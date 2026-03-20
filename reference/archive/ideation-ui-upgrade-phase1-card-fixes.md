# Phase UI-1 — Card Grid UI Fixes

**Branch:** `ideation-ui-upgrade` (off `main`)
**Prereq:** None — this is the first phase.
Read `reference/ideation-ui-upgrade.md` for full context and architecture.

---

## Goal
Fix four things on the idea card grid:
1. Show the full pitch (remove 3-line clamp)
2. Stop badges from overflowing off the right edge of the card
3. Replace the styled doc-count badge with plain "N docs · M artifacts" info text
4. Collapse long tag lists to one line with a per-card "···" expand toggle

---

## Files Changed
```
packages/site/static/css/command-center.css
packages/site/static/js/ideas.js
```

---

## Step 1 — Remove pitch line-clamp

File: `packages/site/static/css/command-center.css`

Find `.idea-card-pitch` and remove these three lines from inside it:
```css
display: -webkit-box;
-webkit-line-clamp: 3;
-webkit-box-orient: vertical;
overflow: hidden;
```

Leave all other properties (`font-size`, `color`, `line-height`, `margin-bottom`) intact.

---

## Step 2 — Fix header overflow

The `.idea-card-header` is `display: flex`. When a title is long, it pushes the badge cluster
off-screen to the right. Fix: let the title shrink and truncate; keep badges rigid.

File: `packages/site/static/css/command-center.css`

Replace the existing `.idea-card-title` rule:
```css
.idea-card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0;
  flex: 1 1 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Replace the existing `.idea-card-badges` rule:
```css
.idea-card-badges {
  display: flex;
  gap: 0.35rem;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
}
```

---

## Step 3 — Replace styled doc badge with plain info text

### 3a — CSS changes

File: `packages/site/static/css/command-center.css`

Add this new rule (place it near the other `.idea-card-*` rules):
```css
.idea-card-counts {
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.68rem;
  color: var(--text-secondary);
  white-space: nowrap;
}
```

Remove the `.idea-badge--docs` rule entirely (it is no longer used).

### 3b — JS changes

File: `packages/site/static/js/ideas.js` — inside `renderGrid()`

**Find** this block (the existing doc badge variable):
```js
    var docCount = idea.document_count || 0;
    var docBadge = docCount > 0
      ? '<span class="idea-badge idea-badge--docs">' + docCount + ' doc' + (docCount !== 1 ? 's' : '') + '</span>' : '';
```

**Replace with:**
```js
    var docCount = idea.document_count || 0;
    var artifactCount = idea.artifact_count || 0;
    var countsParts = [];
    if (docCount > 0) countsParts.push(docCount + ' doc' + (docCount !== 1 ? 's' : ''));
    if (artifactCount > 0) countsParts.push(artifactCount + ' artifact' + (artifactCount !== 1 ? 's' : ''));
    var countsText = countsParts.length > 0
      ? '<span class="idea-card-counts">' + countsParts.join(' · ') + '</span>'
      : '';
```

**Find** in the card HTML string inside the same `renderGrid()`:
```js
          '<div class="idea-card-badges">' + secretBadge + updatedBadge + docBadge + '</div>' +
```

**Replace with:**
```js
          '<div class="idea-card-badges">' + secretBadge + updatedBadge + countsText + '</div>' +
```

---

## Step 4 — Tags per-card collapse

Tags collapse to one line by default. A `···` button reveals all. State is per-card and
persists within the session (survives filter/sort changes; resets on page reload).

### 4a — Add module-level state

File: `packages/site/static/js/ideas.js`

**Find** (near top of file):
```js
var allIdeas = [];
var isAdmin = false;
```

**Replace with:**
```js
var allIdeas = [];
var isAdmin = false;
var expandedTags = {};   // keyed by idea id string; true = expanded
```

### 4b — Update tag rendering in renderGrid()

**Find** in the card HTML string inside `renderGrid()`:
```js
        (tags ? '<div class="idea-card-tags">' + tags + '</div>' : '') +
