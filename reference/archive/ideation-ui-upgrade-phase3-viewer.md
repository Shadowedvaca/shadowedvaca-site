# Phase UI-3 — Viewer Page

**Branch:** `ideation-ui-upgrade` (off `main`)
**Prereq:** Phase UI-2 complete (overlay now generates viewer links).
Read `reference/ideation-ui-upgrade.md` for full context and architecture.

---

## Goal
Create a standalone viewer page at `/ideas/viewer/` that opens a single document or artifact
in a full-page, readable view. Auth-gated. Renders markdown (marked.js), mermaid diagrams
(mermaid.js), and HTML artifacts.

Document viewer works immediately. Artifact viewer requires Phase UI-4 (the proxy route) and
sv-tools to expose the artifact detail endpoint — until then, it will show an error message
gracefully.

---

## Files Changed
```
packages/site/static/ideas/viewer/index.html    ← NEW
packages/site/build.py                          ← copy viewer to dist
```

---

## Step 1 — Create the viewer page

Create the file `packages/site/static/ideas/viewer/index.html` (create the `viewer/`
directory too if it does not exist):

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Viewer — Shadowedvaca</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=IBM+Plex+Sans:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      background: #0a0c10;
      color: #c8cdd3;
      font-family: 'IBM Plex Sans', sans-serif;
      font-size: 0.95rem;
      line-height: 1.7;
    }

    #viewer-header {
      display: flex;
      align-items: baseline;
      gap: 1rem;
      padding: 1rem 2rem;
      border-bottom: 1px solid #1e2533;
      position: sticky;
      top: 0;
      background: #0a0c10;
      z-index: 10;
    }

    #back-link {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.8rem;
      color: #6b7280;
      text-decoration: none;
      flex-shrink: 0;
    }
    #back-link:hover { color: #00d4ff; }

    #viewer-title {
      font-size: 1rem;
      font-weight: 600;
      color: #c8cdd3;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1 1 0;
      min-width: 0;
    }

    #viewer-meta {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.72rem;
      color: #6b7280;
      white-space: nowrap;
      flex-shrink: 0;
    }

    #viewer-body {
      max-width: 820px;
      margin: 0 auto;
      padding: 2rem 2rem 4rem;
    }

    /* Markdown content */
    #viewer-body h1,
    #viewer-body h2,
    #viewer-body h3,
    #viewer-body h4 {
      color: #c8cdd3;
      font-weight: 600;
      margin: 1.5rem 0 0.5rem;
    }
    #viewer-body h1 { font-size: 1.4rem; }
    #viewer-body h2 { font-size: 1.15rem; border-bottom: 1px solid #1e2533; padding-bottom: 0.3rem; }
    #viewer-body h3 { font-size: 1rem; }
    #viewer-body h4 { font-size: 0.9rem; color: #6b7280; }

    #viewer-body p { margin-bottom: 0.75rem; }

    #viewer-body a { color: #00d4ff; }

    #viewer-body ul,
    #viewer-body ol {
      padding-left: 1.5rem;
      margin-bottom: 0.75rem;
    }
    #viewer-body li { margin-bottom: 0.25rem; }

    #viewer-body code {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.85em;
      background: rgba(255,255,255,0.05);
      border: 1px solid #1e2533;
      border-radius: 3px;
      padding: 0.1em 0.35em;
      color: #00d4ff;
    }

    #viewer-body pre {
      background: rgba(255,255,255,0.03);
      border: 1px solid #1e2533;
      border-radius: 4px;
      padding: 1rem;
      overflow-x: auto;
      margin-bottom: 1rem;
    }
    #viewer-body pre code {
      background: none;
      border: none;
      padding: 0;
      color: #c8cdd3;
    }

    #viewer-body blockquote {
      border-left: 3px solid #1e2533;
      margin: 0 0 0.75rem;
      padding: 0.25rem 1rem;
      color: #6b7280;
    }

    #viewer-body table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 1rem;
      font-size: 0.88rem;
    }
    #viewer-body th,
    #viewer-body td {
      border: 1px solid #1e2533;
      padding: 0.4rem 0.75rem;
      text-align: left;
    }
    #viewer-body th { background: rgba(255,255,255,0.04); color: #c8cdd3; }

    #viewer-body hr {
      border: none;
      border-top: 1px solid #1e2533;
      margin: 1.5rem 0;
    }

    /* Mermaid diagram container */
    .mermaid {
      background: #0d1117;
      border: 1px solid #1e2533;
      border-radius: 4px;
      padding: 1.5rem;
      overflow-x: auto;
    }

    /* Error / loading states */
    .viewer-message {
      font-family: 'Share Tech Mono', monospace;
      font-size: 0.85rem;
      color: #6b7280;
      margin-top: 3rem;
      text-align: center;
    }
    .viewer-message--error { color: #e05c5c; }
  </style>
</head>
<body>

<div id="viewer-header">
  <a href="javascript:history.back()" id="back-link">← back</a>
  <span id="viewer-title"></span>
  <span id="viewer-meta"></span>
</div>

<div id="viewer-body">
  <p class="viewer-message">Loading...</p>
</div>

<script src="/js/marked.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
(function () {
  var JWT_KEY = 'sv_site_jwt';
  var API_BASE = '/api';

  function getToken() {
    try {
      var raw = localStorage.getItem(JWT_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data.token) return null;
      var parts = data.token.split('.');
      if (parts.length !== 3) return null;
      var payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem(JWT_KEY);
        return null;
      }
      return data.token;
    } catch (e) { return null; }
  }

  function showError(msg) {
    document.getElementById('viewer-body').innerHTML =
      '<p class="viewer-message viewer-message--error">' + msg + '</p>';
  }

  var params   = new URLSearchParams(location.search);
  var ideaId   = params.get('idea_id');
  var docId    = params.get('doc_id');
  var artId    = params.get('artifact_id');

  var token = getToken();
  if (!token) {
    location.href = '/login.html?next=' + encodeURIComponent(location.href);
    return;
  }
  if (!ideaId || (!docId && !artId)) {
    showError('Invalid viewer URL — missing idea_id or doc_id / artifact_id.');
    return;
  }

  var headers = { 'Authorization': 'Bearer ' + token };

  if (docId) {
    // Documents: content is in the full idea detail response
    fetch(API_BASE + '/ideas/' + ideaId, { headers: headers })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var doc = (data.documents || []).find(function (d) {
          return String(d.id) === String(docId);
        });
        if (!doc) throw new Error('Document not found in idea ' + ideaId);

        document.title = doc.title + ' — Shadowedvaca';
        document.getElementById('viewer-title').textContent = doc.title;
        document.getElementById('viewer-meta').textContent  = doc.created_at.slice(0, 10);
        document.getElementById('viewer-body').innerHTML    = marked.parse(doc.content);
      })
      .catch(function (e) { showError('Could not load document: ' + e.message); });

  } else {
    // Artifacts: fetched from the dedicated proxy route (Phase UI-4)
    fetch(API_BASE + '/ideas/' + ideaId + '/artifacts/' + artId, { headers: headers })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (art) {
        document.title = art.title + ' — Shadowedvaca';
        document.getElementById('viewer-title').textContent = art.title;
        document.getElementById('viewer-meta').textContent  =
          art.artifact_type + ' · ' + art.format + ' · ' + art.created_at.slice(0, 10);

        var body = document.getElementById('viewer-body');
        if (art.format === 'markdown') {
          body.innerHTML = marked.parse(art.content);
        } else if (art.format === 'mermaid') {
          body.innerHTML = '<div class="mermaid">' + art.content + '</div>';
          mermaid.initialize({ startOnLoad: false, theme: 'dark' });
          mermaid.run({ nodes: body.querySelectorAll('.mermaid') });
        } else {
          // html format — content is trusted (our own data)
          body.innerHTML = art.content;
        }
      })
      .catch(function (e) { showError('Could not load artifact: ' + e.message); });
  }
}());
</script>

