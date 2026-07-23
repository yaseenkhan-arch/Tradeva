/* ══════════════════════════════════════════════════════════
   TRADEVA — ANALYTICS.JS
   Same theme/sidebar behavior as the rest of the dashboard,
   plus Chart.js configs, sample data, and animated counters
   for the Analytics page only.
══════════════════════════════════════════════════════════ */

/* ── THEME (identical pattern to dashboard.html) ── */
const html = document.documentElement;
function applyTheme(mode, save) {
  const dark = mode === 'dark';
  if (dark) html.setAttribute('data-theme', 'dark'); else html.removeAttribute('data-theme');
  const track = document.getElementById('themeTrack');
  const label = document.getElementById('themeLabel');
  if (track) { if (dark) track.classList.add('on'); else track.classList.remove('on'); }
  if (label) {
    label.innerHTML = dark
      ? `<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12.5 9.5A6 6 0 015 2a6 6 0 000 12 6 6 0 007.5-4.5z"/></svg> Dark mode`
      : `<svg viewBox="0 0 14 14" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="7" cy="7" r="3"/><line x1="7" y1="0.5" x2="7" y2="2.5"/><line x1="7" y1="11.5" x2="7" y2="13.5"/><line x1="0.5" y1="7" x2="2.5" y2="7"/><line x1="11.5" y1="7" x2="13.5" y2="7"/></svg> Light mode`;
  }
  if (save) localStorage.setItem('tradeva_theme', mode);
  setTimeout(renderAllCharts, 60);
}
function toggleTheme() {
  applyTheme(html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
}
applyTheme(localStorage.getItem('tradeva_theme') || 'light', false);

/* ── MOBILE SIDEBAR ── */
function openSidebar() {
  document.querySelector('.sidebar').classList.add('open');
  document.getElementById('sidebarOverlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ── PROFILE (reads the same localStorage as the rest of the app) ── */
function loadProfileSidebar() {
  const p = JSON.parse(localStorage.getItem('tradeva_profile') || '{}');
  const photo = localStorage.getItem('tradeva_photo');
  const fname = p.fname || 'Kham';
  const lname = p.lname || '';
  const account = p.account || 'Pro Trader';
  const initials = (fname.charAt(0) + (lname.charAt(0) || '')).toUpperCase() || 'KH';
  const nameEl = document.getElementById('sidebarName');
  const roleEl = document.getElementById('sidebarRole');
  const avatarEl = document.getElementById('sidebarAvatar');
  if (nameEl) nameEl.textContent = fname;
  if (roleEl) roleEl.textContent = account;
  if (avatarEl) {
    if (photo) {
      avatarEl.style.backgroundImage = 'url(' + photo + ')';
      avatarEl.textContent = '';
    } else {
      avatarEl.textContent = initials;
    }
  }
}

/* ── FILTER BAR (sample-data page — filters reset the view for now) ── */
function resetFilters() {
  ['filterAccount', 'filterPair', 'filterSession', 'filterDirection', 'filterResult'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.selectedIndex = 0;
  });
}

/* ══════════════════════════════════════════════════════════
   SAMPLE DATA
   (Replace with real aggregation from tradeva_trades once
   the analytics engine is wired up — kept isolated here so
   swapping to real data later only touches this block.)
══════════════════════════════════════════════════════════ */
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/* ══════════════════════════════════════════════════════════
   REAL DATA STORE
   Trades arrive from Firestore (selected account) via the module
   in analytics.html, which calls window.__tvSetAnalytics().
   Every dataset below is derived from those trades — nothing is
   hardcoded. Demo values are used only until the first real trade.
══════════════════════════════════════════════════════════ */
let TRADES = [];
let ACCOUNT = null;
let START_BALANCE = 0;
let DEMO_MODE = true;

const num = v => (typeof v === 'number' && !isNaN(v)) ? v : (parseFloat(v) || 0);

function tradeDate(t) {
  if (t.rawDate) { const d = new Date(t.rawDate + 'T00:00:00'); if (!isNaN(d)) return d; }
  if (t.date)    { const d = new Date(t.date);                  if (!isNaN(d)) return d; }
  return null;
}
function chronological(list) {
  const ts = t => (t.createdAt && typeof t.createdAt.seconds === 'number')
    ? t.createdAt.seconds * 1e6 + (t.createdAt.nanoseconds || 0) / 1e3 : null;
  return [...list].sort((a, b) => {
    const ad = a.rawDate || '', bd = b.rawDate || '';
    if (ad !== bd) return ad.localeCompare(bd);
    const at = ts(a), bt = ts(b);
    if (at !== null && bt !== null && at !== bt) return at - bt;
    if (typeof a._qi === 'number' && typeof b._qi === 'number') return b._qi - a._qi;
    return 0;
  });
}
function outcomeOf(t) {
  if (t.outcome) return t.outcome;
  const p = num(t.pnl);
  return p > 0 ? 'Win' : p < 0 ? 'Loss' : 'BE';
}

/* Group P&L by an arbitrary key, returning sorted {labels, values, winRates} */
function groupBy(list, keyFn, opts = {}) {
  const map = {};
  list.forEach(t => {
    const k = keyFn(t);
    if (!k) return;
    if (!map[k]) map[k] = { pnl: 0, n: 0, wins: 0 };
    map[k].pnl += num(t.pnl);
    map[k].n++;
    if (outcomeOf(t) === 'Win') map[k].wins++;
  });
  let entries = Object.entries(map);
  if (opts.sortByValue) entries.sort((a, b) => b[1].pnl - a[1].pnl);
  if (opts.limit) entries = entries.slice(0, opts.limit);
  return {
    labels:   entries.map(e => e[0]),
    values:   entries.map(e => Math.round(e[1].pnl)),
    winRates: entries.map(e => e[1].n ? Math.round(e[1].wins / e[1].n * 100) : 0),
    counts:   entries.map(e => e[1].n)
  };
}

/* ── Derived datasets (recomputed whenever trades change) ── */
let EQUITY_LABELS = [], EQUITY_DATA = [], DRAWDOWN_DATA = [];
let MONTHLY_LABELS = [], MONTHLY_PNL = [], WINRATE_TREND = [];
let SESSION_DATA = { labels: [], values: [], winRates: [] };
let DAY_DATA = { labels: [], values: [] };
let PAIRS_DATA = { labels: [], values: [] };
let DURATION_DATA = { labels: [], values: [] };
let RR_DATA = { labels: [], values: [] };
let OUTCOME_DATA = { labels: ['Wins','Losses','Break-even'], values: [0,0,0] };
let HEATMAP_HOURS = [], HEATMAP_VALUES = [];
let BEST_TRADES = [], WORST_TRADES = [], TIMELINE_DATA = [];

const DEMO = {
  EQUITY_LABELS: MONTHS.slice(),
  EQUITY_DATA:   [0, 3200, 5100, 9800, 8200, 14600, 19200, 24800, 31500, 36200, 41800, 47320],
  DRAWDOWN_DATA: [0, -1.2, -3.4, -0.8, -8.4, -2.1, -0.5, -4.6, -1.1, -0.3, -2.8, -0.6],
  MONTHLY_LABELS: MONTHS.slice(),
  MONTHLY_PNL:   [3200, 1900, 4700, -1600, 6400, 4600, 4600, 5600, 6700, 4700, 5600, 5520],
  WINRATE_TREND: [55, 58, 61, 57, 63, 66, 68, 65, 70, 69, 71, 68.4],
  SESSION_DATA:  { labels: ['Asia','London','New York','Overlap'], values: [3200, 21400, 15800, 6920], winRates: [52, 76, 71, 64] },
  DAY_DATA:      { labels: ['Monday','Tuesday','Wednesday','Thursday','Friday'], values: [8100, 14600, 9800, 7200, -2380] },
  PAIRS_DATA:    { labels: ['EURUSD','GBPJPY','XAUUSD','NAS100','US30'], values: [18900, 11200, 9600, 5100, 2520] },
  DURATION_DATA: { labels: ['<15m','15-60m','1-4h','4h+'], values: [4200, 19800, 16400, 6920] },
  RR_DATA:       { labels: ['<0R','0-1R','1-2R','2-3R','3-4R','4R+'], values: [8, 22, 45, 38, 19, 11] },
  OUTCOME_DATA:  { labels: ['Wins','Losses','Break-even'], values: [158, 61, 12] },
  HEATMAP_HOURS: ['7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM'],
  HEATMAP_VALUES:[40, 120, 310, 280, 90, -40, 60, -90, 20],
  BEST_TRADES: [
    { date: 'Jun 16, 2026', pair: 'XAUUSD', session: 'New York', rr: '2.6R', pnl: 2250, result: 'Win' },
    { date: 'Jul 2, 2026',  pair: 'USDCAD', session: 'London',   rr: '2.0R', pnl: 1840, result: 'Win' },
    { date: 'Jun 5, 2026',  pair: 'XAUUSD', session: 'New York', rr: '2.8R', pnl: 1750, result: 'Win' },
    { date: 'May 22, 2026', pair: 'XAUUSD', session: 'New York', rr: '3.1R', pnl: 1500, result: 'Win' },
    { date: 'Jun 20, 2026', pair: 'EURUSD', session: 'London',   rr: '2.2R', pnl: 800,  result: 'Win' },
  ],
  WORST_TRADES: [
    { date: 'May 14, 2026', pair: 'EURUSD', session: 'London',   rr: '-1.0R', pnl: -750, result: 'Loss' },
    { date: 'Apr 30, 2026', pair: 'XAUUSD', session: 'Asia',     rr: '-1.2R', pnl: -610, result: 'Loss' },
    { date: 'Apr 22, 2026', pair: 'NAS100', session: 'New York', rr: '-0.6R', pnl: -340, result: 'Loss' },
    { date: 'Apr 15, 2026', pair: 'US30',   session: 'Overlap',  rr: '-0.9R', pnl: -290, result: 'Loss' },
    { date: 'May 8, 2026',  pair: 'GBPJPY', session: 'London',   rr: '-0.8R', pnl: -260, result: 'Loss' },
  ],
  TIMELINE_DATA: ['W','W','L','W','W','W','BE','W','L','W','W','W','L','W','W','BE','W','W','L','W',
                  'W','W','L','W','W','BE','W','W','W','L','W','W','W','L','W','W','W','BE','W','W'],
};

function useDemo() {
  EQUITY_LABELS = DEMO.EQUITY_LABELS; EQUITY_DATA = DEMO.EQUITY_DATA; DRAWDOWN_DATA = DEMO.DRAWDOWN_DATA;
  MONTHLY_LABELS = DEMO.MONTHLY_LABELS; MONTHLY_PNL = DEMO.MONTHLY_PNL; WINRATE_TREND = DEMO.WINRATE_TREND;
  SESSION_DATA = DEMO.SESSION_DATA; DAY_DATA = DEMO.DAY_DATA; PAIRS_DATA = DEMO.PAIRS_DATA;
  DURATION_DATA = DEMO.DURATION_DATA; RR_DATA = DEMO.RR_DATA; OUTCOME_DATA = DEMO.OUTCOME_DATA;
  HEATMAP_HOURS = DEMO.HEATMAP_HOURS; HEATMAP_VALUES = DEMO.HEATMAP_VALUES;
  BEST_TRADES = DEMO.BEST_TRADES; WORST_TRADES = DEMO.WORST_TRADES; TIMELINE_DATA = DEMO.TIMELINE_DATA;
}

/* Build every dataset from the real trade list. */
function computeDatasets() {
  const chron = chronological(TRADES);
  if (!chron.length) { useDemo(); return; }

  const base = START_BALANCE > 0 ? START_BALANCE : 0;

  /* Equity + drawdown, grouped per day so the curve advances over time */
  const dayKeys = [], dayNet = {};
  chron.forEach(t => {
    const k = t.rawDate || t.date || '';
    if (!(k in dayNet)) { dayNet[k] = 0; dayKeys.push(k); }
    dayNet[k] += num(t.pnl);
  });
  EQUITY_LABELS = ['Start']; EQUITY_DATA = [base]; DRAWDOWN_DATA = [0];
  let cum = 0, peak = base;
  dayKeys.forEach(k => {
    cum += dayNet[k];
    const eq = base + cum;
    if (eq > peak) peak = eq;
    const d = new Date(k + 'T00:00:00');
    EQUITY_LABELS.push(isNaN(d) ? k : (MONTHS[d.getMonth()] + ' ' + d.getDate()));
    EQUITY_DATA.push(Math.round(base > 0 ? eq : cum));
    DRAWDOWN_DATA.push(peak > 0 ? Math.round(((eq - peak) / peak) * 10000) / 100 : 0);
  });

  /* Monthly P&L + win-rate trend */
  const mKeys = [], mAgg = {};
  chron.forEach(t => {
    const d = tradeDate(t); if (!d) return;
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    if (!mAgg[k]) { mAgg[k] = { pnl: 0, n: 0, wins: 0, label: MONTHS[d.getMonth()] }; mKeys.push(k); }
    mAgg[k].pnl += num(t.pnl); mAgg[k].n++;
    if (outcomeOf(t) === 'Win') mAgg[k].wins++;
  });
  MONTHLY_LABELS = mKeys.map(k => mAgg[k].label);
  MONTHLY_PNL    = mKeys.map(k => Math.round(mAgg[k].pnl));
  WINRATE_TREND  = mKeys.map(k => mAgg[k].n ? Math.round(mAgg[k].wins / mAgg[k].n * 100) : 0);

  /* Breakdowns */
  SESSION_DATA = groupBy(chron, t => t.session, { sortByValue: true });
  const DAY_ORDER = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const dow = groupBy(chron, t => { const d = tradeDate(t); return d ? DAY_ORDER[(d.getDay() + 6) % 7] : null; });
  const dowOrder = DAY_ORDER.filter(d => dow.labels.includes(d));
  DAY_DATA = { labels: dowOrder, values: dowOrder.map(d => dow.values[dow.labels.indexOf(d)]) };
  PAIRS_DATA = groupBy(chron, t => t.pair, { sortByValue: true, limit: 6 });
  DURATION_DATA = groupBy(chron, t => t.tradeType || t.setup || null, { sortByValue: true, limit: 6 });

  /* R-multiple distribution */
  const buckets = { '<0R':0, '0-1R':0, '1-2R':0, '2-3R':0, '3-4R':0, '4R+':0 };
  chron.forEach(t => {
    const r = num(t.rr);
    if (r < 0) buckets['<0R']++;
    else if (r < 1) buckets['0-1R']++;
    else if (r < 2) buckets['1-2R']++;
    else if (r < 3) buckets['2-3R']++;
    else if (r < 4) buckets['3-4R']++;
    else buckets['4R+']++;
  });
  RR_DATA = { labels: Object.keys(buckets), values: Object.values(buckets) };

  /* Outcomes */
  let w = 0, l = 0, be = 0;
  chron.forEach(t => { const o = outcomeOf(t); if (o === 'Win') w++; else if (o === 'Loss') l++; else be++; });
  OUTCOME_DATA = { labels: ['Wins','Losses','Break-even'], values: [w, l, be] };

  /* Session heatmap (uses session as the axis when hour data isn't captured) */
  HEATMAP_HOURS  = SESSION_DATA.labels.slice(0, 9);
  HEATMAP_VALUES = SESSION_DATA.values.slice(0, 9);

  /* Best / worst trades */
  const byPnl = [...chron].sort((a, b) => num(b.pnl) - num(a.pnl));
  const fmtRow = t => ({
    date: t.date || t.rawDate || '',
    pair: t.pair || '—',
    session: t.session || '—',
    rr: (num(t.rr) >= 0 ? '' : '') + num(t.rr).toFixed(1) + 'R',
    pnl: Math.round(num(t.pnl)),
    result: outcomeOf(t)
  });
  BEST_TRADES  = byPnl.filter(t => num(t.pnl) > 0).slice(0, 5).map(fmtRow);
  WORST_TRADES = byPnl.filter(t => num(t.pnl) < 0).slice(-5).reverse().map(fmtRow);

  /* Outcome timeline (last 40, oldest -> newest) */
  TIMELINE_DATA = chron.slice(-40).map(t => {
    const o = outcomeOf(t);
    return o === 'Win' ? 'W' : o === 'Loss' ? 'L' : 'BE';
  });
}

/* Update the headline stat counters from real trades */
function updateCounters() {
  const set = (sel, val) => { const el = document.querySelector(sel); if (el) el.setAttribute('data-count', val); };
  if (!TRADES.length) return;
  const wins   = TRADES.filter(t => outcomeOf(t) === 'Win');
  const losses = TRADES.filter(t => outcomeOf(t) === 'Loss');
  const net    = TRADES.reduce((s, t) => s + num(t.pnl), 0);
  const gw = wins.reduce((s, t) => s + Math.abs(num(t.pnl)), 0);
  const gl = losses.reduce((s, t) => s + Math.abs(num(t.pnl)), 0);
  const decided = wins.length + losses.length;
  set('[data-stat="netPnl"]', Math.round(net));
  set('[data-stat="winRate"]', decided ? (wins.length / decided * 100).toFixed(1) : 0);
  set('[data-stat="profitFactor"]', gl > 0 ? (gw / gl).toFixed(2) : 0);
  set('[data-stat="totalTrades"]', TRADES.length);
}

/* Entry point called by the Firestore module in analytics.html */
window.__tvSetAnalytics = function (rows, account) {
  TRADES = Array.isArray(rows) ? rows : [];
  ACCOUNT = account || null;
  START_BALANCE = account && Number(account.startingBalance) > 0 ? Number(account.startingBalance) : 0;
  DEMO_MODE = TRADES.length === 0;
  computeDatasets();
  updateCounters();
  const badge = document.getElementById('demoBadge');
  if (badge) badge.style.display = DEMO_MODE ? '' : 'none';
  renderAllCharts();
  renderHeatmap();
  renderTimeline();
  renderTables();
  animateCounters();
  animateEdgeRing();
};

/* ── ANIMATED COUNTERS ── */
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseFloat(el.getAttribute('data-count'));
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    const isDecimal = String(target).includes('.') || Math.abs(target) < 20;
    const duration = 900;
    const start = performance.now();
    const from = 0;

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (target - from) * eased;
      const display = isDecimal ? current.toFixed(1) : Math.round(current).toLocaleString('en-US');
      el.textContent = prefix + display + suffix;
      if (progress < 1) requestAnimationFrame(tick);
      else {
        const finalDisplay = isDecimal ? target.toFixed(1) : Math.round(target).toLocaleString('en-US');
        el.textContent = prefix + finalDisplay + suffix;
      }
    }
    requestAnimationFrame(tick);
  });
}