```

**Replace with:**
```js
        (tags
          ? '<div class="idea-card-tags" id="tags-' + idea.id + '">' + tags + '</div>' +
            '<button class="tags-toggle" data-id="' + idea.id + '" aria-label="expand tags">···</button>'
          : '') +
```

### 4c — Post-render pass after grid.innerHTML = html

**Find** (at the end of `renderGrid()`, the existing card-click binding):
```js
  grid.querySelectorAll('.idea-card').forEach(function(card) {
    card.addEventListener('click', function() {
      openOverlay(parseInt(card.dataset.id));
    });
  });
```

**Replace with:**
```js
  grid.querySelectorAll('.idea-card').forEach(function(card) {
    card.addEventListener('click', function() {
      openOverlay(parseInt(card.dataset.id));
    });
  });

  // Tags collapse: restore state and hide toggle when not needed
  grid.querySelectorAll('.idea-card-tags').forEach(function(el) {
    var id = el.id.replace('tags-', '');
    var btn = el.parentElement.querySelector('.tags-toggle[data-id="' + id + '"]');
    if (!btn) return;
    if (expandedTags[id]) {
      el.classList.add('tags-expanded');
      btn.textContent = '↑';
    }
    btn.hidden = el.scrollHeight <= el.clientHeight + 2;
  });
```

### 4d — Tags toggle delegation in DOMContentLoaded

**Find** (inside `DOMContentLoaded`, near the bottom of the file):
```js
  document.getElementById('overlay-close').addEventListener('click', closeOverlay);
```

Add the following **before** that line:
```js
  // Tags expand/collapse — delegated on grid so it survives re-renders
  document.getElementById('idea-grid').addEventListener('click', function(e) {
    var btn = e.target.closest('.tags-toggle');
    if (!btn) return;
    e.stopPropagation();
    var id = btn.dataset.id;
    expandedTags[id] = !expandedTags[id];
    var tagsEl = document.getElementById('tags-' + id);
    if (tagsEl) tagsEl.classList.toggle('tags-expanded', !!expandedTags[id]);
    btn.textContent = expandedTags[id] ? '↑' : '···';
  });

```

### 4e — CSS for tag collapse

File: `packages/site/static/css/command-center.css`

Replace the existing `.idea-card-tags` rule with:
```css
.idea-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 0;
  overflow: hidden;
  max-height: 1.8rem;
  transition: max-height 0.2s ease;
}

.idea-card-tags.tags-expanded {
  max-height: 20rem;
}
```

Add after it:
```css
.tags-toggle {
  display: inline-block;
  background: none;
  border: none;
  padding: 0 0.2rem;
  margin-top: 0.15rem;
  margin-bottom: 0.4rem;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.72rem;
  color: var(--text-secondary);
  cursor: pointer;
  letter-spacing: 0.05em;
}
.tags-toggle:hover { color: var(--accent); }
```

---

## Step 5 — Build and verify

```bash
python packages/site/build.py
```

Open the ideas board and confirm:
- [ ] Long pitches show in full — no truncation at 3 lines
- [ ] Cards with long titles: title truncates with ellipsis, badges stay visible on the right
- [ ] Cards with many tags: only 1 line of tags visible, `···` button appears
- [ ] Clicking `···` expands tags on that card only; other cards unaffected
- [ ] Clicking `↑` collapses back
- [ ] Expand state survives a filter/sort change within the same page session
- [ ] Cards with only 1 line of tags: no toggle button shown
- [ ] "N docs" / "M artifacts" plain text appears where the old badge was (or nothing if zero)
- [ ] No `idea-badge--docs` badge style visible anywhere

---

## Done
Phase 1 complete when all Step 5 checks pass.

Proceed to `reference/ideation-ui-upgrade-phase2-overlay.md`.
