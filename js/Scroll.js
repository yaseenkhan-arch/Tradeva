/* ==========================================================================
   scroll.js — progress bar + nav shadow.

   Both effects share ONE scroll listener, throttled with
   requestAnimationFrame. Two independent listeners each doing their own
   layout read is the classic cause of janky scrolling.

   `{ passive: true }` tells the browser we will never call
   preventDefault(), so it can scroll without waiting for our handler.
   ========================================================================== */

function initScroll() {
  'use strict';

  var bar = document.getElementById('progress');
  var nav = document.getElementById('nav');
  var ticking = false;

  function update() {
    var y   = window.scrollY || document.documentElement.scrollTop;
    var max = document.documentElement.scrollHeight - window.innerHeight;

    if (bar) bar.style.transform = 'scaleX(' + (max > 0 ? y / max : 0) + ')';
    if (nav) nav.classList.toggle('is-scrolled', y > 8);

    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
  }, { passive: true });

  update();   // set the correct state on load, e.g. after a refresh mid-page
}
