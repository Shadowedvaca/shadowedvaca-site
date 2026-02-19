# Shadowedvaca.com Command Center — Implementation Plan

## Overview

Restructure the existing shadowedvaca-site repo from a static GitHub Pages site into a dark-themed "command center" dashboard hosted on Hetzner. The site is a living portfolio and launchpad for all of Mike's projects, designed to be data-driven (JSON → static HTML) so it can be easily updated and eventually integrated with sv-tools/MCP.

**Target: Live this week (by ~Friday Feb 21, 2026)**

---

## Architecture

```
shadowedvaca-site/                        ← Existing repo, new build layer added on top
├── packages/
│   ├── core/                             ← @sv/core - shared data layer
│   │   ├── schemas/                      ← Pydantic models
│   │   │   ├── project.py
│   │   │   ├── announcement.py
│   │   │   ├── profile.py
│   │   │   └── link.py
│   │   ├── data.py                       ← Data access functions
│   │   └── __init__.py
│   └── site/                             ← @sv/site - the command center renderer
│       ├── templates/
│       │   ├── base.html
│       │   ├── index.html
│       │   └── components/
│       │       ├── ticker.html
│       │       ├── hero.html
│       │       ├── panel.html
│       │       ├── profile.html
│       │       └── workbench.html
│       ├── static/
│       │   ├── css/
│       │   │   └── command-center.css
│       │   ├── js/
│       │   │   └── ticker.js
│       │   └── assets/
│       └── build.py
├── data/                                 ← JSON data files (single source of truth)
│   ├── projects.json
│   ├── announcements.json
│   ├── profile.json
│   └── links.json
├── dist/                                 ← Build output (static HTML/CSS/JS, served by Nginx)
│   ├── index.html                        ← Generated command center
│   ├── css/ js/ assets/                  ← Generated from packages/site/static/
│   ├── meandering-muck.html              ← Copied from root (unchanged)
│   ├── meandering-muck-support.html      ← Copied from root (unchanged)
│   ├── meandering-muck-privacy.html      ← Copied from root (unchanged)
│   └── assets/meandering-muck/           ← Copied from root (unchanged)
├── # --- Existing files (stay at root, untouched) ---
├── meandering-muck.html                  ← Press kit (source, copied to dist/)
├── meandering-muck-support.html          ← Support form (source, copied to dist/)
├── meandering-muck-privacy.html          ← Privacy policy (source, copied to dist/)
├── support-form-google-web-app.js        ← Google Apps Script ref (not served)
├── assets/meandering-muck/               ← MM images/press zip (source, copied to dist/)
├── index.html                            ← OLD homepage (superseded by dist/, not served)
├── style.css                             ← OLD styles (superseded by dist/, not served)
├── CNAME                                 ← OLD GitHub Pages config (not used on Hetzner)
├── docs/
│   └── IMPLEMENTATION-PLAN.md
├── deploy.sh
├── requirements.txt
├── .gitignore
├── README.md
└── CLAUDE.md
```

### Key Architectural Decisions

- **No file moves or renames.** Existing Meandering Muck files stay at root level. The build script copies them into `dist/` preserving their original filenames and relative paths. This means zero internal link updates.
- **Old files stay in repo.** `index.html`, `style.css`, and `CNAME` are superseded but left in place — git history preserves everything, and they don't interfere since Nginx serves from `dist/`.
- **Python + Jinja2** for build system. No runtime server — pure static output.
- **Pydantic models** in sv-core for schema validation. These same models will be importable by sv-tools later.
- **JSON flat files** as the data store. Simple, version-controllable, easy to read/write from any tool.
- **Static output** served by Nginx. Fast, secure, zero maintenance.
- **sv-tools/sv-mcp future path**: Separate repos that will import sv-core as a package and read/write the same JSON data format.

---

## Design Specification: The Command Center

### Color Palette

| Role | Color | Hex |
|------|-------|-----|
| Background (deep) | Near-black | `#0b0e13` |
| Background (panel) | Dark charcoal | `#111620` |
| Background (elevated) | Slightly lighter | `#1a1f2b` |
| Border / divider | Dark gray | `#1e2533` |
| Text (primary) | Light gray | `#c8cdd3` |
| Text (secondary) | Muted gray | `#6b7280` |
| Accent (primary) | Cyan | `#00d4ff` |
| Accent (attention) | Amber | `#f0a030` |
| Status: live/shipped | Green | `#2ecc71` |
| Status: in-progress | Amber | `#f0a030` |
| Status: concept | Dim cyan | `#00d4ff` at 40% opacity |
| Accent (links/hover) | Bright cyan | `#00e5ff` |

