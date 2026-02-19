# Shadowedvaca.com — Command Center Website

## Project Overview

This is the existing shadowedvaca-site repo, being rebuilt from a simple GitHub Pages site into a dark-themed split-screen "command center" hosted on Hetzner. The site serves as a living portfolio and launchpad for all of Mike's projects — games, podcasts, tools, and consulting work.

The site is **data-driven**: JSON data files → Python build script → static HTML/CSS/JS → served by Nginx on Hetzner.

## Existing Files

This repo already contains files from the current GitHub Pages site. **These files stay where they are.** Do not move or rename them. The build script copies them into `dist/` during build, preserving their current paths.

**Existing files at root (do not move, do not modify content/styling):**
- `meandering-muck.html` — Press kit page
- `meandering-muck-support.html` — Support form
- `meandering-muck-privacy.html` — Privacy policy
- `support-form-google-web-app.js` — Google Apps Script reference (not served directly)
- `assets/meandering-muck/` — Images, press kit zip

**Existing files that will be superseded (kept in repo but not served):**
- `index.html` — Old homepage (replaced by generated command center)
- `style.css` — Old styles (replaced by new CSS)
- `CNAME` — GitHub Pages config (not used on Hetzner)

## Architecture

```
shadowedvaca-site/
├── packages/
│   ├── core/                             ← Shared data layer (Pydantic schemas + data access)
│   │   ├── schemas/
│   │   │   ├── project.py                ← Project model (name, status, description, links, features, etc.)
│   │   │   ├── announcement.py           ← Ticker announcement model
│   │   │   ├── profile.py                ← Owner profile model
│   │   │   └── link.py                   ← Link model
│   │   ├── data.py                       ← Data access functions (load/validate JSON)
│   │   └── __init__.py
│   └── site/
│       ├── templates/
│       │   ├── base.html                 ← Full page shell (head, layout, scripts)
│       │   ├── index.html                ← Main template composing all components
│       │   └── components/
│       │       ├── ticker.html           ← Top announcement ticker bar
│       │       ├── main_stage.html       ← Left 2/3: project detail views
│       │       ├── terminal.html         ← Right 1/3: green CRT project index
│       │       ├── sticky_note.html      ← Contact sticky note overlay
│       │       └── bottom_bar.html       ← Footer status bar
│       ├── static/
│       │   ├── css/
│       │   │   └── command-center.css    ← All styles for the command center
│       │   └── js/
│       │       ├── navigation.js         ← Terminal click → main stage swap
│       │       └── sticky.js             ← Random sticky note positioning
│       └── build.py                      ← Build script: data → templates → dist/
├── data/
│   ├── projects.json                     ← All projects with detail view content
│   ├── announcements.json                ← Ticker items
│   └── profile.json                      ← Owner info (name, contact, tagline)
├── dist/                                 ← Build output (served by Nginx)
│   ├── index.html                        ← Generated command center
│   ├── css/ js/                          ← Generated static assets
│   ├── meandering-muck.html              ← Copied from root (unchanged)
│   ├── meandering-muck-support.html      ← Copied from root (unchanged)
│   ├── meandering-muck-privacy.html      ← Copied from root (unchanged)
│   └── assets/meandering-muck/           ← Copied from root (unchanged)
├── reference/
│   └── mockup-v3.html                    ← Design reference mockup (THE source of truth for look & feel)
├── meandering-muck.html                  ← Source, copied to dist/
├── meandering-muck-support.html          ← Source, copied to dist/
├── meandering-muck-privacy.html          ← Source, copied to dist/
├── support-form-google-web-app.js        ← Google Apps Script ref (not served)
├── assets/meandering-muck/               ← Source, copied to dist/
├── index.html                            ← OLD homepage (superseded, not served)
├── style.css                             ← OLD styles (superseded, not served)
├── CNAME                                 ← OLD GitHub Pages config (not used)
├── deploy.sh
├── requirements.txt
├── .gitignore
├── README.md
└── CLAUDE.md
```

### Key Architectural Decisions

