# Phase F-V.3 — Frontend: Reaction Logic in ideas.js

**Branch:** `ideation-voting` (off `main`, **after `ideation-ui-upgrade` is merged**)
**Prereq:** Phase F-V.2 complete (API endpoints live).
Read `reference/ideation-voting-plan.md` for full context.

> **Rebase note (`ideation-ui-upgrade` changes):**
> Before starting this phase, rebase `ideation-voting` on the merged `ideation-ui-upgrade`.
> Two things changed in `renderGrid()` that affect the "Find" blocks below:
>
> 1. `docBadge` variable is gone. Its slot in `.idea-card-badges` is now occupied by `countsText`
>    (a `.idea-card-counts` span with plain "N docs · M artifacts" text). Substitute accordingly.
> 2. The tags block now includes an `id` attribute and a sibling toggle button:
>    ```js
>    '<div class="idea-card-tags" id="tags-' + idea.id + '">' + tags + '</div>' +
>    '<button class="tags-toggle" data-id="' + idea.id + '" aria-label="expand tags">···</button>'
>    ```
>    Match this new shape in Step 5's "Find" block.
>
> The card-click handler in Step 6 is unchanged — tags-toggle uses `e.stopPropagation()`
> so no guard is needed there.

---

## Goal
Update `packages/site/static/js/ideas.js` to:
1. Load reactions in parallel with ideas at startup
2. Merge reaction data onto each card
3. Change the default sort to: favorite count desc → score desc → last edit date desc
4. Add a "Votes" sort button option
5. Render thumbs-up / thumbs-down / star buttons on each card with counts
6. Handle click: optimistic update → API call → revert on fail
7. Show the user their own active state (highlighted button)

CSS for the buttons and tooltip is handled in Phase 4 — this phase just renders
the HTML structure and wires up the JavaScript logic.

---

## Changes to `packages/site/static/js/ideas.js`

Apply the changes below in order.  Each section shows the existing code that
changes (as context) and the replacement.

---

### 1. Add a `reactions` map alongside `allIdeas`

**Find** (near top of file, after `var allIdeas = [];`):
```js
var allIdeas = [];
var isAdmin = false;
var currentSort = 'updated';  // 'updated' | 'name'
```

**Replace with:**
```js
var allIdeas = [];
var reactions = {};   // keyed by idea_id string → {score, ups, downs, favorites, my_vote, my_favorite, voters?, favorited_by?}
var isAdmin = false;
var currentSort = 'votes';    // 'votes' | 'updated' | 'name'
```

---

### 2. Load reactions in parallel with ideas

**Find** the `loadIdeas` function's `Promise.all` call:
```js
    var [meResp, ideasResp] = await Promise.all([
      fetch(API_BASE + '/auth/me', { headers: authHeaders }),
      fetch(API_BASE + '/ideas?limit=200', { headers: authHeaders }),
    ]);
```

**Replace with:**
```js
    var [meResp, ideasResp, reactResp] = await Promise.all([
      fetch(API_BASE + '/auth/me', { headers: authHeaders }),
      fetch(API_BASE + '/ideas?limit=200', { headers: authHeaders }),
      fetch(API_BASE + '/ideas/reactions', { headers: authHeaders }),
    ]);
```

**Find** (still inside `loadIdeas`, after `allIdeas = data.ideas || [];`):
```js
    allIdeas = data.ideas || [];
    renderGrid();
```

**Replace with:**
```js
    allIdeas = data.ideas || [];
    if (reactResp.ok) {
      var reactData = await reactResp.json();
      reactions = reactData.reactions || {};
    }
    renderGrid();
```

---

### 3. Update `getFiltered` sort to support 'votes' and new default order

**Find** the full sort block inside `getFiltered`:
```js
  if (currentSort === 'name') {
    ideas.sort(function(a, b) { return a.title.localeCompare(b.title); });
  } else {
    ideas.sort(function(a, b) { return b.updated_at.localeCompare(a.updated_at); });
  }
```

**Replace with:**
```js
  if (currentSort === 'name') {
    ideas.sort(function(a, b) { return a.title.localeCompare(b.title); });
  } else if (currentSort === 'updated') {
    ideas.sort(function(a, b) { return b.updated_at.localeCompare(a.updated_at); });
  } else {
    // Default: favorites desc → score desc → updated desc
    ideas.sort(function(a, b) {
      var ra = reactions[String(a.id)] || {};
      var rb = reactions[String(b.id)] || {};
      var favDiff = (rb.favorites || 0) - (ra.favorites || 0);
      if (favDiff !== 0) return favDiff;
      var scoreDiff = (rb.score || 0) - (ra.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return b.updated_at.localeCompare(a.updated_at);
    });
  }
```

---

### 4. Add reaction helpers

Add these helper functions **before** `renderGrid`:

