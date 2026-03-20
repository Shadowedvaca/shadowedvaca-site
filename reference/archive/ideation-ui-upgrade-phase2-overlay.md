# Phase UI-2 — Expanded Overlay Redesign

**Branch:** `ideation-ui-upgrade` (off `main`)
**Prereq:** Phase UI-1 complete (card grid fixes in place).
Read `reference/ideation-ui-upgrade.md` for full context and architecture.

---

## Goal
Replace the current inline document reader in the overlay with a "big card" view.
Clicking an idea card opens a panel that shows the full idea — title, status, pitch, all
tags, and lists of doc/artifact links. Each link opens the viewer page in a new tab.
No content is rendered inline in the overlay anymore.

---

## Files Changed
```
packages/site/static/js/ideas.js
packages/site/static/css/command-center.css
```

---

## Step 1 — Replace openOverlay()

File: `packages/site/static/js/ideas.js`

**Find** the entire existing `openOverlay` function:
```js
async function openOverlay(ideaId) {
  var idea = allIdeas.find(function(i) { return i.id === ideaId; });
  if (!idea) return;

  var overlay = document.getElementById('idea-overlay');
  var content = document.getElementById('overlay-content');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  var color = STATUS_COLORS[idea.status] || '#c8cdd3';
  content.innerHTML =
    '<h2 class="overlay-title">' + escapeHtml(idea.title) + '</h2>' +
    '<div class="overlay-meta">' +
      '<span class="idea-status-dot" style="background:' + color + '"></span>' +
      ' ' + escapeHtml(idea.status) +
      (idea.project ? ' · <em>' + escapeHtml(idea.project) + '</em>' : '') +
    '</div>' +
    '<div class="overlay-pitch">' + escapeHtml(idea.elevator_pitch) + '</div>' +
    '<div id="overlay-docs"><em>Loading documents...</em></div>';

  var token = getToken();
  if (!token) return;

  try {
    var resp = await fetch(API_BASE + '/ideas/' + ideaId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) {
      document.getElementById('overlay-docs').innerHTML = '<em>Could not load documents.</em>';
      return;
    }
    var data = await resp.json();
    renderDocs(data.documents || [], data.aspects || []);
  } catch (e) {
    document.getElementById('overlay-docs').innerHTML = '<em>Could not load documents.</em>';
  }
}
```

**Replace with:**
```js
async function openOverlay(ideaId) {
  var idea = allIdeas.find(function(i) { return i.id === ideaId; });
  if (!idea) return;

  var overlay = document.getElementById('idea-overlay');
  var content = document.getElementById('overlay-content');
  overlay.hidden = false;
  document.body.style.overflow = 'hidden';

  var color = STATUS_COLORS[idea.status] || '#c8cdd3';
  var allTags = (idea.tags || []).map(function(t) {
    return '<span class="idea-tag">' + escapeHtml(t) + '</span>';
  }).join('');

  content.innerHTML =
    '<h2 class="overlay-title">' + escapeHtml(idea.title) + '</h2>' +
    '<div class="overlay-meta">' +
      '<span class="idea-status-dot" style="background:' + color + '"></span>' +
      ' ' + escapeHtml(idea.status) +
      (idea.project ? ' · <em>' + escapeHtml(idea.project) + '</em>' : '') +
    '</div>' +
    '<div class="overlay-pitch">' + escapeHtml(idea.elevator_pitch) + '</div>' +
    (allTags ? '<div class="overlay-tags">' + allTags + '</div>' : '') +
    '<div class="overlay-section">' +
      '<div class="overlay-section-title">Documents</div>' +
      '<div id="overlay-docs-list"><em class="overlay-loading">Loading...</em></div>' +
    '</div>' +
    '<div class="overlay-section">' +
      '<div class="overlay-section-title">Artifacts</div>' +
      '<div id="overlay-artifacts-list"><em class="overlay-loading">Loading...</em></div>' +
    '</div>';

  var token = getToken();
  if (!token) return;

  try {
    var resp = await fetch(API_BASE + '/ideas/' + ideaId, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    renderOverlayLinks(ideaId, data.documents || [], data.artifacts || []);
  } catch (e) {
    var docsEl = document.getElementById('overlay-docs-list');
    if (docsEl) docsEl.innerHTML = '<em class="overlay-error">Could not load details.</em>';
    var artEl = document.getElementById('overlay-artifacts-list');
    if (artEl) artEl.innerHTML = '';
  }
}
```

