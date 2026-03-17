# sv-tools Ideas API — Reference for shadowedvaca-site

## Overview

Ideas are stored in sv-tools (SQLite on `138.201.189.106`). The shadowedvaca.com board
fetches from sv-tools via two unauthenticated public endpoints. No API key is required
for these calls — sv-site proxies via `https://sv-tools.shadowedvaca.com`.

---

## Base URL

sv-tools runs on its own dedicated server (`138.201.189.106`):

```
https://sv-tools.shadowedvaca.com/api/v1
```

---

## Public Endpoints

### List public ideas

```
GET /ideas/public
```

Returns all ideas where `public = true`, ordered by `updated_at DESC`.

**Query params (all optional):**
| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status: `spark`, `exploring`, `researching`, `committed`, `shelved` |
| `limit` | int | Max results (default 50, max 200) |

**Response:**
```json
{
  "ideas": [
    {
      "id": 11,
      "title": "Project Starship",
      "slug": "project-starship",
      "elevator_pitch": "A Vampire Survivors-style roguelike where you recruit street musicians...",
      "status": "exploring",
      "public": true,
      "tags": ["roguelike", "music-as-gameplay", "procedural-audio"],
      "project": null,
      "created_at": "2026-03-16 23:43:18",
      "updated_at": "2026-03-16 23:43:19",
      "document_count": 2
    }
  ],
  "total": 20
}
```

---

### Get a single public idea (with documents and aspects)

```
GET /ideas/public/{idea_id}
```

Returns the full idea record including all attached documents and structured aspects.
Returns 404 if the idea does not exist or is not public.

**Response:**
```json
{
  "idea": {
    "id": 11,
    "title": "Project Starship",
    "slug": "project-starship",
    "elevator_pitch": "...",
    "status": "exploring",
    "public": true,
    "tags": ["roguelike", "music-as-gameplay"],
    "project": null,
    "created_at": "2026-03-16 23:43:18",
    "updated_at": "2026-03-16 23:43:19",
    "document_count": 2
  },
  "documents": [
    {
      "id": 1,
      "title": "Project Starship Pitch",
      "content": "# Project Starship\n\n...",
      "created_at": "2026-03-16 23:43:18"
    }
  ],
  "aspects": [
    {
      "id": 1,
      "aspect_type": "audience",
      "title": "Target Audience",
      "content": { "summary": "Roguelike fans who also enjoy music games" },
      "created_at": "2026-03-16 23:43:20",
      "updated_at": "2026-03-16 23:43:20"
    }
  ]
}
```

---

## Data Model

### Idea statuses

| Value | Meaning |
|-------|---------|
| `spark` | Early idea, barely fleshed out |
| `exploring` | Actively thinking about it |
| `researching` | Serious investigation underway |
| `committed` | Decided to build it |
| `shelved` | Not dead, not active |

### Aspect types (convention-driven, not schema-enforced)

Common types in use: `audience`, `marketing`, `budget`, `timeline`, `risks`, `assumptions`.
New types can be added freely by the AI tools in sv-tools.

---

## Authenticated Endpoints (not for sv-site)

All other `/ideas/*` endpoints require `X-API-Key` header and are used exclusively
by the sv-tools chat interface and migration scripts. sv-site should never call these.

---

## Making Ideas Public

Ideas are set to `public: true` via the sv-tools chat interface:

```
update_idea(id=11, public=true)
```

Or in bulk via the `run_migration.py` script (`"public": true` in `proposed-mapping.json`).
Only public ideas are returned by the two endpoints above.

---

## Current State (as of 2026-03-16)

- **26 ideas** in the store
- **20 are public** (returned by `/ideas/public`)
- **60 documents** attached across all ideas
- Ideas were migrated from `I:\My Drive\future-ideas` using `scripts/migration/` in sv-tools
