 /* ══════════════════════════════════════════════════════════════════════
 * tradeva-summary.js — dashboard summary doc + daily aggregates
 * ══════════════════════════════════════════════════════════════════════
 *
 * Replaces the dashboard's full-collection read with:
 *   users/{uid}/accounts/{accId}/settings/stats     ← 1 doc, headline numbers
 *   users/{uid}/accounts/{accId}/daily/{YYYY-MM-DD} ← 1 doc per trading day
 *
 * ── OWNERSHIP ────────────────────────────────────────────────────────
 * This module is the SOLE writer of settings/stats. applyStatsDelta() in
 * tradeva-trades.js writes the SAME fields on the SAME doc — if both run,
 * every counter double-counts. Its three call sites in createTrade /
 * updateTrade / deleteTrade must be replaced by the hooks at the bottom
 * of this file. The export itself stays for any other page importing it.
 *
 * ── CLASSIFICATION PARITY ────────────────────────────────────────────
 * dashboard.html classifies by pnl SIGN (`pnl > 0` = win) and computes
 * winRate as wins / totalTrades — breakevens sit in the denominator.
 * tradeva-trades.js classifies by the `outcome` FIELD and computes
 * winRate as wins / (wins + losses). Those two disagree today.
 *
 * The brief says keep the UI identical, so this module reproduces the
 * DASHBOARD's arithmetic exactly. Flip CLASSIFY_BY_OUTCOME to true if
 * you'd rather the outcome field win — but that visibly moves the
 * numbers on screen, so decide it deliberately.
 *
 * ── DECOMPOSABILITY ──────────────────────────────────────────────────
 * counters (count/wins/losses/pnl/gross/RR) → additive, safe deltas
 * largestWin / largestLoss                  → unrecoverable on delete
 * winStreak / lossStreak                    → order-dependent
 *
 * Creates that append to the end of history update everything inside a
 * transaction. Edits, deletes and backdated inserts update the additive
 * counters exactly and set dirty:true; a background recompute repairs
 * the rest off the critical path. The dashboard never waits for it.
 *
 * maxDrawdown and profitableDays are deliberately NOT stored here — both
 * fall out of the `daily` collection the charts already load.
 * ════════════════════════════════════════════════════════════════════ */

import { db, auth } from "./tradeva-firebase.js";
import {
  doc, getDoc, setDoc, collection, query, orderBy, where,
  getDocs, runTransaction, writeBatch, increment, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

import { fbperf } from "./tradeva-fbperf.js";

/* ── config ───────────────────────────────────────────────────────── */

const SCHEMA_VERSION = 3;

/* The dashboard is ONE document read. Measured: a getDoc round trip to
   asia-south1 is a stable ~570ms, while a collection query costs 2-3x that
   and concurrent queries contend during startup. So the recent-trades rows
   and the equity curve live INSIDE this doc rather than in their own
   collections — deleting a query is worth more than saving bytes. */
const MAX_RECENT = 10;      // rows the dashboard table shows
const MAX_CURVE_DAYS = 400; // ~18 months of trading days, keeps the doc small
const CACHE_PREFIX = "tradeva_summary_";
const CACHE_TTL_MS = 5 * 60 * 1000;

/** false = match dashboard.html (pnl sign). true = match the `outcome` field. */
const CLASSIFY_BY_OUTCOME = false;

/* ── paths ────────────────────────────────────────────────────────── */

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error("tradeva-summary: not signed in");
  return u.uid;
}

const summaryRef = (accId) => doc(db, "users", uid(), "accounts", accId, "settings", "stats");
const dailyRef = (accId, date) => doc(db, "users", uid(), "accounts", accId, "daily", date);
const dailyCol = (accId) => collection(db, "users", uid(), "accounts", accId, "daily");
const tradesCol = (accId) => collection(db, "users", uid(), "accounts", accId, "trades");

/* ── classification ───────────────────────────────────────────────── */

const num = (v) => (typeof v === "number" && !isNaN(v) ? v : parseFloat(v) || 0);

