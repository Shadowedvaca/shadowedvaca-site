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

from jinja2 import Environment, FileSystemLoader

from packages.core import (
    load_announcements,
    load_links,
    load_profile,
    load_projects,
)

SITE_DIR = Path(__file__).parent
TEMPLATES_DIR = SITE_DIR / "templates"
STATIC_DIR = SITE_DIR / "static"
DIST_DIR = REPO_ROOT / "dist"


# --- Jinja2 filters ---

def filter_link_label(key: str) -> str:
    labels = {
        "website": "Website",
        "discord": "Discord",
        "press_kit": "Press Kit",
        "itch_io": "itch.io",
        "app_store": "App Store",
        "google_play": "Google Play",
        "youtube": "YouTube",
        "github": "GitHub",
        "twitch": "Twitch",
        "twitter": "Twitter",
        "patreon": "Patreon",
    }
    return labels.get(key, key.replace("_", " ").title())


def filter_status_label(status: str) -> str:
    labels = {
        "shipped": "Shipped",
        "live": "Live",
        "launching": "Launching",
        "in-progress": "In Progress",
        "concept": "Concept",
    }
    return labels.get(status, status.replace("-", " ").title())


def filter_category_label(category: str) -> str:
    labels = {
        "game": "Game",
        "podcast": "Podcast",
        "wow": "WoW",
        "tool": "Tool",
    }
    return labels.get(category, category.title())


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

    # --- Load and categorize data ---
    all_projects = load_projects()
    all_announcements = load_announcements()
    profile = load_profile()
    links = load_links()

    featured = next((p for p in all_projects if p.featured), None)
    public_projects = sorted(
        [p for p in all_projects if p.visibility == "public" and not p.featured],
        key=lambda p: p.sort_order,
    )
    workbench_projects = sorted(
        [p for p in all_projects if p.visibility == "teaser"],
        key=lambda p: p.sort_order,
    )
    active_announcements = sorted(
        [a for a in all_announcements if a.active],
        key=lambda a: a.priority,
    )

    # --- Set up Jinja2 ---
    env = Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=True,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    env.filters["link_label"] = filter_link_label
    env.filters["status_label"] = filter_status_label
    env.filters["category_label"] = filter_category_label
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

    # --- Render index.html ---
    template = env.get_template("index.html")
    html = template.render(
        featured=featured,
        projects=public_projects,
        workbench_projects=workbench_projects,
        announcements=active_announcements,
        profile=profile,
        links=links,
    )
    (DIST_DIR / "index.html").write_text(html, encoding="utf-8")
    print("  Rendered dist/index.html")

    # --- Copy static assets (css/, js/) ---
    for asset_dir in ("css", "js"):
        src = STATIC_DIR / asset_dir
        if src.exists():
            shutil.copytree(src, DIST_DIR / asset_dir)
            print(f"  Copied static/{asset_dir}/ -> dist/{asset_dir}/")

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
