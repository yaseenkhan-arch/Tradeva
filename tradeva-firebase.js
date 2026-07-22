// ══════════════════════════════════════════════════════════════════
// TRADEVA — SHARED FIREBASE FOUNDATION
// One source of truth for Firebase across every page.
// Import what you need:  import { auth, db, storage, requireAuth } from './tradeva-firebase.js';
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

// ── Config (single source of truth) ───────────────────────────────
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
// AUTH GUARD
// Call at the top of any protected page. Resolves with the signed-in
// user, or redirects to login.html if nobody is signed in.
//
//   import { requireAuth } from './tradeva-firebase.js';
//   const user = await requireAuth();   // page code runs only when signed in
//
// Pass { verified: true } to also require a verified email.
// ══════════════════════════════════════════════════════════════════
function requireAuth(options = {}) {
  const { verified = false, redirect = "login.html" } = options;
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user) {
        window.location.replace(redirect);
        return; // promise intentionally never resolves; page is navigating away
      }
      if (verified && !user.emailVerified) {
        window.location.replace(redirect + "?verify=1");
        return;
      }
      resolve(user);
    });
  });
}

// ══════════════════════════════════════════════════════════════════
// USER DOCUMENT
// Ensures users/{uid} exists. Called on signup and on Google sign-in
// so every authenticated user has a profile document to hang data off.
// Never overwrites existing fields (merge:true) — safe to call repeatedly.
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
      // keep basic profile fields fresh without clobbering anything else
      await setDoc(ref, {
        email: user.email || "",
        displayName: user.displayName || snap.data().displayName || "",
        lastLoginAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (err) {
    console.error("ensureUserDoc failed:", err);
    // non-fatal — auth still works even if the profile write fails
  }
}

// ══════════════════════════════════════════════════════════════════
// GOOGLE SIGN-IN
// One flow for both register + login. Creates the user doc, then
// sends the user to the dashboard.
// ══════════════════════════════════════════════════════════════════
async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  await ensureUserDoc(result.user);
  return result.user;
}

// ── Sign out helper ────────────────────────────────────────────────
async function logout(redirect = "login.html") {
  await signOut(auth);
  window.location.replace(redirect);
}

export {
  app,
  auth,
  db,
  storage,
  googleProvider,
  requireAuth,
  ensureUserDoc,
  signInWithGoogle,
  logout
};