function classify(trade) {
  if (CLASSIFY_BY_OUTCOME) {
    const o = String(trade?.outcome || "").toLowerCase();
    if (o.startsWith("win")) return "win";
    if (o.startsWith("los")) return "loss";
    if (o) return "be";
  }
  const pnl = num(trade?.pnl);
  return pnl > 0 ? "win" : pnl < 0 ? "loss" : "be";
}

function facts(trade) {
  const rr = num(trade?.rr);
  return {
    kind: classify(trade),
    pnl: num(trade?.pnl),
    rr: rr !== 0 ? rr : null,   // dashboard filters rr !== 0 before averaging
    date: trade?.rawDate || "",
  };
}

/* ── shape ────────────────────────────────────────────────────────── */

function zeroSummary() {
  return {
    schemaVersion: SCHEMA_VERSION,
    tradeCount: 0, wins: 0, losses: 0, breakevens: 0,
    netPnl: 0, grossWin: 0, grossLoss: 0,
    sumRR: 0, rrCount: 0,
    largestWin: 0, largestLoss: 0,
    winStreak: 0, lossStreak: 0, currentStreak: 0,
    lastTradeDate: "", dirty: false,
    recent: [],   // newest-first display rows
    curve: [],    // {d: YYYY-MM-DD, l: display label, p: day pnl}
  };
}

/** Minimal display row for the recent-trades table. */
function recentRow(t) {
  return {
    id: t.id || null,
    date: t.date || t.rawDate || "",
    rawDate: t.rawDate || "",
    pair: t.pair || "",
    dir: t.dir || "",
    session: t.session || "",
    pnl: num(t.pnl),
  };
}

/** Ratios derived on READ, never trusted from storage. */
export function deriveSummary(raw) {
  const s = { ...zeroSummary(), ...(raw || {}) };

  s.winRate = s.tradeCount > 0 ? (s.wins / s.tradeCount) * 100 : 0;
  s.profitFactor =
    s.grossLoss > 0 ? s.grossWin / s.grossLoss : s.grossWin > 0 ? Infinity : 0;
  s.avgRR = s.rrCount > 0 ? s.sumRR / s.rrCount : 0;
  s.netRR = s.sumRR;

  // Expand the compact stored shape into what the dashboard renders.
  s.recent = Array.isArray(s.recent) ? s.recent : [];
  s.curve = (Array.isArray(s.curve) ? s.curve : []).map((x) => ({
    date: x.d, label: x.l || x.d, pnl: num(x.p), count: 1,
  }));

  return s;
}

/* ── full recompute (source of truth) ─────────────────────────────── */

export function computeSummaryFrom(trades) {
  const s = zeroSummary();

  // Chronological. rawDate is YYYY-MM-DD so it sorts lexically; _qi is the
  // stable tiebreaker — never sort on createdAt alone (gotcha #1).
  const ordered = [...(trades || [])].sort((a, b) => {
    const d = String(a?.rawDate || "").localeCompare(String(b?.rawDate || ""));
    return d !== 0 ? d : num(a?._qi) - num(b?._qi);
  });

  let curWin = 0, curLoss = 0;

  for (const t of ordered) {
    const f = facts(t);
    s.tradeCount++;
    s.netPnl += f.pnl;
    if (f.rr !== null) { s.sumRR += f.rr; s.rrCount++; }
    if (f.date > s.lastTradeDate) s.lastTradeDate = f.date;

    if (f.kind === "win") {
      s.wins++;
      s.grossWin += Math.abs(f.pnl);
      if (f.pnl > s.largestWin) s.largestWin = f.pnl;
      curWin++; curLoss = 0;
    } else if (f.kind === "loss") {
      s.losses++;
      s.grossLoss += Math.abs(f.pnl);
      if (f.pnl < s.largestLoss) s.largestLoss = f.pnl;
      curLoss++; curWin = 0;
    } else {
      s.breakevens++;
      // dashboard's streak loop ignores pnl === 0 entirely — mirror that
    }

    if (curWin > s.winStreak) s.winStreak = curWin;
    if (curLoss > s.lossStreak) s.lossStreak = curLoss;
  }

  s.currentStreak = curWin > 0 ? curWin : -curLoss;

  /* Equity curve, grouped by DAY (gotcha #3). */
  const byDay = new Map();
  for (const t of ordered) {
    const d = t?.rawDate || "";
    if (!d) continue;
    const cur = byDay.get(d) || { d, l: t.date || d, p: 0 };
    cur.p += num(t.pnl);
    byDay.set(d, cur);
  }
  s.curve = [...byDay.values()]
    .sort((a, b) => a.d.localeCompare(b.d))
    .slice(-MAX_CURVE_DAYS)
    .map((x) => ({ ...x, p: Math.round(x.p * 100) / 100 }));

  /* Recent rows, newest first — same ordering the table used to get from
     listTrades(), so the displayed rows are unchanged. */
  s.recent = ordered.slice(-MAX_RECENT).reverse().map(recentRow);

  s.dirty = false;
  return s;
}

