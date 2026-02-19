"""
Validate all data files load correctly against their Pydantic schemas.
Run from the repo root: python scripts/validate_data.py
"""
import sys
from pathlib import Path

# Ensure repo root is on the path
sys.path.insert(0, str(Path(__file__).parent.parent))

from packages.core import (
    load_projects,
    load_announcements,
    load_profile,
)


def main() -> None:
    print("=== Shadowedvaca Data Validation ===\n")

    print("Projects:")
    projects = load_projects()
    sections = ("active", "upcoming", "systems", "archive")
    for section in sections:
        section_projects = [p for p in projects if p.section == section]
        if section_projects:
            print(f"  [{section}]")
            for p in sorted(section_projects, key=lambda x: x.sort_order):
                featured = " [FEATURED]" if p.featured else ""
                links_count = len(p.links)
                print(f"    ({p.status:12}) {p.name}{featured} — {links_count} link(s)")
    print(f"  -> {len(projects)} projects loaded\n")

    print("Announcements:")
    announcements = load_announcements()
    active = [a for a in announcements if a.active]
    for a in sorted(announcements, key=lambda x: x.sort_order):
        status = "active" if a.active else "inactive"
        print(f"  [{status}] (dot:{a.dot_style}, order:{a.sort_order}) {a.text}")
    print(f"  -> {len(announcements)} total, {len(active)} active\n")

    print("Profile:")
    profile = load_profile()
    print(f"  Name:     {profile.name}")
    print(f"  Company:  {profile.company}")
    print(f"  Location: {profile.location}")
    print(f"  Email:    {profile.email}")
    print(f"  Tagline:  {profile.tagline!r}")
    print(f"  Bottom bar: {profile.bottom_bar_tagline!r}\n")

    print("All data loaded and validated successfully.")


if __name__ == "__main__":
    main()
