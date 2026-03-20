# sv-common Migration — shadowedvaca-site Implementation Plan

> **Context:** This document is the per-repo implementation checklist for shadowedvaca-site, derived from the cross-repo audit at `PullAllTheThings-site/reference/SV_COMMON_AUDIT.md`.
> **Prerequisite:** The sv-common standalone package (Phases SV-1 through SV-3 in the audit) must be complete and tagged before any step here begins.

---

## Current State (shadowedvaca-site)

```
src/sv_common/
├── __init__.py
└── auth/
    ├── __init__.py
    └── passwords.py        ← Only file that matters. bcrypt hash/verify.
```

That's it. shadowedvaca already made the right instinct: `sv_common` was never imported deeply here. The app kept its own JWT, invite codes, DB engine, and ORM models in `sv_site/` with hub-platform-specific designs. The local `sv_common` copy is a one-file stub.

**Single active import:**
```python
# src/sv_site/auth.py:17
from sv_common.auth.passwords import hash_password, verify_password
```

Everything else (`jwt.py`, `invite_codes.py`, `database.py`, `models.py`) is already in `sv_site/` and stays there.

---

## Decision: What Migrates vs. What Stays

| Component | Current Home | Decision | Reason |
|-----------|-------------|----------|--------|
| `passwords.py` | `src/sv_common/auth/` | **Migrate** — use package | Trivial swap; will stay current with all sv-common fixes |
| JWT create/decode | `sv_site/auth.py` | **Optional migrate** | Claims differ by design (`username`, `is_admin`). Parameterized sv-common JWT can serve these via `extra_claims`. Low urgency — current impl is clean. |
| `require_auth()` dependency | `sv_site/auth.py` | **Stay in sv_site** | FastAPI-specific. sv-common should not depend on FastAPI. |
| Invite codes | `sv_site/auth.py` | **Optional migrate** | Field names differ (`created_by_user_id` vs. sv-common's generic `owner_id`). A thin wrapper works but isn't urgent. |
| DB engine / session | `sv_site/database.py` | **Stay in sv_site** | Already clean, no divergence risk, no shared consumers. |
| ORM models | `sv_site/models.py` | **Stay in sv_site** | App-specific; correct per the audit. |
| Feedback ingest | `sv_site/routes/feedback_ingest.py` + `feedback_processor.py` | **Evaluate for SV-2** | If sv-common ships a generic `feedback/` client, shadowedvaca could become a consumer rather than an implementor. See §4 below. |

---

## Phase SV-5a: Replace Local sv_common With Package (Required)

This is the minimum required change. It eliminates the local copy and pins to the shared package.

### Step 1 — Add sv-common to dependencies

In `pyproject.toml` (or `requirements.txt`):

```toml
# pyproject.toml
[project.dependencies]
# ... existing deps ...
"sv-common @ git+https://github.com/Shadowedvaca/sv-common@v1.0.0",
```

Or in `requirements.txt`:
```
sv-common @ git+https://github.com/Shadowedvaca/sv-common@v1.0.0
```

Pin to a specific tag — never `@main`.

### Step 2 — Verify the one import still resolves

```python
# sv_site/auth.py — this import should work unchanged after package install
from sv_common.auth.passwords import hash_password, verify_password
```

The package must export `sv_common.auth.passwords` with the same interface (`hash_password(plain: str) -> str`, `verify_password(plain: str, hashed: str) -> bool`). Confirm this against the sv-common v1.0.0 tag before deleting anything.

### Step 3 — Delete `src/sv_common/`

```bash
rm -r src/sv_common/
```

This removes:
- `src/sv_common/__init__.py`
- `src/sv_common/auth/__init__.py`
- `src/sv_common/auth/passwords.py`
- `src/sv_common/__pycache__/` and nested caches

### Step 4 — Update `pyproject.toml` package discovery

Check that `pyproject.toml` does not explicitly list `sv_common` as a local package to include. If using `find_packages` or `packages = [{include = "sv_common", from = "src"}]`, remove that entry.

```toml
# Before (if present — remove sv_common entry):
[tool.setuptools.packages.find]
where = ["src"]
# "sv_common" was auto-discovered — no longer present, so nothing to remove here

# If explicitly listed:
# packages = ["sv_site", "sv_common"]  ← remove sv_common
packages = ["sv_site"]
```

### Step 5 — Run tests

```bash
python -m pytest tests/ -v
```

All tests should pass. If anything fails on import, check:
1. The package is installed (`pip show sv-common`)
2. The installed version exports `sv_common.auth.passwords` correctly

### Step 6 — Update CI/CD

In `.github/workflows/deploy.yml`, ensure the pip install step installs sv-common from the tag:

```yaml
- name: Install dependencies
  run: pip install -r requirements.txt
  # sv-common @ git+... must be in requirements.txt for this to work
  # If using pyproject.toml, ensure `pip install -e .` or `pip install .` pulls it
```

If the sv-common repo is private, a GitHub deploy key or a fine-grained PAT scoped to sv-common must be available in the CI environment. The server's deploy user also needs SSH access or a PAT to `git+ssh://github.com/Shadowedvaca/sv-common` at pip install time.

---

## Phase SV-5b: JWT Migration — Deferred

JWT parameterization (`extra_claims: dict`) and invite code standardization are being addressed as part of a larger cross-app user management unification project. See `reference/SV_COMMON_USER_MANAGEMENT.md`.

**Do not touch `sv_site/auth.py` JWT or invite code logic during SV-5a.** Those changes will come as part of the user management project after sv-common v1.0 is stable.

---

## Phase SV-5c: Invite Code Migration — Deferred

Same as above — deferred to the user management project. See `reference/SV_COMMON_USER_MANAGEMENT.md`.

---

## Phase SV-5d: Feedback Pipeline — Evaluate sv-common Client

The audit notes sv-common will ship a `feedback/` module — a client-side library for submitting feedback to the Hub ingest endpoint.

shadowedvaca is the **server** side of that pipeline, not a client. The decision here is different:

| Component | Keep In sv_site | Move / Delegate |
|-----------|----------------|-----------------|
| `POST /api/feedback/ingest` route | ✅ stays | Hub owns the ingest endpoint |
| `feedback_processor.py` (Claude AI) | ✅ stays | App-specific AI processing logic |
| `customer_feedback` ORM model | ✅ stays | App DB schema |
| Hub read API (`GET /api/hub/feedback`) | ✅ stays | Admin-only UI |
| PATT client (`sv_common/feedback/`) | N/A | PATT uses sv-common client to POST here |

**Nothing moves out of shadowedvaca for the feedback pipeline.** sv-common's `feedback/` client is what PATT and satt use to send feedback *to* shadowedvaca. shadowedvaca is the receiver.

One future consideration: if the `FeedbackIngestPayload` schema is defined only in shadowedvaca, PATT's sv-common client must either duplicate it or import it. The cleanest option long-term is to define the ingest payload schema in sv-common (since the client and server must agree on it) and have shadowedvaca import it from there. **This is not urgent now**, but worth noting when sv-common's `feedback/` module is designed.

---

## Full Checklist

```
Phase SV-5a (Required — do when sv-common v1.0.0 is tagged):
[ ] Pin sv-common@v1.0.0 in requirements.txt / pyproject.toml
[ ] Confirm sv_common.auth.passwords interface is identical to local copy
[ ] Delete src/sv_common/ directory and all caches
[ ] Remove sv_common from pyproject.toml package discovery (if listed)
[ ] python -m pytest tests/ -v → all green
[ ] Update CI/CD pip install step; confirm server deploy has access to sv-common repo
[ ] Deploy to staging; smoke test login and registration (password hash/verify paths)

Phase SV-5b + SV-5c (Deferred — see SV_COMMON_USER_MANAGEMENT.md):
[ ] No action during sv-common package migration
[ ] JWT and invite code standardization tracked separately as user management project

Phase SV-5d (Future consideration):
[ ] When sv-common feedback/ module is finalized, check whether FeedbackIngestPayload
    schema belongs in sv-common for client/server agreement
[ ] No code changes needed in shadowedvaca until that decision is made
```

---

## Risks and Rollback

**Risk:** sv-common package unavailable at pip install time (private repo, missing deploy key).
**Mitigation:** Test pip install in CI against the tag before deleting local sv_common. Keep the local copy until CI is confirmed green.

**Risk:** sv-common package interface changes break the single import.
**Mitigation:** Pin to a specific tag (`@v1.0.0`), never `@main`. Only upgrade on an explicit version bump PR.

**Risk:** Server deploy fails because the server's `www-data` user can't reach the GitHub SSH endpoint.
**Mitigation:** Use HTTPS with a fine-grained read-only PAT (no push access needed), stored as a deploy secret. Or bundle sv-common into requirements at deploy time: `pip download` + `pip install --no-index`.

**Rollback:** If the package install fails post-deployment, revert to the local `src/sv_common/` by restoring the directory from git history and reverting `requirements.txt`. This is a safe, fast rollback.

---

## Summary

shadowedvaca's migration is the simplest of the three apps. The local `sv_common` is already minimal by good instinct. Phase SV-5a is a three-step swap: add dependency, verify one import, delete three files. Everything else (JWT, invite codes, DB, ORM, feedback pipeline) is correctly scoped to `sv_site` and stays there.

The only thing worth tracking for later is whether the `FeedbackIngestPayload` schema eventually wants to live in sv-common to keep the client (PATT/satt) and server (shadowedvaca) in sync.
