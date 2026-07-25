 // ══════════════════════════════════════════════════════════════════
// TRADEVA — ACCOUNTS MODULE
// Trading-account CRUD in Firestore + the live sidebar switcher.
// Every page imports what it needs from here.
//
//   accounts:   users/{uid}/accounts/{accountId}
//   trades:     users/{uid}/accounts/{accountId}/trades/{tradeId}   (Step 2)
//
// Selected-account pointer is per-device (localStorage), defaulting to
// the user's first account.
// ══════════════════════════════════════════════════════════════════

import { auth, db } from "./tradeva-firebase.js";
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const SELECTED_KEY = "tradeva_selected_account";

// ── Paths ──────────────────────────────────────────────────────────
function accountsCol(uid) { return collection(db, "users", uid, "accounts"); }
function accountDoc(uid, id) { return doc(db, "users", uid, "accounts", id); }
function tradesCol(uid, accId) { return collection(db, "users", uid, "accounts", accId, "trades"); }

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.uid;
}

// ══════════════════════════════════════════════════════════════════
// CRUD
// ══════════════════════════════════════════════════════════════════

// Create an account. Only name + startingBalance are required; the rest
// get sensible defaults. currentBalance & equity start at startingBalance.
async function createAccount(data) {
  const start = Number(data.startingBalance) || 0;
  const payload = {
    name:            (data.name || "").trim(),
    broker:          (data.broker || "").trim(),
    type:            data.type || "Personal",       // Personal | Prop Firm | Demo
    platform:        data.platform || "Manual",     // MT5 | MT4 | cTrader | TradingView | DXTrade | Match Trader | Manual
    currency:        data.currency || "USD",
    leverage:        data.leverage || "1:100",
    startingBalance: start,
    currentBalance:  start,   // equals starting until trades exist
    equity:          start,   // equals starting until trades exist
    accountNumber:   (data.accountNumber || "").trim(),
    challengePhase:  (data.challengePhase || "").trim(),
    brokerServer:    (data.brokerServer || "").trim(),
    notes:           (data.notes || "").trim(),
    status:          data.status || "active",        // active | archived
    createdAt:       serverTimestamp(),
    updatedAt:       serverTimestamp()
  };
  if (!payload.name) throw new Error("Account name is required");
  const ref = await addDoc(accountsCol(uid()), payload);
  invalidateAccountsCache();
  return ref.id;
}

// Update mutable fields on an account.
async function updateAccount(id, data) {
  const patch = { updatedAt: serverTimestamp() };
  const fields = ["name","broker","type","platform","currency","leverage",
                  "startingBalance","accountNumber","challengePhase","brokerServer","notes","status"];
  fields.forEach(f => { if (data[f] !== undefined) patch[f] = f === "startingBalance" ? Number(data[f]) || 0 : data[f]; });
  // If startingBalance changes and no trades yet, keep current/equity in sync
  if (patch.startingBalance !== undefined) {
    const snap = await getDoc(accountDoc(uid(), id));
    if (snap.exists()) {
      const a = snap.data();
      if ((a.tradeCount || 0) === 0) {
        patch.currentBalance = patch.startingBalance;
        patch.equity = patch.startingBalance;
      }
    }
  }
  await updateDoc(accountDoc(uid(), id), patch);
  invalidateAccountsCache();
}

