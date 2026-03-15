# Shadowedvaca Ideation Board — Full Plan

**Date:** March 11, 2026
**Project:** sv-tools (surface on shadowedvaca.com)
**Status:** iB1 ✅ complete · iB-Auth ✅ complete · iB3 🔲 next

---

## The Problem

Ideas live in ~70 markdown files in Google Drive, GitHub projects, and the task DB — none of it is shareable in a way that works for how Tolu and Cheri process information. Tolu doesn't read long docs. There's no single view. Nothing is structured for a pitch conversation. When Mike wants to swarm on an idea with his trusted circle, there's no clean way to do it.

---

## The Solution: Shadowedvaca Ideation Board

A lightweight idea board on shadowedvaca.com. No published link = effectively private but shareable. No auth, no logins — just a URL handed to Tolu and Cheri when needed.

### Core Features (MVP)
- **Cards:** Idea name + elevator pitch up front, drill-in for full context
- **Public/Private flag:** Controls what's visible; sets up future public feed on shadowedvaca.com
- **Data source:** Dedicated idea store (separate from task DB — see below)
- **Sort:** Default = newest/most recently modified first; alternate = by idea name
- **Filter:** Status grouping via dropdown (spark → exploring → researching → committed → shelved)
- **Search:** Full-text search across all attached MDs, not just the pitches
- **Semantic retrieval:** All MDs and pitches indexed into the semantic retrieval system — searchable from PMA sessions

### Deferred (Not MVP)
- Comments/reactions from Tolu and Cheri (they text for now)
- Roadmap/scheduling
- Video integration
- Public feed on shadowedvaca.com (flag exists in v1, surface comes later)

---

## Data Model

### Why a Dedicated Idea Store (Not the Task DB)

The task DB idea type got us here, but ideas have a richer shape:
- 1-to-many attached documents per idea
- Public/private display flags
- Status lifecycle that's different from task status
- Display-oriented fields (elevator pitch, tags for the board)

Forcing this into the generic task schema creates friction. A dedicated ideas store keeps it clean and purpose-built. The task DB remains for tasks, waiting items, and project management.

### Idea Record (structured fields)
```
- id
- title
- slug
- elevator_pitch         (short, 2-4 sentences — the card face)
- status                 (spark | exploring | researching | committed | shelved)
- public                 (boolean)
- created_at
- updated_at             (drives default sort; shown as badge in UI when recently changed)
- tags                   (array)
- project                (optional — links to a project once it graduates to active work)
```

### Attached Documents (flexible, many per idea)
```
- id
- idea_id               (foreign key → idea record)
- title                 (e.g. "Initial Brainstorm - Mar 11 2026")
- content               (full markdown)
- created_at
```

### Key Design Decisions
- The **idea record** holds structured display fields (pitch, status, tags) — tight and queryable
- The **attached MDs** hold everything else — brainstorm sessions, deep dives, half-baked notes, research — messy, rich, historical
- Multiple sessions on the same idea just attach another MD — no overwriting, full history
- `updated_at` on the idea record bumps whenever a new MD is attached or fields change — surfaces as a UI badge ("Updated") so Tolu and Cheri know Mike's been thinking about it again
- **All idea records and attached MDs are fed into the semantic retrieval system** — searchable from PMA sessions, not just the board UI

---

## Ideation Session Workflow (New Process)

When a brainstorm session produces something worth keeping:
1. Session ends with an exported MD (as we do now)
2. Instead of floating free, that MD gets **attached to a specific idea record**
3. If the idea doesn't exist yet → create it with title + elevator pitch
4. If it already exists → attach the new MD, bump `updated_at`

Going back 3-4 times to refine an idea just accumulates attached MDs on one record — clean history, no overwriting, full context always available.

---

## Mode, Lens, and Tool Architecture

### Ideation Mode

A new top-level mode in sv-tools dedicated to the full idea lifecycle — from first spark to project graduation. Replaces the current scattered approach (Drive MDs + task DB ideas + GitHub).

**Mode responsibility:** Managing the idea store, ideation sessions, idea presentation, and the pipeline from idea → project.

---

