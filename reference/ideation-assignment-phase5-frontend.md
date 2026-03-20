# Phase 5 — Frontend Access Panel

## Context

This is phase 5 of 6 for the ideation board per-user access control feature. Read `reference/ideation-assignment-plan.md` for the full picture.

**Prereqs:** Phase 3 complete (admin endpoints live). Phase 4 is optional before this — the panel works independently of enforcement.

This phase adds an admin-only "Access" panel to each idea card. Admins can open it per card to view and toggle user access. No changes to what non-admin users see.

---

## What to Build

- **Modified:** `packages/site/static/js/ideas.js`
- **Modified:** `packages/site/static/css/command-center.css`

Read both files in full before making changes.

---

## JavaScript Changes (`ideas.js`)

### New module-level state

Add near the top with the other state variables (`allIdeas`, `reactions`, etc.):

```js
var accessCache = {};  // keyed by idea_id string → array of {user_id, username, override}
```

---

### Card HTML changes in `renderGrid()`

The card currently renders a header, pitch, tags, meta line, and reactions bar. Make two additions for admins only, both **between the meta line and the reactions bar**:

1. **Access toggle button** (admin only):
```html
<button class="idea-access-toggle" data-idea-id="{idea.id}" aria-expanded="false">
  Access ▾
</button>
```

2. **Access panel** (admin only, hidden by default):
```html
<div class="idea-access-panel" id="access-panel-{idea.id}" hidden>
  <div class="idea-access-panel-inner">
    <em class="idea-access-loading">Loading...</em>
  </div>
</div>
```

Both are only emitted when `isAdmin === true`.

---

### Event: access toggle button

In `renderGrid()`, after the existing reaction and tag event listeners, add delegation for `.idea-access-toggle` clicks. Use event delegation on the grid (like the existing tags-toggle delegation):

```js
grid.querySelectorAll('.idea-access-toggle').forEach(function(btn) {
  btn.addEventListener('click', function(e) {
    e.stopPropagation();  // prevent card overlay from opening
    var ideaId = btn.dataset.ideaId;
    var panel = document.getElementById('access-panel-' + ideaId);
    var isOpen = !panel.hidden;
    panel.hidden = isOpen;
    btn.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    btn.textContent = isOpen ? 'Access ▾' : 'Access ▴';
    if (!isOpen) {
      if (accessCache[ideaId]) {
        renderAccessPanel(ideaId);
      } else {
        loadAccessPanel(ideaId);
      }
    }
  });
});
```

---

### Card click guard

The existing `openOverlay` click handler already guards against reaction clicks. Add two more guards:

```js
if (e.target.closest('.idea-access-panel')) return;
if (e.target.closest('.idea-access-toggle')) return;
```

---

### New function: `loadAccessPanel(ideaId)`

Fetches access data from the API, caches it, then calls `renderAccessPanel`.

```js
async function loadAccessPanel(ideaId) {
  var token = getToken();
  if (!token) return;
  try {
    var resp = await fetch(API_BASE + '/admin/ideas/' + ideaId + '/access', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    var data = await resp.json();
    accessCache[String(ideaId)] = data.users;
    renderAccessPanel(ideaId);
  } catch (e) {
    var panel = document.getElementById('access-panel-' + ideaId);
    if (panel) {
      panel.querySelector('.idea-access-panel-inner').innerHTML =
        '<em class="idea-access-error">Failed to load.</em>';
    }
  }
}
```

---

### New function: `renderAccessPanel(ideaId)`

Renders user rows with checkboxes into the panel. Computes effective access from cache + idea.public.

```js
function renderAccessPanel(ideaId) {
  var panel = document.getElementById('access-panel-' + ideaId);
  if (!panel) return;
  var inner = panel.querySelector('.idea-access-panel-inner');
  var users = accessCache[String(ideaId)];
  if (!users || users.length === 0) {
    inner.innerHTML = '<em class="idea-access-empty">No non-admin users.</em>';
    return;
  }
  var idea = allIdeas.find(function(i) { return String(i.id) === String(ideaId); });
  var ideaPublic = idea ? !!idea.public : false;

  var html = '';
  users.forEach(function(u) {
    // override: null = no row, true/false = explicit
    var effective = (u.override !== null && u.override !== undefined)
      ? u.override
      : ideaPublic;
    var hasOverride = (u.override !== null && u.override !== undefined);
    var indicatorHtml = hasOverride
      ? ' <span class="idea-access-override-dot" title="manually overridden">●</span>'
      : '';
    html +=
      '<label class="idea-access-row">' +
        '<input type="checkbox"' +
          ' class="idea-access-checkbox"' +
          ' data-idea-id="' + ideaId + '"' +
          ' data-user-id="' + u.user_id + '"' +
          (effective ? ' checked' : '') +
        '>' +
        '<span class="idea-access-username">' + escapeHtml(u.username) + indicatorHtml + '</span>' +
      '</label>';
  });
  inner.innerHTML = html;

  inner.querySelectorAll('.idea-access-checkbox').forEach(function(cb) {
    cb.addEventListener('change', function() {
      handleAccessChange(
        parseInt(cb.dataset.ideaId),
        parseInt(cb.dataset.userId),
        cb.checked,
        cb
      );
    });
  });
}
```

