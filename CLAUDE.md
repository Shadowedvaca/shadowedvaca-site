# Shadowedvaca.com — Project Reference

## Project Overview

This repo is a hybrid platform:

1. **Static Command Center** — A data-driven portfolio website (JSON → Pydantic → Jinja2 → static HTML/CSS/JS) served by Nginx.
2. **FastAPI Backend** — `src/sv_site/` — an authenticated API powering the hub, feedback pipeline, ideas board, and user management.
3. **Hub** — `hub/` — admin-only static HTML/JS pages (feedback review, user management, invite generation, settings).

Hosted on Hetzner CPX11 (Ubuntu 24.04, Nginx 1.24, PostgreSQL, Certbot SSL).

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
│           └── ideas.py                  ← /api/ideas/* (proxy to sv-tools)
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
├── deploy/
│   ├── nginx/shadowedvaca.com.conf      ← Nginx reverse proxy + static file config
│   ├── systemd/shadowedvaca.service     ← Systemd unit for FastAPI (Uvicorn)
│   └── scripts/create_schema.sql        ← Initial DB schema
│
├── scripts/
│   ├── validate_data.py                 ← Validates JSON data against Pydantic schemas
│   └── migrations/add_customer_feedback.sql
│
├── tests/
│   ├── conftest.py                      ← Fixtures: async_client, mock_db, test_settings
│   ├── test_feedback_ingest.py
│   └── test_feedback_read.py
│
├── monitoring/                          ← Server health checks + alerting
├── docs/                                ← Implementation plans and notes
├── reference/
│   └── mockup-v3.html                   ← Design reference (source of truth for UI)
│
├── .github/workflows/deploy.yml         ← GitHub Actions CI/CD
├── .env.example                         ← Environment variable template
├── deploy.sh                            ← Local deploy: build → scp to server
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

- **Python 3.11+** — Build system, data layer, and API backend
- **FastAPI + Uvicorn** — Async API, 2 workers, listening on `127.0.0.1:8050`
- **SQLAlchemy (async)** — ORM with asyncpg driver
- **PostgreSQL** — Persistent storage (schema: `shadowedvaca`)
- **Pydantic / pydantic-settings** — Schema validation and env config
- **Jinja2** — Static site templating
- **Anthropic Claude Haiku 4.5** — AI processing for feedback (graceful degradation if unavailable)
- **Vanilla HTML/CSS/JS** — No frontend frameworks. Minimal client-side JS.
- **Nginx 1.24** — Reverse proxy + static file serving
- **Let's Encrypt / Certbot** — Auto-renewing SSL
- **Google Fonts** — IBM Plex Sans, Share Tech Mono, Caveat (loaded from CDN, not self-hosted)

## FastAPI Backend

### Config (`config.py`)

Key settings (loaded from `.env`):
- `database_url` — PostgreSQL async connection string
- `secret_key` — JWT signing secret
- `jwt_algorithm` / `jwt_expire_minutes` — HS256, 480 min
- `feedback_ingest_key` — Shared secret for `POST /api/feedback/ingest`
- `anthropic_api_key` — Claude API key for feedback processing
- `sv_tools_url` / `sv_tools_api_key` — For ideas proxy

### Database Models (`models.py`)

All tables live in the `shadowedvaca` schema.

| Table | Key Columns |
|-------|-------------|
| `users` | id (SERIAL), username, password_hash, is_admin, is_active, created_at |
| `invite_codes` | code VARCHAR(16) PK, created_by_user_id FK, used_at, expires_at, permissions JSONB |
| `user_permissions` | user_id FK, tool_slug — composite PK |
| `customer_feedback` | id (SERIAL), program_name, received_at, score (1–10), raw_feedback, summary, sentiment, tags JSONB, privacy_token, processed_at, processing_error |

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
| GET | `/api/ideas` | JWT | List ideas (admin → full list, user → public only) |
| GET | `/api/ideas/{id}` | JWT | Get single idea |

Proxies to sv-tools API with 10-second timeout.

## Static Site Builder

**Run:** `python packages/site/build.py` (from repo root)

**Process:**
1. Load + validate `data/*.json` via `packages/core/data.py`
2. Group projects by section; identify `featured` project (default on load)
3. Render Jinja2 templates → `dist/index.html`, `dist/ideas/index.html`
4. Copy static assets (CSS, JS, 404, robots.txt, favicon) to `dist/`
5. Copy Meandering Muck files to `dist/` unchanged

**Windows gotchas:**
- `shutil.rmtree(dist/)` fails if Explorer has the folder open → clear contents, keep dir
- `strftime("%-d")` not supported → use `%d` + `.replace(" 0", " ")`
- Use `namespace()` in Jinja2 for variables set inside loops

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

## Deployment

### Local
```bash
python packages/site/build.py      # Build static site → dist/
bash deploy.sh                     # Build + scp to server (Git Bash on Windows)
python -m pytest tests/ -v         # Run tests
```

`deploy.sh` uses: `scp -r dist/* deploy@5.78.114.224:/var/www/shadowedvaca.com/`
SSH key: `~/.ssh/va_hetzner_openssh`

### Server Layout
```
/opt/shadowedvaca/          ← Git repo clone
├── venv/                   ← Python venv
├── .env                    ← Live secrets
└── src/, deploy/, ...

/var/www/shadowedvaca.com/  ← Static files (served by Nginx)
```

### Services
- **Nginx** — reverse proxy + static files (ports 80/443)
  - `/api/*` → proxy to `127.0.0.1:8050`
  - `/ideas/*` → static SPA with fallback
  - `/` → static files with 404 fallback
  - Gzip on CSS/JS/JSON/SVG; 30-day cache on static assets
- **shadowedvaca.service** — Uvicorn, 2 workers, runs as `www-data`
- **PostgreSQL** — localhost:5432

### CI/CD (GitHub Actions)

`.github/workflows/deploy.yml`:
1. Build static site
2. Deploy `dist/` files to server
3. Git pull + pip install on server
4. Reload Nginx + restart systemd service
5. Health check: `GET /api/health`

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
