/* ══════════════════════════════════════════════════════════════════════
 * tradeva-fbperf.js — Firestore performance instrumentation
 * ══════════════════════════════════════════════════════════════════════
 *
 * Wraps Firestore calls and records, per operation:
 *   start, end, duration, document count, estimated payload bytes,
 *   whether the result came from cache, and any error code.
 *
 * After the dashboard finishes loading, call fbperf.report() to print a
 * ranked table of the slowest operations plus a serial-vs-parallel
 * analysis and real network bytes from Resource Timing.
 *
 * Usage:
 *   import { fbperf } from "./tradeva-fbperf.js";
 *   const snap = await fbperf.traced("trades:recent",
 *                                    () => getDocs(q),
 *                                    { accountId: acc.id });
 *   fbperf.report();
 *
 * Disable entirely:  window.TRADEVA_FBPERF = false;
 *
 * NOTE: intentionally has NO Firestore import. It takes a thunk, so it
 * never couples to an SDK version and never runs at import time.
 * (See gotcha #7 — no import-time side effects in shared modules.)
 * ════════════════════════════════════════════════════════════════════ */

const enabled = () =>
  typeof window !== "undefined" && window.TRADEVA_FBPERF !== false;

/** @type {Array<{label:string,start:number,end:number,duration:number,docs:number,bytes:number,fromCache:boolean|null,error:string|null,meta:object}>} */
const records = [];
const phases = [];
let reportedOnce = false;

/* ── size / shape helpers ─────────────────────────────────────────── */

function safeStringify(value) {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (v && typeof v === "object") {
        // Firestore Timestamp
        if (typeof v.toDate === "function") return v.toDate().toISOString();
        // DocumentReference
        if (typeof v.path === "string" && typeof v.id === "string") return v.path;
      }
      return v;
    });
  } catch {
    return "";
  }
}

function byteLength(str) {
  if (!str) return 0;
  try {
    return new TextEncoder().encode(str).length;
  } catch {
    return str.length;
  }
}

function isQuerySnapshot(r) {
  return !!r && typeof r.size === "number" && Array.isArray(r.docs);
}

function isDocSnapshot(r) {
  return !!r && typeof r.exists === "function" && !Array.isArray(r.docs);
}

function countDocs(result) {
  if (isQuerySnapshot(result)) return result.size;
  if (isDocSnapshot(result)) return result.exists() ? 1 : 0;
  if (Array.isArray(result)) return result.length;
  return 0;
}

function estimateBytes(result) {
  try {
    if (isQuerySnapshot(result)) {
      let total = 0;
      for (const d of result.docs) total += byteLength(safeStringify(d.data()));
      return total;
    }
    if (isDocSnapshot(result)) {
      return result.exists() ? byteLength(safeStringify(result.data())) : 0;
    }
    if (Array.isArray(result)) return byteLength(safeStringify(result));
  } catch {
    /* ignore — instrumentation must never break the page */
  }
  return 0;
}

function cacheFlag(result) {
  const m = result && result.metadata;
  return m && typeof m.fromCache === "boolean" ? m.fromCache : null;
}

/* ── core ─────────────────────────────────────────────────────────── */

/**
 * Time an async Firestore operation.
 * @param {string} label   e.g. "summary:get" / "trades:recent(10)"
 * @param {() => Promise<any>} fn  thunk that performs the call
 * @param {object} [meta]  arbitrary extra context for the report
 */
async function traced(label, fn, meta = {}) {
  if (!enabled()) return fn();

  const start = performance.now();
  let result, error = null;

  try {
    result = await fn();
    return result;
  } catch (e) {
    error = (e && (e.code || e.message)) || String(e);
    throw e;
  } finally {
    const end = performance.now();
    records.push({
      label,
      start,
      end,
      duration: end - start,
      docs: error ? 0 : countDocs(result),
      bytes: error ? 0 : estimateBytes(result),
      fromCache: error ? null : cacheFlag(result),
      error,
      meta,
    });
  }
}

/** Mark a non-Firestore milestone (paint, chart init, etc.). */
function phase(label) {
  if (!enabled()) return;
  phases.push({ label, at: performance.now() });
}

/* ── real network bytes (Resource Timing) ─────────────────────────── */

