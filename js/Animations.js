/* ==========================================================================
   animations.js — scroll reveal + hero mouse parallax.
   ========================================================================== */

function initAnimations() {
  'use strict';

  revealOnScroll();
  heroParallax();
}

/* --------------------------------------------------------------------------
   SCROLL REVEAL

   Each element is unobserved the moment it appears: something that has
   already been revealed never needs watching again, and leaving dozens of
   observers running costs real battery on a long page.
   -------------------------------------------------------------------------- */
function revealOnScroll() {
  var items = document.querySelectorAll('.reveal, .reveal-left, .reveal-right, .reveal-blur');
  if (!items.length) return;

  /* No IntersectionObserver, or the user asked for less motion?
     Show everything immediately. Never leave content at opacity 0. */
  if (window.TV.reducedMotion || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(items, function (el) { el.classList.add('in'); });
    return;
  }

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: .08 });

  Array.prototype.forEach.call(items, function (el) {
    /* Stagger by position among siblings, so a row of cards cascades while
       a lone heading animates immediately. */
    var sibs = el.parentNode ? el.parentNode.children : [el];
    var idx  = Array.prototype.indexOf.call(sibs, el);
    el.style.transitionDelay = (idx > 0 ? Math.min(idx, 4) * 70 : 0) + 'ms';
    io.observe(el);
  });
}

/* --------------------------------------------------------------------------
   HERO MOUSE PARALLAX

   Deliberately tiny: 8px of travel across the whole viewport. Enough to add
   depth, not enough to notice as an effect.

   Skipped entirely on touch devices — there is no cursor to follow, and
   listening for pointermove there would only cost battery.
   -------------------------------------------------------------------------- */
function heroParallax() {
  var stage = document.querySelector('.hero-stage');
  if (!stage || window.TV.reducedMotion) return;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

  var MAX = 8;              // px of movement at the screen edge
  var ticking = false;
  var tx = 0, ty = 0;

  window.addEventListener('pointermove', function (e) {
    /* Range: -1 .. 1, measured from the centre of the viewport. */
    tx = ((e.clientX / window.innerWidth)  - .5) * 2 * MAX;
    ty = ((e.clientY / window.innerHeight) - .5) * 2 * MAX;

    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(function () {
        /* translate3d promotes the element to its own compositor layer,
           so the float animation and the parallax don't fight each other. */
        stage.style.transform = 'translate3d(' + (-tx) + 'px,' + (-ty) + 'px,0)';
        ticking = false;
      });
    }
  }, { passive: true });
}
