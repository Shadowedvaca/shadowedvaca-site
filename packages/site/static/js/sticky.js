/**
 * Sticky note — shadowedvaca.com command center
 *
 * On load: places the note at a semi-random horizontal position
 * (center ±120px, clamped) with a slight random rotation (-3° to +1°).
 *
 * Draggable: the user can grab and reposition the note anywhere within
 * the main stage. Supports mouse and touch. On resize, resets to the
 * random position only if the note hasn't been dragged yet.
 */
(function () {
  "use strict";

  var sticky, stage;
  var isDragging  = false;
  var wasDragged  = false;   // true once the user has moved the note
  var dragOffsetX = 0;
  var dragOffsetY = 0;
  var resizeTimer;

  // ── Initial random placement ─────────────────────────────────────────────

  function positionSticky() {
    if (wasDragged) { return; }   // keep user-placed position across resize

    var stageWidth  = stage.offsetWidth;
    var stickyWidth = sticky.offsetWidth;
    var margin      = 24;
    var center      = stageWidth / 2;
    var maxOffset   = Math.min(120, (stageWidth - stickyWidth) / 2 - margin);

    var offset   = (Math.random() * 2 - 1) * maxOffset;
    var leftPos  = center - (stickyWidth / 2) + offset;
    var rotation = -3 + Math.random() * 4;   // -3° to +1°

    sticky.style.left      = leftPos + "px";
    sticky.style.top       = "auto";
    sticky.style.bottom    = "2.5rem";
    sticky.style.transform = "rotate(" + rotation + "deg)";
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

  function onTouchStart(e) {
    var t = e.touches[0];
    startDrag(t.clientX, t.clientY);
    e.preventDefault();
  }

  function onTouchMove(e) {
    var t = e.touches[0];
    moveDrag(t.clientX, t.clientY);
    e.preventDefault();
  }

  function onTouchEnd() { endDrag(); }

  // ── Init ─────────────────────────────────────────────────────────────────

  function init() {
    sticky = document.getElementById("stickyNote");
    if (!sticky) { return; }
    stage = sticky.parentElement;

    positionSticky();

    // Mouse
    sticky.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup",   onMouseUp);

    // Touch (passive: false so we can call preventDefault)
    sticky.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove",  onTouchMove,  { passive: false });
    document.addEventListener("touchend",   onTouchEnd);

    // Re-randomise on resize only if the user hasn't dragged the note
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
