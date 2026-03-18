# Phase F.4 — Hub: Customer Feedback Display Module

> **Repo:** shadowedvaca-site
> **Branch:** `phase-feedback` (continue from Phase F.1, or fresh branch from `main`
> if F.1 was merged)
> **Depends on:** Phase F.1 deployed — `shadowedvaca.customer_feedback` table exists
> and has data (can be built once F.1 is live; does not require F.3)
> **Produces:** `customer_feedback` Hub tool, `/hub/feedback/` page, admin read API

---

## Goal

Give Mike a dashboard in the Hub to review all feedback across all programs:

1. A **`GET /api/hub/feedback`** endpoint that reads from the Hub's own DB
2. A `/hub/feedback/` **page** — card grid with filters (program, sentiment, tag, score)
3. A **tool card** on the Hub dashboard (admin-only)

No proxying. No cross-repo calls. The Hub reads its own `shadowedvaca.customer_feedback`
table directly.

---

## Prerequisites

- Phase F.1 complete and deployed — table exists, ingest endpoint is live
- Some feedback records exist for testing (submit a few via the ingest endpoint or
  via a PATT form if F.3 is also done)
- Familiar with hub page patterns:
  - `hub/index.html` — how tool cards are rendered and gated by `isAdmin`
  - Any existing `hub/*/index.html` — page shell and auth guard pattern
  - `src/sv_site/routes/ideas.py` — route + admin dependency pattern to follow
  - `src/sv_site/tools.py` — tool registry

---

## Key Files to Read Before Starting

- `src/sv_site/tools.py` — tool registry; add `customer_feedback` entry
- `src/sv_site/routes/ideas.py` — admin dependency + route pattern
- `src/sv_site/database.py` — `get_db()` AsyncSession dependency
- `src/sv_site/models.py` — `CustomerFeedback` ORM model (added in F.1)
- `src/sv_site/main.py` — router registration
- `hub/index.html` — how admin tool cards are rendered (locate the admin tools section)
- `hub/settings/index.html` or `hub/users/index.html` — page shell + auth guard JS pattern

---

## Step 1: Tool Registry

**File:** `src/sv_site/tools.py`

Add to the tool registry alongside the existing admin-only tools (`invite`, `users`):

```python
{
    "slug": "customer_feedback",
    "label": "Customer Feedback",
    "description": "Review feedback submitted across all apps.",
    "url": "/hub/feedback/",
    "icon": "💬",
    "status": "admin",    # admin-only; no user_permissions row needed
},
```

---

## Step 2: Admin Read API

**File:** `src/sv_site/routes/feedback_read.py` (new file)

Reads from the Hub's own DB. No proxying. Uses the existing `get_current_user_admin`
dependency (same as `ideas.py` admin routes).

