# TRADEVA — FIREBASE ARCHITECTURE HANDOFF

> Read this first. It captures the whole backend architecture, what's migrated,
> what isn't, and the exact pattern to follow for the remaining work.
> With this doc a fresh session can continue immediately.

---

## 1. Project Reality

- **Live:** tradeva.app (Vercel, auto-deploys from GitHub `yaseenkhan-arch/Tradeva`)
- **Stack:** plain HTML / CSS / vanilla JS — **no build step, no framework**
- **Backend:** Firebase (project `tradeva-app`), **Blaze plan** (billing enabled)
- **Services in use:** Authentication, Firestore, Storage
- **Firestore region:** `asia-south1`

Every page is a standalone `.html` file that imports shared ES modules by
relative path (`./tradeva-firebase.js`). Files live flat in the repo root.

---

## 2. The Three Shared Modules

These are the foundation. **Never duplicate Firebase config into a page** —
always import from these.

### `tradeva-firebase.js`
Single source of truth for config + service init.

```js
export { app, auth, db, storage, googleProvider,
         requireAuth, ensureUserDoc, signInWithGoogle, logout };
```

- `requireAuth()` → Promise resolving to the signed-in user; redirects to
  `login.html` if signed out. Optional `{ verified: true }` to also require
  a verified email.
- `ensureUserDoc(user)` → creates/refreshes `users/{uid}` (safe to call repeatedly).
- `signInWithGoogle()` → popup flow, creates the user doc, returns the user.
- `logout()` → signs out and redirects.

### `tradeva-accounts.js`
Trading accounts + the sidebar switcher.

```js
export { createAccount, updateAccount, deleteAccount, listAccounts, getAccount,
         getSelectedAccountId, setSelectedAccount, clearSelectedAccount,
         resolveSelectedAccount, initAccountSwitcher, tradesCol };
```

- `resolveSelectedAccount()` → the active account object, defaulting to the
  first account; returns `null` when the user has none.
- `initAccountSwitcher()` → turns the `.account-switcher` sidebar pill into a
  working dropdown on any page.
- `deleteAccount(id)` → **cascades**: deletes all the account's trades first
  (Firestore does not cascade automatically), then the account doc.

### `tradeva-trades.js`
Trade CRUD + screenshot compression/upload.

```js
export { compressImageFile, compressFromInput,
         uploadTradeImage, deleteTradeImage,
         createTrade, updateTrade, deleteTrade, getTrade, listTrades, countTrades };
```

- Images are compressed client-side to **~180KB** (canvas → JPEG, stepping
  quality then dimensions) before upload to Storage. Only the download URL is
  stored on the trade doc.
- `listTrades(accountId)` → newest-first, with **deterministic ordering** (see §6).

---

## 3. Data Model (Firestore)

```
users/{uid}                                  ← profile doc
  ├─ accounts/{accountId}                    ← trading accounts
  │    └─ trades/{tradeId}                   ← trades belong to ONE account
  └─ (future: mood, discipline, reviews, plans, knowledge)

Storage:
  users/{uid}/accounts/{accountId}/trades/{tradeId}/entry.jpg
  users/{uid}/accounts/{accountId}/trades/{tradeId}/exit.jpg
```

**Account fields:** `name*`, `broker`, `type` (Personal|Prop Firm|Demo),
`platform`, `currency`, `leverage`, `startingBalance*`, `currentBalance`,
`equity`, `accountNumber`, `challengePhase`, `brokerServer`, `notes`,
`status` (active|archived), `createdAt`, `updatedAt`.
*Required: name + startingBalance. Others default (USD, 1:100).*

**Trade fields:** `accountId`, `date` (display string), `rawDate` (YYYY-MM-DD),
`pair`, `dir`, `entry`, `exit`, `sl`, `tp`, `session`, `tradeType`, `htfBias`,
`rr`, `pips`, `timeInPos`, `outcome`, `pnl`, `tvLink`, `notes`,
`rulesFollowed`, `entryImg`, `exitImg`, `createdAt`, `updatedAt`.

**Selected account** is stored **per-device in localStorage** under
`tradeva_selected_account` — deliberately NOT in Firestore, so viewing a
different account on your phone doesn't change your laptop.

**localStorage still used (intentionally):** `tradeva_theme`,
`tradeva_profile`, `tradeva_photo`.

---

## 4. Security Rules (published in console)

**Firestore** — everything under `users/{uid}` readable/writable only by that uid.
**Storage** — same, plus 2MB cap and `image/*` content-type check.

Both are already published. If reads/writes suddenly fail with
"Missing or insufficient permissions", check these first.

---

## 5. The Page Conversion Pattern

Every migrated page follows the same three-part shape.

**(a) Auth guard** — injected right after `<body>`, identical on every page:

```html
<!-- ══ TRADEVA AUTH GUARD (injected — do not duplicate) ══ -->
<style>
@keyframes tvspin{to{transform:rotate(360deg);}}
body.tv-guarding{visibility:hidden;}
#tvAuthLoading{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;
  justify-content:center;background:#F8FAFC;visibility:visible;}
html[data-theme="dark"] #tvAuthLoading{background:#080C14;}
body.tv-ready #tvAuthLoading{display:none;}
</style>
<div id="tvAuthLoading"><div style="width:34px;height:34px;border-radius:50%;
  border:3px solid rgba(59,130,246,0.25);border-top-color:#3B82F6;
  animation:tvspin .7s linear infinite;"></div></div>
<script>document.body.classList.add("tv-guarding");</script>
<script type="module">
import { requireAuth } from "./tradeva-firebase.js";
try { const user = await requireAuth(); window.tradevaUser = user; }
catch (e) { console.error("Auth guard error:", e); }
finally { document.body.classList.remove("tv-guarding");
          document.body.classList.add("tv-ready"); }
</script>
<!-- ══ END AUTH GUARD ══ -->
```

