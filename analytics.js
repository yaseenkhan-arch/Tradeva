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
const EQUITY_DATA   = [0, 3200, 5100, 9800, 8200, 14600, 19200, 24800, 31500, 36200, 41800, 47320];
const DRAWDOWN_DATA  = [0, -1.2, -3.4, -0.8, -8.4, -2.1, -0.5, -4.6, -1.1, -0.3, -2.8, -0.6];
const MONTHLY_PNL    = [3200, 1900, 4700, -1600, 6400, 4600, 4600, 5600, 6700, 4700, 5600, 5520];
const WINRATE_TREND  = [55, 58, 61, 57, 63, 66, 68, 65, 70, 69, 71, 68.4];

const SESSION_DATA  = { labels: ['Asia','London','New York','Overlap'], values: [3200, 21400, 15800, 6920], winRates: [52, 76, 71, 64] };
const DAY_DATA      = { labels: ['Monday','Tuesday','Wednesday','Thursday','Friday'], values: [8100, 14600, 9800, 7200, -2380] };
const PAIRS_DATA    = { labels: ['EURUSD','GBPJPY','XAUUSD','NAS100','US30'], values: [18900, 11200, 9600, 5100, 2520] };
const DURATION_DATA = { labels: ['<15m','15–60m','1–4h','4h+'], values: [4200, 19800, 16400, 6920] };
const RR_DATA       = { labels: ['<0R','0–1R','1–2R','2–3R','3–4R','4R+'], values: [8, 22, 45, 38, 19, 11] };
const OUTCOME_DATA  = { labels: ['Wins','Losses','Break-even'], values: [158, 61, 12] };

const HEATMAP_HOURS  = ['7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM'];
const HEATMAP_VALUES = [40, 120, 310, 280, 90, -40, 60, -90, 20];

const BEST_TRADES = [
  { date: 'Jun 16, 2026', pair: 'XAUUSD', session: 'New York', rr: '2.6R', pnl: 2250, result: 'Win' },
  { date: 'Jul 2, 2026',  pair: 'USDCAD', session: 'London',   rr: '2.0R', pnl: 1840, result: 'Win' },
  { date: 'Jun 5, 2026',  pair: 'XAUUSD', session: 'New York', rr: '2.8R', pnl: 1750, result: 'Win' },
  { date: 'May 22, 2026', pair: 'XAUUSD', session: 'New York', rr: '3.1R', pnl: 1500, result: 'Win' },
  { date: 'Jun 20, 2026', pair: 'EURUSD', session: 'London',   rr: '2.2R', pnl: 800,  result: 'Win' },
];
const WORST_TRADES = [
  { date: 'May 14, 2026', pair: 'EURUSD', session: 'London',   rr: '-1.0R', pnl: -750, result: 'Loss' },
  { date: 'Apr 30, 2026', pair: 'XAUUSD', session: 'Asia',     rr: '-1.2R', pnl: -610, result: 'Loss' },
  { date: 'Apr 22, 2026', pair: 'NAS100', session: 'New York', rr: '-0.6R', pnl: -340, result: 'Loss' },
  { date: 'Apr 15, 2026', pair: 'US30',   session: 'Overlap',  rr: '-0.9R', pnl: -290, result: 'Loss' },
  { date: 'May 8, 2026',  pair: 'GBPJPY', session: 'London',   rr: '-0.8R', pnl: -260, result: 'Loss' },
];

/* Sequence of last 40 trade outcomes for the timeline strip (oldest -> newest) */
const TIMELINE_DATA = ['W','W','L','W','W','W','BE','W','L','W','W','W','L','W','W','BE','W','W','L','W',
                        'W','W','L','W','W','BE','W','W','W','L','W','W','W','L','W','W','W','BE','W','W'];

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
    data: { labels: MONTHS, datasets: [{ data: EQUITY_DATA, borderColor: '#10B981', borderWidth: 2.5, backgroundColor: eqGrad, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#10B981', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
    options: chartOptions(c, v => '$' + (v >= 1000 ? (v/1000).toFixed(0)+'k' : v), v => ' $' + v.toLocaleString())
  });

  /* ── Drawdown Curve (negative, matches dashboard convention) ── */
  const ddCtx = document.getElementById('drawdownChart').getContext('2d');
  const ddGrad = ddCtx.createLinearGradient(0, 0, 0, 220);
  ddGrad.addColorStop(0, 'rgba(239,68,68,0)');
  ddGrad.addColorStop(1, 'rgba(239,68,68,0.22)');
  chartInstances.drawdown = new Chart(ddCtx, {
    type: 'line',
    data: { labels: MONTHS, datasets: [{ data: DRAWDOWN_DATA, borderColor: '#EF4444', borderWidth: 2.5, backgroundColor: ddGrad, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#EF4444', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
    options: chartOptions(c, v => v + '%', v => ' ' + v.toFixed(1) + '%', -10, 0)
  });

  /* ── Monthly Performance (bar, green/red per bar) ── */
  const moCtx = document.getElementById('monthlyChart').getContext('2d');
  chartInstances.monthly = new Chart(moCtx, {
    type: 'bar',
    data: { labels: MONTHS, datasets: [{ data: MONTHLY_PNL, backgroundColor: MONTHLY_PNL.map(v => v >= 0 ? 'rgba(16,185,129,0.75)' : 'rgba(239,68,68,0.75)'), borderRadius: 5, maxBarThickness: 28 }] },
    options: chartOptions(c, v => '$' + (v/1000).toFixed(0) + 'k', v => ' $' + v.toLocaleString())
  });

  /* ── Rolling Win Rate ── */
  const wrCtx = document.getElementById('winRateChart').getContext('2d');
  const wrGrad = wrCtx.createLinearGradient(0, 0, 0, 220);
  wrGrad.addColorStop(0, 'rgba(59,130,246,0.20)');
  wrGrad.addColorStop(1, 'rgba(59,130,246,0)');
  chartInstances.winrate = new Chart(wrCtx, {
    type: 'line',
    data: { labels: MONTHS, datasets: [{ data: WINRATE_TREND, borderColor: '#3B82F6', borderWidth: 2.5, backgroundColor: wrGrad, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: '#3B82F6', pointHoverBorderColor: '#fff', pointHoverBorderWidth: 2 }] },
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
  renderAllCharts();
  renderHeatmap();
  renderTimeline();
  renderTables();
  animateCounters();
  animateEdgeRing();
});
