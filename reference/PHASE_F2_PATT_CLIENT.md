# Phase F.2 — PATT: sv_common.feedback Client Package

> **Repo:** PullAllTheThings-site (this doc lives in shadowedvaca-site as a reference)
> **Status:** Complete — merged to `feature/phase-feedback`, migration 0050 applied on all envs
> **Depends on:** Phase F.1 deployed — `POST /api/feedback/ingest` must be live
> **Produces:** `common.feedback_submissions` local table, `sv_common.feedback` package
> **Next:** Phase F.3 — PATT feedback button + form + submission API

---

## What This Phase Built

The client-side half of the feedback pipeline lives entirely in PullAllTheThings-site.
This document exists here so the Hub side has a record of the integration contract —
what payload arrives at the ingest endpoint, how the shared keys are used, and what
the PATT client stores locally.

**No Hub code changed in F.2.** Everything below is client-side only.

---

## PATT Local DB Table

`common.feedback_submissions` — PII lives here and nowhere else.

```sql
CREATE TABLE common.feedback_submissions (
    id                    SERIAL PRIMARY KEY,
    program_name          VARCHAR(80)  NOT NULL,
    submitted_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    is_authenticated_user BOOLEAN      NOT NULL DEFAULT FALSE,
    is_anonymous          BOOLEAN      NOT NULL DEFAULT FALSE,
    contact_info          VARCHAR(255),        -- real value; NEVER sent to Hub
    privacy_token         VARCHAR(64),         -- sha256 hash; sent to Hub

    score                 INTEGER      CHECK (score BETWEEN 1 AND 10),
    raw_feedback          TEXT         NOT NULL,

    hub_feedback_id       INTEGER,             -- NULL until Hub confirms
    hub_synced_at         TIMESTAMPTZ
);
```

`contact_info` is never transmitted anywhere. The Hub has no `contact_info` column and
never will.

---

## sv_common.feedback Package

**Location:** `src/sv_common/feedback/` in PullAllTheThings-site

```
sv_common/feedback/
├── __init__.py      — public API: submit_feedback()
├── _privacy.py      — SHA-256 privacy token generation
├── _store.py        — asyncpg insert/update for local table
└── _hub_client.py   — HTTP POST to Hub ingest endpoint
```

### Public API

```python
from sv_common.feedback import submit_feedback

result = await submit_feedback(
    pool,
    score=8,
    raw_feedback="Really enjoying the new crafting corner!",
    is_authenticated_user=True,
    contact_info="mike@example.com",   # stored locally; never forwarded
    is_anonymous=False,
)
# → {"id": 42, "hub_feedback_id": 99, "program_name": "patt-guild-portal"}
```

### Flow

```
submit_feedback() called
  │
  ├─ 1. Validate: score 1–10, raw_feedback non-empty
  ├─ 2. privacy_token = sha256(FEEDBACK_PRIVACY_SALT + normalized contact_info)
  │         → None if is_anonymous=True or no contact provided
  ├─ 3. INSERT into common.feedback_submissions (contact_info stored here)
  ├─ 4. POST de-identified payload to Hub /api/feedback/ingest (fire-and-forget)
  │         → Hub failure: local record still saved, hub_feedback_id stays NULL
  └─ 5. If Hub returns hub_feedback_id: UPDATE local record with hub_feedback_id
```

### Privacy Token Generation

```python
# _privacy.py
normalized = contact_info.strip().lower()
token = sha256(f"{FEEDBACK_PRIVACY_SALT}{normalized}".encode()).hexdigest()
```

- `FEEDBACK_PRIVACY_SALT` is PATT-specific — different from any other client app's salt
- Same person on PATT and another app produces **different tokens** (no cross-app correlation)
- Token is NULL when `is_anonymous=True`, contact is empty, or salt env var is unset
- The Hub cannot reverse the token; it can only detect two records from the same person

---

## Payload Sent to Hub

PATT's `_hub_client.py` POSTs this JSON to `POST /api/feedback/ingest`:

```json
{
    "program_name":          "patt-guild-portal",
    "score":                 8,
    "raw_feedback":          "Really enjoying the new crafting corner!",
    "is_authenticated_user": true,
    "is_anonymous":          false,
    "privacy_token":         "a3f8b2..."
}
```

**`contact_info` is never in this payload.** The Hub ingest endpoint's `IngestPayload`
schema has no `contact_info` field — this is enforced at the Pydantic layer, not just
by convention.

Header: `X-Ingest-Key: <FEEDBACK_INGEST_KEY>`

---

## Shared Environment Variables

Both repos must have matching values for `FEEDBACK_INGEST_KEY`. They must NOT share
`FEEDBACK_PRIVACY_SALT` — that is intentionally per-app.

| Variable | PATT | Hub | Notes |
|----------|------|-----|-------|
| `FEEDBACK_INGEST_KEY` | ✓ set | ✓ must match | Shared secret; authenticate ingest POSTs |
| `FEEDBACK_PRIVACY_SALT` | ✓ set | — never set | Per-app only; different value for every client |
| `FEEDBACK_HUB_URL` | ✓ set | — not needed | Hub's own base URL; PATT uses it to POST |
| `ANTHROPIC_API_KEY` | — not needed | ✓ set | Hub-only; used for AI processing |

### Keys set on PATT server (all three envs: `.env.dev`, `.env.test`, `.env.prod`)

```bash
FEEDBACK_HUB_URL=https://hub.shadowedvaca.com
FEEDBACK_INGEST_KEY=df9bf11c5983d22bc23bdc7338707c2088107affc027490e9fbf00e50189475f
FEEDBACK_PRIVACY_SALT=178ab60fe386f62692d9a5e87d5186c7bf445e0fad84df313db612f4ff8760de
```

**Action required on Hub:** `FEEDBACK_INGEST_KEY` above must be set in the Hub's
server env before F.3 goes live. Without it, PATT's Hub POSTs will receive 401 and
`hub_feedback_id` will remain NULL (local records still save — no data loss).

---

## Graceful Degradation

The Hub call is fire-and-forget. PATT's local record is always saved first.
If the Hub is unreachable, returns an error, or the ingest key is misconfigured:

- Local record saved with `hub_feedback_id = NULL`
- Warning logged: `"Hub feedback ingest failed (local record still saved): ..."`
- User sees no error — the form submission still succeeds

There is no retry mechanism in F.2. A future phase can sweep local records where
`hub_feedback_id IS NULL` and re-submit them.

---

## program_name

PATT sets `program_name = "patt-guild-portal"` at app startup via `config_cache`:

```python
# guild_portal/app.py lifespan startup
set_program_name("patt-guild-portal")
```

`submit_feedback()` reads this from the cache automatically. The program name
is what the Hub uses to group and filter feedback by source app in F.4.

---

## What F.2 Does NOT Do

- No feedback button or form — that is Phase F.3
- No API route in guild_portal — that is Phase F.3
- No retry for failed Hub syncs — future phase
- No admin view of local `feedback_submissions` — future phase

---

## Phase F.3 Preview

F.3 (next in PullAllTheThings-site) will add:

- A floating feedback button on every PATT page (public and admin)
- A modal form: score (1–10 slider), free-text field, optional contact, anonymous toggle
- `POST /api/v1/feedback` route in guild_portal that calls `submit_feedback()`
- Contact pre-filled for logged-in users; anonymous default for guests