---

### New function: `handleAccessChange(ideaId, userId, checked, checkbox)`

Saves the override to the API. Waits for server response (no optimistic update — access control is security-relevant).

```js
async function handleAccessChange(ideaId, userId, checked, checkbox) {
  var token = getToken();
  if (!token) return;

  // Find what the default is for this idea
  var idea = allIdeas.find(function(i) { return i.id === ideaId; });
  var ideaPublic = idea ? !!idea.public : false;
  var isDefault = (checked === ideaPublic);

  checkbox.disabled = true;

  try {
    var resp;
    if (isDefault) {
      // Removing override — revert to default behavior
      resp = await fetch(API_BASE + '/admin/ideas/' + ideaId + '/access/' + userId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      });
    } else {
      // Setting an explicit override
      resp = await fetch(API_BASE + '/admin/ideas/' + ideaId + '/access/' + userId, {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ can_view: checked })
      });
    }

    if (!resp.ok) throw new Error('HTTP ' + resp.status);

    // Update cache
    var users = accessCache[String(ideaId)];
    if (users) {
      var u = users.find(function(x) { return x.user_id === userId; });
      if (u) u.override = isDefault ? null : checked;
    }
    renderAccessPanel(ideaId);

  } catch (e) {
    // Revert checkbox
    checkbox.checked = !checked;
    checkbox.disabled = false;
  }
}
```

---

## CSS Changes (`command-center.css`)

Add a new section after the reaction buttons block. Search for `/* Ideation Board — Reaction Buttons` to find the right location, then add below it:

```css
/* Ideation Board — Access Control Panel (admin only) */

.idea-access-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: none;
  border: 1px solid rgba(240, 160, 48, 0.25);
  border-radius: 3px;
  color: rgba(240, 160, 48, 0.6);
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.68rem;
  padding: 0.2rem 0.5rem;
  cursor: pointer;
  margin-bottom: 0.4rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.idea-access-toggle:hover {
  border-color: rgba(240, 160, 48, 0.6);
  color: var(--amber);
}
.idea-access-toggle[aria-expanded="true"] {
  border-color: rgba(240, 160, 48, 0.5);
  color: var(--amber);
  background: rgba(240, 160, 48, 0.06);
}

.idea-access-panel {
  background: rgba(240, 160, 48, 0.03);
  border: 1px solid rgba(240, 160, 48, 0.15);
  border-radius: 4px;
  padding: 0.5rem 0.6rem;
  margin-bottom: 0.5rem;
  font-size: 0.75rem;
  font-family: 'Share Tech Mono', monospace;
}

.idea-access-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
}
.idea-access-row:last-child {
  border-bottom: none;
}

.idea-access-row input[type="checkbox"] {
  accent-color: var(--accent);
  cursor: pointer;
  flex-shrink: 0;
}
.idea-access-row input[type="checkbox"]:disabled {
  cursor: wait;
  opacity: 0.5;
}

.idea-access-username {
  color: var(--text-primary);
  flex: 1;
}

.idea-access-override-dot {
  font-size: 0.55rem;
  color: var(--amber);
  margin-left: 0.25rem;
  vertical-align: middle;
}

.idea-access-loading,
.idea-access-error,
.idea-access-empty {
  font-size: 0.72rem;
  color: var(--text-secondary);
}
.idea-access-error { color: #e05c5c; }
```

---

## Steps

1. Read `packages/site/static/js/ideas.js` and `packages/site/static/css/command-center.css` in full.
2. Make the JS changes: new state variable, card HTML additions, toggle event, click guards, three new functions.
3. Make the CSS changes: new section after reaction buttons block.
4. Build and deploy:
   ```bash
   bash deploy.sh
   ```
   (Static-only change — no server restart needed.)
5. Commit and push:
   ```bash
   git add packages/site/static/js/ideas.js packages/site/static/css/command-center.css
   git commit -m "feat(ideas): admin per-user access panel on cards"
   git push
   ```

---

## Smoke Test

1. Log in as admin. Cards should show an amber "Access ▾" button between the meta line and reactions.
2. Click it on any card — panel opens, user list loads with checkboxes.
3. Close and reopen — data comes from cache instantly, no network call.
4. Idea is public: all users should be checked by default (no override indicator).
5. Uncheck a user — checkbox disables briefly, then panel refreshes with an amber dot next to the username.
6. Recheck the same user — amber dot disappears (override removed, reverted to default).
7. Try on a secret idea: all users unchecked by default. Check one — that user is now granted access.
8. Log in as a non-admin user who was just granted access to the secret idea — confirm it appears in their list.

---

## Done When

- "Access ▾" button visible on cards when logged in as admin, invisible to non-admins
- Panel opens/closes correctly; subsequent opens use cache
- Checkboxes reflect effective access (override or default)
- Override indicator (amber dot) appears when a user's access has been manually set
- Checkbox change saves immediately, disables during save, reverts on failure
- Card overlay does not open when clicking panel or toggle button