/* ── HEATMAP RENDER ── */
function renderHeatmap() {
  const row = document.getElementById('heatmapRow');
  if (!row) return;
  const max = Math.max(...HEATMAP_VALUES.map(v => Math.abs(v)));
  row.innerHTML = HEATMAP_VALUES.map((v, i) => {
    const intensity = Math.min(1, Math.abs(v) / max);
    const isPos = v >= 0;
    const color = isPos
      ? `rgba(16,185,129,${0.25 + intensity * 0.65})`
      : `rgba(239,68,68,${0.25 + intensity * 0.65})`;
    return `<div class="heat-cell" style="background:${color};" title="${HEATMAP_HOURS[i]}: ${isPos ? '+' : ''}$${v}">
      <span class="heat-hour">${HEATMAP_HOURS[i]}</span>
      <span>${isPos ? '+' : ''}${v}</span>
    </div>`;
  }).join('');
}

/* ── TIMELINE RENDER ── */
function renderTimeline() {
  const strip = document.getElementById('timelineStrip');
  if (!strip) return;
  const colorMap = { W: 'var(--green)', L: 'var(--red)', BE: 'var(--text-faint)' };
  const labelMap = { W: 'Win', L: 'Loss', BE: 'Break-even' };
  strip.innerHTML = TIMELINE_DATA.map((o, i) =>
    `<div class="timeline-dot" style="background:${colorMap[o]};" title="Trade ${i + 1}: ${labelMap[o]}"></div>`
  ).join('');
}

