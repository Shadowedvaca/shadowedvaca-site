# sv-common: Shared User Management — Design Brief

> **Status:** Pre-design — to be worked after sv-common package migration is complete
> **Trigger:** Start this project once sv-common v1.0 is tagged and all three apps are consuming the package
> **Scope:** Define a shared user model + auth flows that all apps use as a common base, with clean extension points for app-specific additions (guild identity in PATT, tool permissions in shadowedvaca)

---

## Problem Statement

All three apps implement user management independently, and the implementations are already drifting:

| Capability | shadowedvaca | PATT | satt |
|---|---|---|---|
| Users table | `id, username, password_hash, is_admin, is_active, created_at` | Linked to guild members + Discord | Old copy of PATT's |
| Invite codes | `owner_id, expires_at, permissions JSONB, used_at` | `player_id, created_by_id, 72h default` | Old copy of PATT's |
| Permissions | `user_permissions` table (tool slugs) | Guild rank (`rank_level` in JWT) | Unknown |
| JWT claims | `user_id, username, is_admin` | `user_id, member_id, rank_level` | Broken (old import) |
| Auth routes | login, register, invite, me, change-password | Similar set | Similar set |

Any bug fixed in one app's auth flow doesn't reach the others. Any new capability (e.g. session invalidation, password reset tokens, audit logging for logins) has to be added three times. An admin who manages users in PATT and shadowedvaca is looking at two different UIs with different mental models.

---

## Design Principles

1. **sv-common provides the floor, not the ceiling.** The common schema and auth flows cover what every app needs. Apps add columns and routes on top without touching shared code.

2. **Non-breaking extensions.** PATT's guild identity bolts on via a separate table with a FK to the shared user. It doesn't modify the base user row. The base user table stays clean across all apps.

3. **One auth flow to learn.** Login, registration via invite, password change — these should work identically in every app from the outside. The token payload differs by app, but the endpoints, HTTP methods, and request/response shapes should match.

4. **Invite codes are a first-class concept.** The base invite code table covers the universal case (short code, expiry, owner, consumed flag). App-specific fields (tool permissions, player link) live in a separate JSONB metadata column or extension table.

5. **No forced schema coupling.** Each app keeps its own database and its own ORM models. sv-common provides `DeclarativeBase` + a reference schema. Apps can use it directly or adapt it — but sv-common doesn't connect to any app's database.

---

## Proposed Base Schema

### `sv_users` table

```sql
CREATE TABLE sv_users (
    id          SERIAL PRIMARY KEY,
    username    VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

This is the minimum. No app-specific fields (no `is_admin`, no `member_id`). Those live in extension tables or alongside this via columns added in each app's migration.

**shadowedvaca extension** — add two columns to the shared table or keep a separate profile row:
```sql
ALTER TABLE sv_users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE;
-- tool permissions stay in a separate user_permissions table (already exists)
```

**PATT extension** — separate table, FK relationship:
```sql
CREATE TABLE guild_members (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER REFERENCES sv_users(id) ON DELETE CASCADE,
    discord_id  VARCHAR(32),
    rank_level  INTEGER NOT NULL DEFAULT 0,
    -- ... guild-specific fields
);
```

### `sv_invite_codes` table

```sql
CREATE TABLE sv_invite_codes (
    code        VARCHAR(16) PRIMARY KEY,
    owner_id    INTEGER NOT NULL REFERENCES sv_users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at  TIMESTAMPTZ,
    used_at     TIMESTAMPTZ,
    used_by_id  INTEGER REFERENCES sv_users(id),
    metadata    JSONB NOT NULL DEFAULT '{}'
);
```

The `metadata` column carries app-specific fields:
- shadowedvaca: `{"permissions": ["customer_feedback", "ideas"]}`
- PATT: `{"player_id": 42, "rank_level": 3}`
- satt: `{}` (open invite, no extras)

### ORM Base Classes

sv-common provides SQLAlchemy mixins, not full model classes — apps compose them:

```python
# sv_common/db/mixins.py
class UserMixin:
    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str]
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    updated_at: Mapped[datetime] = mapped_column(default=func.now(), onupdate=func.now())

class InviteCodeMixin:
    code: Mapped[str] = mapped_column(String(16), primary_key=True)
    owner_id: Mapped[int]   # app sets the FK target
    created_at: Mapped[datetime] = mapped_column(default=func.now())
    expires_at: Mapped[datetime | None]
    used_at: Mapped[datetime | None]
    used_by_id: Mapped[int | None]
    metadata: Mapped[dict] = mapped_column(JSONB, default={})
