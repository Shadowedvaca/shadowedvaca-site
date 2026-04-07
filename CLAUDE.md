# Shadowedvaca.com — Project Reference

## Project Overview

This repo is a hybrid platform:

1. **Static Command Center** — A data-driven portfolio website (JSON → Pydantic → Jinja2 → static HTML/CSS/JS) served by Nginx.
2. **FastAPI Backend** — `src/sv_site/` — an authenticated API powering the hub, feedback pipeline, ideas board, and user management.
3. **Hub** — `hub/` — admin-only static HTML/JS pages (feedback review, user management, invite generation, settings).

Hosted on Hetzner (Ubuntu 24.04, Nginx 1.24, PostgreSQL in Docker, Certbot SSL). Three environments: dev, test, prod — each with its own server and Docker stack.

## Repository Structure

```
shadowedvaca-site/
├── src/
│   ├── sv_common/                        ← Shared auth utilities (bcrypt re-export)
│   └── sv_site/                          ← FastAPI application
│       ├── main.py                       ← App init, router registration, CORS
│       ├── config.py                     ← Pydantic settings (loaded from .env)
│       ├── auth.py                       ← JWT, invite codes, password utilities
│       ├── database.py                   ← Async SQLAlchemy engine + get_db() dep
│       ├── models.py                     ← ORM models (User, InviteCode, UserPermission, CustomerFeedback)
│       ├── tools.py                      ← Hub tool registry (static config)
│       ├── feedback_processor.py         ← Claude Haiku AI processing for feedback
│       └── routes/
│           ├── auth.py                   ← /api/auth/* (login, register, invite, me, change-password)
│           ├── admin.py                  ← /api/admin/* (user management, permissions)
│           ├── feedback_ingest.py        ← POST /api/feedback/ingest (public, API key auth)
│           ├── feedback_read.py          ← GET /api/hub/feedback (admin JWT)
│           ├── ideas.py                  ← /api/ideas/* (proxy to sv-tools, override enforcement)
│           ├── idea_reactions.py         ← /api/ideas/reactions, vote + favorite endpoints
│           └── idea_access.py            ← /api/admin/ideas/{id}/access (per-user override CRUD)
│
├── packages/
│   ├── core/                             ← Shared data layer (Pydantic schemas + JSON loaders)
│   │   ├── schemas/
│   │   │   ├── project.py               ← Project model
│   │   │   ├── announcement.py          ← Ticker announcement model
│   │   │   └── profile.py               ← Owner profile model
│   │   ├── data.py                      ← load_projects(), load_announcements(), load_profile()
│   │   └── __init__.py
│   ├── site/                            ← Static site builder
│   │   ├── build.py                     ← Main build script: data → templates → dist/
│   │   ├── templates/
│   │   │   ├── base.html                ← Page shell (head, layout, scripts)
│   │   │   ├── index.html               ← Main command center template
│   │   │   ├── components/
│   │   │   │   ├── ticker.html          ← Scrolling announcement bar
│   │   │   │   ├── main_stage.html      ← Left 2/3: project detail views
│   │   │   │   ├── terminal.html        ← Right 1/3: CRT project index
│   │   │   │   ├── sticky_note.html     ← Contact sticky note overlay
│   │   │   │   └── bottom_bar.html      ← Footer status bar
│   │   │   └── ideas/
│   │   │       └── index.html           ← Ideas board SPA template
│   │   └── static/
│   │       ├── css/command-center.css   ← All command center styles
│   │       ├── js/
│   │       │   ├── navigation.js        ← Terminal → stage swapping
│   │       │   ├── sticky.js            ← Random sticky note positioning
│   │       │   ├── ticker.js            ← Ticker animation
│   │       │   ├── ideas.js             ← Ideas board client
│   │       │   └── marked.min.js        ← Markdown parser
│   │       ├── 404.html
│   │       ├── favicon.svg
│   │       └── robots.txt
│   └── book-club/                       ← Book club app (React + Express, separate from main site)
│
├── hub/                                 ← Admin hub static pages (served by Nginx at /hub/)
│   ├── index.html                       ← Hub dashboard
│   ├── feedback/index.html              ← Feedback review UI
│   ├── invite/index.html                ← Invite code generator
│   ├── settings/index.html              ← Password / account settings
│   └── users/index.html                 ← User management
│
├── data/                                ← JSON source of truth for static site
│   ├── projects.json
│   ├── announcements.json
│   └── profile.json
│
├── Dockerfile                           ← App image (python:3.12-slim, uvicorn 2 workers)
├── docker-compose.dev.yml               ← Dev stack (app port 8200, DB internal)
├── docker-compose.test.yml              ← Test stack (app port 8200, DB internal)
├── docker-compose.prod.yml              ← Prod stack (app port 8055, DB internal)
│
├── deploy/
│   ├── nginx/
│   │   ├── shadowedvaca.com.conf        ← Prod nginx (proxy → 8050 until Docker cutover)
│   │   ├── dev.shadowedvaca.com.conf    ← Dev nginx (proxy → 8200)
│   │   └── test.shadowedvaca.com.conf   ← Test nginx (proxy → 8200)
│   ├── systemd/shadowedvaca.service     ← Legacy systemd unit (prod only, until F.D.4 cutover)
│   └── scripts/create_schema.sql        ← Initial DB schema
│
├── scripts/
│   ├── validate_data.py                 ← Validates JSON data against Pydantic schemas
│   └── migrations/
│       ├── add_customer_feedback.sql
│       ├── add_idea_reactions.sql
│       └── add_idea_access_overrides.sql
│
├── tests/
│   ├── conftest.py                      ← Fixtures: async_client, mock_db, test_settings
│   ├── test_feedback_ingest.py
│   └── test_feedback_read.py
│
├── .github/workflows/
│   ├── deploy-dev.yml                   ← Manual dispatch → dev server
│   ├── deploy-test.yml                  ← Auto on push to main → test server
│   └── deploy.yml                       ← Auto on prod-v* tag → prod server
│
├── .env.example                         ← Environment variable template
├── login.html                           ← Auth pages (root, copied to web root by deploy)
├── register.html
├── requirements.txt
├── pyproject.toml                       ← Project config + pytest settings
│
├── meandering-muck.html                 ← Source (copied to dist/ unchanged)
├── meandering-muck-support.html
├── meandering-muck-privacy.html
├── assets/meandering-muck/
├── index.html                           ← OLD homepage (superseded, not served)
├── style.css                            ← OLD styles (superseded, not served)
└── dist/                                ← Build output (served by Nginx, not committed)
```