1. **No file moves or renames.** Existing Meandering Muck files stay at root. The build script copies them into `dist/` preserving their original filenames and paths. Zero internal link updates needed.
2. **sv-core is a reusable library.** The schemas and data access layer in `packages/core/` will eventually be consumed by sv-tools and sv-mcp (separate repos). Design it as a clean, importable Python package.
3. **Data-driven everything.** The website reads from JSON files in `data/`. No content is hardcoded in templates. Every piece of text, every project, every announcement comes from the data layer.
4. **Static output.** The build script generates pure static HTML/CSS/JS into `dist/`. No runtime server for the website. Nginx serves files.
5. **Server supports multiple sites.** Nginx config uses sites-available/sites-enabled pattern so sv-tools can be added to the same Hetzner server later.

## Tech Stack

- **Python 3.11+** — Build system and data layer
- **Pydantic** — Schema validation
- **Jinja2** — HTML templating
- **Vanilla HTML/CSS/JS** — No frontend frameworks. Minimal client-side JS (navigation, sticky note positioning).
- **Nginx** — Web server on Hetzner
- **Let's Encrypt / Certbot** — SSL

## Design: Split-Screen Command Center

### Concept

A single-screen split-screen layout. NOT a scrolling page with stacked sections. NOT a grid of boxes/cards. The site fills the viewport and is divided into two zones:

- **Main Stage (left 2/3):** Shows the detail view for whichever project is selected. This is the "monitor" — it displays one thing at a time with full focus.
- **Terminal Sidebar (right 1/3):** A retro CRT-style green-on-black terminal that serves as the project index/navigation. Clicking a project here swaps the main stage content.

Think: a mission control workstation where the left screen shows the active feed and the right screen is the directory.

### Reference Mockup

**The file `reference/mockup-v3.html` is the definitive design reference.** Open it in a browser. The generated site must match this mockup's layout, colors, typography, interactions, and feel. Use it as the source of truth when building templates and CSS.

### Color Palette

| Role | Hex |
|------|-----|
| Background (deep) | `#0a0c10` |
| Background (terminal) | `#030806` |
| Divider / border | `#1e2533` |
| Text (primary) | `#c8cdd3` |
| Text (secondary) | `#6b7280` |
| Accent (primary/cyan) | `#00d4ff` |
| Accent (attention/amber) | `#f0a030` |
| Terminal green (bright) | `#33ff33` |
| Terminal green (dim) | `#1a9e1a` |
| Terminal green (faint) | `#0d4f0d` |
| Status: live/shipped | `#2ecc71` |
| Status: in-progress | `#f0a030` |
| Status: concept | `#00d4ff` at 40% opacity |

### Layout Components

**Ticker Bar (top, full width):**
- Scrolling horizontal announcements, amber text on dark background
- CSS animation, pauses on hover
- Data-driven from `announcements.json`

**Main Stage (left 2/3 of viewport):**
- Shows one project detail view at a time
- Each project view contains: category label, title, tagline, meta tags (status, platform, tech), content area (video embed, screenshots, or placeholder), action buttons (links to sites, demos, press kits), description text, and optionally a feature list
- Content scrolls vertically within this zone if needed
- Meandering Muck is the default view on load
- Smooth fade transition when switching between projects

**Terminal Sidebar (right 1/3 of viewport):**
- Black background with CRT scanline overlay (repeating-linear-gradient)
- Green phosphor text (`#33ff33`) using Share Tech Mono font
- Prompt line at top: `shadowedvaca@cmd:~$ ls --projects` with blinking cursor
- Projects grouped into sections: `── active ──`, `── upcoming ──`, `── systems ──`, `── archive ──`
- Each project is clickable — click highlights it (left green border) and swaps the main stage
- Selected project gets a brighter background

**Sticky Note (on main stage, bottom area):**
- A square (~180×180px) yellow sticky note with a tape strip across the top
- Contains: name, company, location, email, tagline
- Uses Caveat (handwritten Google Font)
- Positioned absolutely at the bottom of the main stage
- **Semi-random horizontal position:** On page load, JS places it roughly centered ±120px (clamped to stay in bounds). Slight random rotation (-3° to +1°). Recalculates on window resize.

**Bottom Bar (bottom, full width):**
- Thin status bar with copyright and tagline
- Share Tech Mono font, subdued color

### Typography

