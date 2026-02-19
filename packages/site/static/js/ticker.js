/**
 * Ticker animation — shadowedvaca.com command center
 *
 * - Duplicates ticker items so the scroll loops seamlessly
 * - Sets animation duration based on content width for consistent scroll speed
 * - Pauses on hover (desktop)
 */
(function () {
  "use strict";

  var PIXELS_PER_SECOND = 75;

  function init() {
    var ticker = document.getElementById("cc-ticker");
    var track = document.getElementById("cc-ticker-track");

    if (!ticker || !track) return;

    // Duplicate all children so the loop is seamless.
    // CSS animates from 0 to -50%, which puts the duplicate exactly at 0.
    var originals = Array.prototype.slice.call(track.children);
    originals.forEach(function (node) {
      var clone = node.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      track.appendChild(clone);
    });

    // Set duration based on the width of one copy (half total scrollWidth)
    // so scroll speed is consistent regardless of how many announcements exist.
    function updateDuration() {
      var halfWidth = track.scrollWidth / 2;
      var duration = halfWidth / PIXELS_PER_SECOND;
      track.style.animationDuration = duration.toFixed(1) + "s";
    }

    updateDuration();

    // Pause on hover so the user can read announcements
    ticker.addEventListener("mouseenter", function () {
      track.style.animationPlayState = "paused";
    });

    ticker.addEventListener("mouseleave", function () {
      track.style.animationPlayState = "running";
    });

    // Re-compute duration if viewport resizes significantly
    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(updateDuration, 150);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