/* ── TABLES RENDER ── */
function renderTables() {
  const fmtPnl = v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const bestBody = document.getElementById('bestTradesBody');
  if (bestBody) {
    bestBody.innerHTML = BEST_TRADES.map(t => `
      <tr>
        <td>${t.date}</td>
        <td class="td-pair">${t.pair}</td>
        <td>${t.session}</td>
        <td>${t.rr}</td>
        <td class="green" style="color:var(--green);font-weight:700;">${fmtPnl(t.pnl)}</td>
        <td><span class="result-badge result-win">Win</span></td>
      </tr>`).join('');
  }

  const worstBody = document.getElementById('worstTradesBody');
  if (worstBody) {
    worstBody.innerHTML = WORST_TRADES.map(t => `
      <tr>
        <td>${t.date}</td>
        <td class="td-pair">${t.pair}</td>
        <td>${t.session}</td>
        <td>${t.rr}</td>
        <td style="color:var(--red);font-weight:700;">${fmtPnl(t.pnl)}</td>
        <td><span class="result-badge result-loss">Loss</span></td>
      </tr>`).join('');
  }
}

/* ── EDGE SCORE RING ANIMATION ── */
function animateEdgeRing() {
  const target = 87;
  const circumference = 439.8; // 2 * PI * r(70)
  const ring = document.getElementById('edgeRingFg');
  const numEl = document.getElementById('edgeScoreNum');
  if (!ring || !numEl) return;

  const offset = circumference - (target / 100) * circumference;
  requestAnimationFrame(() => { ring.style.strokeDashoffset = offset; });

  const duration = 1200;
  const start = performance.now();
  function tick(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    numEl.textContent = Math.round(target * eased);
    if (progress < 1) requestAnimationFrame(tick);
    else numEl.textContent = target;
  }
  requestAnimationFrame(tick);
}

