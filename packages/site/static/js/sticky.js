/**
 * Sticky note positioning — shadowedvaca.com command center
 *
 * On load, places the sticky note at a semi-random horizontal position
 * within the main stage: roughly centered ±120px, clamped to stay in bounds.
 * Also applies a slight random rotation between -3° and +1°.
 * Recalculates on window resize to keep it in bounds.
 */
(function () {
  "use strict";

  function positionSticky() {
    var sticky = document.getElementById("stickyNote");
    if (!sticky) { return; }

    var stage      = sticky.parentElement;
    var stageWidth = stage.offsetWidth;
    var stickyWidth = sticky.offsetWidth;

    var margin    = 24;
    var center    = stageWidth / 2;
    var maxOffset = Math.min(120, (stageWidth - stickyWidth) / 2 - margin);

    // Random offset from center
    var offset  = (Math.random() * 2 - 1) * maxOffset;
    var leftPos = center - (stickyWidth / 2) + offset;

    // Random slight rotation: -3° to +1°
    var rotation = -3 + Math.random() * 4;

    sticky.style.left      = leftPos + "px";
    sticky.style.transform = "rotate(" + rotation + "deg)";
  }

  var resizeTimer;

  function init() {
    positionSticky();
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(positionSticky, 150);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