```python
"""
GET /api/hub/feedback
Admin-only endpoint. Returns paginated feedback records from the Hub's local DB.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, desc
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.auth import get_current_user_admin
from sv_site.database import get_db
from sv_site.models import CustomerFeedback

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/hub/feedback", tags=["feedback"])


def _serialize(record: CustomerFeedback) -> dict:
    return {
        "id":                    record.id,
        "program_name":          record.program_name,
        "received_at":           record.received_at.isoformat() if record.received_at else None,
        "is_authenticated_user": record.is_authenticated_user,
        "is_anonymous":          record.is_anonymous,
        "privacy_token":         record.privacy_token[:8] + "…" if record.privacy_token else None,
        # truncated for display — never send full token to browser
        "score":                 record.score,
        "raw_feedback":          record.raw_feedback,
        "summary":               record.summary,
        "sentiment":             record.sentiment,
        "tags":                  record.tags or [],
        "processed_at":          record.processed_at.isoformat() if record.processed_at else None,
        "processing_error":      record.processing_error,
    }


@router.get("")
async def list_feedback(
    program_name: Optional[str] = Query(None),
    sentiment:    Optional[str] = Query(None),
    tag:          Optional[str] = Query(None),
    min_score:    Optional[int] = Query(None, ge=1, le=10),
    max_score:    Optional[int] = Query(None, ge=1, le=10),
    limit:        int           = Query(50, ge=1, le=200),
    offset:       int           = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user_admin),
):
    q = select(CustomerFeedback)

    if program_name:
        q = q.where(CustomerFeedback.program_name == program_name)
    if sentiment:
        q = q.where(CustomerFeedback.sentiment == sentiment)
    if tag:
        q = q.where(CustomerFeedback.tags.contains([tag]))
    if min_score is not None:
        q = q.where(CustomerFeedback.score >= min_score)
    if max_score is not None:
        q = q.where(CustomerFeedback.score <= max_score)

    count_q = select(func.count()).select_from(q.subquery())
    total = (await db.execute(count_q)).scalar_one()

    data_q = q.order_by(desc(CustomerFeedback.received_at)).limit(limit).offset(offset)
    rows = (await db.execute(data_q)).scalars().all()

    return {
        "ok": True,
        "data": {
            "feedback": [_serialize(r) for r in rows],
            "total": total,
        },
    }


@router.get("/programs")
async def list_programs(
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user_admin),
):
    """Distinct program names — used to populate the filter dropdown."""
    q = select(CustomerFeedback.program_name).distinct()
    rows = (await db.execute(q)).scalars().all()
    return {"ok": True, "data": {"programs": sorted(rows)}}
```

**Register in `src/sv_site/main.py`:**
```python
from sv_site.routes.feedback_read import router as feedback_read_router
app.include_router(feedback_read_router)
```

**Note on `privacy_token` in API response:** The token is truncated to 8 chars + `…`
for display. This lets Mike see that two cards share the same submitter (matching
prefixes) without exposing the full hash. The full hash is never sent to the browser.

---

## Step 3: Hub Dashboard Tool Card

**File:** `hub/index.html`

Locate the section that renders admin-only tool cards (where `invite` and `users`
cards are rendered). Add a card for `customer_feedback` using the exact same
card markup pattern.

The card should display:
- Icon: 💬
- Label: "Customer Feedback"
- Description: "Review feedback submitted across all apps."
- Link: `/hub/feedback/`

Follow the exact structure of existing admin tool cards.

---

## Step 4: Hub Feedback Page

**File:** `hub/feedback/index.html`

Read the existing hub page shell from another hub page first (e.g. `hub/users/index.html`)
and match that structure exactly for the header, nav, and auth guard pattern.

### Page Layout

```
header (hub nav — same as all hub pages)
main.feedback-main
  ├── .fb-header
  │     ├── h1 "Customer Feedback"
  │     └── .fb-meta  — "N total responses"
  │
  ├── .fb-filters
  │     ├── <select id="f-program">  All Programs / each program
  │     ├── <select id="f-sentiment"> All / Positive / Neutral / Negative / Mixed
  │     ├── <select id="f-tag">  All Tags / <each tag in vocabulary>
  │     ├── <input type="number" id="f-min-score" placeholder="Min" min="1" max="10">
  │     ├── <input type="number" id="f-max-score" placeholder="Max" min="1" max="10">
  │     └── <button id="btn-apply">Apply</button>
  │
  ├── #fb-loading   (spinner, visible while fetching)
  ├── #fb-error     (error state, hidden by default)
  ├── #fb-empty     (empty state, hidden by default)
  └── #fb-grid      (card grid, hidden until loaded)
```

### Card HTML (generated by JavaScript `renderCard(item)`)

