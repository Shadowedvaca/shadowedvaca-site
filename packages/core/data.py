import json
from pathlib import Path

from .schemas.project import Project
from .schemas.announcement import Announcement
from .schemas.profile import Profile

# data/ directory is always relative to the repo root
_REPO_ROOT = Path(__file__).parent.parent.parent
DATA_DIR = _REPO_ROOT / "data"


def load_projects() -> list[Project]:
    """Load and validate all projects from data/projects.json."""
    with open(DATA_DIR / "projects.json", encoding="utf-8") as f:
        raw = json.load(f)
    return [Project(**item) for item in raw]


def load_announcements() -> list[Announcement]:
    """Load and validate all announcements from data/announcements.json."""
    with open(DATA_DIR / "announcements.json", encoding="utf-8") as f:
        raw = json.load(f)
    return [Announcement(**item) for item in raw]


def load_profile() -> Profile:
    """Load and validate the profile from data/profile.json."""
    with open(DATA_DIR / "profile.json", encoding="utf-8") as f:
        raw = json.load(f)
    return Profile(**raw)