// Delete an account AND all of its trades (irreversible).
// Firestore doesn't cascade, so we delete the trades subcollection first.
async function deleteAccount(id) {
  const u = uid();
  // delete trades in batches of 400 (batch limit is 500)
  const tradesSnap = await getDocs(tradesCol(u, id));
  let batch = writeBatch(db);
  let n = 0;
  for (const d of tradesSnap.docs) {
    batch.delete(d.ref);
    n++;
    if (n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
  }
  await batch.commit();

  /* Firestore does not cascade, and deleting the parent doc does NOT delete
     its subcollections — they become unreachable orphans that still bill.
     Clear the derived data too. */
  for (const sub of ["daily", "settings", "mood", "discipline", "plans", "reviews"]) {
    try {
      const snap = await getDocs(collection(db, "users", u, "accounts", id, sub));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn(`deleteAccount: could not clear ${sub}`, e); }
  }

  // delete the account doc itself
  await deleteDoc(accountDoc(u, id));
  invalidateAccountsCache();
  try { localStorage.removeItem("tradeva_summary_" + id); } catch (e) {}
  // if the deleted account was selected, clear the pointer
  if (getSelectedAccountId() === id) clearSelectedAccount();
}

// List accounts (active first, newest first). Pass {includeArchived:true} to get all.
/* ── ACCOUNT CACHE (localStorage snapshot + coalescing) ──────────
   MEASURED: getDocs on a 2-document collection costs ~1250ms consistently,
   in BOTH persistent-cache and memory-cache mode. So IndexedDB is not the
   cause — it is the authenticated WebChannel handshake, paid once per
   session on the first read.

   That cost cannot be removed, but it CAN be taken off the critical path.
   Accounts change very rarely (a user creates one and edits it maybe twice
   a year), so we keep a snapshot in localStorage. On a repeat visit the app
   renders from that snapshot in ~0ms and refreshes from Firestore in the
   background, updating the UI only if something actually changed.
────────────────────────────────────────────────────────────────── */
const ACCOUNTS_SNAPSHOT_KEY = "tradeva_accounts_snapshot";

function readAccountsSnapshotRaw() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed && Array.isArray(parsed.rows) && parsed.uid === auth.currentUser?.uid)
      ? parsed : null;
  } catch (e) { return null; }
}

function readAccountsSnapshot() {
  const p = readAccountsSnapshotRaw();
  return p ? p.rows : null;
}

/* MEASURED: this 2-document query cost 585ms on one page and 3315ms on
   another in the same session. It is charged per QUERY, not per byte, and
   it runs on every page load of every page.

   Accounts change maybe twice a year, and every mutation calls
   invalidateAccountsCache() which wipes the snapshot — so within the TTL
   the cached copy is authoritative and the network round trip is pure
   waste. Skip it entirely rather than "refreshing in the background",
   because a background query still contends with the reads that matter.

   Cost: an account edited on ANOTHER device can take up to the TTL to
   appear here. Edits made on THIS device are instant. */
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

function snapshotIsFresh() {
  const p = readAccountsSnapshotRaw();
  return !!(p && p.rows.length && (Date.now() - (p.at || 0)) < SNAPSHOT_TTL_MS);
}

function writeAccountsSnapshot(rows) {
  try {
    localStorage.setItem(ACCOUNTS_SNAPSHOT_KEY, JSON.stringify({
      uid: auth.currentUser?.uid || null,
      at: Date.now(),
      // strip Firestore Timestamps — they do not survive JSON round-trips
      rows: rows.map(r => {
        const { createdAt, updatedAt, ...rest } = r;
        return rest;
      })
    }));
  } catch (e) { /* quota or private mode — cache is optional */ }
}

function clearAccountsSnapshot() {
  try { localStorage.removeItem(ACCOUNTS_SNAPSHOT_KEY); } catch (e) {}
}

let _accountsPromise = null;
let _accountsAt = 0;
const ACCOUNTS_TTL_MS = 30000;

function invalidateAccountsCache() {
  _accountsPromise = null; _accountsAt = 0; clearAccountsSnapshot();
}

/* Instant read from the local snapshot. Returns null on a first-ever visit. */
function listAccountsCached(opts = {}) {
  const rows = readAccountsSnapshot();
  if (!rows) return null;
  return opts.includeArchived ? rows : rows.filter(a => a.status !== "archived");
}