```

Each app's `models.py` composes these:

```python
# shadowedvaca: sv_site/models.py
from sv_common.db.mixins import UserMixin, InviteCodeMixin

class User(UserMixin, Base):
    __tablename__ = "users"
    __table_args__ = {"schema": "shadowedvaca"}
    is_admin: Mapped[bool] = mapped_column(default=False)  # extension

class InviteCode(InviteCodeMixin, Base):
    __tablename__ = "invite_codes"
    __table_args__ = {"schema": "shadowedvaca"}
    owner_id: Mapped[int] = mapped_column(ForeignKey("shadowedvaca.users.id"))
    used_by_id: Mapped[int | None] = mapped_column(ForeignKey("shadowedvaca.users.id"), nullable=True)
```

---

## Auth Flow Standardization

### Endpoints — same shape across all apps

| Route | Method | Auth | Request | Response |
|-------|--------|------|---------|----------|
| `/api/auth/login` | POST | None | `{username, password}` | `{access_token, token_type}` |
| `/api/auth/register` | POST | None | `{username, password, invite_code}` | `{access_token, token_type}` |
| `/api/auth/invite` | POST | Admin/privileged JWT | `{expires_hours?, metadata?}` | `{code, expires_at}` |
| `/api/auth/me` | GET | JWT | — | `{user_id, username, ...app claims}` |
| `/api/auth/change-password` | POST | JWT | `{current_password, new_password}` | `{ok: true}` |

sv-common can provide these as a FastAPI `APIRouter` factory:

```python
# sv_common/auth/router.py
def create_auth_router(
    get_db,             # app's database dependency
    user_model,         # app's User ORM class
    invite_model,       # app's InviteCode ORM class
    token_factory,      # callable: (user) -> dict of extra JWT claims
    admin_check,        # callable: (payload) -> bool — what counts as "admin" for this app
) -> APIRouter:
    router = APIRouter(prefix="/api/auth")
    # ... registers login, register, invite, me, change-password routes
    return router
```

Each app calls this once in `main.py` and passes its app-specific callables. The `token_factory` is what makes JWT claims different per app:

```python
# shadowedvaca/main.py
auth_router = create_auth_router(
    get_db=get_db,
    user_model=User,
    invite_model=InviteCode,
    token_factory=lambda user: {"username": user.username, "is_admin": user.is_admin},
    admin_check=lambda payload: payload.get("is_admin", False),
)
app.include_router(auth_router)

# PATT/main.py
auth_router = create_auth_router(
    get_db=get_db,
    user_model=User,
    invite_model=InviteCode,
    token_factory=lambda user: {"member_id": user.guild_member.id, "rank_level": user.guild_member.rank_level},
    admin_check=lambda payload: payload.get("rank_level", 0) >= OFFICER_RANK,
)
app.include_router(auth_router)
```

---

## JWT Standardization

```python
# sv_common/auth/jwt.py
def create_access_token(
    user_id: int,
    secret_key: str,
    algorithm: str,
    expire_minutes: int,
    extra_claims: dict = {},
) -> str: ...

def decode_access_token(token: str, secret_key: str, algorithm: str) -> dict: ...
```

Each app's `require_auth` FastAPI dependency stays app-side — it knows which claims to extract and what to do with them (shadowedvaca checks `is_admin`, PATT checks `rank_level`). sv-common provides the signing/decoding primitives only.

---

## Invite Code Standardization

sv-common provides the generation and lifecycle logic; the ORM model lives in each app (using `InviteCodeMixin`):

```python
# sv_common/auth/invite_codes.py
def generate_code(length: int = 8, charset: str = "ABCDEFGHJKMNPQRSTUVWXYZ23456789") -> str:
    """Generate a random invite code string. Does not touch the database."""
    ...

async def validate_invite_code(db, model_class, code: str):
    """Returns the invite code row if valid (exists, not used, not expired). Otherwise None."""
    ...

async def consume_invite_code(db, model_class, code: str, used_by_id: int):
    """Mark the invite code as used. Returns updated row. Raises ValueError if invalid."""
    ...
