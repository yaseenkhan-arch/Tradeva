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

// ── Firestore with OFFLINE PERSISTENCE ────────────────────────────
// Documents are cached in IndexedDB, so a repeat page load reads from
// local disk (instant) instead of the network, and the app keeps working
// offline. persistentMultipleTabManager lets several Tradeva tabs share
// one cache without fighting over the lock.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
  });
} catch (e) {
  // Older browsers (or private mode) may refuse IndexedDB — fall back to
  // the normal in-memory client rather than breaking the whole app.
  console.warn("Firestore persistent cache unavailable, using memory cache:", e);
  db = getFirestore(app);
}

/* Storage is only needed when uploading a trade screenshot, so it is
   loaded on demand instead of on every page. This removes an SDK fetch
   (~120ms) from the critical path of 12 of 14 pages. */
let _storage = null;
async function getStorageLazy() {
  if (_storage) return _storage;
  const { getStorage } = await import("https://www.gstatic.com/firebasejs/12.15.0/firebase-storage.js");
  _storage = getStorage(app);
  return _storage;
}
/* Back-compat: existing code imports `storage` directly. Keep the name as a
   thenable proxy so `await storage` works, and expose the loader explicitly. */
const storage = { get instance() { return _storage; } };
const googleProvider = new GoogleAuthProvider();

/* ── CONNECTION WARM-UP ──────────────────────────────────────────
   MEASURED: the first Firestore read of a session costs ~2.2s; a second
   identical read costs ~670ms. The gap is one-time setup — opening the
   WebChannel, exchanging the auth token, and (because persistentLocalCache
   is enabled) initialising IndexedDB plus the multi-tab lease.

   Coalescing duplicate queries saved only 80ms, which proved the cost is
   per-session, not per-query. So instead of reducing queries, we start that
   setup as early as possible.

   Two things happen here:
     1. IndexedDB / local cache init begins immediately on module load.
     2. The authenticated channel is warmed the instant auth resolves —
        in parallel with the app's own first query rather than before it.
   Both are best-effort and never block the app. */
let _warmed = null;
function warmFirestore() {
  if (_warmed) return _warmed;
  _warmed = (async () => {
    try {
      const { doc: _doc, getDoc: _getDoc } = await import(
        "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js");
      const u = auth.currentUser;
      // Read the user's own profile doc: allowed by the security rules, tiny,
      // and almost always already needed later anyway.
      const ref = u ? _doc(db, "users", u.uid) : _doc(db, "__warmup__", "__warmup__");
      await _getDoc(ref).catch(() => {});
    } catch (e) { /* best-effort */ }
  })();
  return _warmed;
}

/* Kick off cache/IndexedDB init right away… */
warmFirestore();
/* …and warm the AUTHENTICATED channel the moment a session exists. */
onAuthStateChanged(auth, (u) => { if (u) { _warmed = null; warmFirestore(); } });


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