/**
 * Read every trade once and rewrite the summary. Repair path only.
 *
 * Orders by rawDate, NOT createdAt: Firestore omits documents that lack
 * the orderBy field entirely, so any legacy trade written without a
 * createdAt would be invisible to a createdAt-ordered recount.
 */
export async function recomputeSummary(accId) {
  const snap = await fbperf.traced(
    "summary:recompute(all trades)",
    () => getDocs(query(tradesCol(accId), orderBy("rawDate", "asc"))),
    { accountId: accId }
  );

  const trades = snap.docs.map((d, i) => ({ id: d.id, _qi: i, ...d.data() }));
  const summary = computeSummaryFrom(trades);

  await setDoc(summaryRef(accId), { ...summary, updatedAt: serverTimestamp() }, { merge: true });
  writeCache(accId, summary);
  return deriveSummary(summary);
}

/* ── localStorage snapshot (instant first paint) ──────────────────── */

function writeCache(accId, summary) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + accId,
      JSON.stringify({ uid: auth.currentUser?.uid || null, at: Date.now(), summary })
    );
  } catch { /* quota / private mode — cache is optional */ }
}

/** Instant, zero-network. null on a first-ever visit. */
export function getSummaryCached(accId) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + accId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // guard against a cache left by a previously signed-in user
    if (!parsed?.summary || parsed.uid !== (auth.currentUser?.uid || null)) return null;
    return { ...deriveSummary(parsed.summary), _stale: Date.now() - parsed.at > CACHE_TTL_MS };
  } catch {
    return null;
  }
}

