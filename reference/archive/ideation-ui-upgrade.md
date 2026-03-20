# Ideation Board UI Upgrade — Master Plan

## Feature Branch
`ideation-ui-upgrade` (branch off `main`)

## Goal
Overhaul idea cards and the detail view to be more scannable and usable:
- Show full pitch text on cards (remove clamp)
- Fix badge/label overflow in card headers
- Collapse long tag lists to one line with a per-card expand toggle
- Replace styled doc-count badge with simple "N docs · M artifacts" info text
- Redesign the drill-in overlay as an expanded "big card" (no inline doc reading)
- Add docs and artifacts as link lists in the overlay (collapse to 1 shown + "···" expand)
- Add a standalone viewer page that renders docs/artifacts in a new tab
- Add an artifact proxy route in sv-site ready for sv-tools to back

## Cancelled scope (handled in sv-tools separately)
- Auto-status management (Spark → Exploring → Researching → Committed)
- Session tracking

---

## Architecture

```
[Card grid — summary view]
  Status dot + title + "N docs · M artifacts" (small text, upper-right)
  Full pitch (no clamp)
  Tags → collapsed to 1 line by default, per-card "···" toggle (session memory)
  Meta: status · updated X days ago
  Click card → opens expanded overlay

[Expanded overlay — "big card"]
  Title + status + project link (if any)
  Full pitch
  All tags (expanded, no toggle)
  Documents section:
    1 link visible (title + date → opens viewer in new tab)
    "··· N more" toggle to reveal rest
  Artifacts section (same pattern):
    1 link visible (title + type → opens viewer in new tab)
    "··· N more" toggle
  [Future: comments section]

[Viewer page — /ideas/viewer/]
  Standalone dark-themed page, no command-center chrome
  URL params: idea_id + doc_id  OR  idea_id + artifact_id
  Auth-gated (JWT from localStorage → redirect to /login.html if missing/expired)
  For docs:      GET /api/ideas/{idea_id} → find doc by id → render markdown
  For artifacts: GET /api/ideas/{idea_id}/artifacts/{artifact_id} → render by format
  Formats: markdown (marked.js), mermaid (mermaid.js CDN), html (direct innerHTML)

[sv-site: GET /api/ideas/{idea_id}/artifacts/{artifact_id}]
  Proxies to sv-tools GET /api/v1/ideas/{idea_id}/artifacts/{artifact_id}
  Returns: { id, title, artifact_type, content, format, created_at }
  ⚠ sv-tools must expose this endpoint — artifact viewer will 503 until it does
  Document viewer is unaffected: doc content already in GET /api/ideas/{id} response
```

---

## Sub-Phases

| # | Doc | What it covers |
|---|-----|----------------|
| UI-1 | `ideation-ui-upgrade-phase1-card-fixes.md` | Remove pitch clamp, fix header overflow, replace doc badge with plain counts, per-card tag collapse |
| UI-2 | `ideation-ui-upgrade-phase2-overlay.md` | Overlay redesign as big card; docs + artifacts as link lists with collapse |
| UI-3 | `ideation-ui-upgrade-phase3-viewer.md` | Standalone viewer page (markdown + mermaid + html); build.py copy step |
| UI-4 | `ideation-ui-upgrade-phase4-artifact-proxy.md` | `GET /api/ideas/{id}/artifacts/{artifact_id}` proxy route in sv-site |

Work each phase in order — each one is self-contained given this doc + its own phase doc.

---

## Files Touched (total across all phases)

```
packages/site/static/js/ideas.js                 ← UI-1, UI-2
packages/site/static/css/command-center.css      ← UI-1, UI-2
packages/site/static/ideas/viewer/index.html     ← NEW  UI-3
packages/site/build.py                           ← UI-3
src/sv_site/routes/ideas.py                      ← UI-4
```

`packages/site/templates/ideas/index.html` — no changes needed.

---

## Voting Plan Impact

The `ideation-voting` branch must be started **after `ideation-ui-upgrade` is merged into main**.

| Change in this work | Voting plan impact |
|---|---|
| `.idea-badge--docs` CSS rule removed | No conflict — voting plan doesn't reference it |
| `.idea-card-title` gains `flex: 1 1 0; min-width: 0` | Voting plan Phase 4 reaction row is below the header — no conflict |
| `.idea-card-badges` now only has secret + updated badges + counts text | Voting plan doesn't add to this div — no conflict |
| `renderGrid()` significantly restructured | **Merge conflict likely** in voting Phase 3 — rebase on `ideation-ui-upgrade` before starting |
| `renderDocs()` removed, overlay fully redesigned | Voting plan doesn't touch the overlay — no conflict |

The voting plan sub-phase docs (`ideation-voting-phase3-frontend.md`) have been updated with
a rebase note and corrected "Find" blocks to match the post-upgrade card HTML.

---

## Deploy Checklist (after all phases)

1. `python packages/site/build.py`
2. `bash deploy.sh` — static site + viewer page
3. `sudo systemctl restart shadowedvaca` — picks up the new artifact proxy route
4. Full smoke test is in `ideation-ui-upgrade-phase4-artifact-proxy.md`
