# Ideation Board — Per-User Access Control Plan

## What We're Building

Ideas on the board are currently public (all logged-in users see them) or secret (admin-only). That's a binary switch that lives in sv-tools. This feature adds a granular per-user override layer: the admin can hand-pick exactly which users can or cannot see any given idea, regardless of its public/secret status in sv-tools.

Override data lives in the sv-site PostgreSQL database (shadowedvaca schema) — not in sv-tools.

---

## Overall Architecture

- **New DB table:** `shadowedvaca.idea_access_overrides (idea_id, user_id, can_view)`
- **New API endpoints:** Admin-only CRUD under `/api/admin/ideas/{id}/access`
- **Modified proxy:** `GET /api/ideas` and `GET /api/ideas/{id}` enforce overrides for non-admins
- **New admin UI:** Per-card "Access" panel with user checkboxes, visible to admins only

### Access Logic (one rule)
```
visible = overrides_map.get(idea_id, idea.public)
```
If an override exists for the user+idea pair, use it. Otherwise fall back to `idea.public` from sv-tools. No other cases.

---

## Phases

| Phase | What | Key Files | Standalone Deploy? |
|-------|------|-----------|-------------------|
| 1 | DB migration | `scripts/migrations/add_idea_access_overrides.sql` | Yes |
| 2 | ORM model | `src/sv_site/models.py` | Yes (unused) |
| 3 | Admin CRUD endpoints | `src/sv_site/routes/idea_access.py`, `main.py` | Yes |
| 4 | Proxy enforcement | `src/sv_site/routes/ideas.py` | Deploy with Phase 3 |
| 5 | Frontend access panel | `ideas.js`, `command-center.css` | After Phase 3 |
| 6 | Verification | — | N/A |

**Phase 4 must be deployed together with (or after) Phase 3.** All other phases are independently deployable.

---

## Phase Docs

Each phase has its own reference doc:

- `reference/ideation-assignment-phase1-db.md`
- `reference/ideation-assignment-phase2-model.md`
- `reference/ideation-assignment-phase3-api.md`
- `reference/ideation-assignment-phase4-proxy.md`
- `reference/ideation-assignment-phase5-frontend.md`
- `reference/ideation-assignment-phase6-verify.md`

---

## Key Existing Patterns to Follow

| Pattern needed | Where to find it |
|----------------|-----------------|
| Migration file format | `scripts/migrations/add_idea_reactions.sql` |
| ORM model style | `IdeaVote`, `IdeaFavorite` in `src/sv_site/models.py` |
| pg_insert upsert | `src/sv_site/routes/idea_reactions.py` (put_vote, put_favorite) |
| Admin guard (`_require_admin`) | `src/sv_site/routes/admin.py` |
| DB session injection | Any route in `routes/idea_reactions.py` |
| Ideas proxy pattern | `src/sv_site/routes/ideas.py` |
| Card render loop | `renderGrid()` in `packages/site/static/js/ideas.js` |
| Reaction button event handling | `handleReactionClick()` in `ideas.js` |

---

## Server & Deploy Reference

- Server: `deploy@5.78.114.224`, key at `~/.ssh/va_hetzner_openssh`
- Static deploy: `bash deploy.sh` (runs build + scp)
- Backend deploy: `git push` then on server: `git fetch origin && git reset --hard origin/main && sudo systemctl restart shadowedvaca`
- DB migrations: `psql "postgresql://sv_site_user:SvSiteDb2026@127.0.0.1:5432/sv_site_db" -f scripts/migrations/<file>.sql` (run via SSH)
- Health check: `curl https://shadowedvaca.com/api/health`