### Layout (Desktop, ~1200px+)

```
┌─────────────────────────────────────────────────────────┐
│  ▸ TICKER: scrolling announcements (amber text on dark) │
├─────────────────────────────────────────────────────────┤
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │                                                 │   │
│   │           HERO / FEATURED PROJECT               │   │
│   │     (Meandering Muck — trailer, links, pitch)   │   │
│   │                                                 │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
│   ┌──────────────────┐  ┌──────────────────┐            │
│   │  PROJECT PANEL   │  │  PROJECT PANEL   │            │
│   │  Salt All The    │  │  Pull All The    │            │
│   │  Things          │  │  Things          │            │
│   │  ● Launching 3/3 │  │  ● Live          │            │
│   └──────────────────┘  └──────────────────┘            │
│                                                         │
│   ┌──────────────────┐  ┌──────────────────┐            │
│   │  PROJECT PANEL   │  │  PROJECT PANEL   │            │
│   │  sv-tools        │  │  Show Planner    │            │
│   │  ◐ In Progress   │  │  (SATT system)   │            │
│   └──────────────────┘  └──────────────────┘            │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │  PROFILE BAR                                    │   │
│   │  Mike | Developer & Consultant | 20+ yrs data   │   │
│   │  Skills: Python, SQL, Godot, AI/ML, Data        │   │
│   │  Roles: Shadowedvaca LLC, Board Member [NPO]    │   │
│   │  contact@shadowedvaca.com                       │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
│   ┌─────────────────────────────────────────────────┐   │
│   │  THE WORKBENCH (dim, teaser zone)               │   │
│   │  ◌ Project Ember — ???                          │   │
│   │  ◌ Untitled — early concept                     │   │
│   └─────────────────────────────────────────────────┘   │
│                                                         │
│   ── footer: © 2026 Shadowedvaca LLC ──                 │
└─────────────────────────────────────────────────────────┘
```

### Layout (Mobile, <768px)

- Ticker stays at top (single line, scrolling)
- Hero section stacks vertically (trailer on top, text/links below)
- Project panels stack in single column, full width
- Profile bar stacks naturally
- Workbench at bottom

### Ticker Behavior

- Horizontal scrolling text, continuous loop
- Data source: `announcements.json`
- Entries separated by a diamond or dot separator (e.g., `◆`)
- Subtle amber glow or amber text on dark background
- CSS animation, no heavy JS framework needed
- Pauses on hover (desktop)

### Project Panel Design

Each panel is a compact card with:
- **Status dot** (colored circle: green/amber/dim) + status label
- **Project name** (large, cyan accent)
- **One-liner description** (light gray)
- **Links** (small, underlined, cyan) — e.g., "Website", "Press Kit", "Discord", "App Store"
- **Optional tag/badge** — e.g., "Game", "Podcast", "Tool", "WoW"
- Subtle border glow on hover
- Dark panel background (`#111620`) against page background (`#0b0e13`)

### Hero Section

The featured project gets more real estate:
- Embedded YouTube trailer (the Meandering Muck gameplay video)
- Store badges/links (App Store, Google Play — or "Coming [date]" badges)
- Link to the itch.io original ("Where it all started")
- Tagline from the press kit
- Press Kit link (links to `/meandering-muck.html`)

### Profile Bar

Compact horizontal bar:
- Name and title
- Key skills as subtle tags/chips
- Current roles
- Contact email
- Links to social/external presences

### The Workbench

- Dimmer than active project panels (lower opacity or darker background)
- Just codename + optional one-liner
- Status dots are dim/hollow
- Placeholder entries are fine for now

---

## Data Schemas

### projects.json

