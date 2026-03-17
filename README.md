# shadowedvaca.com

Command center dashboard for [shadowedvaca.com](https://shadowedvaca.com) — a living portfolio and launchpad for games, podcasts, tools, and consulting work.

## Architecture

**Data-driven static site**: JSON data files → Python build script → static HTML/CSS/JS → served by Nginx.

```
data/           ← JSON source of truth (projects, announcements, profile, links)
packages/
  core/         ← sv-core: Pydantic schemas + data access (reusable library)
  site/         ← Command center renderer: Jinja2 templates + build script
dist/           ← Build output (served by Nginx, not committed to git)
```

## Setup

Requires Python 3.11+.

```bash
pip install -r requirements.txt
# or, to install as an editable package:
pip install -e .
```

## Build

```bash
python -m packages.site.build
```

Output goes to `dist/`. Open `dist/index.html` in a browser to preview.

## Validate Data

```bash
python scripts/validate_data.py
```

Loads all JSON data files through their Pydantic schemas and prints a summary.

## Data Files

All content lives in `data/`:

| File | Contents |
|------|----------|
| `data/projects.json` | All projects (game, podcast, wow, tool, utilities, creative) |
| `data/announcements.json` | Ticker announcements |
| `data/profile.json` | Personal/professional profile |

Edit these files to update site content, then rebuild.

## Deployment

Site is hosted on Hetzner Cloud (CPX11, `5.78.114.224`), served by Nginx from `dist/`.

```bash
bash deploy.sh
```

## Packages

| Package | Purpose |
|---------|---------|
| `packages/core/` | Shared Pydantic schemas + data access layer |
| `packages/site/` | Command center: Jinja2 templates + build script |
| `packages/book-club/` | Book club web app (React + Express + PostgreSQL) |

## Monitoring

Lightweight server health monitoring lives in `monitoring/`. Python scripts run via systemd timers, results stored in SQLite.

```bash
python monitoring/run_health_check.py --dry-run
```

See `monitoring/README.md` for setup and `docs/MONITORING-PLAN.md` for implementation status.

## Project: Meandering Muck

Existing press kit and support pages live at the repo root and are copied into `dist/` during build — do not modify their content or paths.

- `meandering-muck.html` — Press kit
- `meandering-muck-support.html` — Support form
- `meandering-muck-privacy.html` — Privacy policy

---

© 2026 Shadowedvaca LLC