### Lenses within Ideation Mode

#### Brainstorm Lens (existing, scoped)
Currently the Brainstorm Lens is large and handles both project-level ideation and general idea capture. Going forward:

- **Single responsibility:** Ideating *about an existing project or topic* — exploring options, working through problems, thinking out loud
- Outputs an exported MD at the end of the session
- That MD can be attached to an idea record if the session produces one worth keeping
- No longer responsible for idea capture or management — that goes to the Idea Capture Lens

#### Idea Capture Lens (new)
Handles bringing a new idea into the system cleanly.

**Workflow:**
1. User presents an idea (rough or polished)
2. Lens helps craft the elevator pitch (2-4 sentences, Tolu-readable)
3. Lens captures: title, pitch, tags, status, public flag
4. Session exported as first attached MD
5. Idea record created in the dedicated store
6. Everything indexed into semantic retrieval

#### Idea Review Lens (future)
For returning to an existing idea to refine, add context, update status, or prep for a conversation with Tolu/Cheri.

- Loads existing idea record + attached MDs
- Allows pitch refinement
- Attaches new session MD
- Bumps `updated_at`

#### Pipeline Lens (future)
For managing the idea → project graduation process.

- Status transitions (spark → exploring → committed)
- Linking an idea to a new project record
- Archiving shelved ideas cleanly

---

### Tools Needed

#### Phase 1 (MVP — build now)
- `create_idea` — Create a new idea record with structured fields + first attached MD
- `attach_idea_doc` — Attach a new MD to an existing idea record, bump `updated_at`
- `list_ideas` — List idea records with filters (status, public/private, sort by modified/name)
- `get_idea` — Get full idea record + all attached MDs
- `update_idea` — Update structured fields (pitch, status, tags, public flag)

#### Phase 2 (post-MVP)
- `search_ideas` — Full-text search across all attached MDs (if not handled by semantic retrieval layer directly)
- `graduate_idea` — Transition an idea to a project, linking records and updating status to committed
- `shelve_idea` — Archive an idea cleanly with a reason note

---

## Migration Plan (~70 MD files)

### Strategy: Wrap and Attach
Don't try to parse and extract structured data from 70 inconsistent MDs. Instead:
1. Each existing MD becomes an **attached document** on an idea record
2. For each idea, manually write (or generate with AI assist) a clean elevator pitch
3. Structured record gets created fresh; the MD chaos lives in attachments where it belongs

### Migration Approach
- Claude Code session to enumerate all Drive MDs and create stub idea records
- Mike + PMA do a curation pass to write elevator pitches (can be done incrementally)
- Migration priority: don't block on doing all 70 — migrate as ideas come up, do a bulk pass when ready
- After migration: Google Drive abandoned as idea store, DB is source of truth

---

## Board UI (shadowedvaca.com)

- Unlisted page — no nav link, shared by URL only
- Cards: title + elevator pitch, "Updated" badge if recently modified
- Drill-in: full pitch + list of attached MDs with dates
- Sort: modified date (default) | idea name
- Filter: status dropdown (spark / exploring / researching / committed / shelved)
- Search: full-text across all attached MDs
- Public/private flag respected — private ideas never rendered
- Estimated build: 1-2 days Claude Code once data model is finalized and migration is done

---

## Open Questions
1. Does the dedicated idea store live in the same database as sv-tools or a separate one?
2. Migration priority — bulk all 70 up front in one Claude Code session, or incremental as ideas surface?
3. Semantic retrieval indexing — does this happen at write time (on `create_idea` / `attach_idea_doc`) or via a scheduled sync?
4. Elevator pitch generation — for the migration pass, do we AI-generate pitches from the existing MDs for Mike to approve, or does Mike write them fresh?

---

## Summary

This is not a big build. The data model is clean. The Brainstorm Lens already exists and just needs scoping. The new tools are straightforward CRUD + search. The board UI is a read layer over structured data. The lift is the migration and writing good elevator pitches — which is actually valuable work regardless of the tooling.

**The real unlock:** Ideas stop being documents and start being records. Everything attaches to them. PMA can find them, reason about them, and help evolve them over time.
