# Shadowedvaca.com — Command Center Website

## Project Overview

This is the existing shadowedvaca-site repo, being restructured from a simple GitHub Pages site into a dark-themed "command center" dashboard hosted on Hetzner. The site serves as a living portfolio and launchpad for all of Mike's projects — games, podcasts, tools, and consulting work.

The site is **data-driven**: JSON data files → Python build script → static HTML/CSS/JS → served by Nginx on Hetzner.

## Existing Files

This repo already contains files from the current GitHub Pages site. **These files stay where they are.** Do not move or rename them. The build script copies them into `dist/` during build, preserving their current paths.

**Meandering Muck pages (DO NOT MODIFY content or styling):**
- `meandering-muck.html` — Press kit
- `meandering-muck-support.html` — Support form
- `meandering-muck-privacy.html` — Privacy policy
- `support-form-google-web-app.js` — Google Apps Script reference (not served directly)
- `assets/meandering-muck/` — Images, press kit zip

**Old files (superseded by the new build, but left in repo — git history preserves everything):**
- `index.html` — Old homepage (new command center replaces it in `dist/`)
- `style.css` — Old styles (new CSS replaces it in `dist/`)
- `CNAME` — GitHub Pages config (irrelevant once DNS moves to Hetzner)

The build script generates the new `dist/index.html` and copies the MM files alongside it. Nginx serves from `dist/`. The old root-level `index.html` and `style.css` are never served.

## Target Architecture

```
shadowedvaca-site/
├── packages/
│   ├── core/                         ← Shared data layer (Pydantic schemas + data access)
│   │   ├── schemas/                  ← Pydantic models for Project, Announcement, Profile, Link
│   │   ├── data.py                   ← Data access functions (load/validate JSON)
│   │   └── __init__.py
│   └── site/                         ← Command center renderer
│       ├── templates/                ← Jinja2 templates
│       │   ├── base.html
│       │   ├── index.html
│       │   └── components/           ← ticker.html, hero.html, panel.html, profile.html, workbench.html
│       ├── static/
│       │   ├── css/command-center.css
│       │   ├── js/ticker.js
│       │   └── assets/
│       └── build.py                  ← Build script: reads data via core, renders to dist/
├── data/                             ← JSON data files (single source of truth)
│   ├── projects.json
│   ├── announcements.json
│   ├── profile.json
│   └── links.json
├── dist/                             ← Build output (served by Nginx) — add to .gitignore
│   ├── index.html                    ← Generated command center homepage
│   ├── css/
│   ├── js/
│   ├── assets/
│   │   └── meandering-muck/          ← Copied from root assets/meandering-muck/
│   ├── meandering-muck.html          ← Copied from root
│   ├── meandering-muck-support.html  ← Copied from root
│   └── meandering-muck-privacy.html  ← Copied from root
├── docs/
│   └── IMPLEMENTATION-PLAN.md
│── # --- Existing files (untouched at root, copied to dist/ during build) ---
├── meandering-muck.html
├── meandering-muck-support.html
├── meandering-muck-privacy.html
├── support-form-google-web-app.js
├── assets/meandering-muck/
├── index.html                        ← OLD (not served, superseded by dist/)
├── style.css                         ← OLD (not served, superseded by dist/)
├── CNAME                             ← OLD (GitHub Pages, not used on Hetzner)
├── deploy.sh
├── requirements.txt
├── .gitignore
├── README.md
└── CLAUDE.md                         ← This file
```

## Key Principles

1. **No file moves.** Existing Meandering Muck files stay at root level. The build script copies them into `dist/` preserving their original filenames and relative paths. This means zero internal link updates are needed.
2. **sv-core is a reusable library.** The schemas and data access layer in `packages/core/` will eventually be consumed by sv-tools and sv-mcp (separate repos). Design it as a clean, importable Python package.
3. **Data-driven everything.** The website reads from JSON files in `data/`. No content is hardcoded in templates. Every piece of text, every project card, every announcement comes from the data layer.
4. **Static output.** The build script generates pure static HTML/CSS/JS into `dist/`. No runtime server for the website. Nginx serves files.
5. **Server supports multiple sites.** Nginx config uses sites-available/sites-enabled pattern so sv-tools can be added to the same Hetzner server later.

## Tech Stack

- **Python 3.11+** — Build system and data layer
- **Pydantic** — Schema validation
- **Jinja2** — HTML templating
- **Vanilla HTML/CSS/JS** — No frontend frameworks. Minimal client-side JS (ticker animation, hover effects).
- **Nginx** — Web server on Hetzner
- **Let's Encrypt / Certbot** — SSL

## Design: The Command Center

### Concept
Dark-themed dashboard that looks like a mission control center. Not stacked cards. Not AI slop. Dense, informative, scannable — like a control room with multiple monitors showing different project statuses.

### Color Palette
| Role | Hex |
|------|-----|
| Background (deep) | `#0b0e13` |
| Background (panel) | `#111620` |
| Background (elevated) | `#1a1f2b` |
| Border / divider | `#1e2533` |
| Text (primary) | `#c8cdd3` |
| Text (secondary) | `#6b7280` |
| Accent (primary/cyan) | `#00d4ff` |
| Accent (attention/amber) | `#f0a030` |
| Status: live/shipped | `#2ecc71` |
| Status: in-progress | `#f0a030` |
| Status: concept | `#00d4ff` at 40% opacity |