```js
// ---- Reaction helpers ----

function getReaction(ideaId) {
  return reactions[String(ideaId)] || {
    score: 0, ups: 0, downs: 0, favorites: 0,
    my_vote: null, my_favorite: false
  };
}

function buildTooltip(r) {
  // Only called for admins — r.voters and r.favorited_by will be present
  var lines = [];
  if (r.voters && r.voters.length) {
    r.voters.forEach(function(v) {
      lines.push((v.vote === 1 ? '▲ ' : '▼ ') + v.username);
    });
  }
  if (r.favorited_by && r.favorited_by.length) {
    lines.push('★ ' + r.favorited_by.join(', '));
  }
  return lines.length ? lines.join('\n') : '';
}

async function sendReaction(method, url) {
  var token = getToken();
  if (!token) return false;
  try {
    var opts = { method: method, headers: { 'Authorization': 'Bearer ' + token } };
    if (method === 'PUT' && url.endsWith('/vote')) {
      // vote value is embedded in url query or passed separately — handled at call site
    }
    var resp = await fetch(url, opts);
    return resp.ok;
  } catch (e) { return false; }
}

async function sendVote(ideaId, voteValue) {
  // voteValue: 1, -1, or 0 (retract)
  var token = getToken();
  if (!token) return false;
  try {
    var resp;
    if (voteValue === 0) {
      resp = await fetch(API_BASE + '/ideas/' + ideaId + '/vote', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token },
      });
    } else {
      resp = await fetch(API_BASE + '/ideas/' + ideaId + '/vote', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ vote: voteValue }),
      });
    }
    return resp.ok;
  } catch (e) { return false; }
}

async function sendFavorite(ideaId, isFavoriting) {
  var token = getToken();
  if (!token) return false;
  try {
    var resp = await fetch(API_BASE + '/ideas/' + ideaId + '/favorite', {
      method: isFavoriting ? 'PUT' : 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token },
    });
    return resp.ok;
  } catch (e) { return false; }
}
```

---

### 5. Update `renderGrid` to include reaction buttons on each card

**Find** the card HTML string inside `renderGrid` (the `return (...)` block).
After `ideation-ui-upgrade` this looks like:

```js
    return (
      '<div class="idea-card" data-id="' + idea.id + '">' +
        '<div class="idea-card-header">' +
          '<span class="idea-status-dot" style="background:' + color + '" title="' + idea.status + '"></span>' +
          '<h2 class="idea-card-title">' + escapeHtml(idea.title) + '</h2>' +
          '<div class="idea-card-badges">' + secretBadge + updatedBadge + countsText + '</div>' +
        '</div>' +
        '<p class="idea-card-pitch">' + escapeHtml(idea.elevator_pitch) + '</p>' +
        (tags ? '<div class="idea-card-tags" id="tags-' + idea.id + '">' + tags + '</div>' +
                '<button class="tags-toggle" data-id="' + idea.id + '" aria-label="expand tags">···</button>' : '') +
        '<p class="idea-card-meta">' + escapeHtml(idea.status) + ' · updated ' + daysAgo(idea.updated_at) + '</p>' +
      '</div>'
    );
```

**Replace with:**

```js
    var r = getReaction(idea.id);
    var upActive   = r.my_vote === 1  ? ' reaction-btn--active' : '';
    var downActive = r.my_vote === -1 ? ' reaction-btn--active' : '';
    var starActive = r.my_favorite    ? ' reaction-btn--active reaction-btn--starred' : '';
    var tooltip    = isAdmin ? buildTooltip(r) : '';
    var scoreTitle = tooltip ? ' title="' + escapeHtml(tooltip) + '"' : '';

    return (
      '<div class="idea-card" data-id="' + idea.id + '">' +
        '<div class="idea-card-header">' +
          '<span class="idea-status-dot" style="background:' + color + '" title="' + idea.status + '"></span>' +
          '<h2 class="idea-card-title">' + escapeHtml(idea.title) + '</h2>' +
          '<div class="idea-card-badges">' + secretBadge + updatedBadge + countsText + '</div>' +
        '</div>' +
        '<p class="idea-card-pitch">' + escapeHtml(idea.elevator_pitch) + '</p>' +
        (tags ? '<div class="idea-card-tags" id="tags-' + idea.id + '">' + tags + '</div>' +
                '<button class="tags-toggle" data-id="' + idea.id + '" aria-label="expand tags">···</button>' : '') +
        '<p class="idea-card-meta">' + escapeHtml(idea.status) + ' · updated ' + daysAgo(idea.updated_at) + '</p>' +
        '<div class="idea-card-reactions" data-idea-id="' + idea.id + '">' +
          '<button class="reaction-btn reaction-btn--up' + upActive + '" data-action="up" title="Thumbs up">▲ <span class="reaction-count">' + (r.ups || 0) + '</span></button>' +
          '<button class="reaction-btn reaction-btn--down' + downActive + '" data-action="down" title="Thumbs down">▼ <span class="reaction-count">' + (r.downs || 0) + '</span></button>' +
          '<span class="reaction-score"' + scoreTitle + '>' + (r.score >= 0 ? '+' : '') + (r.score || 0) + '</span>' +
          '<button class="reaction-btn reaction-btn--star' + starActive + '" data-action="star" title="Favorite">★ <span class="reaction-count">' + (r.favorites || 0) + '</span></button>' +
        '</div>' +
      '</div>'
    );
```

---