- **Body text:** IBM Plex Sans (Google Fonts) — weights 300, 400, 600
- **Monospace / UI elements:** Share Tech Mono (Google Fonts)
- **Sticky note:** Caveat (Google Fonts) — weights 400, 600

System font stack as fallback: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`

### Visual Effects

- CRT scanline overlay on terminal (CSS repeating-linear-gradient, pointer-events: none)
- Subtle inner glow on terminal (box-shadow inset, green tint)
- Blinking cursor animation on terminal prompt
- Cyan gradient glow on the split divider
- Fade-in animation when swapping main stage views
- Terminal project highlight on hover (faint green background + left border)
- **No heavy animations. Performance matters.**

### Responsive Behavior

- **Desktop (>900px):** Side-by-side split, viewport-height layout, no page scroll
- **Tablet/Mobile (≤900px):** Stacks vertically — main stage on top, terminal below (max-height 40vh). Page scrolls. Ticker stays at top.
- **Small mobile (≤500px):** Reduced padding, smaller title font

### Interaction

- Clicking a project in the terminal sidebar:
  1. Removes `selected` class from all terminal projects
  2. Adds `selected` class to clicked project
  3. Hides all `.stage-view` elements
  4. Shows the target `.stage-view` with fade-in animation
  5. Scrolls main stage content area to top

## Data Schemas

The Pydantic models in `packages/core/schemas/` must validate the JSON data. Key models:

### Project
- `id` (str) — unique identifier, maps to stage view ID
- `name` (str) — display name
- `tagline` (str) — one-liner shown under title
- `description` (list[str]) — paragraphs of description text
- `status` — `"live"` | `"launching"` | `"in-progress"` | `"concept"` | `"archived"`
- `category` (str) — label shown above title (e.g., "Featured Project", "System — Custom Built")
- `section` — `"active"` | `"upcoming"` | `"systems"` | `"archive"` — which terminal group it belongs to
- `terminal_desc` (str) — short description shown in terminal sidebar
- `meta_tags` (list[dict]) — tags shown in the meta row (label + optional status style)
- `links` (list[dict]) — action buttons (label, url, style: primary/secondary)
- `features` (list[str], optional) — feature bullet list for systems
- `media` (dict, optional) — video embed URL, screenshot paths, or placeholder config
- `sort_order` (int) — ordering within section
- `featured` (bool) — if true, this is the default view on page load

### Announcement
- `id` (str), `text` (str), `dot_style` (str: "live" or "soon"), `active` (bool), `sort_order` (int)

### Profile
- `name`, `company`, `location`, `email`, `tagline` (str)
- `bottom_bar_tagline` (str) — text shown in bottom status bar

## Projects Data

### Active
- **Meandering Muck** — Tilt-controlled maze game. Launching late Feb 2026 on iOS/Android. Featured (default view). Has YouTube embed, store link placeholders, press kit and support links.
- **Pull All The Things** — WoW guild site + raid roster management. Live. Links to site and Discord.

### Upcoming
- **Salt All The Things** — WoW podcast. Launching 3/3/2026. Link to site.
- **sv-tools** — Dev tools & automation. In progress. No external links yet.

### Systems
- **Podcast Show Planner** — Custom podcast planning tool. In use. Will have demo link. Features: episode timeline, topic queue, guest scheduling, rundown templates, research linking.
- **Raid Team Manager** — Guild roster & comp management. In use. Will have demo link. Features: roster management, comp builder, attendance tracking, bench rotation, Discord integration.

### Archive
- **Meandering Muck (itch.io)** — Original game jam release, 2024. Link to itch.io page.

## Important Notes

- **The reference mockup (`reference/mockup-v3.html`) is the design bible.** Match it closely.
- sv-tools and sv-mcp are SEPARATE repos. Do not scaffold them here.
- The Meandering Muck sub-pages are existing files. Copy them as-is during build. Do not modify their content or styling.
- Keep client-side JavaScript minimal. Vanilla JS only. No React, Vue, or frameworks.
- The site must load fast. Static files — no excuse for slow performance.
- Mike is on Windows. All scripts must work on Windows (use Python for cross-platform compatibility).
- Google Fonts (IBM Plex Sans, Share Tech Mono, Caveat) should be loaded from Google CDN, not self-hosted.