function networkSummary() {
  try {
    const entries = performance
      .getEntriesByType("resource")
      .filter((e) => /firestore\.googleapis\.com|firebasestorage\.googleapis\.com/.test(e.name));
    if (!entries.length) return null;

    let transfer = 0, encoded = 0;
    for (const e of entries) {
      transfer += e.transferSize || 0;
      encoded += e.encodedBodySize || 0;
    }
    return {
      requests: entries.length,
      transferKB: +(transfer / 1024).toFixed(1),
      encodedKB: +(encoded / 1024).toFixed(1),
      // transferSize is 0 when the cross-origin response has no
      // Timing-Allow-Origin header — fall back to the estimate.
      trustworthy: transfer > 0,
    };
  } catch {
    return null;
  }
}

/* ── report ───────────────────────────────────────────────────────── */

/**
 * Print a ranked list of the slowest Firestore operations.
 * @param {string} [title]
 * @param {{ force?: boolean }} [opts]  force:true allows repeat reports
 */
function report(title = "Dashboard", opts = {}) {
  if (!enabled()) return;
  if (reportedOnce && !opts.force) return;
  if (!records.length) {
    console.info(`[fbperf] ${title}: no Firestore operations recorded.`);
    return;
  }
  reportedOnce = true;

  const summed = records.reduce((s, r) => s + r.duration, 0);
  const first = Math.min(...records.map((r) => r.start));
  const last = Math.max(...records.map((r) => r.end));
  const wall = last - first;
  const totalDocs = records.reduce((s, r) => s + r.docs, 0);
  const totalBytes = records.reduce((s, r) => s + r.bytes, 0);

  const ranked = [...records]
    .sort((a, b) => b.duration - a.duration)
    .map((r) => ({
      operation: r.label,
      ms: Math.round(r.duration),
      "% of tracked": ((r.duration / summed) * 100).toFixed(1) + "%",
      docs: r.docs,
      KB: +(r.bytes / 1024).toFixed(1),
      cache: r.fromCache === null ? "—" : r.fromCache ? "HIT" : "server",
      "start@ms": Math.round(r.start),
      error: r.error || "",
    }));

  const slowest = ranked[0];

  console.groupCollapsed(
    `%c[fbperf] ${title} — ${records.length} Firestore ops, ` +
      `wall ${Math.round(wall)}ms, slowest: ${slowest.operation} (${slowest.ms}ms)`,
    "color:#3B82F6;font-weight:600"
  );

  console.table(ranked);

  const parallelism = wall > 0 ? summed / wall : 1;
  console.log(
    `Summed duration : ${Math.round(summed)}ms\n` +
      `Wall clock      : ${Math.round(wall)}ms\n` +
      `Parallelism     : ${parallelism.toFixed(2)}x  ` +
      (parallelism < 1.2
        ? "→ requests are effectively SERIAL. Look for an await chain."
        : "→ requests are overlapping well."),
  );
  console.log(
    `Documents read  : ${totalDocs}\n` +
      `Payload (est.)  : ${(totalBytes / 1024).toFixed(1)} KB`
  );

  const net = networkSummary();
  if (net) {
    console.log(
      `Network         : ${net.requests} requests, ` +
        (net.trustworthy
          ? `${net.transferKB} KB transferred (${net.encodedKB} KB encoded)`
          : "byte counts unavailable (no Timing-Allow-Origin) — use the estimate above")
    );
  }

  if (phases.length) {
    console.table(
      phases.map((p) => ({ milestone: p.label, "at ms": Math.round(p.at) }))
    );
  }

  const cacheHits = records.filter((r) => r.fromCache === true).length;
  if (cacheHits) console.log(`Cache hits      : ${cacheHits}/${records.length}`);

  const errors = records.filter((r) => r.error);
  if (errors.length) {
    console.warn(`${errors.length} failed operation(s):`, errors);
  }

  console.groupEnd();
}

/** Clear all records (useful for SPA-style re-measurement). */
function reset() {
  records.length = 0;
  phases.length = 0;
  reportedOnce = false;
}

/** Raw records, for exporting or asserting in tests. */
function dump() {
  return records.map((r) => ({ ...r }));
}

export const fbperf = { traced, phase, report, reset, dump };
export { traced };