```html
<div class="fb-card">

  <!-- Header row: program badge, score, sentiment, date -->
  <div class="fb-card-header">
    <span class="fb-program">{{ program_name }}</span>
    <span class="fb-score fb-score--N">{{ score }}/10</span>
    <span class="fb-sentiment fb-sentiment--{{ sentiment }}">{{ sentiment }}</span>
    <span class="fb-date" title="{{ received_at ISO }}">{{ relative time }}</span>
  </div>

  <!-- Tags -->
  <div class="fb-tags">
    <span class="fb-tag">{{ tag }}</span>  <!-- one per tag -->
  </div>

  <!-- AI summary (always visible) -->
  <p class="fb-summary">{{ summary || "(AI processing pending)" }}</p>

  <!-- Raw feedback (collapsed) -->
  <details class="fb-raw">
    <summary>Raw feedback</summary>
    <blockquote>{{ raw_feedback }}</blockquote>
  </details>

  <!-- Footer: user context + token -->
  <div class="fb-card-footer">
    {% if is_authenticated_user %}
      <span class="fb-badge fb-badge--user" title="Submitted by a registered user">
        registered user
      </span>
    {% else %}
      <span class="fb-badge fb-badge--anon">visitor</span>
    {% endif %}

    {% if privacy_token %}
      <span class="fb-token" title="Anonymized submitter token (truncated)">
        {{ privacy_token }}  <!-- already truncated by API -->
      </span>
    {% endif %}
  </div>

</div>
```

### Score Color Classes

Apply a CSS class based on score value in `renderCard()`:
- `fb-score--low` (1–3): red (`#f87171`)
- `fb-score--mid` (4–6): amber (`#fbbf24`)
- `fb-score--high` (7–8): lime (`#a3e635`)
- `fb-score--top` (9–10): green (`#4ade80`)

### Sentiment Badge Colors

```css
.fb-sentiment--positive { color: #4ade80; border-color: rgba(74,222,128,0.3); background: rgba(74,222,128,0.1); }
.fb-sentiment--negative { color: #f87171; border-color: rgba(248,113,113,0.3); background: rgba(248,113,113,0.1); }
.fb-sentiment--neutral  { color: #9ca3af; border-color: rgba(156,163,175,0.3); background: rgba(156,163,175,0.1); }
.fb-sentiment--mixed    { color: #fbbf24; border-color: rgba(251,191,36,0.3);  background: rgba(251,191,36,0.1);  }
```

Apply these as inline badge spans with `padding: 0.15rem 0.45rem; border-radius: 3px; font-size: 0.75rem; border: 1px solid; text-transform: capitalize;`.

### Tag Filter Vocabulary (hardcoded in HTML)

```html
<option value="">All Tags</option>
<option value="new feature request">new feature request</option>
<option value="bug report">bug report</option>
<option value="praise">praise</option>
<option value="improvement suggestion">improvement suggestion</option>
<option value="missing content">missing content</option>
<option value="performance issue">performance issue</option>
<option value="ui/ux">ui/ux</option>
<option value="documentation">documentation</option>
<option value="confusing/unclear">confusing/unclear</option>
<option value="other">other</option>
```

### JavaScript Structure

