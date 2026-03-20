Idea Artifacts — API for other projects

  Here's how the artifact system works, in enough detail to implement it elsewhere:

  Data Model (idea_artifacts table)

  id            INTEGER PRIMARY KEY AUTOINCREMENT
  idea_id       INTEGER NOT NULL  -- FK → ideas.id (CASCADE DELETE)
  title         TEXT NOT NULL     -- e.g. "Order Process Flow — Mar 2026"
  artifact_type TEXT NOT NULL     -- see enum below
  content       TEXT NOT NULL     -- full artifact content
  format        TEXT NOT NULL     -- see enum below
  created_at    TEXT NOT NULL

  artifact_type enum: use_cases | process_flow | data_flow | architecture | wireframe | network_diagram

  format enum: markdown | mermaid | html

  Service API (IdeaService)

  - attach_artifact(idea_id, title, artifact_type, content, format) → IdeaArtifact — creates a record, bumps idea.updated_at
  - list_artifacts(idea_id) → list[IdeaArtifact] — returns all artifacts for an idea, newest first
  - get_idea() now includes an artifacts section showing artifact titles, types, and format (not full content)

  AI Tool (attach_idea_artifact)

  The tool requires confirmation before calling — the description explicitly says "Always ask the user before storing." After confirmation it calls
  attach_artifact() and returns a summary.

  Distinction from idea_documents

  - Artifacts = structured deliverables with a known type/format (process diagrams, wireframes, use case tables). One idea can have many artifacts over time — each 
  call creates a new record, nothing is overwritten.
  - Documents (attach_idea_doc) = narrative markdown notes, brainstorm sessions, meeting notes. Same append-only pattern.