---

## Step 2 — Replace renderDocs() with renderOverlayLinks() + renderLinkSection()

File: `packages/site/static/js/ideas.js`

**Find** the entire `renderDocs` function:
```js
function renderDocs(docs, aspects) {
  var container = document.getElementById('overlay-docs');
  var html = '';

  if (aspects && aspects.length > 0) {
    html += '<h3 class="overlay-section-title">Aspects</h3>';
    var byType = {};
    aspects.forEach(function(a) {
      if (!byType[a.aspect_type]) byType[a.aspect_type] = [];
      byType[a.aspect_type].push(a);
    });
    Object.keys(byType).forEach(function(type) {
      html += '<div class="overlay-aspect-group"><strong>' + escapeHtml(type) + '</strong>';
      byType[type].forEach(function(a) {
        var label = a.title ? ' — ' + escapeHtml(a.title) : '';
        html += '<div class="overlay-aspect">' + label + '<pre>' + escapeHtml(JSON.stringify(a.content, null, 2)) + '</pre></div>';
      });
      html += '</div>';
    });
  }

  if (docs.length === 0) {
    html += '<p><em>No documents attached yet.</em></p>';
  } else {
    html += '<h3 class="overlay-section-title">Documents (' + docs.length + ')</h3>';
    docs.forEach(function(doc) {
      html +=
        '<div class="overlay-doc">' +
          '<h4 class="overlay-doc-title">' + escapeHtml(doc.title) +
            ' <span class="overlay-doc-date">' + doc.created_at.slice(0, 10) + '</span>' +
          '</h4>' +
          '<div class="overlay-doc-content">' + marked.parse(doc.content) + '</div>' +
        '</div>';
    });
  }

  container.innerHTML = html;
}
```

**Replace with:**
```js
function renderOverlayLinks(ideaId, docs, artifacts) {
  renderLinkSection(
    'overlay-docs-list',
    docs,
    function(doc) {
      return '/ideas/viewer/?idea_id=' + ideaId + '&doc_id=' + doc.id;
    },
    function(doc) {
      return escapeHtml(doc.title) +
        ' <span class="overlay-link-meta">' + doc.created_at.slice(0, 10) + '</span>';
    },
    'No documents attached yet.'
  );

  renderLinkSection(
    'overlay-artifacts-list',
    artifacts,
    function(art) {
      return '/ideas/viewer/?idea_id=' + ideaId + '&artifact_id=' + art.id;
    },
    function(art) {
      return escapeHtml(art.title) +
        ' <span class="overlay-link-meta">' +
        escapeHtml(art.artifact_type) + ' · ' + escapeHtml(art.format) +
        '</span>';
    },
    'No artifacts attached yet.'
  );
}

function renderLinkSection(containerId, items, hrefFn, labelFn, emptyMsg) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (items.length === 0) {
    el.innerHTML = '<em class="overlay-empty">' + emptyMsg + '</em>';
    return;
  }

  var html = '';
  items.forEach(function(item, i) {
    html +=
      '<div class="overlay-link-row' + (i > 0 ? ' overlay-link-row--extra' : '') + '">' +
        '<a href="' + hrefFn(item) + '" target="_blank" rel="noopener" class="overlay-link">' +
          labelFn(item) +
        '</a>' +
      '</div>';
  });
  if (items.length > 1) {
    html +=
      '<button class="overlay-expand-btn" data-count="' + (items.length - 1) + '">' +
        '··· ' + (items.length - 1) + ' more' +
      '</button>';
  }
  el.innerHTML = html;

  // Start collapsed — hide rows after the first
  el.querySelectorAll('.overlay-link-row--extra').forEach(function(row) {
    row.style.display = 'none';
  });

  var btn = el.querySelector('.overlay-expand-btn');
  if (btn) {
    btn.addEventListener('click', function() {
      var extra = el.querySelectorAll('.overlay-link-row--extra');
      var isExpanded = extra[0] && extra[0].style.display !== 'none';
      extra.forEach(function(row) { row.style.display = isExpanded ? 'none' : ''; });
      btn.textContent = isExpanded
        ? '··· ' + extra.length + ' more'
        : '↑ collapse';
    });
  }
}
```