/* ══════════════════════════════════════════════════════════
   CHART.JS CONFIGS
══════════════════════════════════════════════════════════ */
let chartInstances = {};

function isDark() { return html.getAttribute('data-theme') === 'dark'; }

function destroyCharts() {
  Object.values(chartInstances).forEach(c => c && c.destroy());
  chartInstances = {};
}

function baseColors() {
  return {
    grid: isDark() ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    tick: isDark() ? '#3D5170' : '#94A3B8',
    tooltipBg: isDark() ? '#1A2540' : '#0F172A',
    tooltipText: '#F0F4FF',
    tooltipSub: '#8899B4',
  };
}

function renderAllCharts() {
  destroyCharts();
  const c = baseColors();

  /* ── Equity Curve ── */
  const eqCtx = document.getElementById('equityChart').getContext('2d');
  const eqGrad = eqCtx.createLinearGradient(0, 0, 0, 220);
  eqGrad.addColorStop(0, 'rgba(16,185,129,0.22)');
  eqGrad.addColorStop(1, 'rgba(16,185,129,0)');
  chartInstances.equity = new Chart(eqCtx, {
    type: 'line',
    data: { labels: EQUITY_LABELS, datasets: [{ data: EQUITY_DATA, borderColor: '#10B981', borderWidth: 2.5, backgroundColor: eqGrad, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#10B981', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
    options: chartOptions(c, v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), v => ' $' + v.toLocaleString())
  });

  /* ── Drawdown Curve (negative, matches dashboard convention) ── */
  const ddCtx = document.getElementById('drawdownChart').getContext('2d');
  const ddGrad = ddCtx.createLinearGradient(0, 0, 0, 220);
  ddGrad.addColorStop(0, 'rgba(239,68,68,0)');
  ddGrad.addColorStop(1, 'rgba(239,68,68,0.22)');
  chartInstances.drawdown = new Chart(ddCtx, {
    type: 'line',
    data: { labels: EQUITY_LABELS, datasets: [{ data: DRAWDOWN_DATA, borderColor: '#EF4444', borderWidth: 2.5, backgroundColor: ddGrad, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#EF4444', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
    options: chartOptions(c, v => v + '%', v => ' ' + v.toFixed(1) + '%', -10, 0)
  });

  /* ── Monthly Performance (bar, green/red per bar) ── */
  const moCtx = document.getElementById('monthlyChart').getContext('2d');
  chartInstances.monthly = new Chart(moCtx, {
    type: 'bar',
    data: { labels: MONTHLY_LABELS, datasets: [{ data: MONTHLY_PNL, backgroundColor: MONTHLY_PNL.map(v => v >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)'), borderRadius: 5, maxBarThickness: 28 }] },
    options: chartOptions(c, v => '$' + (v/1000).toFixed(0) + 'k', v => ' $' + v.toLocaleString())
  });

  /* ── Rolling Win Rate ── */
  const wrCtx = document.getElementById('winRateChart').getContext('2d');
  const wrGrad = wrCtx.createLinearGradient(0, 0, 0, 220);
  wrGrad.addColorStop(0, 'rgba(59,130,246,0.20)');
  wrGrad.addColorStop(1, 'rgba(59,130,246,0)');
  chartInstances.winrate = new Chart(wrCtx, {
    type: 'line',
    data: { labels: MONTHLY_LABELS, datasets: [{ data: WINRATE_TREND, borderColor: '#3B82F6', borderWidth: 2.5, backgroundColor: wrGrad, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#3B82F6', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
    options: chartOptions(c, v => v + '%', v => ' ' + v.toFixed(1) + '%', 40, 80)
  });

  /* ── Session Performance (horizontal bar) ── */
  chartInstances.session = new Chart(document.getElementById('sessionChart').getContext('2d'), {
    type: 'bar',
    data: { labels: SESSION_DATA.labels, datasets: [{ data: SESSION_DATA.values, backgroundColor: ['#94A3B8','#10B981','#3B82F6','#8B5CF6'].map(hex => hexToRgba(hex, 0.8)), borderRadius: 6, maxBarThickness: 22 }] },
    options: hBarOptions(c, SESSION_DATA.winRates, ' WR')
  });

  /* ── PnL by Day of Week (horizontal bar) ── */
  chartInstances.dayOfWeek = new Chart(document.getElementById('dayOfWeekChart').getContext('2d'), {
    type: 'bar',
    data: { labels: DAY_DATA.labels, datasets: [{ data: DAY_DATA.values, backgroundColor: DAY_DATA.values.map(v => v >= 0 ? 'rgba(16,185,129,0.8)' : 'rgba(239,68,68,0.8)'), borderRadius: 6, maxBarThickness: 22 }] },
    options: hBarOptions(c)
  });

  /* ── Best Trading Pairs (horizontal bar) ── */
  chartInstances.pairs = new Chart(document.getElementById('pairsChart').getContext('2d'), {
    type: 'bar',
    data: { labels: PAIRS_DATA.labels, datasets: [{ data: PAIRS_DATA.values, backgroundColor: 'rgba(59,130,246,0.8)', borderRadius: 6, maxBarThickness: 20 }] },
    options: hBarOptions(c)
  });

  /* ── Trade Duration Analysis (bar) ── */
  chartInstances.duration = new Chart(document.getElementById('durationChart').getContext('2d'), {
    type: 'bar',
    data: { labels: DURATION_DATA.labels, datasets: [{ data: DURATION_DATA.values, backgroundColor: 'rgba(16,185,129,0.75)', borderRadius: 6, maxBarThickness: 34 }] },
    options: chartOptions(c, v => '$' + (v/1000).toFixed(0) + 'k', v => ' $' + v.toLocaleString())
  });

  /* ── R:R Distribution (histogram) ── */
  chartInstances.rr = new Chart(document.getElementById('rrChart').getContext('2d'), {
    type: 'bar',
    data: { labels: RR_DATA.labels, datasets: [{ data: RR_DATA.values, backgroundColor: RR_DATA.labels.map(l => l === '<0R' ? 'rgba(239,68,68,0.75)' : 'rgba(59,130,246,0.75)'), borderRadius: 5, maxBarThickness: 30 }] },
    options: chartOptions(c, v => v, v => ' ' + v + ' trades')
  });

  /* ── Trade Outcome Donut ── */
  chartInstances.outcome = new Chart(document.getElementById('outcomeChart').getContext('2d'), {
    type: 'doughnut',
    data: { labels: OUTCOME_DATA.labels, datasets: [{ data: OUTCOME_DATA.values, backgroundColor: ['#10B981', '#EF4444', isDark() ? '#3D5170' : '#CBD5E1'], borderWidth: 0, hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: c.tooltipBg, titleColor: c.tooltipSub, bodyColor: c.tooltipText, padding: 10, cornerRadius: 8 }
      },
      animation: { duration: 800, easing: 'easeInOutQuart' }
    }
  });
}

/* Shared line/bar chart options builder */
function chartOptions(c, yTickFmt, tooltipFmt, yMin, yMax) {
  const opts = {
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg, titleColor: c.tooltipSub, bodyColor: c.tooltipText,
        padding: 10, cornerRadius: 8,
        callbacks: { label: ctx => tooltipFmt(ctx.raw) }
      }
    },
    scales: {
      x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 11 } } },
      y: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 11 }, callback: yTickFmt } }
    }
  };
  if (yMin !== undefined) opts.scales.y.min = yMin;
  if (yMax !== undefined) opts.scales.y.max = yMax;
  return opts;
}

/* Horizontal bar options builder (used for Session / Day / Pairs charts) */
function hBarOptions(c, extraLabels, extraSuffix) {
  return {
    indexAxis: 'y',
    responsive: true, maintainAspectRatio: false,
    animation: { duration: 700, easing: 'easeInOutQuart' },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: c.tooltipBg, titleColor: c.tooltipSub, bodyColor: c.tooltipText,
        padding: 10, cornerRadius: 8,
        callbacks: {
          label: ctx => {
            const val = ctx.raw;
            const base = ' ' + (val >= 0 ? '+$' : '-$') + Math.abs(val).toLocaleString();
            if (extraLabels) return base + ' · ' + extraLabels[ctx.dataIndex] + (extraSuffix || '') + '%';
            return base;
          }
        }
      }
    },
    scales: {
      x: { grid: { color: c.grid }, ticks: { color: c.tick, font: { size: 10 }, callback: v => '$' + (Math.abs(v) >= 1000 ? (v/1000).toFixed(0)+'k' : v) } },
      y: { grid: { display: false }, ticks: { color: c.tick, font: { size: 11, weight: '600' } } }
    }
  };
}

/* Hex -> rgba helper for session bar coloring */
function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* ── INIT ── */
document.addEventListener('DOMContentLoaded', () => {
  loadProfileSidebar();
  // charts render once Firestore trades arrive (see module in analytics.html)
});