```

Each app wraps this in its own `generate_invite_code()` function that sets its own `metadata` fields. The lifecycle (validate, consume) is fully shared.

---

## Per-App Migration View

### shadowedvaca
- **Current state:** Clean, minimal. `User` and `InviteCode` models are already close to the base schema.
- **Changes:** Adopt `UserMixin` and `InviteCodeMixin`. Add `is_admin` as a local extension column. Move invite `permissions` list into `metadata JSONB`. Update `generate_invite_code()` to use sv-common's code generator + lifecycle functions.
- **Auth routes:** Mount sv-common's `create_auth_router()`. This replaces the manually written login/register/invite/me/change-password routes in `sv_site/routes/auth.py`.
- **Risk:** Low. Schema changes are additive (rename `permissions` → `metadata`, add `used_by_id`). One migration script.

### PATT
- **Current state:** Complex. User is tied to guild member identity. Admin check is rank-based, not a boolean flag.
- **Changes:** Adopt `UserMixin` for the base `users` table. Guild identity stays in `guild_members` extension table (FK to users). `token_factory` returns `member_id` and `rank_level` from the joined guild_member row. `admin_check` checks rank level, not `is_admin`.
- **Auth routes:** Mount sv-common's `create_auth_router()` with PATT's token_factory. Custom guild onboarding flow (DM on join, role sync) stays in PATT's own Discord code — it's not part of the auth router.
- **Risk:** Medium. Requires careful migration of existing users table to the mixin schema without losing guild member links.

### satt
- **Current state:** Broken old copy of PATT's user system.
- **Changes:** Straightforward — satt has the simplest needs. Adopt `UserMixin` cleanly. No guild extensions needed. Mount sv-common's auth router with a simple `token_factory`.
- **Risk:** Low. Since satt's user system is already broken/dead, there's no "working system" to protect.

---

## Open Questions (Decide Before Implementation)

**1. Does `is_admin` belong in the base schema or as an extension?**
Every app has some concept of elevated privilege. shadowedvaca uses `is_admin: bool`. PATT uses `rank_level >= OFFICER`. satt presumably has something similar. Should the base `UserMixin` include `is_admin` as a universal field (defaulting to False), or does each app define its own privilege column? Argument for including it: it's universal enough. Argument against: PATT's rank system makes a boolean insufficient.

**2. Does the `admin_check` callable in `create_auth_router` cover PATT's use case cleanly?**
shadowedvaca's admin check is `payload["is_admin"] == True`. PATT's is `payload["rank_level"] >= N`. The callable signature handles this — but PATT's "who can generate an invite code" may be more nuanced than a single boolean (e.g., officers can invite but only up to Member rank). The router factory may need a separate `invite_permission_check` callable.

**3. Where does `me` endpoint live if app claims differ?**
The `/api/auth/me` response should include app-specific fields (`is_admin` for shadowedvaca, `rank_level` for PATT). The sv-common router can return `{user_id, username, ...token_factory(user)}` — but this requires a DB lookup to build fresh app claims rather than just echoing the token. Decide: re-derive claims from DB on `/me`, or return what's in the token?

**4. Multi-tenant or per-app databases?**
Each app currently has its own PostgreSQL database. The shared schema approach works fine with this — each app runs its own migrations using the common mixin definitions. A shared database would simplify cross-app user lookup but is a much bigger architectural shift. Keep per-app databases.

**5. What does satt actually need?**
satt's purpose as a standalone app is unclear from this vantage point. Its user management needs are minimal (or maybe nonexistent if it's just a bot). Clarify satt's scope before designing its user migration — don't build something it doesn't need.

---

## Implementation Order (When Ready)

1. **Design review** — answer the open questions above; agree on the `UserMixin` schema and the auth router factory interface
2. **sv-common: add mixins + auth router factory** — write the code, unit test it standalone
3. **sv-common: tag v1.1** — user management features ship as a minor version bump; no breaking changes to v1.0 auth primitives
4. **Migrate shadowedvaca first** — smallest change, cleanest existing code, serves as the reference implementation
5. **Migrate satt** — straightforward once shadowedvaca is proven
6. **Migrate PATT last** — most complex due to guild identity layering; use shadowedvaca and satt as proven patterns

---

## Not In Scope

- Single sign-on across apps (users are per-app, not federated)
- Session storage, refresh tokens, or logout/invalidation (can be added later as sv-common v1.x features)
- Password reset via email (no email infrastructure currently)
- OAuth / social login
