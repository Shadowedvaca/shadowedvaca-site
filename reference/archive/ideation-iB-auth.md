# iB-Auth — sv_site JWT Auth for shadowedvaca.com

**Repo:** shadowedvaca-site (`H:\Development\Shadowedvaca-site`)
**Branch:** `feat/ideation-iB-auth`
**Status:** ✅ COMPLETE — deployed and live as of 2026-03-15
**Depends on:** iB1 deployed (ideas API must exist)
**Blocks:** iB3 (board page requires auth layer) — **iB3 is now unblocked**

---

## What Was Built

A FastAPI backend (`sv_site`) running on port 8050 of the Hetzner server (5.78.114.224).
Provides JWT auth, invite codes, a hub landing page, admin user management, and a JWT-gated
ideas proxy.

---

## Deviations from Original Plan

### sv_common not used
- Original plan: copy `sv_common/auth/` from PATT repo
- **Actual:** `sv_common/auth/jwt.py` imports `guild_portal.config` — not portable
- **Fix:** App-local `src/sv_site/auth.py` with own JWT functions (same shape as SATT's `auth.py`).
  Only `sv_common/auth/passwords.py` (bcrypt — no deps) was copied.

### Separate Postgres schema (not shared common.users)
- Original plan: use `common.users` shared table
- **Actual:** `shadowedvaca` schema with its own `users`, `invite_codes`, and `user_permissions` tables
- **Why:** Cleaner isolation; avoids coupling shadowedvaca.com login to PATT/SATT accounts

### Hub landing page built (not in original plan)
- `hub/index.html` — JWT-gated landing page; renders tool cards based on user permissions
- Admins see a separate "admin" section with Invite and Users cards
- Non-admins see only their permitted tools + always-on locked tools (Settings)

### Admin UI built (not in original plan)
- `hub/invite/index.html` — Generate invite links with per-tool permission checkboxes
- `hub/users/index.html` — List all users, toggle permissions, delete users

### Login redirects to /hub/ (not /ideas/)
- Original plan: redirect to `/ideas/` after login
- **Actual:** redirect to `/hub/` — more logical since ideas board isn't built yet

### GitHub Actions deploy workflow NOT built
- Decided against automated deploy; manual `bash deploy.sh` + `ssh hetzner git pull && restart`

---

## What's Running on Server

### Service
- **Systemd:** `shadowedvaca.service` — uvicorn on `127.0.0.1:8050`, user `www-data`
- **PYTHONPATH:** `/opt/shadowedvaca/src`
- **Env file:** `/opt/shadowedvaca/.env`
- **Repo on server:** `/opt/shadowedvaca/` (cloned from GitHub, branch `feat/ideation-iB-auth`)
- **Venv:** `/opt/shadowedvaca/venv/`

### .env on server (variables)
```
DATABASE_URL=postgresql+asyncpg://sv_site_user:SvSiteDb2026@127.0.0.1:5432/sv_site_db
SECRET_KEY=<generated hex>
SV_TOOLS_URL=http://127.0.0.1:8000
ENVIRONMENT=production
```
Note: config field is `secret_key` (not `jwt_secret_key` as originally planned).

### Database
- **DB:** `sv_site_db`, user `sv_site_user` on the shared Postgres instance
- **Schema:** `shadowedvaca`
- **Tables:** `users`, `invite_codes`, `user_permissions`
- Schema created from `deploy/scripts/create_schema.sql`

---

## Final Repository Structure

```
shadowedvaca-site/
├── src/
│   ├── sv_common/
│   │   └── auth/
│   │       └── passwords.py        ← bcrypt hash/verify (only portable file from sv_common)
│   └── sv_site/
│       ├── __init__.py
│       ├── main.py                 ← includes auth, admin, ideas routers
│       ├── config.py               ← pydantic-settings; field: secret_key
│       ├── auth.py                 ← app-local JWT + invite code generation
│       ├── database.py             ← async SQLAlchemy engine + get_db dependency
│       ├── models.py               ← User, InviteCode, UserPermission (shadowedvaca schema)
│       ├── tools.py                ← static tool registry (TOOLS, LOCKED_SLUGS, GRANTABLE_SLUGS)
│       └── routes/
│           ├── auth.py             ← login, register, me, invite, change-password
│           ├── admin.py            ← GET/PUT/DELETE /api/admin/users, GET /api/admin/tools
│           └── ideas.py            ← JWT-gated proxy to sv-tools http://127.0.0.1:8000
├── hub/
│   ├── index.html                  ← hub landing page (dynamic, permission-aware)
│   ├── invite/
│   │   └── index.html              ← admin: generate invite links with permissions
│   ├── users/
│   │   └── index.html              ← admin: manage user permissions + delete users
│   └── settings/
│       └── index.html              ← change password
├── login.html                      ← static login page (redirects to /hub/)
├── register.html                   ← static invite-code registration page
├── deploy/
│   ├── nginx/
│   │   └── shadowedvaca.com.conf   ← full nginx config (static + /api/ proxy to 8050)
│   ├── systemd/
│   │   └── shadowedvaca.service    ← systemd unit
│   └── scripts/
│       └── create_schema.sql       ← DB schema (shadowedvaca schema, all three tables)
└── requirements.txt                ← fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, bcrypt, pyjwt, httpx, pydantic-settings
```

---

## API Endpoints

### Auth (`/api/auth/`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| POST | `/api/auth/login` | none | `{username, password}` → `{token, username}` |
| POST | `/api/auth/register` | none | `{username, password, invite_code}` — applies invite permissions |
| POST | `/api/auth/invite` | Bearer (admin) | `{permissions: []}` → `{invite_url}` |
| GET | `/api/auth/me` | Bearer | Returns `{user_id, username, isAdmin, permissions}` |
| POST | `/api/auth/change-password` | Bearer | `{current_password, new_password}` |

### Admin (`/api/admin/`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/admin/tools` | Bearer (admin) | Returns static TOOLS list |
| GET | `/api/admin/users` | Bearer (admin) | All users with permissions |
| PUT | `/api/admin/users/{id}/permissions` | Bearer (admin) | Replace permission rows |
| DELETE | `/api/admin/users/{id}` | Bearer (admin) | Cannot delete admins or self |

### Ideas (`/api/ideas`)
| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/api/ideas` | Bearer | Proxy to sv-tools public ideas endpoint |

---

## Permission Model

- **LOCKED_SLUGS** (`settings`): always returned in `me.permissions`, never stored in DB, always visible on hub
- **GRANTABLE_SLUGS**: stored in `user_permissions` table, controllable via invite and admin UI
- **Admin users**: bypass all permission checks, see all tools + admin section
- Add new tools to `src/sv_site/tools.py` — single source of truth for both backend and hub UI

### Adding a new tool (future pattern)
1. Add entry to `TOOLS` list in `src/sv_site/tools.py` with `locked: False, admin_only: False`
2. Add entry to `GRANTABLE_TOOLS` JS array in `hub/invite/index.html`
3. Add entry to `ALL_TOOLS` JS array in `hub/index.html`
4. Create `hub/<tool-slug>/index.html` with auth gate checking `permissions.includes('<slug>')`

---

## Known Issues / Gotchas

- **Shell expansion of passwords with `$` or `!`**: PostgreSQL passwords must be alphanumeric when
  set via SSH heredocs or sed. `SvSiteDb2026` used instead of original choice.
- **Bcrypt hash in psql**: Never interpolate bcrypt hash into shell strings — `$2b$`, `$12$` etc.
  get shell-expanded. Always write to a Python script file and execute that instead.
- **nginx config with `$` variables**: Write nginx conf locally and `scp` it — don't use SSH heredocs
  which expand `$host`, `$remote_addr` etc.
- **nginx redirect loop for /ideas/**: `try_files $uri $uri/ /ideas/index.html` loops if the file
  doesn't exist. Use `=404` fallback. The ideas page isn't built yet so this was the fix.
