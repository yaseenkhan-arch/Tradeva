// ══════════════════════════════════════════════════════════════════
// TRADEVA — PERFORMANCE INSTRUMENTATION
//
// Measures the real cost of each startup phase with performance.now()
// and prints a table to the console. No guessing.
//
// Usage on any page:
//   import { perf } from "./tradeva-perf.js";
//   perf.mark("auth:start"); ... perf.mark("auth:end");
//   perf.report();
//
// Or wrap a promise:
//   const rows = await perf.time("trades:download", listTrades(accId));
//
// Set window.TRADEVA_PERF = false to silence it in production.
// ══════════════════════════════════════════════════════════════════

const ENABLED = () => window.TRADEVA_PERF !== false;

const marks = {};
const spans = [];
const t0 = performance.now();          // module import time
const navStart = (performance.timing && performance.timing.navigationStart)
  ? 0 : 0;                              // page-relative: performance.now() is already page-relative

function mark(name) {
  if (!ENABLED()) return;
  marks[name] = performance.now();
}

/* Record a completed span between two marks (or explicit values). */
function span(label, startMark, endMark) {
  if (!ENABLED()) return;
  const a = typeof startMark === "number" ? startMark : marks[startMark];
  const b = typeof endMark === "number" ? endMark : marks[endMark];
  if (a == null || b == null) return;
  spans.push({ label, ms: b - a, start: a, end: b });
}

/* Time a promise and record it automatically. */
async function time(label, promise) {
  if (!ENABLED()) return promise;
  const a = performance.now();
  try {
    const result = await promise;
    const b = performance.now();
    spans.push({ label, ms: b - a, start: a, end: b });
    return result;
  } catch (e) {
    const b = performance.now();
    spans.push({ label: label + " (FAILED)", ms: b - a, start: a, end: b });
    throw e;
  }
}

/* Time a synchronous function. */
function timeSync(label, fn) {
  if (!ENABLED()) return fn();
  const a = performance.now();
  const r = fn();
  const b = performance.now();
  spans.push({ label, ms: b - a, start: a, end: b });
  return r;
}

/* First meaningful paint — call when real content is on screen. */
function firstContent(label = "FIRST MEANINGFUL CONTENT") {
  if (!ENABLED()) return;
  const now = performance.now();
  spans.push({ label, ms: now, start: 0, end: now, isTotal: true });
}

function report(title = "TRADEVA STARTUP") {
  if (!ENABLED()) return;
  const total = performance.now();

  // Which phase dominated?
  const timed = spans.filter(s => !s.isTotal);
  const slowest = timed.slice().sort((a, b) => b.ms - a.ms)[0];

  console.groupCollapsed(
    `%c⚡ ${title} — ${total.toFixed(0)}ms total`,
    "color:#3B82F6;font-weight:700;font-size:13px"
  );

  const rows = spans.map(s => ({
    Phase: s.label,
    "Duration (ms)": Math.round(s.ms * 10) / 10,
    "Started at (ms)": Math.round(s.start * 10) / 10,
    "% of total": total > 0 ? ((s.ms / total) * 100).toFixed(1) + "%" : "—"
  }));
  console.table(rows);

  if (slowest) {
    console.log(
      `%cBOTTLENECK: ${slowest.label} — ${slowest.ms.toFixed(0)}ms (${((slowest.ms / total) * 100).toFixed(0)}% of startup)`,
      "color:#EF4444;font-weight:700"
    );
  }

  // Serial vs parallel: overlap detection
  const sorted = timed.slice().sort((a, b) => a.start - b.start);
  let serialTime = 0, lastEnd = 0;
  sorted.forEach(s => {
    if (s.start >= lastEnd) { serialTime += s.ms; lastEnd = s.end; }
    else if (s.end > lastEnd) { serialTime += s.end - lastEnd; lastEnd = s.end; }
  });
  const sumAll = timed.reduce((a, s) => a + s.ms, 0);
  if (sumAll > 0) {
    const saved = sumAll - serialTime;
    console.log(
      `Parallelism: ${sumAll.toFixed(0)}ms of work ran in ${serialTime.toFixed(0)}ms wall time ` +
      `(${saved > 1 ? saved.toFixed(0) + "ms overlapped" : "fully sequential — parallelise these"})`
    );
  }

  // Browser-level navigation timings for cold-load context
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) {
      console.log(
        `Network: DNS+TCP ${Math.round(nav.connectEnd - nav.startTime)}ms · ` +
        `TTFB ${Math.round(nav.responseStart - nav.startTime)}ms · ` +
        `HTML downloaded ${Math.round(nav.responseEnd - nav.startTime)}ms · ` +
        `DOM ready ${Math.round(nav.domContentLoadedEventEnd - nav.startTime)}ms`
      );
    }
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    if (fcp) console.log(`First Contentful Paint: ${Math.round(fcp.startTime)}ms`);
  } catch (e) {}

  console.groupEnd();
  return { total, spans: spans.slice() };
}

const perf = { mark, span, time, timeSync, firstContent, report, marks, spans };
export { perf };
