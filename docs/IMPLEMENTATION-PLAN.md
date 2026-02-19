# Shadowedvaca.com Command Center — Implementation Plan

## Overview

Rebuild the existing shadowedvaca-site repo from a static GitHub Pages site into a split-screen "command center" dashboard hosted on Hetzner. The main stage (left 2/3) shows project detail views, the terminal sidebar (right 1/3) is a retro CRT project index. All content is data-driven via JSON.

**Reference mockup: `reference/mockup-v3.html`** — Open it in a browser. This is the design source of truth.

---

## Architecture

```
shadowedvaca-site/
├── packages/
│   ├── core/                             ← Shared data layer
│   │   ├── schemas/                      ← Pydantic models (project, announcement, profile)
│   │   ├── data.py                       ← Data access functions
│   │   └── __init__.py
│   └── site/                             ← Command center renderer
│       ├── templates/                    ← Jinja2 templates
│       │   ├── base.html
│       │   ├── index.html
│       │   └── components/               ← ticker, main_stage, terminal, sticky_note, bottom_bar
│       ├── static/                       ← CSS and JS
│       └── build.py                      ← Build script
├── data/                                 ← JSON data files
│   ├── projects.json
│   ├── announcements.json
│   └── profile.json
├── dist/                                 ← Build output (served by Nginx)
├── reference/
│   └── mockup-v3.html                    ← Design reference
├── # --- Existing files (stay at root, untouched) ---
├── meandering-muck.html
├── meandering-muck-support.html
├── meandering-muck-privacy.html
├── assets/meandering-muck/
├── deploy.sh
├── requirements.txt
├── .gitignore
└── CLAUDE.md
```

---

## Phase 1: Project Scaffolding & Data Layer

**Goal:** Set up the project structure, Pydantic schemas, JSON data files, and build script skeleton.

### Tasks

1. **Create `.gitignore`**
   ```
   dist/
   __pycache__/
   *.pyc
   .venv/
   *.egg-info/
   ```

2. **Create `requirements.txt`**
   ```
   pydantic>=2.0
   jinja2>=3.1
   ```

3. **Create directory structure**
   - `packages/core/`, `packages/core/schemas/`, `packages/site/`, `packages/site/templates/`, `packages/site/templates/components/`, `packages/site/static/css/`, `packages/site/static/js/`, `data/`, `dist/`, `reference/`

4. **Create Pydantic schemas** in `packages/core/schemas/`
   - `project.py` — Project model with all fields documented in CLAUDE.md (id, name, tagline, description, status, category, section, terminal_desc, meta_tags, links, features, media, sort_order, featured)
   - `announcement.py` — Announcement model (id, text, dot_style, active, sort_order)
   - `profile.py` — Profile model (name, company, location, email, tagline, bottom_bar_tagline)
   - `__init__.py` — Re-export all models

5. **Create data access layer** `packages/core/data.py`
   - Functions to load and validate each JSON file against its Pydantic schema
   - Handle file paths relative to project root

6. **Create JSON data files** in `data/`
   - `projects.json` — All 7 projects (Meandering Muck, Pull All The Things, Salt All The Things, sv-tools, Show Planner, Raid Team Manager, Meandering Muck itch.io) with full detail view content matching the mockup
   - `announcements.json` — Ticker items (MM launch, Salt podcast, PATT live)
   - `profile.json` — Mike's contact info and taglines

7. **Copy reference mockup** — Place the mockup HTML into `reference/mockup-v3.html`

8. **Create skeleton `build.py`** in `packages/site/`
   - Loads data via core
   - Placeholder for template rendering
   - Copies existing MM files from root to `dist/` preserving paths
   - Copies static assets to `dist/`

### Checkpoint
- All schemas validate against the JSON data files
- `python -m packages.site.build` runs without error and copies MM files to `dist/`
- Commit and summarize what was built

---

## Phase 2: Templates & CSS — The Command Center

**Goal:** Build the Jinja2 templates and CSS to produce the split-screen command center matching the reference mockup.

### Tasks

1. **Create `base.html` template**
   - Full HTML shell: doctype, head (meta, Google Fonts, CSS link), body
   - The viewport-filling layout structure: `.layout` > `.ticker-bar` + `.content-split` + `.bottom-bar`

2. **Create component templates**
   - `ticker.html` — Loop over announcements, render ticker items with dot indicators, duplicate for seamless scroll
   - `main_stage.html` — Loop over projects, render each as a `.stage-view` div. Conditionally include: video embed, screenshot placeholder, action buttons, description paragraphs, feature list. Mark the featured project as `.active`
   - `terminal.html` — Group projects by section (active/upcoming/systems/archive). Render each with status character, name, description. Add `data-target` attribute linking to stage view ID. Mark featured project as `.selected`
   - `sticky_note.html` — Render profile data in sticky note format
   - `bottom_bar.html` — Copyright and tagline