## Tech Stack

- **Python 3.12** — Build system, data layer, and API backend
- **FastAPI + Uvicorn** — Async API, 2 workers, containerized
- **Docker + Docker Compose** — All environments run as Docker stacks
- **SQLAlchemy (async)** — ORM with asyncpg driver
- **PostgreSQL 16** — Persistent storage (schema: `shadowedvaca`), containerized
- **Pydantic / pydantic-settings** — Schema validation and env config
- **Jinja2** — Static site templating
- **Anthropic Claude Haiku 4.5** — AI processing for feedback (graceful degradation if unavailable)
- **Vanilla HTML/CSS/JS** — No frontend frameworks. Minimal client-side JS.
- **Nginx 1.24** — Reverse proxy + static file serving
- **Let's Encrypt / Certbot** — Auto-renewing SSL
- **Google Fonts** — IBM Plex Sans, Share Tech Mono, Caveat (loaded from CDN, not self-hosted)

## Environments & Servers

**Claude handles all server operations. Mike does not SSH into servers.**

| Env | Domain | Server alias | IP | App port | Status |
|-----|--------|-------------|-----|----------|--------|
| dev | `dev.shadowedvaca.com` | `my-web-apps-dev` | 91.99.112.160 | 8200 | Docker ✓ |
| test | `test.shadowedvaca.com` | `my-web-apps-test` | 91.99.121.21 | 8200 | Not yet set up |
| prod | `shadowedvaca.com` | `hetzner` | 5.78.114.224 | 8050 (systemd) → 8055 (Docker, pending cutover) | Systemd (legacy) |