```json
[
  {
    "id": "meandering-muck",
    "name": "Meandering Muck",
    "tagline": "A maze game with infinite replayability. Just a little sticky.",
    "description": "Tilt-controlled maze puzzle game with procedurally generated mazes, multiple difficulty levels, and a retro-pixel art style. Built in Godot 4.",
    "status": "launching",
    "category": "game",
    "featured": true,
    "visibility": "public",
    "links": {
      "press_kit": "/meandering-muck.html",
      "youtube": "https://www.youtube.com/embed/U35kuoxncfI",
      "itch_io": "https://shadowedvaca.itch.io/meandering-muck",
      "app_store": null,
      "google_play": null
    },
    "launch_date": "2026-02-24",
    "image": "assets/meandering-muck/Title_512_512.png",
    "sort_order": 1
  },
  {
    "id": "salt-all-the-things",
    "name": "Salt All The Things",
    "tagline": "A World of Warcraft podcast.",
    "description": "WoW-focused podcast covering raids, guild life, and community.",
    "status": "launching",
    "category": "podcast",
    "featured": false,
    "visibility": "public",
    "links": {
      "website": "https://saltallthethings.com"
    },
    "launch_date": "2026-03-03",
    "image": null,
    "sort_order": 2
  },
  {
    "id": "pull-all-the-things",
    "name": "Pull All The Things",
    "tagline": "WoW guild site with raid roster management.",
    "description": "Guild website for organizing raids, managing rosters, and coordinating a WoW community.",
    "status": "live",
    "category": "wow",
    "featured": false,
    "visibility": "public",
    "links": {
      "website": "https://pullallthethings.com",
      "discord": "https://discord.gg/jgSSRBvjHM"
    },
    "launch_date": null,
    "image": null,
    "sort_order": 3
  },
  {
    "id": "sv-tools",
    "name": "sv-tools",
    "tagline": "Developer tools and automation.",
    "description": "Internal tooling suite. Open source release planned.",
    "status": "in-progress",
    "category": "tool",
    "featured": false,
    "visibility": "public",
    "links": {},
    "launch_date": null,
    "image": null,
    "sort_order": 4
  },
  {
    "id": "show-planner",
    "name": "Podcast Show Planner",
    "tagline": "Custom show planning system built for SATT.",
    "description": "Web-based show planning and scheduling tool built for the Salt All The Things podcast.",
    "status": "live",
    "category": "tool",
    "featured": false,
    "visibility": "public",
    "links": {
      "website": "https://saltallthethings.com"
    },
    "launch_date": null,
    "image": null,
    "sort_order": 5
  },
  {
    "id": "raid-team-manager",
    "name": "Raid Team Manager",
    "tagline": "Roster and raid management built for PATT.",
    "description": "Web-based raid roster and team management tool built for Pull All The Things.",
    "status": "live",
    "category": "tool",
    "featured": false,
    "visibility": "public",
    "links": {
      "website": "https://pullallthethings.com"
    },
    "launch_date": null,
    "image": null,
    "sort_order": 6
  }
]
```

### announcements.json

```json
[
  {
    "id": "mm-launch",
    "text": "Meandering Muck launches late February on iOS and Android!",
    "date": "2026-02-18",
    "active": true,
    "priority": 1
  },
  {
    "id": "satt-launch",
    "text": "Salt All The Things podcast premieres March 3rd",
    "date": "2026-02-18",
    "active": true,
    "priority": 2
  },
  {
    "id": "site-launch",
    "text": "Welcome to the new shadowedvaca.com",
    "date": "2026-02-18",
    "active": true,
    "priority": 3
  }
]
```

### profile.json

```json
{
  "name": "Mike",
  "title": "Independent Developer & Consultant",
  "company": "Shadowedvaca LLC",
  "location": "Arizona",
  "bio": "Lifelong hobbyist programmer with 20+ years of professional data experience. Building games, podcasts, tools, and communities.",
  "skills": ["Python", "SQL", "Godot 4", "Data Engineering", "AI/ML", "Web Development"],
  "roles": [
    {
      "title": "Founder",
      "org": "Shadowedvaca LLC"
    }
  ],
  "contact": {
    "email": "contact@shadowedvaca.com"
  }
}
```

### links.json

