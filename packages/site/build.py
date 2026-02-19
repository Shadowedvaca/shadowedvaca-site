"""
Build script for shadowedvaca.com command center.

Usage (from repo root):
    python packages/site/build.py

Output goes to dist/. dist/ is cleared and rebuilt on each run.
"""
import shutil
import sys
from pathlib import Path

# Ensure repo root is importable regardless of where this script is called from
REPO_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(REPO_ROOT))

from markupsafe import Markup, escape
from jinja2 import Environment, FileSystemLoader

from packages.core import (
    load_announcements,
    load_profile,
    load_projects,
)

SITE_DIR = Path(__file__).parent
TEMPLATES_DIR = SITE_DIR / "templates"
STATIC_DIR = SITE_DIR / "static"
DIST_DIR = REPO_ROOT / "dist"


# --- Jinja2 filters ---

def filter_status_label(status: str) -> str:
    labels = {
        "live": "Live",
        "launching": "Launching",
        "in-progress": "In Progress",
        "concept": "Concept",
        "archived": "Archived",
    }
    return labels.get(status, status.replace("-", " ").title())


def filter_status_char_class(status: str) -> str:
    """Maps a project status to the CSS class used on the terminal sidebar ▸ char."""
    mapping = {
        "live": "live",
        "launching": "progress",
        "in-progress": "concept",
        "concept": "concept",
        "archived": "archived",
    }
    return mapping.get(status, "live")


def filter_nl2br(text: str) -> Markup:
    """Escape HTML in text, then convert literal \\n newlines to <br> tags."""
    return Markup(escape(text).replace("\n", Markup("<br>")))


def filter_format_date(date_str: str | None) -> str:
    """Format a YYYY-MM-DD date string for display (cross-platform)."""
    if not date_str:
        return ""
    try:
        from datetime import date
        d = date.fromisoformat(date_str)
        # %d zero-pads; strip leading zero via replace (works on all platforms)
        return d.strftime("%B %d, %Y").replace(" 0", " ")
    except ValueError:
        return date_str


def build() -> None:
    print("Building shadowedvaca.com...")

    # --- Load and validate data ---
    all_projects = load_projects()
    all_announcements = load_announcements()
    profile = load_profile()

    # Featured project (shown by default on load)
    featured = next((p for p in all_projects if p.featured), None)

    # Projects grouped by section for the terminal sidebar
    projects_by_section = {
        section: sorted(
            [p for p in all_projects if p.section == section],
            key=lambda p: p.sort_order,
        )
        for section in ("active", "upcoming", "systems", "archive")
    }

    # All projects ordered by sort_order (for main stage view rendering)
    all_projects_ordered = sorted(all_projects, key=lambda p: p.sort_order)

    # Active announcements ordered for the ticker
    active_announcements = sorted(
        [a for a in all_announcements if a.active],
        key=lambda a: a.sort_order,
    )

    # --- Set up Jinja2 ---
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["status_label"] = filter_status_label
    env.filters["status_char_class"] = filter_status_char_class
    env.filters["nl2br"] = filter_nl2br
    env.filters["format_date"] = filter_format_date

    # --- Clear dist/ contents (keep the dir itself — Windows holds it open) ---
    if DIST_DIR.exists():
        for item in DIST_DIR.iterdir():
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    else:
        DIST_DIR.mkdir()
    print(f"  Cleared dist/ at {DIST_DIR}")

    # --- Site-wide config (used in base.html for meta/OG tags) ---
    site = {
        "url": "https://shadowedvaca.com",
        "name": "Shadowedvaca LLC",
        "title": "Shadowedvaca LLC — Command Center",
        "description": (
            "Games, podcasts, tools, and consulting. "
            "Home of Meandering Muck, launching February 2026."
        ),
        "og_image": "https://shadowedvaca.com/assets/meandering-muck/Title_512_512.png",
    }

    # --- Render index.html ---
    template = env.get_template("index.html")
    html = template.render(
        featured=featured,
        projects_by_section=projects_by_section,
        all_projects=all_projects_ordered,
        announcements=active_announcements,
        profile=profile,
        site=site,
    )
    (DIST_DIR / "index.html").write_text(html, encoding="utf-8")
    print("  Rendered dist/index.html")

    # --- Copy static assets (css/, js/, and root-level files like favicon) ---
    for asset_dir in ("css", "js"):
        src = STATIC_DIR / asset_dir
        if src.exists():
            shutil.copytree(src, DIST_DIR / asset_dir)
            print(f"  Copied static/{asset_dir}/ -> dist/{asset_dir}/")

    for static_file in STATIC_DIR.iterdir():
        if static_file.is_file():
            shutil.copy2(static_file, DIST_DIR / static_file.name)
            print(f"  Copied {static_file.name} -> dist/{static_file.name}")

    # --- Copy Meandering Muck HTML files (root -> dist/) ---
    mm_files = [
        "meandering-muck.html",
        "meandering-muck-support.html",
        "meandering-muck-privacy.html",
    ]
    for filename in mm_files:
        src = REPO_ROOT / filename
        if src.exists():
            shutil.copy2(src, DIST_DIR / filename)
            print(f"  Copied {filename} -> dist/{filename}")

    # --- Copy assets/meandering-muck/ -> dist/assets/meandering-muck/ ---
    mm_assets_src = REPO_ROOT / "assets" / "meandering-muck"
    if mm_assets_src.exists():
        shutil.copytree(mm_assets_src, DIST_DIR / "assets" / "meandering-muck")
        print("  Copied assets/meandering-muck/ -> dist/assets/meandering-muck/")

    print(f"\nBuild complete. Output: {DIST_DIR}")


if __name__ == "__main__":
    build()