async function listAccounts(opts = {}) {
  /* Fast path: a recent local snapshot answers without touching the network.
     Pass { fresh: true } where authoritative data matters (settings page). */
  if (!opts.fresh && snapshotIsFresh()) {
    const rows = readAccountsSnapshot() || [];
    if (window.TRADEVA_PERF !== false) {
      console.log("%c   \u21b3 accounts: 0ms  [SNAPSHOT]  " + rows.length + " docs",
                  "color:#10B981");
    }
    return opts.includeArchived ? rows : rows.filter(a => a.status !== "archived");
  }

  const fresh = _accountsPromise && (Date.now() - _accountsAt) < ACCOUNTS_TTL_MS;
  if (!fresh) {
    _accountsAt = Date.now();
    const t0 = performance.now();
    _accountsPromise = getDocs(query(accountsCol(uid()), orderBy("createdAt", "desc")))
      .then(snap => {
        const ms = performance.now() - t0;
        const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        writeAccountsSnapshot(rows);
        // Was this served from the local cache or the network?
        const src = snap.metadata.fromCache ? "CACHE" : "NETWORK";
        if (window.TRADEVA_PERF !== false) {
          console.log(`%c   ↳ getDocs(accounts): ${ms.toFixed(0)}ms  [${src}]  ${snap.size} docs`,
                      "color:#8B5CF6");
        }
        window.__tvAccountsFetchMs = ms;
        window.__tvAccountsSource = src;
        return rows;
      })
      .catch(err => { invalidateAccountsCache(); throw err; });
  }
  const all = await _accountsPromise;
  return opts.includeArchived ? all : all.filter(a => a.status !== "archived");
}

