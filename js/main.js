/* ==========================================================================
   main.js — entry point.

   Every module is written as a plain function that takes no arguments and
   guards its own DOM lookups. That means a missing element can never throw
   and take the rest of the page's interactivity down with it — a real
   failure mode when sections get added one at a time.

   Loaded with `defer` in index.html, so the DOM is guaranteed to exist by
   the time this runs. No DOMContentLoaded wrapper needed.
   ========================================================================== */

/* Shared flag. Read it before starting any animation. */
window.TV = window.TV || {};
window.TV.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

(function boot() {
  'use strict';

  if (typeof initNavbar     === 'function') initNavbar();
  if (typeof initScroll     === 'function') initScroll();
  if (typeof initAnimations === 'function') initAnimations();

  initRipple();
})();

/* --------------------------------------------------------------------------
   BUTTON RIPPLE
   One listener on the document rather than one per button — this is event
   delegation, and it means buttons added in later sections work with no
   extra wiring.
   -------------------------------------------------------------------------- */
function initRipple() {
  if (window.TV.reducedMotion) return;

  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.btn') : null;
    if (!btn) return;

    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var span = document.createElement('span');

    span.className = 'ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = (e.clientX - rect.left - size / 2) + 'px';
    span.style.top  = (e.clientY - rect.top  - size / 2) + 'px';

    btn.appendChild(span);
    span.addEventListener('animationend', function () { span.remove(); });
  });
}