**(b) Page script keeps a store + a setter**, and does NOT render on
`DOMContentLoaded` (that caused a visible flash of demo data):

```js
let ROWS = [];
let DEMO_MODE = false;
window.__tvSetX = function (rows) {
  ROWS = Array.isArray(rows) ? rows : [];
  DEMO_MODE = ROWS.length === 0;
  renderEverything();
};
document.addEventListener('DOMContentLoaded', () => {
  loadProfileSidebar();
  // real render happens when Firestore answers
});
```

**(c) Loader module before `</body>`:**

```html
<script type="module">
import { auth } from "./tradeva-firebase.js";
import { initAccountSwitcher, resolveSelectedAccount } from "./tradeva-accounts.js";
import { listTrades } from "./tradeva-trades.js";
function tvWhenAuthed(){ return new Promise(res=>{ if(auth.currentUser) return res();
  const t=setInterval(()=>{ if(auth.currentUser){ clearInterval(t); res(); } },60); }); }
(async () => {
  await tvWhenAuthed();
  await initAccountSwitcher();
  try {
    const acc = await resolveSelectedAccount();
    if (!acc) { window.__tvSetX([]); return; }
    const rows = await listTrades(acc.id);
    window.__tvSetX(rows, acc);
  } catch (e) { console.error("load failed:", e); window.__tvSetX([]); }
})();
</script>
```

---

## 6. Hard-Won Gotchas (do not re-learn these)

1. **`serverTimestamp()` is `null` locally.** On a freshly-written doc,
   `createdAt` reads as null until the server round-trip. Never sort on it
   alone — `listTrades` keeps the Firestore query index (`_qi`) as a stable
   tiebreaker. Sorting bugs here caused equity curves to draw backwards.

2. **Drawdown is measured on ACCOUNT EQUITY, not profit.** Base = the account's
   `startingBalance`; equity = base + cumulative P&L; drawdown = drop from peak
   equity. Measuring against peak *profit* makes a +3000/-1000 sequence look
   like -33% when it's really -0.97% on a 100k account.

3. **Group charts by DAY, not per trade.** Several trades on one date should
   collapse into one point, and the curve should be seeded with a "Start" point
   at the opening balance so growth reads left-to-right from day zero.

4. **Don't render demo data before Firestore answers** — it flashes. Start stat
   values as `—` in the HTML and fill them in the setter.

5. **Negative money formatting:** `Math.abs()` + a `+` prefix silently drops the
   minus sign. Always branch: `(n >= 0 ? '+$' : '-$') + Math.abs(n)...`.

6. **Editing these large HTML files with regex/`str_replace` is dangerous.**
   Several times an edit left orphaned content *after* `</html>`, which the
   browser renders as raw visible text. **Use Python slicing on explicit
   indices**, and after every edit verify:
   `<script>` open/close counts match, exactly one `</html>`, and every script
   block parses.

---

## 7. Status

### Migrated to Firestore ✅
| Page | Notes |
|---|---|
| `login.html` / `register.html` | email+password, Google, verification, shared config |
| `settings.html` | accounts CRUD + logout (new page) |
| `dashboard.html` | all stats + equity/drawdown charts from real trades; demo badge |
| `trades-new.html` | writes to Firestore, image compression → Storage, account gating |
| `trades.html` | list/search/filter from Firestore |
| `trade-detail.html` | view/edit/delete by doc id (`?id=`) |
| `profit-calendar.html` | real trades + visual redesign |
| `analytics.html` + `analytics.js` | full aggregation engine, all 11 stat cards real |

Auth guard + live account switcher are on **all** app pages.

### Still on localStorage ⬜
| Page | Keys it owns |
|---|---|
| `mood-tracker.html` | `tradeva_mood_entries` |
| `discipline-tracker.html` | `tradeva_discipline_entries`, `_rules`, `_checklist` |
| `reviews.html` | `tradeva_reviews` (+ reads mood/discipline/plans) |
| `milestones.html` | `tradeva_milestones` (+ reads everything) |
| `weekly-planner.html` | `tradeva_weekly_plans` |
| `knowledge-base.html` | `tradeva_knowledge` |

**These are a different job.** Unlike the trade pages (which only *read*), each
of these *creates and stores its own records*, so each needs its own Firestore
collection and a small CRUD module — essentially repeating the trades migration.

---

## 8. Recommended Next Steps

1. **`mood-tracker.html` first** — simplest (one collection, one entry type).
   It establishes the pattern the rest follow.
2. Then `discipline-tracker`, `weekly-planner`, `knowledge-base`.
3. Then `reviews` and `milestones` last — they *read* all the others, so they
   need those collections to exist first.

**Suggested collection paths** (keep the per-account scoping where it makes sense):

```
users/{uid}/accounts/{accountId}/mood/{entryId}
users/{uid}/accounts/{accountId}/discipline/{entryId}
users/{uid}/accounts/{accountId}/plans/{planId}
users/{uid}/accounts/{accountId}/reviews/{reviewId}
users/{uid}/knowledge/{resourceId}        ← NOT per-account (library is global)
```

Build one `tradeva-journal.js` module exporting CRUD for mood / discipline /
plans / reviews rather than four separate modules — they share the same shape.

---

## 9. Testing Reality Check

Most charts have only ever seen **2 trades on a single day**. Before adding more
surface area, log real trades across several days and confirm the equity curve,
drawdown, calendar and analytics all behave. Two data points can't show a trend —
several issues that looked like bugs were simply too little data.