async function getAccount(id) {
  const snap = await getDoc(accountDoc(uid(), id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ══════════════════════════════════════════════════════════════════
// SELECTED ACCOUNT (per-device pointer)
// ══════════════════════════════════════════════════════════════════
function getSelectedAccountId() { return localStorage.getItem(SELECTED_KEY) || null; }
function setSelectedAccount(id) { localStorage.setItem(SELECTED_KEY, id); }
function clearSelectedAccount() { localStorage.removeItem(SELECTED_KEY); }

// Resolve the selected account, defaulting to the first account if the
// stored pointer is missing or points to a deleted/archived account.
// Returns the account object, or null if the user has no accounts.
/* Instant, synchronous resolve from the snapshot. null if unavailable. */
function resolveSelectedAccountCached() {
  const accounts = listAccountsCached();
  if (!accounts || !accounts.length) return null;
  const stored = getSelectedAccountId();
  return (stored && accounts.find(a => a.id === stored)) || accounts[0];
}

async function resolveSelectedAccount() {
  const accounts = await listAccounts();
  if (!accounts.length) { clearSelectedAccount(); return null; }
  const stored = getSelectedAccountId();
  let acc = stored ? accounts.find(a => a.id === stored) : null;
  if (!acc) { acc = accounts[0]; setSelectedAccount(acc.id); }
  return acc;
}

// ══════════════════════════════════════════════════════════════════
// LIVE SIDEBAR SWITCHER
// Turns the .account-switcher pill into a working dropdown on any page.
// Call initAccountSwitcher() after auth is ready.
// ══════════════════════════════════════════════════════════════════
async function initAccountSwitcher(options = {}) {
  const pill = document.querySelector(".account-switcher");
  if (!pill) return;

  // Neutralise any inline onclick (old "coming soon" stub)
  pill.onclick = null;
  pill.removeAttribute("onclick");

  const labelEl = pill.querySelector(".account-label");
  const dotEl   = pill.querySelector(".account-dot");

  let CURRENT = [];   // whatever the pill is currently showing

  /* ── menu element, created once ──────────────────────────────────── */
  let menu = document.getElementById("tvAccountMenu");
  if (menu) menu.remove();
  menu = document.createElement("div");
  menu.id = "tvAccountMenu";
  menu.style.cssText = [
    "position:absolute","z-index:500","min-width:210px","max-height:320px","overflow-y:auto",
    "background:var(--bg-card,#fff)","border:1px solid var(--border,#E2E8F0)","border-radius:12px",
    "box-shadow:0 12px 32px rgba(0,0,0,0.16)","padding:6px","display:none"
  ].join(";");
  document.body.appendChild(menu);

  function positionMenu() {
    const r = pill.getBoundingClientRect();
    menu.style.left = r.left + "px";
    menu.style.width = r.width + "px";
    menu.style.top = (r.top - menu.offsetHeight - 8) + "px"; // open upward (pill sits at sidebar bottom)
  }
  function openMenu()  { menu.style.display = "block"; positionMenu(); }
  function closeMenu() { menu.style.display = "none"; }

  /* ── listeners bound exactly once, regardless of how many times we
        repaint. Binding inside paint() would stack duplicate handlers
        every time the background refresh landed. ─────────────────────── */
  if (!pill.dataset.tvSwitcherBound) {
    pill.dataset.tvSwitcherBound = "1";
    pill.style.cursor = "pointer";

    pill.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!CURRENT.length) { window.location.href = "settings.html"; return; }
      menu.style.display === "block" ? closeMenu() : openMenu();
    });

    document.addEventListener("click", (e) => {
      if (!menu.contains(e.target) && !pill.contains(e.target)) closeMenu();
    });
    window.addEventListener("resize", () => {
      if (menu.style.display === "block") positionMenu();
    });

    menu.addEventListener("click", (e) => {
      if (e.target.closest("#tvManageAccounts")) { window.location.href = "settings.html"; return; }
      const row = e.target.closest(".tv-acc-row");
      if (!row) return;
      const id = row.getAttribute("data-id");
      setSelectedAccount(id);
      closeMenu();
      if (typeof options.onChange === "function") options.onChange(id);
      else window.location.reload();   // default: re-read the selected account
    });
  }

  /* ── rendering ───────────────────────────────────────────────────── */
  function rowHTML(a, isSel) {
    return `<div class="tv-acc-row" data-id="${a.id}" style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:500;color:var(--text-primary,#0F172A);${isSel?'background:var(--accent-bg,#EFF6FF);':''}">
      <span style="width:7px;height:7px;border-radius:50%;background:${isSel?'var(--green,#10B981)':'var(--text-faint,#94A3B8)'};flex-shrink:0;"></span>
      <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(a.name)}</span>
      ${a.type ? `<span style="font-size:10px;color:var(--text-faint,#94A3B8);">${escapeHtml(a.type)}</span>`:''}
    </div>`;
  }

  function paint(accounts) {
    CURRENT = accounts || [];

    if (!CURRENT.length) {
      if (labelEl) labelEl.textContent = "Add an account";
      if (dotEl) dotEl.style.background = "var(--text-faint, #94A3B8)";
      menu.innerHTML = "";
      closeMenu();
      return;
    }

    const storedId = getSelectedAccountId();
    let selected = storedId ? CURRENT.find(a => a.id === storedId) : null;
    if (!selected) { selected = CURRENT[0]; setSelectedAccount(selected.id); }

    if (labelEl) labelEl.textContent = selected.name;
    if (dotEl) dotEl.style.background = "var(--green, #10B981)";

    const sel = getSelectedAccountId();
    menu.innerHTML =
      CURRENT.map(a => rowHTML(a, a.id === sel)).join("") +
      `<div style="height:1px;background:var(--border-light,#F1F5F9);margin:6px 4px;"></div>
       <div id="tvManageAccounts" style="display:flex;align-items:center;gap:9px;padding:9px 10px;border-radius:9px;cursor:pointer;font-size:12.5px;font-weight:600;color:var(--accent,#3B82F6);">
         <span style="width:15px;height:15px;display:inline-flex;">+</span> Manage accounts
       </div>`;
  }

  const signature = list =>
    (list || []).map(a => `${a.id}:${a.name || ""}:${a.type || ""}`).join("|");

  /* ── paint from the local snapshot FIRST — zero network ───────────── */
  const cached = listAccountsCached();
  let painted = false;
  if (cached && cached.length) { paint(cached); painted = true; }

  /* ── then reconcile in the background ────────────────────────────── */
  let fresh;
  try {
    fresh = await listAccounts();
  } catch (e) {
    console.error("Switcher: listAccounts failed", e);
    if (!painted) paint([]);   // nothing cached and the fetch failed
    return;
  }

  // Repaint only when the list actually changed — avoids clobbering an
  // open menu on every page load for no reason.
  if (!painted || signature(fresh) !== signature(cached)) paint(fresh);
}

function escapeHtml(s){ return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

export {
  createAccount, updateAccount, deleteAccount, listAccounts, getAccount,
  getSelectedAccountId, setSelectedAccount, clearSelectedAccount, resolveSelectedAccount,
  initAccountSwitcher, tradesCol, invalidateAccountsCache,
  listAccountsCached, resolveSelectedAccountCached
};
