/**
 * Terminal navigation — shadowedvaca.com command center
 *
 * Clicking a project in the terminal sidebar:
 *   1. Removes "selected" from all terminal projects
 *   2. Adds "selected" to the clicked project
 *   3. Hides all .stage-view elements
 *   4. Shows the target .stage-view with a fade-in animation
 *   5. Scrolls the main stage content area back to the top
 */
(function () {
  "use strict";

  function init() {
    var projects = document.querySelectorAll(".terminal-project[data-target]");
    var views    = document.querySelectorAll(".stage-view");
    var scroll   = document.querySelector(".main-stage-scroll");

    projects.forEach(function (proj) {
      proj.addEventListener("click", function () {
        var targetId = proj.getAttribute("data-target");

        // Update selected state in terminal
        projects.forEach(function (p) { p.classList.remove("selected"); });
        proj.classList.add("selected");

        // Swap the active stage view
        views.forEach(function (v) { v.classList.remove("active"); });
        var target = document.getElementById(targetId);
        if (target) { target.classList.add("active"); }

        // Scroll main stage to top
        if (scroll) { scroll.scrollTop = 0; }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