```json
[
  {
    "label": "Meandering Muck",
    "url": "/meandering-muck.html",
    "platform": "web",
    "category": "project"
  },
  {
    "label": "Salt All The Things",
    "url": "https://saltallthethings.com",
    "platform": "web",
    "category": "project"
  },
  {
    "label": "Pull All The Things",
    "url": "https://pullallthethings.com",
    "platform": "web",
    "category": "project"
  },
  {
    "label": "Discord",
    "url": "https://discord.gg/jgSSRBvjHM",
    "platform": "discord",
    "category": "social"
  },
  {
    "label": "itch.io",
    "url": "https://shadowedvaca.itch.io/meandering-muck",
    "platform": "itch",
    "category": "project"
  }
]
```

---

## Server Information

### Current State
- **Provider**: Hetzner Cloud
- **Server**: CPX11 (2 vCPU, 2 GB RAM, 40 GB disk)
- **IP**: 5.78.114.224
- **Datacenter**: Hillsboro, OR (hil-dc1)
- **Current OS**: Unknown / will be rebuilt

### Target State
- **OS**: Ubuntu 24.04 LTS (fresh rebuild via Hetzner console)
- **Web server**: Nginx
- **SSL**: Let's Encrypt via Certbot (auto-renewing)
- **Domain**: shadowedvaca.com pointed to 5.78.114.224
- **Deployment**: rsync from local build to server, or git pull + build on server

### IMPORTANT: sv-tools coexistence
sv-tools will also be deployed to this same server soon. The Nginx config must be structured to support multiple sites/services. Use a clean virtual host / sites-available pattern so adding sv-tools later is just adding a new config file.

### DNS Changes Required (Manual Step)
Current: shadowedvaca.com is on GitHub Pages (CNAME file points there)
Target: A record pointing to 5.78.114.224
DNS is managed at Bluehost.

---

## Implementation Phases

Each phase ends with a code review checkpoint. Claude Code should commit at the end of each phase and present a summary of what was done and what to review.

### Phase 1: Project Scaffolding & Data Layer

**Goal**: Set up sv-core schemas, seed data files, and prepare the build infrastructure. Existing files stay where they are.

**Tasks**:
1. Create `.gitignore` (dist/, __pycache__/, *.pyc, .env, etc.)
2. Create `packages/` directory structure
3. Set up Python project (`pyproject.toml`) with dependencies: `jinja2`, `pydantic`
4. Create `requirements.txt`
5. Create Pydantic models in `packages/core/schemas/` for Project, Announcement, Profile, Link
6. Create data access module (`packages/core/data.py`) with functions:
   - `load_projects()` → list of validated Project objects
   - `load_announcements()` → list of validated Announcement objects
   - `load_profile()` → validated Profile object
   - `load_links()` → list of validated Link objects
   - All functions read from `data/` directory, validate with Pydantic
7. Create seed data files in `data/` with the JSON content specified above
8. Write a simple test script that loads all data and prints a summary
9. Create `README.md`
10. Commit: "add command center scaffolding and data layer"

**Review checkpoint**: Mike reviews data schemas and seed data for accuracy.

---

### Phase 2: Build System & Templates

**Goal**: Create the Jinja2 template system and build script that generates the static site.

**Tasks**:
1. Create `packages/site/build.py`:
   - Imports sv-core data access functions
   - Loads all data
   - Renders Jinja2 templates with data context
   - Outputs to `dist/` directory
   - Copies static assets (CSS, JS, images) to `dist/`
   - Copies MM files from root into `dist/` preserving filenames:
     - `meandering-muck.html` → `dist/meandering-muck.html`
     - `meandering-muck-support.html` → `dist/meandering-muck-support.html`
     - `meandering-muck-privacy.html` → `dist/meandering-muck-privacy.html`
     - `assets/meandering-muck/` → `dist/assets/meandering-muck/`
2. Create Jinja2 templates:
   - `base.html` — HTML skeleton, meta tags, CSS/JS includes
   - `index.html` — Command center layout, extends base
   - `components/ticker.html` — Announcement ticker partial
   - `components/hero.html` — Featured project section
   - `components/panel.html` — Reusable project panel card
   - `components/profile.html` — Profile/status bar
   - `components/workbench.html` — Teaser section
3. Create placeholder CSS (`static/css/command-center.css`)
4. Create placeholder JS (`static/js/ticker.js`)
5. Verify build script runs and produces valid HTML in `dist/`
6. Commit

**Review checkpoint**: Mike runs the build locally, opens `dist/index.html` in a browser. HTML structure correct? All sections present?

---

