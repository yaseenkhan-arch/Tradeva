// ══════════════════════════════════════════════════════════════════
// TRADEVA — JOURNAL MODULE
// Firestore CRUD for the journalling collections that live under a
// trading account: mood, discipline, weekly plans and reviews.
//
//   users/{uid}/accounts/{accountId}/mood/{entryId}
//   users/{uid}/accounts/{accountId}/discipline/{entryId}
//   users/{uid}/accounts/{accountId}/plans/{planId}
//   users/{uid}/accounts/{accountId}/reviews/{reviewId}
//
// Account-level settings (discipline rules / checklist) live on their own
// docs so they aren't duplicated per entry:
//   users/{uid}/accounts/{accountId}/settings/discipline
//
// The knowledge base is deliberately NOT per-account — it's a global
// library for the user:
//   users/{uid}/knowledge/{resourceId}
//
// All four entry collections share the same shape, so one generic set of
// helpers covers them. Pass the collection name as the first argument.
// ══════════════════════════════════════════════════════════════════

import { auth, db } from "./tradeva-firebase.js";
import {
  collection, doc, addDoc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

function uid() {
  const u = auth.currentUser;
  if (!u) throw new Error("Not signed in");
  return u.uid;
}

/* Allowed per-account journal collections. */
const COLLECTIONS = ["mood", "discipline", "plans", "reviews"];
function assertCollection(name) {
  if (!COLLECTIONS.includes(name)) {
    throw new Error("Unknown journal collection: " + name);
  }
}

function entriesCol(accountId, name) {
  assertCollection(name);
  return collection(db, "users", uid(), "accounts", accountId, name);
}
function entryDoc(accountId, name, id) {
  assertCollection(name);
  return doc(db, "users", uid(), "accounts", accountId, name, id);
}

// ══════════════════════════════════════════════════════════════════
// GENERIC ENTRY CRUD
// ══════════════════════════════════════════════════════════════════

/* List every entry in a collection, newest-first.
   Keeps the Firestore query index (_qi) as a stable tiebreaker so
   ordering never becomes arbitrary when createdAt hasn't resolved
   locally yet (serverTimestamp is null on fresh writes). */
async function listEntries(accountId, name) {
  if (!accountId) return [];
  let snap;
  try {
    snap = await getDocs(query(entriesCol(accountId, name), orderBy("createdAt", "desc")));
  } catch (e) {
    console.warn("listEntries ordered query failed, falling back:", e);
    snap = await getDocs(entriesCol(accountId, name));
  }
  const rows = snap.docs.map((d, i) => ({ id: d.id, _qi: i, ...d.data() }));
  const ts = t => (t.createdAt && typeof t.createdAt.seconds === "number")
    ? t.createdAt.seconds * 1e6 + (t.createdAt.nanoseconds || 0) / 1e3
    : null;
  rows.sort((a, b) => {
    const ad = a.date || "", bd = b.date || "";
    if (ad !== bd) return bd.localeCompare(ad);          // newest date first
    const at = ts(a), bt = ts(b);
    if (at !== null && bt !== null && at !== bt) return bt - at;
    return a._qi - b._qi;
  });
  return rows;
}

async function getEntry(accountId, name, id) {
  const snap = await getDoc(entryDoc(accountId, name, id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function createEntry(accountId, name, data) {
  if (!accountId) throw new Error("No trading account selected");
  const ref = await addDoc(entriesCol(accountId, name), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

async function updateEntry(accountId, name, id, data) {
  await updateDoc(entryDoc(accountId, name, id), {
    ...data,
    updatedAt: serverTimestamp()
  });
}

async function deleteEntry(accountId, name, id) {
  await deleteDoc(entryDoc(accountId, name, id));
}

/* Most journal pages are "one entry per date" — saving re-saves the same
   day rather than piling up duplicates. This finds an existing entry for
   the date and updates it, otherwise creates a new one.
   Returns the document id. */
async function upsertByDate(accountId, name, date, data) {
  if (!accountId) throw new Error("No trading account selected");
  const rows = await listEntries(accountId, name);
  const existing = rows.find(r => r.date === date);
  if (existing) {
    await updateEntry(accountId, name, existing.id, { ...data, date });
    return existing.id;
  }
  return await createEntry(accountId, name, { ...data, date });
}

// ══════════════════════════════════════════════════════════════════
// ACCOUNT-LEVEL SETTINGS DOCS
// For things that aren't per-day entries — e.g. the discipline rule set
// and pre-trade checklist, which are configuration, not history.
//   users/{uid}/accounts/{accountId}/settings/{docId}
// ══════════════════════════════════════════════════════════════════
function settingsDoc(accountId, docId) {
  return doc(db, "users", uid(), "accounts", accountId, "settings", docId);
}

async function getSettings(accountId, docId, fallback = {}) {
  if (!accountId) return fallback;
  try {
    const snap = await getDoc(settingsDoc(accountId, docId));
    return snap.exists() ? snap.data() : fallback;
  } catch (e) {
    console.error("getSettings failed:", e);
    return fallback;
  }
}

async function saveSettings(accountId, docId, data) {
  if (!accountId) throw new Error("No trading account selected");
  // merge:true so partial updates don't wipe sibling fields
  await setDoc(settingsDoc(accountId, docId), {
    ...data,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// ══════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE (global to the user, not per-account)
//   users/{uid}/knowledge/{resourceId}
// ══════════════════════════════════════════════════════════════════
function knowledgeCol() { return collection(db, "users", uid(), "knowledge"); }
function knowledgeDoc(id) { return doc(db, "users", uid(), "knowledge", id); }

async function listKnowledge() {
  let snap;
  try {
    snap = await getDocs(query(knowledgeCol(), orderBy("createdAt", "desc")));
  } catch (e) {
    console.warn("listKnowledge ordered query failed, falling back:", e);
    snap = await getDocs(knowledgeCol());
  }
  return snap.docs.map((d, i) => ({ id: d.id, _qi: i, ...d.data() }));
}

async function createKnowledge(data) {
  const ref = await addDoc(knowledgeCol(), {
    ...data,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

async function updateKnowledge(id, data) {
  await updateDoc(knowledgeDoc(id), { ...data, updatedAt: serverTimestamp() });
}

async function deleteKnowledge(id) {
  await deleteDoc(knowledgeDoc(id));
}

export {
  // per-account journal entries
  listEntries, getEntry, createEntry, updateEntry, deleteEntry, upsertByDate,
  // account-level settings docs
  getSettings, saveSettings,
  // global knowledge base
  listKnowledge, createKnowledge, updateKnowledge, deleteKnowledge
};