SSH key for all servers: `~/.ssh/va_hetzner_openssh`

### Server Layout (dev/test)

```
/opt/shadowedvaca-site/          ← git repo clone
├── .env                         ← secrets (never committed, generated per-env)
├── docker-compose.dev.yml       ← symlinked or present per server role
└── ...

/var/www/dev.shadowedvaca.com/   ← static files (dev)
/var/www/test.shadowedvaca.com/  ← static files (test)
```

### Dev Server Notes

- 2 GiB swapfile at `/swapfile` (added 2026-04-01, persisted in `/etc/fstab`) — needed because shared server runs multiple app stacks
- Other projects also run on `my-web-apps-dev`: guild-portal (port 8100), lsa (port 3000)
- DB user in Docker: `shadowedvaca` (owns all tables). Migration files have `GRANT ... TO sv_site_user` — those fail harmlessly on Docker (role doesn't exist); tables still create fine.

## Deploy Workflow

**This is how things get deployed. Claude runs these, not Mike.**

### Dev (manual, any branch)

```bash
gh workflow run deploy-dev.yml -f branch=feature/my-branch
```

Workflow does: checkout → build static site → scp `dist/` + `login.html` + `register.html` to `/var/www/dev.shadowedvaca.com/` → git pull on server → `docker compose build app` → `docker compose up -d --force-recreate app`

### Test (automatic on merge to main)

Pushing or merging to `main` automatically triggers `deploy-test.yml`.

### Prod (automatic on tag)

```bash
git tag prod-vX.Y.Z && git push origin prod-vX.Y.Z
```

Triggers `deploy.yml` → deploys to prod server.

### Static site build (local, before manual deploy)

```bash
python packages/site/build.py      # from repo root
python -m pytest tests/ -v         # run tests
```

**Windows gotchas:**
- `shutil.rmtree(dist/)` fails if Explorer has the folder open → clear contents, keep dir
- `strftime("%-d")` not supported → use `%d` + `.replace(" 0", " ")`
- Use `namespace()` in Jinja2 for variables set inside loops
- `rsync` is not available in Claude Code's bash environment — use `scp -r`

## Docker Operations Reference

**Claude uses these when managing servers. Do not run docker compose commands in parallel — one operation at a time.**

```bash
# Start stack (reads .env fresh — use this, not restart)
docker compose -f docker-compose.dev.yml up -d --force-recreate app

# Stop everything cleanly
docker compose -f docker-compose.dev.yml down

# View logs
docker compose -f docker-compose.dev.yml logs app --tail=50

# Check env vars loaded in container
docker exec shadowedvaca-site-app-1 env | grep SV_TOOLS

# Run a DB migration
docker compose -f docker-compose.dev.yml exec -T db psql -U shadowedvaca -d shadowedvaca_dev < migrations/some_migration.sql

# Check container health
docker ps
```

**Critical gotcha:** `docker compose restart` does NOT reload `env_file`. Always use `up -d --force-recreate` when env vars may have changed. The deploy workflows already use `--force-recreate`.

**Critical gotcha:** Never pipe complex SQL via SSH heredoc — it doesn't transmit reliably. Copy SQL files with `scp` first, then pipe them in.

## FastAPI Backend

### Config (`config.py`)

Key settings (loaded from `.env`):
- `database_url` — PostgreSQL async connection string (uses Docker service name `db`)
- `secret_key` — JWT signing secret
- `jwt_algorithm` / `jwt_expire_minutes` — HS256, 480 min
- `feedback_ingest_key` — Shared secret for `POST /api/feedback/ingest`
- `anthropic_api_key` — Claude API key for feedback processing
- `sv_tools_url` / `sv_tools_api_key` / `sv_tools_callback_key` — For ideas proxy

### Database Models (`models.py`)

All tables live in the `shadowedvaca` schema.

| Table | Key Columns |
|-------|-------------|
| `users` | id (SERIAL), username, password_hash, is_admin, is_active, created_at |
| `invite_codes` | code VARCHAR(16) PK, created_by_user_id FK, used_at, expires_at, permissions JSONB |
| `user_permissions` | user_id FK, tool_slug — composite PK |
| `customer_feedback` | id (SERIAL), program_name, received_at, score (1–10), raw_feedback, summary, sentiment, tags JSONB, privacy_token, processed_at, processing_error |
| `idea_votes` | idea_id (INTEGER), user_id — composite PK, vote (1 or -1) |
| `idea_favorites` | idea_id (INTEGER), user_id — composite PK |
| `idea_access_overrides` | idea_id (INTEGER), user_id — composite PK, can_view BOOL, created_at, updated_at |

`customer_feedback` is fully de-identified — no PII stored. Anonymous submissions force `privacy_token = NULL`.

### Tool Registry (`tools.py`)

Three hub tools:
- `settings` — locked (always granted, cannot revoke)
- `ideas` — grantable via invite code
- `customer_feedback` — admin-only

### Auth (`auth.py`)

- JWT: `create_access_token()` / `decode_access_token()` — payload has `{user_id, username, is_admin}`
- Invite codes: 8-char alphanumeric (no 0/O/1/I/L), 48-hour default expiry
- `require_auth(Authorization header)` — FastAPI dependency, HTTP 401 on missing/invalid token
- Passwords: bcrypt via `sv_common.auth.passwords`

### API Routes

#### Auth (`/api/auth/`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/auth/login` | None | Username + password → JWT |
| POST | `/api/auth/register` | None | Invite code → create user + JWT |
| POST | `/api/auth/invite` | Admin JWT | Generate invite code (with optional tool permissions) |
| GET | `/api/auth/me` | JWT | Current user (username, is_admin, permissions) |
| POST | `/api/auth/change-password` | JWT | Change password |

#### Admin (`/api/admin/`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/admin/tools` | Admin | List all tools |
| GET | `/api/admin/users` | Admin | List all users + permissions |
| PUT | `/api/admin/users/{id}/permissions` | Admin | Set grantable permissions |
| DELETE | `/api/admin/users/{id}` | Admin | Delete user (not self, not admin) |

#### Feedback Ingest (`/api/feedback/`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/feedback/ingest` | `X-Ingest-Key` header | Submit de-identified feedback |

Payload: `{program_name, score (1–10), raw_feedback, is_authenticated_user?, is_anonymous?, privacy_token?}`

AI processing happens synchronously (Claude Haiku). Degrades gracefully if API unavailable.

#### Feedback Read (`/api/hub/feedback/`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/hub/feedback` | Admin JWT | List feedback (filterable, paginated) |
| GET | `/api/hub/feedback/programs` | Admin JWT | Distinct program names |

Query params: `program_name`, `sentiment`, `tag`, `min_score`, `max_score`, `limit` (default 50, max 200), `offset`

#### Ideas (`/api/ideas/`)
| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/ideas` | JWT | List ideas (admin → full list, user → filtered by public + overrides) |
| GET | `/api/ideas/{id}` | JWT | Get single idea |
| GET | `/api/ideas/reactions` | JWT | All vote/favorite counts + current user's state |
| PUT | `/api/ideas/{id}/vote` | JWT | Cast or change vote (`{"vote": 1}` or `{"vote": -1}`) |
| DELETE | `/api/ideas/{id}/vote` | JWT | Retract vote |
| PUT | `/api/ideas/{id}/favorite` | JWT | Favorite an idea |
| DELETE | `/api/ideas/{id}/favorite` | JWT | Unfavorite an idea |
| GET | `/api/admin/ideas/{id}/access` | Admin JWT | List all non-admin users + their override for this idea |
| PUT | `/api/admin/ideas/{id}/access/{user_id}` | Admin JWT | Set override (`{"can_view": true/false}`) |
| DELETE | `/api/admin/ideas/{id}/access/{user_id}` | Admin JWT | Remove override (reverts to idea.public default) |

Proxies to sv-tools API with 10-second timeout. Access rule: `visible = overrides_map.get(idea_id, idea.public)` — override wins, falls back to sv-tools `public` flag.

## Static Site Builder

**Run:** `python packages/site/build.py` (from repo root)

**Process:**
1. Load + validate `data/*.json` via `packages/core/data.py`
2. Group projects by section; identify `featured` project (default on load)
3. Render Jinja2 templates → `dist/index.html`, `dist/ideas/index.html`
4. Copy static assets (CSS, JS, 404, robots.txt, favicon) to `dist/`
5. Copy Meandering Muck files to `dist/` unchanged

**Note:** `login.html` and `register.html` live at repo root (not `dist/`) and are deployed separately by all three GitHub Actions workflows.

## Data Schemas (Pydantic)

### Project (`packages/core/schemas/project.py`)
- `id`, `name`, `tagline`, `description: list[str]`, `category`, `terminal_desc`
- `status`: `"live"` | `"launching"` | `"in-progress"` | `"concept"` | `"archived"`
- `section`: `"active"` | `"websites"` | `"games"` | `"utilities"` | `"creative"` | `"printing"` | `"archive"`
- `meta_tags: list[MetaTag]`, `links: list[ProjectLink]`, `features: list[str] | None`
- `media: MediaConfig | None`, `sort_order: int`, `featured: bool`

### Announcement (`packages/core/schemas/announcement.py`)
- `id`, `text`, `dot_style` (`"live"` | `"soon"`), `active: bool`, `sort_order: int`

### Profile (`packages/core/schemas/profile.py`)
- `name`, `company`, `location`, `email`, `tagline`, `bottom_bar_tagline`
- `calendly_url`, `social_links: list[dict]`, `funding_links: list[dict]`

## Design: Split-Screen Command Center

The command center fills the viewport — NOT a scrolling page. Two zones:

- **Main Stage (left 2/3):** One project detail view at a time. Fade transition on switch. Meandering Muck is default.
- **Terminal Sidebar (right 1/3):** CRT-style green-on-black project index. Click to swap main stage.

**The file `reference/mockup-v3.html` is the design bible.** Match it for layout, colors, typography, and feel.

### Color Palette

| Role | Hex |
|------|-----|
| Background (deep) | `#0a0c10` |
| Background (terminal) | `#030806` |
| Divider / border | `#1e2533` |
| Text (primary) | `#c8cdd3` |
| Text (secondary) | `#6b7280` |
| Accent (cyan) | `#00d4ff` |
| Accent (amber) | `#f0a030` |
| Terminal green (bright) | `#33ff33` |
| Terminal green (dim) | `#1a9e1a` |
| Terminal green (faint) | `#0d4f0d` |
| Status live | `#2ecc71` |
| Status in-progress | `#f0a030` |
| Status concept | `#00d4ff` @ 40% opacity |

### Responsive Behavior

- **Desktop (>900px):** Side-by-side split, viewport-height, no page scroll
- **Tablet/Mobile (≤900px):** Stacks — main stage top, terminal below (max-height 40vh), page scrolls
- **Small mobile (≤500px):** Reduced padding, smaller title font

## Testing

**Framework:** pytest + pytest-asyncio

**Fixtures** (`tests/conftest.py`):
- `test_settings` — Settings with test values
- `mock_db` — AsyncMock DB session (dependency override)
- `async_client` — FastAPI test client

**Coverage:** feedback ingest (auth, validation, privacy enforcement, AI degradation), feedback read (filtering, pagination, token truncation), AI response validation (bad tags filtered, unknown sentiment → neutral).

## Important Notes

- **No file moves/renames.** Existing Meandering Muck files stay at root. Build copies them to `dist/` unchanged.
- **sv-tools and sv-mcp are SEPARATE repos.** Do not scaffold them here.
- **`packages/core/` is a reusable library.** Keep it clean and importable.
- **Vanilla JS only.** No React, Vue, or other frontend frameworks.
- **No content hardcoded in templates.** Everything comes from JSON data files.
- **Mike is on Windows.** All scripts must be cross-platform (Python preferred over shell).
- **`rsync` is not available** in the Claude Code bash environment on this machine — use `scp -r`.
- **Claude handles all server operations.** Mike does not SSH into servers or run docker commands manually.
