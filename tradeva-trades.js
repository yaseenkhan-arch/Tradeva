 // ══════════════════════════════════════════════════════════════════
// TRADEVA — TRADES MODULE
// Trade CRUD in Firestore, scoped to the selected trading account,
// plus screenshot compression + upload to Firebase Storage.
//
//   users/{uid}/accounts/{accountId}/trades/{tradeId}
//   storage: users/{uid}/accounts/{accountId}/trades/{tradeId}/{entry|exit}.jpg
// ══════════════════════════════════════════════════════════════════

import { auth, db, storage } from "./tradeva-firebase.js";
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc, setDoc,
  query, orderBy, limit, getCountFromServer, onSnapshot, increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import {
  ref, uploadString, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.uid;
}
function tradesCol(accountId) { return collection(db, "users", uid(), "accounts", accountId, "trades"); }
function tradeDoc(accountId, tradeId) { return doc(db, "users", uid(), "accounts", accountId, "trades", tradeId); }

// ══════════════════════════════════════════════════════════════════
// IMAGE COMPRESSION
// Iteratively shrinks/re-encodes until the JPEG lands under the target
// (default ~180KB) so Storage costs and load times stay low.
// Returns a data URL string, or null when no file was chosen.
// ══════════════════════════════════════════════════════════════════
const TARGET_BYTES = 180 * 1024;   // ~180KB
const MIN_QUALITY  = 0.45;
const MAX_DIMENSION_START = 1280;

function dataUrlBytes(dataUrl) {
  // base64 chars → bytes (approx, ignoring the header)
  const b64 = dataUrl.split(",")[1] || "";
  return Math.floor(b64.length * 0.75);
}

