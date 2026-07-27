 // ══════════════════════════════════════════════════════════════════
// TRADEVA — SHARED FIREBASE FOUNDATION
//
//   import { auth, db, storage, requireAuth } from './tradeva-firebase.js';
//
// Deliberately simple. Nothing runs side effects at import time beyond
// initialising the SDK, because login.html and register.html import this
// before any user exists.
// ══════════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js";

// ── Config ─────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDsaMzX6_NlzwsD3ibeYghv3q8HTbytmmU",
  authDomain: "tradeva-app.firebaseapp.com",
  projectId: "tradeva-app",
  storageBucket: "tradeva-app.firebasestorage.app",
  messagingSenderId: "682302343296",
  appId: "1:682302343296:web:9643bf7b4b6664482e3e65"
};

// ── Init ───────────────────────────────────────────────────────────
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

// ══════════════════════════════════════════════════════════════════
// AUTH GUARD — redirects to login.html when signed out.
//   const user = await requireAuth();
// ══════════════════════════════════════════════════════════════════
function requireAuth(options = {}) {
  const { verified = false, redirect = "login.html" } = options;
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) { window.location.replace(redirect); return; }
      if (verified && !user.emailVerified) { window.location.replace(redirect + "?verify=1"); return; }
      resolve(user);
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// USER DOCUMENT — ensures users/{uid} exists. Safe to call repeatedly.
// ══════════════════════════════════════════════════════════════════
async function ensureUserDoc(user, extra = {}) {
  if (!user) return;
  const ref = doc(db, "users", user.uid);
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: user.uid,
        email: user.email || "",
        displayName: user.displayName || extra.displayName || "",
        photoURL: user.photoURL || "",
        createdAt: serverTimestamp(),
        ...extra
      });
    } else {
      await setDoc(ref, {
        email: user.email || "",
        displayName: user.displayName || snap.data().displayName || "",
        lastLoginAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error("ensureUserDoc failed:", err);
  }
}

// ══════════════════════════════════════════════════════════════════
// SIDEBAR PROFILE — ONE implementation for every page.
//
// Each page used to carry its own copy that read localStorage ONLY. That
// works while you stay on one device, but localStorage is per-device: on a
// fresh sign-in (or after logout clears it) every page falls back to the
// hardcoded "Kham / Pro Trader" placeholder.
//
// This paints the local snapshot first so there is no flicker, then — only
// when that snapshot is incomplete — reconciles against users/{uid}, which
// ensureUserDoc() already fills with displayName and photoURL. So it costs
// zero extra reads on a device that already knows the user.
//
//   import { hydrateProfileSidebar } from './tradeva-firebase.js';
//   hydrateProfileSidebar();          // safe to call before auth resolves
//
// No import-time side effects: nothing here runs until it is called.
// ══════════════════════════════════════════════════════════════════
function paintProfileSidebar(p = {}) {
  const fname    = p.fname   || "Kham";
  const lname    = p.lname   || "";
  const account  = p.account || "Pro Trader";
  const initials = (fname.charAt(0) + (lname.charAt(0) || "")).toUpperCase() || "KH";

  const nameEl   = document.querySelector(".profile-name");
  const roleEl   = document.querySelector(".profile-role");
  const avatarEl = document.querySelector(".avatar");

  if (nameEl) nameEl.textContent = fname;
  if (roleEl) roleEl.textContent = account;
  if (avatarEl) {
    if (p.photo) {
      avatarEl.style.backgroundImage    = "url(" + p.photo + ")";
      avatarEl.style.backgroundSize     = "cover";
      avatarEl.style.backgroundPosition = "center";
      avatarEl.style.color              = "transparent";
      avatarEl.textContent              = "";
    } else {
      avatarEl.style.backgroundImage = "";
      avatarEl.style.color           = "";
      avatarEl.textContent           = initials;
    }
  }
}

function readLocalProfile() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem("tradeva_profile") || "{}"); } catch (e) {}
  try { p.photo = localStorage.getItem("tradeva_photo") || null; } catch (e) {}
  return p;
}

async function hydrateProfileSidebar() {
  const local = readLocalProfile();
  paintProfileSidebar(local);                       // instant, no network

  if (local.fname && local.account) return;         // device already knows them

  const user = auth.currentUser || await new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
  });
  if (!user) return;

  let remote = {};
  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (snap.exists()) remote = snap.data() || {};
  } catch (e) {
    return;                                         // offline: local paint stands
  }

  const display = remote.displayName || user.displayName || "";
  if (!display && !remote.photoURL && !user.photoURL) return;

  const merged = {
    fname:   local.fname   || display.split(" ")[0] || "",
    lname:   local.lname   || display.split(" ").slice(1).join(" ") || "",
    account: local.account || remote.account || "Trader",
    photo:   local.photo   || remote.photoURL || user.photoURL || null
  };
  paintProfileSidebar(merged);

  // refresh the snapshot so the next page load paints instantly
  try {
    localStorage.setItem("tradeva_profile", JSON.stringify({
      ...local,
      photo: undefined,
      fname:   merged.fname,
      lname:   merged.lname,
      account: merged.account
    }));
  } catch (e) {}
}

// ── Google sign-in (used by both login and register) ───────────────
async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(result.user);
  return result.user;
}

// ── Sign out ───────────────────────────────────────────────────────
async function logout(redirect = "login.html") {
  await signOut(auth);
  window.location.replace(redirect);
}

export {
  app,
  auth,
  db,
  hydrateProfileSidebar,
  storage,
  googleProvider,
  requireAuth,
  ensureUserDoc,
  signInWithGoogle,
  logout
};
