/**
 * Sticky note — shadowedvaca.com command center
 *
 * Desktop only. On mobile (≤900px) the note is hidden via CSS.
 *
 * On load: places the note at a semi-random horizontal position
 * (center ±120px, clamped) with a slight random rotation (-3° to +1°).
 * Random values are generated ONCE at init and reused on resize so the
 * note doesn't jump when the browser address bar shows/hides.
 *
 * Draggable via mouse. Touch drag is intentionally disabled — the
 * touchstart/touchmove preventDefault required for dragging blocks
 * page scroll on mobile.
 */
(function () {
  "use strict";

  var sticky, stage;
  var isDragging  = false;
  var wasDragged  = false;   // true once the user has moved the note
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var resizeTimer;

  // Random values stored once at init — reused on every resize call so
  // a viewport-height change (address bar show/hide) doesn't re-randomise.
  var _offsetFrac = 0;   // -1 to +1, fraction of maxOffset
  var _rotation   = 0;   // degrees

  // ── Initial random placement ─────────────────────────────────────────────

  function positionSticky() {
    if (wasDragged) { return; }   // keep user-placed position across resize

    var stageWidth  = stage.offsetWidth;
    var stickyWidth = sticky.offsetWidth;
    var margin      = 24;
    var center      = stageWidth / 2;
    var maxOffset   = Math.min(120, (stageWidth - stickyWidth) / 2 - margin);

    var leftPos = center - (stickyWidth / 2) + _offsetFrac * maxOffset;

    sticky.style.left      = leftPos + "px";
    sticky.style.top       = "auto";
    sticky.style.bottom    = "2.5rem";
    sticky.style.transform = "rotate(" + _rotation + "deg)";
  }

  // ── Drag helpers ─────────────────────────────────────────────────────────

  function startDrag(clientX, clientY) {
    isDragging = true;

    var rect      = sticky.getBoundingClientRect();
    var stageRect = stage.getBoundingClientRect();

    dragOffsetX = clientX - rect.left;
    dragOffsetY = clientY - rect.top;

    // Switch from bottom- to top-based positioning so we can drag freely
    sticky.style.top    = (rect.top - stageRect.top) + "px";
    sticky.style.bottom = "auto";

    document.body.style.cursor = "grabbing";
    sticky.style.cursor        = "grabbing";
  }

  function moveDrag(clientX, clientY) {
    if (!isDragging) { return; }

    var stageRect = stage.getBoundingClientRect();
    var x = clientX - stageRect.left - dragOffsetX;
    var y = clientY - stageRect.top  - dragOffsetY;

    // Clamp to stage bounds
    x = Math.max(0, Math.min(stage.offsetWidth  - sticky.offsetWidth,  x));
    y = Math.max(0, Math.min(stage.offsetHeight - sticky.offsetHeight, y));

    sticky.style.left = x + "px";
    sticky.style.top  = y + "px";
    wasDragged = true;
  }

  function endDrag() {
    if (!isDragging) { return; }
    isDragging = false;
    document.body.style.cursor = "";
    sticky.style.cursor        = "";
  }

  // ── Event listeners ───────────────────────────────────────────────────────

  function onMouseDown(e) {
    startDrag(e.clientX, e.clientY);
    e.preventDefault();
  }

  function onMouseMove(e) { moveDrag(e.clientX, e.clientY); }
  function onMouseUp()    { endDrag(); }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    sticky = document.getElementById("stickyNote");
    if (!sticky) { return; }
    stage = sticky.parentElement;

    // Generate random values once — reused on every positionSticky() call
    _offsetFrac = Math.random() * 2 - 1;   // -1 to +1
    _rotation   = -3 + Math.random() * 4;  // -3° to +1°

    positionSticky();

    // Mouse drag (desktop only — touch drag disabled to keep page scroll working)
    sticky.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);

    // Re-calculate layout bounds on resize, reusing the same random position
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