### Layout
- **Top ticker**: Scrolling announcements (amber on dark), CSS animation, pauses on hover
- **Hero section**: Featured project (Meandering Muck) with YouTube trailer embed, store links, tagline
- **Project panels**: Grid of compact cards (NOT vertical stack). Each has: status dot, name, one-liner, links, category badge
- **Profile bar**: Compact horizontal section — name, title, skills as tags, roles, contact
- **Workbench**: Dimmer section for codename teasers and upcoming concepts
- **Desktop**: CSS Grid layout, panels side by side
- **Mobile (<768px)**: Panels stack to single column, ticker stays at top

### Typography
System font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### Visual Effects
- Panel border glow on hover (subtle cyan)
- Status dot pulse animation for "live" items
- Ticker smooth scroll with seamless loop
- No heavy animations. Performance matters.

## Projects to Display

### Featured (Hero Section)
- **Meandering Muck** — Tilt-controlled maze game. Launching ~2/24/2026 on iOS and Android.
  - YouTube trailer: https://www.youtube.com/embed/U35kuoxncfI
  - Press kit: /meandering-muck.html
  - Original itch.io release: https://shadowedvaca.itch.io/meandering-muck
  - App Store / Google Play links: TBD (use placeholder "Coming Soon" badges)

### Project Panel Cards
- **Salt All The Things** — WoW podcast. Launching 3/3/2026. Site: https://saltallthethings.com
- **Pull All The Things** — WoW guild site with raid roster management. Site: https://pullallthethings.com, Discord: https://discord.gg/jgSSRBvjHM
- **sv-tools** — Developer tools and automation. In progress. Open source planned.
- **Podcast Show Planner** — Custom show planning system built for SATT. Live at saltallthethings.com
- **Raid Team Manager** — Roster and raid management built for PATT. Live at pullallthethings.com

### Workbench (Teasers)
- Placeholder codenames with dim status dots. No real details yet.

## Server Details

- **Provider**: Hetzner Cloud
- **Plan**: CPX11 (2 vCPU, 2 GB RAM, 40 GB disk)
- **IP**: 5.78.114.224
- **Datacenter**: Hillsboro, OR (hil-dc1)
- **Target OS**: Ubuntu 24.04 LTS (server will be rebuilt fresh before Phase 4)
- **Domain**: shadowedvaca.com (DNS at Bluehost, will be pointed to Hetzner IP)

## Implementation Phases

Work through these phases in order. Commit at the end of each phase and present a summary for review before moving to the next.

### Phase 1: Project Scaffolding & Data Layer
- Create .gitignore (include dist/, __pycache__/, *.pyc, .env, etc.)
- Create the packages/ directory structure
- Create pyproject.toml with dependencies (jinja2, pydantic)
- Create requirements.txt
- Create Pydantic models in packages/core/schemas/
- Create data access module (packages/core/data.py)
- Seed JSON data files in data/
- Write test script to validate data loading
- Create README.md
- Commit: "add command center scaffolding and data layer"
- **STOP FOR REVIEW**

### Phase 2: Build System & Templates
- Create build.py that reads data via sv-core and renders Jinja2 templates to dist/
- Build copies existing MM files from root into dist/ (preserving filenames and relative paths)
- Build copies assets/meandering-muck/ into dist/assets/meandering-muck/
- Create all Jinja2 templates (base, index, components)
- Create placeholder CSS and JS
- Verify build produces valid HTML
- **STOP FOR REVIEW**

### Phase 3: Command Center Visual Design
- Implement full dark-theme CSS per design spec
- Implement ticker.js animation
- Responsive layout (desktop grid, mobile stack)
- Test at multiple viewport sizes
- **STOP FOR REVIEW**

### Phase 4: Server Provisioning & Deployment
- REQUIRES: Mike to rebuild server to Ubuntu 24.04, share SSH access, update DNS
- SSH into server, security setup (deploy user, firewall, disable root password login)
- Install and configure Nginx with sites-available pattern
- SSL via Certbot
- Create deploy.sh script
- Initial deployment
- **STOP FOR REVIEW**

### Phase 5: Content Polish & Launch Readiness
- Verify all links
- Add Open Graph / Twitter Card meta tags
- Add favicon
- Performance check
- Final deploy
- Tag as v1.0
- **STOP FOR REVIEW**

## Data Schemas

See data/*.json for the current data. The Pydantic models in packages/core/schemas/ must validate this data.

### Project
- id (str), name (str), tagline (str), description (str)
- status: "shipped" | "live" | "launching" | "in-progress" | "concept"
- category: "game" | "podcast" | "wow" | "tool"
- featured (bool), visibility: "public" | "teaser" | "hidden"
- links (dict of str→str|null), launch_date (str|null), image (str|null), sort_order (int)

### Announcement
- id (str), text (str), date (str), active (bool), priority (int)

### Profile
- name, title, company, location, bio (str)
- skills (list[str]), roles (list[dict]), contact (dict)

### Link
- label, url, platform, category (str)

## Important Notes

- sv-tools and sv-mcp are SEPARATE repos. Do not scaffold them here. sv-core in this repo will eventually be extracted as a dependency they consume.
- Keep client-side JavaScript minimal. No React, no Vue, no frameworks. Vanilla JS only.
- The site must load fast. It's static files — there's no excuse for slow performance.
- Mike is on Windows. All scripts must work on Windows (use Python for cross-platform compatibility, avoid bash-only constructs in build scripts).
