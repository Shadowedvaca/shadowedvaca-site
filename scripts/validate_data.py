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
    load_links,
)


def main() -> None:
    print("=== Shadowedvaca Data Validation ===\n")

    print("Projects:")
    projects = load_projects()
    for p in projects:
        featured = " [FEATURED]" if p.featured else ""
        print(f"  [{p.status:12}] {p.name}{featured}")
    print(f"  -> {len(projects)} projects loaded\n")

    print("Announcements:")
    announcements = load_announcements()
    active = [a for a in announcements if a.active]
    for a in sorted(announcements, key=lambda x: x.priority):
        status = "active" if a.active else "inactive"
        print(f"  [{status}] (priority {a.priority}) {a.text}")
    print(f"  -> {len(announcements)} total, {len(active)} active\n")

    print("Profile:")
    profile = load_profile()
    print(f"  Name:     {profile.name}")
    print(f"  Title:    {profile.title}")
    print(f"  Company:  {profile.company}")
    print(f"  Skills:   {', '.join(profile.skills)}")
    print(f"  Roles:    {len(profile.roles)} role(s)")
    print(f"  Contact:  {profile.contact}\n")

    print("Links:")
    links = load_links()
    for link in links:
        print(f"  [{link.platform:8}] {link.label}: {link.url}")
    print(f"  -> {len(links)} links loaded\n")

    print("All data loaded and validated successfully.")


if __name__ == "__main__":
    main()