### Phase 3: Command Center Visual Design

**Goal**: Implement the full dark-theme command center CSS and client-side JS.

**Tasks**:
1. Implement `command-center.css` with the full design spec:
   - Dark color palette as specified
   - CSS Grid layout for the panel grid (responsive)
   - Ticker styling and animation (CSS keyframes)
   - Panel card styling with status dots, hover effects, border glow
   - Hero section with embedded video container
   - Profile bar layout
   - Workbench section (dimmer styling)
   - Mobile responsive breakpoints (768px, 480px)
   - Typography: system font stack, appropriate sizes and weights
   - Subtle visual effects: panel border glow on hover, status dot pulse for "live" items
2. Implement `ticker.js`:
   - Smooth horizontal scroll animation
   - Pause on hover (desktop)
   - Loop seamlessly
3. Refine templates as needed to support the CSS structure
4. Test in browser at multiple viewport sizes
5. Commit

**Review checkpoint**: Big visual review. Does it feel like a command center? Dark theme working? Mobile working?

---

### Phase 4: Server Provisioning & Deployment

**Goal**: Get the Hetzner server ready and deploy the site.

**PREREQUISITE — Manual steps for Mike**:
1. **Rebuild the server**: Hetzner console → server → "Rebuild" tab → Ubuntu 24.04 → Rebuild
2. **Share SSH access**: Provide root password or SSH key to Claude Code
3. **Update DNS**: Bluehost → DNS for shadowedvaca.com → A record to `5.78.114.224`, remove GitHub Pages CNAME

**Tasks (Claude Code, once SSH access is confirmed)**:
1. SSH into server, initial security setup:
   - Update packages
   - Create deploy user with SSH key auth
   - Basic firewall (ufw: allow 22, 80, 443)
   - Disable root password SSH login
2. Install Nginx
3. Install Certbot for Let's Encrypt SSL
4. Configure Nginx:
   - `/etc/nginx/sites-available/shadowedvaca.com` virtual host
   - Serve static files from `/var/www/shadowedvaca.com/`
   - Clean sites-available/sites-enabled pattern for future sv-tools addition
5. Set up SSL certificate (requires DNS to be pointed already)
6. Create deployment script (`deploy.sh`):
   - Builds the site locally (runs build.py)
   - Rsyncs `dist/` to server
7. Run initial deployment
8. Verify site is live at https://shadowedvaca.com
9. Commit deployment config

**Review checkpoint**: Mike visits https://shadowedvaca.com. Live and working? SSL good? MM pages accessible at their original paths?

---

### Phase 5: Content Polish & Launch Readiness

**Goal**: Final content pass, verify all links, launch prep.

**Tasks**:
1. Verify all external links work (SATT, PATT, itch.io, YouTube, Discord)
2. Add proper meta tags (Open Graph, Twitter cards)
3. Add favicon
4. Review and adjust announcement ticker content for launch week
5. Adjust any project details based on Mike's feedback
6. Performance check
7. Final build and deploy
8. Commit and tag as v1.0

**Review checkpoint**: Final sign-off. Site is live, content is accurate, ready to share.

---

## Post-Launch Improvements (Not in this pass)

- App Store / Google Play badges for Meandering Muck once approved
- RSS feed integration for Salt All The Things
- sv-tools MCP integration — update site data via MCP commands
- Meandering Muck sub-page redesign to match command center theme
- Blog/writing section
- Privacy-respecting analytics (Plausible or self-hosted)
- Workbench content with real codenames
- Automated deployments (git push triggers build + deploy)

---

## Quick Reference for Mike

### To update the site after launch:

1. Edit the relevant JSON file in `data/`
2. Run `python packages/site/build.py`
3. Run `./deploy.sh`

### What Mike needs to do manually (not Claude Code):

| Task | When | Difficulty |
|------|------|-----------|
| Rebuild Hetzner server to Ubuntu 24.04 | Before Phase 4 | Easy — 3 clicks in Hetzner console |
| Share SSH credentials with Claude Code | Before Phase 4 | Easy — copy/paste a password or key |
| Update DNS A record to 5.78.114.224 | Before Phase 4 (SSL step) | Easy — one field change at Bluehost |
| Review/approve at each phase checkpoint | Between phases | Just look and give feedback |

Everything else is Claude Code's job.
