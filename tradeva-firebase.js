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
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

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

// ── Firestore init ────────────────────────────────────────────────
// DIAGNOSTIC: persistentLocalCache forces IndexedDB open + multi-tab lease
// negotiation before the FIRST read can be served. Measured cost on the
// first query of a session: ~3.4s in Firefox, ~2.2s in Chrome, for a
// 2-document read. We time the init and let it be disabled at runtime so
// the two hypotheses (IndexedDB vs auth handshake) can be told apart.
//
//   localStorage.setItem('tradeva_no_persistence','1')  -> memory cache
//   localStorage.removeItem('tradeva_no_persistence')    -> persistent cache
let db;
{
  const _t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
  let _noPersist = false;
  try { _noPersist = localStorage.getItem("tradeva_no_persistence") === "1"; } catch (e) {}

  try {
    db = _noPersist
      ? getFirestore(app)
      : initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
        });
  } catch (e) {
    // initializeFirestore throws if Firestore was already initialised for this
    // app (e.g. another module got there first), and IndexedDB can be blocked
    // in private mode. Either way, fall back rather than breaking the page.
    console.warn("Firestore persistent cache unavailable, using default:", e && e.message);
    try { db = getFirestore(app); } catch (e2) { console.error("Firestore init failed:", e2); }
  }

  try {
    if (typeof window !== "undefined" && window.TRADEVA_PERF !== false) {
      const _ms = ((typeof performance !== "undefined" && performance.now) ? performance.now() : 0) - _t0;
      console.log("%c   ↳ Firestore init (" + (_noPersist ? "MEMORY cache" : "PERSISTENT cache") +
                  "): " + _ms.toFixed(0) + "ms", "color:#0EA5E9");
    }
  } catch (e) {}
}

const storage = { get instance() { return _storage; } };
const googleProvider = new GoogleAuthProvider();

/* ── AUTHENTICATED CONNECTION WARM-UP ────────────────────────────
   MEASURED (Firefox): getDocs on a 2-document collection took 3368ms on the
   first read of a session, then 0ms afterwards. The payload is irrelevant —
   the cost is one-time session setup: IndexedDB open, multi-tab lease, and
   the authenticated WebChannel handshake.

   The previous attempt warmed on module load, BEFORE auth resolved, so it
   only warmed an unauthenticated channel — the real handshake still happened
   cold on the app's first genuine read. This version fires the instant a
   session exists, so the handshake overlaps with the rest of startup. */
let _warmed = null;
function warmFirestore() {
  if (_warmed) return _warmed;
  const u = auth.currentUser;
  if (!u) return Promise.resolve();          // nothing useful to warm yet
  const t0 = performance.now();
  _warmed = (async () => {
    try {
      const { doc: _doc, getDoc: _getDoc } = await import(
        "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js");
      // The user's own profile doc: permitted by the rules, tiny, and it
      // forces the full authenticated path to be established.
      await _getDoc(_doc(db, "users", u.uid)).catch(() => {});
      if (window.TRADEVA_PERF !== false) {
        console.log(`%c   ↳ Firestore warm-up (authenticated): ${(performance.now() - t0).toFixed(0)}ms`,
                    "color:#0EA5E9");
      }
    } catch (e) { /* best-effort */ }
  })();
  return _warmed;
}

/* NOTE: deliberately NOT registering a module-level onAuthStateChanged here.
   login.html imports this module before any user exists, and adding a global
   auth listener at import time interfered with the login page's own submit
   flow. App pages call warmFirestore() explicitly after their auth guard
   resolves, which is both safer and better targeted. */


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
  getStorageLazy,
  googleProvider,
  warmFirestore,
  requireAuth,
  ensureUserDoc,
  signInWithGoogle,
  logout
};