```javascript
// Auth guard — same pattern as other hub pages
(async () => {
    const token = localStorage.getItem("sv_site_jwt");
    if (!token) { window.location.href = "/login"; return; }
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (!payload.isAdmin) { window.location.href = "/hub"; return; }

    await loadPrograms();   // populate program filter dropdown
    await loadFeedback({});
})();

async function loadPrograms() {
    const resp = await fetch("/api/hub/feedback/programs", {
        headers: { Authorization: `Bearer ${localStorage.getItem("sv_site_jwt")}` },
    });
    if (!resp.ok) return;
    const data = await resp.json();
    const sel = document.getElementById("f-program");
    data.data.programs.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p; opt.textContent = p;
        sel.appendChild(opt);
    });
}

async function loadFeedback(filters) {
    show("fb-loading"); hide("fb-grid"); hide("fb-error"); hide("fb-empty");

    const params = new URLSearchParams();
    if (filters.program)  params.set("program_name", filters.program);
    if (filters.sentiment) params.set("sentiment", filters.sentiment);
    if (filters.tag)      params.set("tag", filters.tag);
    if (filters.minScore) params.set("min_score", filters.minScore);
    if (filters.maxScore) params.set("max_score", filters.maxScore);

    try {
        const resp = await fetch(`/api/hub/feedback?${params}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("sv_site_jwt")}` },
        });
        if (!resp.ok) throw new Error(resp.statusText);
        const data = await resp.json();

        hide("fb-loading");
        document.querySelector(".fb-meta").textContent =
            `${data.data.total} total response${data.data.total !== 1 ? "s" : ""}`;

        if (data.data.feedback.length === 0) { show("fb-empty"); return; }

        const grid = document.getElementById("fb-grid");
        grid.innerHTML = "";
        data.data.feedback.forEach(item => grid.appendChild(renderCard(item)));
        show("fb-grid");

    } catch (err) {
        hide("fb-loading");
        document.getElementById("fb-error").textContent =
            `Failed to load feedback: ${err.message}`;
        show("fb-error");
    }
}

document.getElementById("btn-apply").addEventListener("click", () => {
    loadFeedback({
        program:   document.getElementById("f-program").value   || null,
        sentiment: document.getElementById("f-sentiment").value || null,
        tag:       document.getElementById("f-tag").value       || null,
        minScore:  document.getElementById("f-min-score").value || null,
        maxScore:  document.getElementById("f-max-score").value || null,
    });
});

function renderCard(item) { /* build and return a DOM element using the card structure above */ }
function relativeTime(iso) { /* "3 hours ago", "2 days ago", etc. — no library needed */ }
function scoreClass(n) {
    if (n <= 3) return "fb-score--low";
    if (n <= 6) return "fb-score--mid";
    if (n <= 8) return "fb-score--high";
    return "fb-score--top";
}
function show(id) { document.getElementById(id).style.display = ""; }
function hide(id) { document.getElementById(id).style.display = "none"; }
```

---

## Tests

### `test_feedback_read_requires_admin`
- Request with non-admin JWT → 403
- Request with no JWT → 401

### `test_feedback_read_returns_records`
- Seed two `CustomerFeedback` rows in test DB
- GET `/api/hub/feedback` → 200, `data.total == 2`
- Assert records sorted newest first

### `test_feedback_read_program_filter`
- Seed records for two programs
- GET `?program_name=patt-guild-portal` → only PATT records returned

### `test_feedback_read_sentiment_filter`
- GET `?sentiment=positive` → only positive records returned

### `test_feedback_read_tag_filter`
- Seed record with `tags=["praise", "ui/ux"]`
- GET `?tag=praise` → record included
- GET `?tag=bug+report` → record excluded

### `test_feedback_read_score_filter`
- GET `?min_score=8` → only records with score >= 8

### `test_privacy_token_truncated_in_response`
- Seed record with `privacy_token="abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"`
- GET response: `privacy_token` field is `"abcdef12…"`, not the full hash

### `test_programs_endpoint_returns_distinct`
- Seed records for "patt-guild-portal" (×3) and "salt-podcast" (×1)
- GET `/api/hub/feedback/programs` → `["patt-guild-portal", "salt-podcast"]`

---

## Deliverables Checklist

- [ ] `src/sv_site/tools.py` — `customer_feedback` admin tool entry added
- [ ] `src/sv_site/routes/feedback_read.py` — `GET /api/hub/feedback` + `GET /api/hub/feedback/programs`
- [ ] `src/sv_site/main.py` — `feedback_read_router` registered
- [ ] `hub/feedback/index.html` — full page (card grid, filters, auth guard, JS)
- [ ] `hub/index.html` — Customer Feedback admin tool card added
- [ ] Tests pass
- [ ] Manual check: Hub dashboard shows the Feedback card (admin login)
- [ ] Manual check: `/hub/feedback/` loads, filters work, cards render correctly
- [ ] Manual check: cards from both PATT and any other app show in the same grid

---

## What This Phase Does NOT Do

- No analytics charts or aggregations (future — the data is there when ready)
- No deletion or editing of feedback records (read-only for now)
- No pagination UI — loads up to 50 newest by default (add load-more later)
- No email or Discord notifications on new feedback (future)
