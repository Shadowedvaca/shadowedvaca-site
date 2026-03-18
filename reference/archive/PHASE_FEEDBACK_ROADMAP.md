# Customer Feedback System — Full Roadmap

> **Branch:** `phase-feedback` (create fresh from `main` in each repo)
> **Status:** Planned

---

## Design Philosophy

**The Hub is the AI processor and analytics store. It never sees PII.**

Client apps (PATT, podcast tool, etc.) collect feedback locally, generate a
one-way privacy token from contact info, and POST a de-identified payload here.
The Hub enriches it with Claude AI and stores it. The Hub display module reads
its own local DB — no cross-app proxying.

---

## Architecture

```
Client app (PATT, podcast, etc.)
  │
  ├─ Stores raw record locally (contact_info stays there)
  ├─ Generates privacy_token = sha256(APP_SALT + normalize(contact_info))
  ├─ POSTs to Hub: { program_name, score, raw_feedback,
  │                  is_authenticated_user, is_anonymous, privacy_token }
  └─ Stores hub_feedback_id returned by Hub

Hub (this repo)
  ├─ POST /api/feedback/ingest  → stores, runs AI, returns hub_feedback_id
  ├─ GET  /api/hub/feedback     → admin-only read endpoint
  └─ /hub/feedback/             → display page (reads own DB)
```

---

## Privacy Token

```python
sha256(APP_SALT + normalize(contact_info))  # one-way; Hub cannot reverse
```

- NULL when `is_anonymous=True` or no contact provided
- Per-app salt means same person on PATT vs podcast = different tokens (no cross-app correlation)
- Hub can detect repeat feedback from same person; cannot identify them

---

## Hub Database Schema

Stored in the Hub's PostgreSQL database (`shadowedvaca` schema):

```sql
CREATE TABLE shadowedvaca.customer_feedback (
    id                    SERIAL PRIMARY KEY,
    program_name          VARCHAR(80)  NOT NULL,
    received_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_authenticated_user BOOLEAN      NOT NULL DEFAULT FALSE,
    is_anonymous          BOOLEAN      NOT NULL DEFAULT FALSE,
    privacy_token         VARCHAR(64),
    score                 INTEGER      CHECK (score BETWEEN 1 AND 10),
    raw_feedback          TEXT         NOT NULL,
    summary               TEXT,
    sentiment             VARCHAR(20),
    tags                  JSONB,
    processed_at          TIMESTAMPTZ,
    processing_error      TEXT
);
```

**No `contact_info` column. Ever.**

---

## Phase Table

| Phase | Repo | Description |
|-------|------|-------------|
| F.1 | **this repo** | Hub ingest endpoint + DB + AI processing |
| F.2 | PullAllTheThings-site | `sv_common.feedback` client package + PATT local DB |
| F.3 | PullAllTheThings-site | PATT feedback button + form + submission API |
| F.4 | **this repo** | Hub display module — card grid + filters + tool card |

F.1 must be deployed before F.2 can be tested end-to-end. F.4 can be built once
F.1 is deployed (data to display) regardless of F.3 status.

---

## Sub-Phase Documents

| Phase | File | Repo |
|-------|------|------|
| F.1 | `reference/PHASE_F1_HUB_INGEST.md` | this repo |
| F.2 | (in PullAllTheThings-site) `reference/PHASE_F2_CLIENT_PACKAGE.md` | PATT |
| F.3 | (in PullAllTheThings-site) `reference/PHASE_F3_PATT_FORM.md` | PATT |
| F.4 | `reference/PHASE_F4_HUB_DISPLAY.md` | this repo |

---

## Environment Variables (this repo)

```bash
FEEDBACK_INGEST_KEY=<32+ byte random string>
ANTHROPIC_API_KEY=<your Anthropic API key>
```

---

## Acceptance Criteria (Hub side)

- [ ] `POST /api/feedback/ingest` validates ingest key, stores record, runs AI, returns `hub_feedback_id`
- [ ] No `contact_info` anywhere in Hub DB or code
- [ ] AI processing populates summary, sentiment, tags; degrades gracefully if key absent
- [ ] `customer_feedback` tool card is admin-only in Hub dashboard
- [ ] `/hub/feedback/` shows card grid, newest first
- [ ] Filters: program, sentiment, tag, score range
- [ ] Cards show all stored fields; raw feedback collapsed by default
- [ ] privacy_token displayed as a truncated hash (never try to reverse it)