</body>
</html>
```

---

## Step 2 — Update build.py to copy the viewer

File: `packages/site/build.py`

Find the section where static assets are copied to `dist/` (look for `shutil.copy` calls or
the loop that mirrors `STATIC_DIR` into `DIST_DIR`).

Add the following block so the viewer is included in every build:

```python
# Viewer page
viewer_src = STATIC_DIR / 'ideas' / 'viewer' / 'index.html'
viewer_dst = DIST_DIR / 'ideas' / 'viewer'
viewer_dst.mkdir(parents=True, exist_ok=True)
shutil.copy(viewer_src, viewer_dst / 'index.html')
```

`STATIC_DIR` and `DIST_DIR` are already defined in `build.py` — use the same names.
`shutil` is already imported.

---

## Step 3 — Build and verify

```bash
python packages/site/build.py
```

Confirm `dist/ideas/viewer/index.html` was created.

### Document viewer test
1. Open the ideas board, click any idea that has at least one document.
2. In the overlay, click a document link — a new tab opens at `/ideas/viewer/?idea_id=...&doc_id=...`.
3. Confirm: title shows in header, date shows in meta, markdown renders correctly (headings,
   code blocks, lists are styled).

### Artifact viewer test (pre-Phase UI-4)
1. Click an artifact link in the overlay — new tab opens.
2. The viewer shows the error message "Could not load artifact: HTTP 404" (or 503 if sv-tools
   is unavailable). This is correct and expected until Phase UI-4 lands.

### Auth gate test
1. Open a viewer URL in an incognito window (no JWT in localStorage).
2. Should redirect to `/login.html?next=<viewer-url>`.

---

## Done
Phase 3 complete when:
- [ ] `packages/site/static/ideas/viewer/index.html` exists
- [ ] `dist/ideas/viewer/index.html` is generated by `build.py`
- [ ] Document viewer renders markdown in a new tab correctly
- [ ] Artifact links open the viewer page and show a graceful error (pre-Phase UI-4)
- [ ] Unauthenticated access redirects to login

Proceed to `reference/ideation-ui-upgrade-phase4-artifact-proxy.md`.
