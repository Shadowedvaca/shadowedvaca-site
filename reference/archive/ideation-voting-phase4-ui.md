# Phase F-V.4 — UI: HTML Controls + CSS Styles

**Branch:** `ideation-voting` (off `main`)
**Prereq:** Phase F-V.3 complete (reaction logic in ideas.js).
Read `reference/ideation-voting-plan.md` for full context.

---

## Goal
1. Add a "Votes" sort button to the ideas page HTML template
2. Style the reaction buttons, score display, and admin tooltip in CSS
3. Build and deploy

---

## Step 1 — Update the HTML template

File: `packages/site/templates/ideas/index.html`

**Find** the sort button group:
```html
    <div class="ideas-sort-group">
      <button id="sort-updated" class="ideas-sort-btn active" data-sort="updated">Recent</button>
      <button id="sort-name" class="ideas-sort-btn" data-sort="name">A–Z</button>
    </div>
```

**Replace with:**
```html
    <div class="ideas-sort-group">
      <button id="sort-votes"   class="ideas-sort-btn active" data-sort="votes">Votes</button>
      <button id="sort-updated" class="ideas-sort-btn"        data-sort="updated">Recent</button>
      <button id="sort-name"    class="ideas-sort-btn"        data-sort="name">A–Z</button>
    </div>
```

The `active` class moves to "Votes" since that is now the default sort.

---

## Step 2 — Add CSS

File: `packages/site/static/css/command-center.css`

Append the following block at the end of the file:

```css
/* ============================================================
   Ideation Board — Reaction Buttons (votes + favorites)
   ============================================================ */

.idea-card-reactions {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--divider);
}

/* Base button reset */
.reaction-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
  background: none;
  border: 1px solid var(--divider);
  border-radius: 3px;
  padding: 3px 8px;
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
  white-space: nowrap;
}

.reaction-btn:hover {
  color: var(--text-primary);
  border-color: var(--text-secondary);
}

/* Up vote — active state: cyan */
.reaction-btn--up.reaction-btn--active {
  color: var(--cyan);
  border-color: var(--cyan);
  background: rgba(0, 212, 255, 0.08);
}

/* Down vote — active state: amber */
.reaction-btn--down.reaction-btn--active {
  color: var(--amber);
  border-color: var(--amber);
  background: rgba(240, 160, 48, 0.08);
}

/* Star — active state: gold */
.reaction-btn--starred {
  color: #f5c842;
  border-color: #f5c842;
  background: rgba(245, 200, 66, 0.08);
}

/* Net score display — sits between the thumbs buttons and the star */
.reaction-score {
  font-family: 'Share Tech Mono', monospace;
  font-size: 0.75rem;
  color: var(--text-secondary);
  min-width: 2.5ch;
  text-align: center;
  padding: 3px 6px;
  border-radius: 3px;
  /* Cursor hint for admins that there's tooltip data */
  cursor: default;
}

/* Positive score: green tint */
.reaction-score[data-positive="true"] {
  color: #2ecc71;
}

/* Negative score: red tint */
.reaction-score[data-negative="true"] {
  color: #e74c3c;
}

/* Push star to the right of the row */
.idea-card-reactions .reaction-btn--star {
  margin-left: auto;
}

/* Admin tooltip — native <title> works fine for hover; no extra CSS needed.
   If a richer tooltip is wanted later, the class below can be built out. */
.reaction-score[title] {
  cursor: help;
  border: 1px dashed var(--divider);
}
```

---

## Step 3 — Optional: tint the score span dynamically

The CSS classes `data-positive` / `data-negative` above only apply if the JS
sets the `data-positive` / `data-negative` attributes.  Add this small update
to `updateReactionBar` in `ideas.js` (Phase 3 file) to keep scores visually
distinct:

In `updateReactionBar`, after updating `scoreEl.textContent`, add:

```js
  scoreEl.dataset.positive = (r.score > 0) ? 'true' : '';
  scoreEl.dataset.negative = (r.score < 0) ? 'true' : '';
```

This is a small polish addition — skip it if you want to keep Phase 3 changes
closed.  The feature works without it.

---

## Step 4 — Build and deploy

```bash
# Rebuild static site
python packages/site/build.py

# Deploy to server
bash deploy.sh
```

After deploy, open the live ideas board and confirm:

- [ ] "Votes" sort button appears and is active by default
- [ ] Reaction row appears on every idea card (▲ count / ▼ count / score / ★ count)
- [ ] Active vote shows cyan (up) or amber (down) highlight
- [ ] Active favorite shows gold star
- [ ] Admin: hovering over the score shows the breakdown tooltip
- [ ] Non-admin: no tooltip on score hover
- [ ] All three sort buttons work (Votes / Recent / A–Z)
- [ ] Layout doesn't break on mobile (buttons wrap gracefully — flexbox handles it)

---

## Done
Phase 4 complete when:
- [ ] `packages/site/templates/ideas/index.html` has "Votes" sort button as default
- [ ] `packages/site/static/css/command-center.css` has reaction button styles appended
- [ ] Build passes without errors
- [ ] Live site looks correct on desktop and mobile
- [ ] Run migration on server if not already done (see Phase 1)
- [ ] Restart sv_site service on server if not already done (see Phase 2)

**Feature complete.**  Run the full smoke test from `reference/ideation-voting-plan.md`
deploy checklist before closing the `ideation-voting` branch.
