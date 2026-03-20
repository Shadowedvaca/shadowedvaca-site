# Ideation Board Voting — Master Plan

## Feature Branch
`ideation-voting` (branch off `main`, **after `ideation-ui-upgrade` is merged**)

## Prereq
`ideation-ui-upgrade` must be merged to `main` first. That work restructures `renderGrid()`
significantly and removes the doc-count badge. Starting `ideation-voting` before it lands will
cause hard merge conflicts in Phase 3 and stale CSS in Phase 4.

## Goal
Add thumbs-up / thumbs-down voting and a favorite star to every idea card on the
Ideation Board.  Aggregated scores are visible to everyone; the hover tooltip
showing who did what is admin-only.  Current user always sees their own action
highlighted.

## Design Decisions (locked)
| Question | Decision |
|---|---|
| Where is vote data stored? | sv-site DB (`shadowedvaca` schema) — users live here, no sv-tools changes needed |
| Who sees the vote breakdown tooltip? | Admins only (counts visible to all) |
| Does current user see their own state? | Yes — always, regardless of admin status |
| Default sort order | Favorite count desc → net score desc → last edit date desc |
| Vote type | One vote per user per idea: +1 or −1 (upsert; delete to retract) |
| Favorite type | One favorite per user per idea (toggle) |

## Architecture

```
[Browser]
  ideas.js
    │  load ideas + reactions in parallel (Promise.all)
    │  merge onto card; render counts + user's own state
    │  click vote/star → optimistic update → API call → revert on fail
    │
[sv-site FastAPI]
  GET  /api/ideas/reactions          ← bulk counts + my state + (admin) breakdown
  PUT  /api/ideas/{id}/vote          ← body {"vote": 1 | -1}
  DELETE /api/ideas/{id}/vote        ← retract vote
  PUT  /api/ideas/{id}/favorite      ← set favorite
  DELETE /api/ideas/{id}/favorite    ← remove favorite
    │
[PostgreSQL — shadowedvaca schema]
  idea_votes      (user_id FK, idea_id int, vote SMALLINT, created_at)
  idea_favorites  (user_id FK, idea_id int, created_at)
```

## Sub-Phases

| # | Doc | What it covers |
|---|---|---|
| F-V.1 | `ideation-voting-phase1-db.md` | Migration SQL + SQLAlchemy models |
| F-V.2 | `ideation-voting-phase2-api.md` | FastAPI route file, all 5 endpoints, register in main.py |
| F-V.3 | `ideation-voting-phase3-frontend.md` | ideas.js changes: load reactions, render buttons, sort, optimistic updates |
| F-V.4 | `ideation-voting-phase4-ui.md` | HTML template controls + CSS for vote/star buttons and tooltip |

Work each phase in order — each one is self-contained given this doc + its own phase doc.

## Files Touched (total across all phases)

```
scripts/migrations/add_idea_reactions.sql   ← NEW (phase 1)
src/sv_site/models.py                       ← add IdeaVote, IdeaFavorite (phase 1)
src/sv_site/routes/idea_reactions.py        ← NEW (phase 2)
src/sv_site/main.py                         ← register router (phase 2)
packages/site/static/js/ideas.js            ← voting logic (phase 3)
packages/site/templates/ideas/index.html    ← sort button + controls (phase 4)
packages/site/static/css/command-center.css ← button + tooltip styles (phase 4)
```

## Deploy Checklist (after all phases)
1. Run migration SQL on server: `psql -U sv_site_user -d sv_db -f scripts/migrations/add_idea_reactions.sql`
2. Deploy Python app (restart sv_site service)
3. Build and deploy static site (`python packages/site/build.py && bash deploy.sh`)
4. Smoke-test: vote on an idea, star an idea, verify sort order, verify admin tooltip