3. **Create `index.html` template**
   - Composes all components into the page layout
   - Includes JS files at bottom

4. **Create `command-center.css`**
   - **Match the reference mockup exactly.** Copy the styles from `reference/mockup-v3.html` as the starting point, then adapt for Jinja2 template structure.
   - All CSS custom properties for colors
   - Responsive breakpoints at 900px and 500px
   - CRT scanline overlay, terminal glow, blinking cursor
   - Sticky note styles with Caveat font

5. **Create `navigation.js`**
   - Terminal project click handler: swap `.active` stage view, update `.selected` terminal project, scroll to top

6. **Create `sticky.js`**
   - Random horizontal position (center ±120px, clamped to bounds)
   - Random slight rotation (-3° to +1°)
   - Recalculate on window resize

7. **Update `build.py`**
   - Render `index.html` template with all data
   - Write generated HTML to `dist/index.html`
   - Copy CSS and JS to `dist/css/` and `dist/js/`
   - Copy MM files and assets to `dist/`

### Checkpoint
- `python -m packages.site.build` produces `dist/index.html` that looks like the reference mockup
- Terminal navigation works (click projects, main stage swaps)
- Sticky note appears in random position on refresh
- Ticker scrolls and pauses on hover
- Responsive: stacks on mobile, side-by-side on desktop
- Commit and summarize

---

## Phase 3: Deploy to Hetzner

**Goal:** Get the site live at shadowedvaca.com on the Hetzner server.

### Server Details
- **Provider:** Hetzner Cloud
- **Plan:** CPX11
- **IP:** 5.78.114.224
- **DNS:** Managed at Bluehost (A records already pointed to Hetzner IP)

### Tasks

1. **Create `deploy.sh`**
   - Run the build script
   - rsync `dist/` to the server at `/var/www/shadowedvaca.com/`

2. **Create Nginx config** (`deploy/nginx/shadowedvaca.com`)
   - Server block for shadowedvaca.com and www.shadowedvaca.com
   - Root: `/var/www/shadowedvaca.com`
   - Standard static file serving with caching headers
   - Sites-available/sites-enabled pattern for future multi-site support

3. **Server setup commands** (document these, Mike will run them or paste them into SSH)
   - Install Nginx
   - Create `/var/www/shadowedvaca.com/`
   - Symlink sites-available → sites-enabled
   - Install Certbot, obtain SSL cert
   - HTTP → HTTPS redirect

4. **Verify**
   - https://shadowedvaca.com loads the command center
   - https://shadowedvaca.com/meandering-muck.html loads the press kit
   - SSL works, HTTP redirects to HTTPS

### Checkpoint
- Site is live at shadowedvaca.com
- All existing MM pages still work at their current URLs
- Commit deploy scripts

---

## Phase 4: Polish & Content

**Goal:** Refine details, add any missing content, fix issues found during review.

### Tasks

1. **Browser testing** — Chrome, Firefox, Safari, mobile
2. **Performance check** — Page load time, font loading, no layout shift
3. **Link verification** — All action buttons, external links, MM page links work
4. **Meta tags** — Add Open Graph and basic SEO meta tags to the generated index.html
5. **Favicon** — Add a favicon if one exists or create a simple one
6. **404 page** — Simple styled 404 matching the dark theme

### Checkpoint
- All issues from testing resolved
- Commit final polish

---

## Phase 5: Future — Demo Pages (Not part of initial build)

These are planned but not built in this pass:

- **Show Planner demo page** — Interactive demo showcasing the podcast planning tool
- **Raid Team Manager demo page** — Interactive demo showcasing the roster management system
- **App store links** — Replace "Coming Soon" buttons with real App Store / Google Play links when Meandering Muck launches
- **Salt All The Things** — Update status and links when podcast launches 3/3/2026
- **sv-tools integration** — Eventually connect to sv-tools via MCP for live data updates

---

## Working Agreements

- **Claude Code handles implementation.** Mike reviews at each checkpoint.
- **Commit at each phase boundary.** Don't continue to next phase without Mike's review.
- **The reference mockup is the design bible.** When in doubt, match the mockup.
- **No file moves.** Existing files stay at root. Build script copies them to `dist/`.
- **Windows compatible.** Mike develops on Windows. All scripts use Python, not bash.