---

## Step 3 — CSS: add overlay big-card rules, remove stale ones

File: `packages/site/static/css/command-center.css`

### 3a — Add new rules

Append the following block (place after the existing overlay rules):

```css
/* ---- Overlay big-card ---- */

.overlay-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  margin-bottom: 1rem;
}

.overlay-section {
  margin-bottom: 1.25rem;
}

.overlay-link-row {
  margin-bottom: 0.35rem;
}

.overlay-link {
  font-size: 0.88rem;
  color: var(--accent);
  text-decoration: none;
}
.overlay-link:hover { text-decoration: underline; }

.overlay-link-meta {
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.72rem;
  color: var(--text-secondary);
  margin-left: 0.4rem;
}

.overlay-expand-btn {
  background: none;
  border: none;
  padding: 0;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  margin-top: 0.2rem;
}
.overlay-expand-btn:hover { color: var(--accent); }

.overlay-loading,
.overlay-empty {
  font-size: 0.82rem;
  color: var(--text-secondary);
  font-style: italic;
}
.overlay-error {
  font-size: 0.82rem;
  color: #e05c5c;
  font-style: italic;
}
```

### 3b — Remove stale rules

Delete the following CSS rules entirely (they were used to render inline doc content;
the overlay no longer renders content inline):

- `.overlay-doc`
- `.overlay-doc:last-child`
- `.overlay-doc-title`
- `.overlay-doc-date`
- `.overlay-doc-content`
- `.overlay-doc-content h1`, `.overlay-doc-content h2`, `.overlay-doc-content h3`
- `.overlay-doc-content p`
- `.overlay-doc-content ul`, `.overlay-doc-content ol`
- `.overlay-doc-content li`
- `.overlay-doc-content code`
- `.overlay-doc-content pre code`
- `.overlay-aspect-group` (if present)
- `.overlay-aspect` (if present)

---

## Step 4 — Build and verify

```bash
python packages/site/build.py
```

Open the ideas board and confirm:

- [ ] Clicking a card opens the overlay immediately with title, status, pitch, and tags visible
- [ ] "Loading..." appears in Documents and Artifacts sections while the detail fetch is in flight
- [ ] Documents section shows a link for each doc (title + date); first shown, rest collapsed
- [ ] Clicking `··· N more` expands all doc links; clicking `↑ collapse` shrinks back
- [ ] Each doc link opens `/ideas/viewer/?idea_id=...&doc_id=...` in a new tab
- [ ] Artifacts section shows links (title + type · format); same collapse behaviour
- [ ] Each artifact link opens `/ideas/viewer/?idea_id=...&artifact_id=...` in a new tab
- [ ] Ideas with no docs show "No documents attached yet."
- [ ] Ideas with no artifacts show "No artifacts attached yet."
- [ ] No inline markdown rendering happens anywhere in the overlay
- [ ] Closing overlay (✕ or backdrop click or Escape) still works

---

## Done
Phase 2 complete when all Step 4 checks pass.

Proceed to `reference/ideation-ui-upgrade-phase3-viewer.md`.