function drawToDataUrl(img, maxDim, quality) {
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
    else { width = Math.round(width * (maxDim / height)); height = maxDim; }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
}

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the selected image. Please try a different photo."));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not process the selected image. Please try a different photo."));
      img.onload = () => {
        try {
          let maxDim = MAX_DIMENSION_START;
          let quality = 0.75;
          let out = drawToDataUrl(img, maxDim, quality);
          // Step quality down, then dimensions, until we're under target.
          let guard = 0;
          while (dataUrlBytes(out) > TARGET_BYTES && guard < 12) {
            guard++;
            if (quality > MIN_QUALITY) quality = Math.max(MIN_QUALITY, quality - 0.1);
            else maxDim = Math.round(maxDim * 0.85);
            out = drawToDataUrl(img, maxDim, quality);
          }
          resolve(out);
        } catch (err) { reject(err); }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Compress the file in an <input type="file"> by element id.
async function compressFromInput(inputId) {
  const el = document.getElementById(inputId);
  const file = el && el.files ? el.files[0] : null;
  if (!file) return null;
  return compressImageFile(file);
}

// ══════════════════════════════════════════════════════════════════
// STORAGE UPLOAD
// Uploads a compressed data URL and returns its public download URL.
// ══════════════════════════════════════════════════════════════════
async function uploadTradeImage(accountId, tradeId, slot, dataUrl) {
  if (!dataUrl) return null;
  const path = `users/${uid()}/accounts/${accountId}/trades/${tradeId}/${slot}.jpg`;
  const r = ref(storage, path);
  await uploadString(r, dataUrl, "data_url");
  return await getDownloadURL(r);
}

async function deleteTradeImage(accountId, tradeId, slot) {
  try {
    const path = `users/${uid()}/accounts/${accountId}/trades/${tradeId}/${slot}.jpg`;
    await deleteObject(ref(storage, path));
  } catch (e) {
    // missing file is fine
    if (!e || e.code !== "storage/object-not-found") console.warn("deleteTradeImage:", e);
  }
}

// ══════════════════════════════════════════════════════════════════
// CRUD
// ══════════════════════════════════════════════════════════════════

// Create a trade under an account. Images (data URLs) are uploaded to
// Storage after the doc is created, then the URLs are patched in.
async function createTrade(accountId, data, images = {}) {
  if (!accountId) throw new Error("No trading account selected");
  const payload = {
    ...data,
    entryImg: null,
    exitImg: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const refDoc = await addDoc(tradesCol(accountId), payload);

  // upload images (if any) then patch URLs onto the doc
  const patch = {};
  if (images.entry) patch.entryImg = await uploadTradeImage(accountId, refDoc.id, "entry", images.entry);
  if (images.exit)  patch.exitImg  = await uploadTradeImage(accountId, refDoc.id, "exit",  images.exit);
  if (Object.keys(patch).length) await updateDoc(refDoc, patch);

  // O(1) summary update — no full collection read
  applyStatsDelta(accountId, payload, +1).catch(e => console.warn("stats delta failed:", e));

  return refDoc.id;
}

async function updateTrade(accountId, tradeId, data, images = {}) {
  // read the pre-edit values so the stats delta can be reversed accurately
  let before = null;
  try { const snap = await getDoc(tradeDoc(accountId, tradeId)); if (snap.exists()) before = snap.data(); } catch (e) {}
  const patch = { ...data, updatedAt: serverTimestamp() };
  if (images.entry) patch.entryImg = await uploadTradeImage(accountId, tradeId, "entry", images.entry);
  if (images.exit)  patch.exitImg  = await uploadTradeImage(accountId, tradeId, "exit",  images.exit);
  await updateDoc(tradeDoc(accountId, tradeId), patch);
  // An edit can change pnl/outcome, so remove the old contribution and add the new
  if (before) {
    await applyStatsDelta(accountId, before, -1);
    await applyStatsDelta(accountId, { ...before, ...data }, +1);
  }
}

async function deleteTrade(accountId, tradeId) {
  // capture the trade before deletion so its stats contribution can be removed
  let existing = null;
  try { const snap = await getDoc(tradeDoc(accountId, tradeId)); if (snap.exists()) existing = snap.data(); } catch (e) {}
  await deleteTradeImage(accountId, tradeId, "entry");
  await deleteTradeImage(accountId, tradeId, "exit");
  await deleteDoc(tradeDoc(accountId, tradeId));
  if (existing) applyStatsDelta(accountId, existing, -1).catch(e => console.warn("stats delta failed:", e));
}

async function getTrade(accountId, tradeId) {
  const snap = await getDoc(tradeDoc(accountId, tradeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// All trades for an account, newest first (by rawDate then createdAt).
async function listTrades(accountId, opts = {}) {
  if (!accountId) return [];
  const max = Number(opts.limit) > 0 ? Number(opts.limit) : 0;
  let snap;
  try {
    const parts = [orderBy("createdAt", "desc")];
    if (max) parts.push(limit(max));
    snap = await getDocs(query(tradesCol(accountId), ...parts));
  } catch (e) {
    // orderBy fails if some docs lack createdAt — fall back to unordered
    console.warn("listTrades ordered query failed, falling back:", e);
    snap = await getDocs(tradesCol(accountId));
  }
  // Keep Firestore's returned order as a stable fallback index. The query is
  // ordered by createdAt desc, so position 0 = newest. This is reliable even
  // when serverTimestamp() hasn't resolved locally yet (createdAt === null).
  const rows = snap.docs.map((d, i) => ({ id: d.id, _qi: i, ...d.data() }));
  const ts = t => {
    if (t.createdAt && typeof t.createdAt.seconds === 'number') {
      return t.createdAt.seconds * 1e6 + (t.createdAt.nanoseconds || 0) / 1e3;
    }
    return null;
  };
  rows.sort((a, b) => {
    const ad = a.rawDate || '', bd = b.rawDate || '';
    if (ad !== bd) return bd.localeCompare(ad);                   // different days → date desc
    const at = ts(a), bt = ts(b);
    if (at !== null && bt !== null && at !== bt) return bt - at;  // same day → exact time desc
    return a._qi - b._qi;                                         // else keep Firestore's order
  });
  return rows;
}

async function countTrades(accountId) {
  if (!accountId) return 0;
  const snap = await getDocs(tradesCol(accountId));
  return snap.size;
}


// ══════════════════════════════════════════════════════════════════
// ACCOUNT STATS DOCUMENT
//   users/{uid}/accounts/{accountId}/settings/stats
//
// A single precomputed summary so lightweight views (and any future
// account list) can show headline numbers WITHOUT downloading every
// trade. It is recomputed after each create / update / delete.
//
// Pages that need per-trade detail (charts, breakdowns) still read the
// full collection — but thanks to offline persistence that read is
// served from local cache on repeat visits.
// ══════════════════════════════════════════════════════════════════
function statsDoc(accountId) {
  return doc(db, "users", uid(), "accounts", accountId, "settings", "stats");
}

function computeStatsFrom(rows) {
  const num = v => (typeof v === "number" && !isNaN(v)) ? v : (parseFloat(v) || 0);
  const outcome = t => t.outcome || (num(t.pnl) > 0 ? "Win" : num(t.pnl) < 0 ? "Loss" : "BE");
  const wins   = rows.filter(t => outcome(t) === "Win");
  const losses = rows.filter(t => outcome(t) === "Loss");
  const net    = rows.reduce((s, t) => s + num(t.pnl), 0);
  const gw     = wins.reduce((s, t) => s + Math.abs(num(t.pnl)), 0);
  const gl     = losses.reduce((s, t) => s + Math.abs(num(t.pnl)), 0);
  const decided = wins.length + losses.length;
  const rrVals = rows.map(t => num(t.rr)).filter(v => v !== 0);
  let lastDate = "";
  rows.forEach(t => { const d = t.rawDate || ""; if (d > lastDate) lastDate = d; });
  return {
    tradeCount: rows.length,
    wins: wins.length,
    losses: losses.length,
    netPnl: Math.round(net * 100) / 100,
    grossWin: Math.round(gw * 100) / 100,
    grossLoss: Math.round(gl * 100) / 100,
    winRate: decided ? Math.round((wins.length / decided) * 1000) / 10 : 0,
    profitFactor: gl > 0 ? Math.round((gw / gl) * 100) / 100 : (gw > 0 ? null : 0),
    netRR: Math.round(rrVals.reduce((a, b) => a + b, 0) * 100) / 100,
    lastTradeDate: lastDate,
    updatedAt: serverTimestamp()
  };
}

/* INCREMENTAL stats update — O(1) per write.
   A full recount would read the entire collection on every save, which is
   fine at 20 trades and ruinous at 10,000. Instead we apply just the delta
   for the trade that changed, using Firestore's atomic increment(). */
function statsDelta(trade, sign) {
  const num = v => (typeof v === "number" && !isNaN(v)) ? v : (parseFloat(v) || 0);
  const pnl = num(trade.pnl);
  const rr  = num(trade.rr);
  const outcome = trade.outcome || (pnl > 0 ? "Win" : pnl < 0 ? "Loss" : "BE");
  const d = {
    tradeCount: increment(sign),
    netPnl:     increment(Math.round(pnl * 100) / 100 * sign),
    netRR:      increment(Math.round(rr * 100) / 100 * sign),
    updatedAt:  serverTimestamp()
  };
  if (outcome === "Win")  { d.wins   = increment(sign); d.grossWin  = increment(Math.abs(pnl) * sign); }
  if (outcome === "Loss") { d.losses = increment(sign); d.grossLoss = increment(Math.abs(pnl) * sign); }
  return d;
}

/* Apply a single trade's contribution (sign +1 to add, -1 to remove). */
async function applyStatsDelta(accountId, trade, sign) {
  if (!accountId || !trade) return;
  try {
    await setDoc(statsDoc(accountId), statsDelta(trade, sign), { merge: true });
  } catch (e) {
    console.warn("stats delta failed, scheduling full recount:", e);
    refreshAccountStats(accountId).catch(() => {});
  }
}

/* Full recount — only for repair/backfill, NOT the normal write path. */
async function refreshAccountStats(accountId) {
  if (!accountId) return null;
  const snap = await getDocs(tradesCol(accountId));
  const rows = snap.docs.map(d => d.data());
  const stats = computeStatsFrom(rows);
  await setDoc(statsDoc(accountId), stats, { merge: true });
  return stats;
}

/* Read the summary only — one tiny document instead of the whole
   collection. Returns null when it hasn't been generated yet. */
async function getAccountStats(accountId) {
  if (!accountId) return null;
  try {
    const snap = await getDoc(statsDoc(accountId));
    return snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error("getAccountStats failed:", e);
    return null;
  }
}

/* Server-side count — no document payload at all. */
async function countTradesFast(accountId) {
  if (!accountId) return 0;
  try {
    const snap = await getCountFromServer(tradesCol(accountId));
    return snap.data().count;
  } catch (e) {
    console.warn("count aggregation unavailable, falling back:", e);
    const s2 = await getDocs(tradesCol(accountId));
    return s2.size;
  }
}


// ══════════════════════════════════════════════════════════════════
// LIVE SUBSCRIPTION
// onSnapshot keeps a page current without re-fetching: the first call is
// served from the local cache (instant), then Firestore pushes only what
// changed. Returns an unsubscribe function.
//
//   const stop = subscribeTrades(accId, rows => render(rows));
//   // later: stop();
// ══════════════════════════════════════════════════════════════════
function subscribeTrades(accountId, callback, opts = {}) {
  if (!accountId) { callback([]); return () => {}; }
  const max = Number(opts.limit) > 0 ? Number(opts.limit) : 0;
  const parts = [orderBy("createdAt", "desc")];
  if (max) parts.push(limit(max));
  return onSnapshot(
    query(tradesCol(accountId), ...parts),
    snap => {
      const rows = snap.docs.map((d, i) => ({ id: d.id, _qi: i, ...d.data() }));
      rows.sort((a, b) => {
        const ad = a.rawDate || "", bd = b.rawDate || "";
        if (ad !== bd) return bd.localeCompare(ad);
        const at = a.createdAt?.seconds || null, bt = b.createdAt?.seconds || null;
        if (at !== null && bt !== null && at !== bt) return bt - at;
        return a._qi - b._qi;
      });
      callback(rows);
    },
    err => { console.error("subscribeTrades error:", err); callback([]); }
  );
}

export {
  compressImageFile, compressFromInput,
  uploadTradeImage, deleteTradeImage,
  createTrade, updateTrade, deleteTrade, getTrade, listTrades, countTrades,
  refreshAccountStats, applyStatsDelta, getAccountStats, countTradesFast, computeStatsFrom,
  subscribeTrades
};
