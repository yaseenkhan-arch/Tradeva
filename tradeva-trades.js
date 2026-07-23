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
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
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

  return refDoc.id;
}

async function updateTrade(accountId, tradeId, data, images = {}) {
  const patch = { ...data, updatedAt: serverTimestamp() };
  if (images.entry) patch.entryImg = await uploadTradeImage(accountId, tradeId, "entry", images.entry);
  if (images.exit)  patch.exitImg  = await uploadTradeImage(accountId, tradeId, "exit",  images.exit);
  await updateDoc(tradeDoc(accountId, tradeId), patch);
}

async function deleteTrade(accountId, tradeId) {
  await deleteTradeImage(accountId, tradeId, "entry");
  await deleteTradeImage(accountId, tradeId, "exit");
  await deleteDoc(tradeDoc(accountId, tradeId));
}

async function getTrade(accountId, tradeId) {
  const snap = await getDoc(tradeDoc(accountId, tradeId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// All trades for an account, newest first (by rawDate then createdAt).
async function listTrades(accountId) {
  if (!accountId) return [];
  let snap;
  try {
    snap = await getDocs(query(tradesCol(accountId), orderBy("createdAt", "desc")));
  } catch (e) {
    // orderBy fails if some docs lack createdAt — fall back to unordered
    console.warn("listTrades ordered query failed, falling back:", e);
    snap = await getDocs(tradesCol(accountId));
  }
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  rows.sort((a, b) => {
    const ad = a.rawDate || "", bd = b.rawDate || "";
    if (ad && bd && ad !== bd) return bd.localeCompare(ad);
    const at = a.createdAt?.seconds || 0, bt = b.createdAt?.seconds || 0;
    return bt - at;
  });
  return rows;
}

async function countTrades(accountId) {
  if (!accountId) return 0;
  const snap = await getDocs(tradesCol(accountId));
  return snap.size;
}

export {
  compressImageFile, compressFromInput,
  uploadTradeImage, deleteTradeImage,
  createTrade, updateTrade, deleteTrade, getTrade, listTrades, countTrades
};
