/* ==========================================================================
   navbar.js — sticky nav state + mobile menu.
   ========================================================================== */

function initNavbar() {
  'use strict';

  var toggle = document.getElementById('navToggle');
  var menu   = document.getElementById('mobileMenu');
  if (!toggle || !menu) return;

  function setMenu(open) {
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }

  toggle.addEventListener('click', function () {
    setMenu(!menu.classList.contains('open'));
  });

  /* Close after tapping a link — otherwise the open menu covers the very
     section the user just asked to jump to. */
  menu.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') setMenu(false);
  });

  /* Escape closes it and returns focus to the button, so keyboard users
     aren't stranded inside a closed menu. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && menu.classList.contains('open')) {
      setMenu(false);
      toggle.focus();
    }
  });
}