export function invalidateSummaryCache(accId) {
  try {
    if (accId) localStorage.removeItem(CACHE_PREFIX + accId);
    else Object.keys(localStorage)
      .filter((k) => k.startsWith(CACHE_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch { /* non-fatal */ }
}

/* ── the read the dashboard makes ─────────────────────────────────── */

/** One document instead of the whole trades collection. Self-heals. */
export async function getSummary(accId) {
  const snap = await fbperf.traced(
    "summary:get(settings/stats)",
    () => getDoc(summaryRef(accId)),
    { accountId: accId }
  );

  if (!snap.exists()) return recomputeSummary(accId);

  const data = snap.data();
  // Docs written by the old applyStatsDelta have no schemaVersion and no
  // streak/largest fields — recompute once, then it's a single-doc read.
  if (num(data.schemaVersion) < SCHEMA_VERSION) return recomputeSummary(accId);

  writeCache(accId, data);

  if (data.dirty) {
    recomputeSummary(accId).catch((e) => console.warn("background recompute failed:", e));
  }

  return deriveSummary(data);
}

/* ── daily aggregates (charts, max drawdown, profitable days) ─────── */

/** Every field additive → increment() alone is correct, zero reads. */
function dailyDelta(accId, batch, date, f, sign, label) {
  if (!date) return;
  const patch = {
    date,
    count: increment(sign),
    pnl: increment(sign * f.pnl),
    wins: increment(f.kind === "win" ? sign : 0),
    losses: increment(f.kind === "loss" ? sign : 0),
    sumRR: increment(f.rr !== null ? sign * f.rr : 0),
    rrCount: increment(f.rr !== null ? sign : 0),
    updatedAt: serverTimestamp(),
  };
  if (label) patch.label = label;   // the display string the chart axis uses
  batch.set(dailyRef(accId, date), patch, { merge: true });
}

/** ~250 tiny docs per trading year instead of every trade. */
export async function listDaily(accId, { from, to } = {}) {
  const clauses = [];
  if (from) clauses.push(where("date", ">=", from));
  if (to) clauses.push(where("date", "<=", to));

  const snap = await fbperf.traced(
    `daily:list(${from || "all"}-${to || "now"})`,
    () => getDocs(query(dailyCol(accId), ...clauses, orderBy("date", "asc"))),
    { accountId: accId }
  );

  // A day whose last trade was deleted decrements to count 0 — skip it
  // rather than drawing a phantom point.
  return snap.docs.map((d) => d.data()).filter((d) => num(d.count) > 0);
}

/**
 * Read the daily aggregates, building them once if they're missing.
 *
 * A fresh deploy has an empty `daily` collection, which would leave the
 * charts blank until someone ran backfillDaily() by hand in the console.
 * This heals it automatically on first load and never runs again once the
 * collection is populated.
 *
 * The localStorage flag only guards the pathological case where a backfill
 * legitimately produces zero days (e.g. every trade is missing rawDate) —
 * without it, that would retry the full-collection read on every page load.
 */
export async function ensureDaily(accId, tradeCount = 0) {
  let days = await listDaily(accId);
  if (days.length || !accId || Number(tradeCount) <= 0) return days;

  const flag = "tradeva_daily_bf_" + accId;
  try { if (localStorage.getItem(flag)) return days; } catch { /* private mode */ }

  try {
    const res = await backfillDaily(accId);
    console.info(`[tradeva] built daily aggregates: ${res.days} days from ${res.trades} trades`);
    try { localStorage.setItem(flag, String(Date.now())); } catch { /* ignore */ }
    days = await listDaily(accId);
  } catch (e) {
    console.warn("daily backfill failed:", e);
  }
  return days;
}

/** One-time migration: build `daily` from the existing trades. */
export async function backfillDaily(accId) {
  const snap = await fbperf.traced(
    "daily:backfill(read all trades)",
    () => getDocs(query(tradesCol(accId), orderBy("rawDate", "asc"))),
    { accountId: accId }
  );

  const days = new Map();
  for (const d of snap.docs) {
    const t = d.data();
    const f = facts(t);
    if (!f.date) continue;
    const cur = days.get(f.date) || {
      date: f.date, label: t.date || f.date,
      count: 0, pnl: 0, wins: 0, losses: 0, sumRR: 0, rrCount: 0,
    };
    cur.count++;
    cur.pnl += f.pnl;
    if (f.kind === "win") cur.wins++;
    if (f.kind === "loss") cur.losses++;
    if (f.rr !== null) { cur.sumRR += f.rr; cur.rrCount++; }
    days.set(f.date, cur);
  }

  const entries = [...days.values()];
  for (let i = 0; i < entries.length; i += 450) {   // batch limit is 500
    const batch = writeBatch(db);
    for (const day of entries.slice(i, i + 450)) {
      batch.set(dailyRef(accId, day.date), { ...day, updatedAt: serverTimestamp() });
    }
    await batch.commit();
  }

  return { days: entries.length, trades: snap.size };
}

/* ── write-path hooks ─────────────────────────────────────────────── */

async function applyDelta(accId, before, after) {
  if (!accId) return;
  const b = before ? facts(before) : null;
  const a = after ? facts(after) : null;

  await runTransaction(db, async (tx) => {
    const ref = summaryRef(accId);
    const snap = await tx.get(ref);
    const s = { ...zeroSummary(), ...(snap.exists() ? snap.data() : {}) };

    const step = (f, sign) => {
      if (!f) return;
      s.tradeCount += sign;
      s.netPnl += sign * f.pnl;
      if (f.rr !== null) { s.sumRR += sign * f.rr; s.rrCount += sign; }
      if (f.kind === "win") { s.wins += sign; s.grossWin += sign * Math.abs(f.pnl); }
      else if (f.kind === "loss") { s.losses += sign; s.grossLoss += sign * Math.abs(f.pnl); }
      else s.breakevens += sign;
    };

    step(b, -1);
    step(a, +1);

    // Clamp — a double-fire must never put negative counters on screen.
    for (const k of ["tradeCount", "wins", "losses", "breakevens", "rrCount", "grossWin", "grossLoss"]) {
      if (s[k] < 0) s[k] = 0;
    }

    const isCreate = !before && !!after;
    const appendsToEnd = isCreate && a.date && a.date >= (s.lastTradeDate || "");

    if (appendsToEnd) {
      if (a.kind === "win") {
        if (a.pnl > s.largestWin) s.largestWin = a.pnl;
        s.currentStreak = s.currentStreak > 0 ? s.currentStreak + 1 : 1;
        if (s.currentStreak > s.winStreak) s.winStreak = s.currentStreak;
      } else if (a.kind === "loss") {
        if (a.pnl < s.largestLoss) s.largestLoss = a.pnl;
        s.currentStreak = s.currentStreak < 0 ? s.currentStreak - 1 : -1;
        if (-s.currentStreak > s.lossStreak) s.lossStreak = -s.currentStreak;
      }
      s.lastTradeDate = a.date;

      /* Curve: fold the new trade into its day. */
      const curve = Array.isArray(s.curve) ? [...s.curve] : [];
      const i = curve.findIndex((x) => x.d === a.date);
      if (i >= 0) curve[i] = { ...curve[i], p: Math.round((num(curve[i].p) + a.pnl) * 100) / 100 };
      else curve.push({ d: a.date, l: after?.date || a.date, p: Math.round(a.pnl * 100) / 100 });
      curve.sort((x, y) => String(x.d).localeCompare(String(y.d)));
      s.curve = curve.slice(-MAX_CURVE_DAYS);

      /* Recent: newest first, capped. */
      const recent = Array.isArray(s.recent) ? [...s.recent] : [];
      recent.unshift(recentRow({ ...after, rawDate: a.date }));
      recent.sort((x, y) => String(y.rawDate || "").localeCompare(String(x.rawDate || "")));
      s.recent = recent.slice(0, MAX_RECENT);
    } else {
      // Delete, edit, or backdated insert — streaks and extremes can no
      // longer be derived from the previous state. Flag for repair.
      s.dirty = true;
      if (a && a.date > (s.lastTradeDate || "")) s.lastTradeDate = a.date;
    }

    s.schemaVersion = SCHEMA_VERSION;
    tx.set(ref, { ...s, updatedAt: serverTimestamp() }, { merge: true });
  });

  const batch = writeBatch(db);
  if (b) dailyDelta(accId, batch, b.date, b, -1);
  if (a) dailyDelta(accId, batch, a.date, a, +1, after?.date);
  await batch.commit();

  invalidateSummaryCache(accId);
}

export const onTradeCreated = (accId, trade) => applyDelta(accId, null, trade);
export const onTradeUpdated = (accId, before, after) => applyDelta(accId, before, after);
export const onTradeDeleted = (accId, trade) => applyDelta(accId, trade, null);

/** Force the order-dependent fields correct right now (blocking). */
export async function ensureFresh(accId) {
  const snap = await getDoc(summaryRef(accId));
  if (!snap.exists() || snap.data().dirty) return recomputeSummary(accId);
  return deriveSummary(snap.data());
}

/** Delete every daily doc for an account — call from deleteAccount(). */
export async function deleteDailyForAccount(accId) {
  const snap = await getDocs(dailyCol(accId));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  invalidateSummaryCache(accId);
  try { localStorage.removeItem("tradeva_daily_bf_" + accId); } catch (e) { /* ignore */ }
}