### 6. Wire up reaction button clicks in `renderGrid`

**Find** (at the end of `renderGrid`, after setting `grid.innerHTML = html;`):

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
    card.addEventListener('click', function(e) {
      // Don't open overlay when clicking reaction buttons
      if (e.target.closest('.idea-card-reactions')) return;
      openOverlay(parseInt(card.dataset.id));
    });
  });

  grid.querySelectorAll('.idea-card-reactions').forEach(function(bar) {
    var ideaId = parseInt(bar.dataset.ideaId);

    bar.querySelectorAll('.reaction-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        handleReactionClick(ideaId, btn.dataset.action, bar);
      });
    });
  });
```

---

### 7. Add `handleReactionClick` function

Add this function **after** `sendFavorite` (still before `renderGrid`):

```js
async function handleReactionClick(ideaId, action, bar) {
  var r = reactions[String(ideaId)] || {
    score: 0, ups: 0, downs: 0, favorites: 0,
    my_vote: null, my_favorite: false
  };

  // Snapshot for rollback
  var prev = JSON.parse(JSON.stringify(r));

  // Optimistic update
  if (action === 'up') {
    if (r.my_vote === 1) {
      // retract
      r.my_vote = null; r.ups = Math.max(0, r.ups - 1); r.score -= 1;
    } else {
      if (r.my_vote === -1) { r.downs = Math.max(0, r.downs - 1); r.score += 1; }
      r.my_vote = 1; r.ups += 1; r.score += 1;
    }
  } else if (action === 'down') {
    if (r.my_vote === -1) {
      r.my_vote = null; r.downs = Math.max(0, r.downs - 1); r.score += 1;
    } else {
      if (r.my_vote === 1) { r.ups = Math.max(0, r.ups - 1); r.score -= 1; }
      r.my_vote = -1; r.downs += 1; r.score -= 1;
    }
  } else if (action === 'star') {
    if (r.my_favorite) {
      r.my_favorite = false; r.favorites = Math.max(0, r.favorites - 1);
    } else {
      r.my_favorite = true; r.favorites += 1;
    }
  }

  reactions[String(ideaId)] = r;
  updateReactionBar(bar, r);

  // Send to API
  var ok = false;
  if (action === 'up') {
    ok = await sendVote(ideaId, r.my_vote === null ? 0 : 1);
    // my_vote was already flipped above — if we retracted, r.my_vote is now null
    // re-read: after retract, prev.my_vote was 1, now null → send 0
    // after set, prev.my_vote was -1 or null, now 1 → send 1
    // (logic already handled: r.my_vote reflects the new state)
  } else if (action === 'down') {
    ok = await sendVote(ideaId, r.my_vote === null ? 0 : -1);
  } else if (action === 'star') {
    ok = await sendFavorite(ideaId, r.my_favorite);
  }

  if (!ok) {
    // Rollback
    reactions[String(ideaId)] = prev;
    updateReactionBar(bar, prev);
  }
}

function updateReactionBar(bar, r) {
  var upBtn   = bar.querySelector('[data-action="up"]');
  var downBtn = bar.querySelector('[data-action="down"]');
  var starBtn = bar.querySelector('[data-action="star"]');
  var scoreEl = bar.querySelector('.reaction-score');

  upBtn.classList.toggle('reaction-btn--active', r.my_vote === 1);
  downBtn.classList.toggle('reaction-btn--active', r.my_vote === -1);
  starBtn.classList.toggle('reaction-btn--active', !!r.my_favorite);
  starBtn.classList.toggle('reaction-btn--starred', !!r.my_favorite);

  upBtn.querySelector('.reaction-count').textContent   = r.ups || 0;
  downBtn.querySelector('.reaction-count').textContent = r.downs || 0;
  starBtn.querySelector('.reaction-count').textContent = r.favorites || 0;
  scoreEl.textContent = (r.score >= 0 ? '+' : '') + (r.score || 0);

  if (isAdmin) {
    var tooltip = buildTooltip(r);
    if (tooltip) scoreEl.setAttribute('title', tooltip);
    else scoreEl.removeAttribute('title');
  }
}
```

---

## Step 2 — Build and verify

```bash
# From repo root — rebuild static assets into dist/
python packages/site/build.py
```

Open the ideas board in the browser.  Confirm:
- Cards load with reaction buttons (▲ / ▼ / ★) and counts
- Default sort is by favorites desc, then score, then date
- Clicking ▲ or ▼ highlights the button and updates the count immediately
- Clicking the same button again deselects it (retract)
- Clicking ▲ while ▼ is active switches the vote (both counts update)
- Clicking ★ toggles the star
- Admin user: hovering over the score shows who voted / who starred

---

## Done
Phase 3 complete when:
- [ ] `packages/site/static/js/ideas.js` has all changes applied
- [ ] `reactions` map loaded on startup alongside ideas
- [ ] Default sort is votes/favorites
- [ ] Vote and favorite buttons appear on every card
- [ ] Optimistic updates work; network failure causes rollback
- [ ] Admin tooltip shows voter breakdown on score hover

Proceed to `reference/ideation-voting-phase4-ui.md`.
