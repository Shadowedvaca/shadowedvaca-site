from typing import Literal, Optional

from pydantic import BaseModel


class MetaTag(BaseModel):
    label: str
    style: Optional[str] = None  # "live", "soon", "concept", "archived", or None (plain)


class ProjectLink(BaseModel):
    label: str
    url: str
    style: Literal["primary", "secondary"] = "secondary"


class MediaConfig(BaseModel):
    type: Literal["video", "placeholder", "image"]
    embed_url: Optional[str] = None   # for type="video" — YouTube embed URL
    image_url: Optional[str] = None   # for type="image" — logo or banner image URL
    icon: Optional[str] = None        # for type="placeholder" — decorative emoji/char
    alt: Optional[str] = None         # for type="placeholder" or "image" — caption/alt text


class Project(BaseModel):
    id: str                           # unique slug, used as stage-view HTML ID
    name: str                         # display name
    tagline: str                      # one-liner under the title
    description: list[str]            # paragraphs of body text
    status: Literal["live", "launching", "in-progress", "concept", "archived"]
    category: str                     # label above title, e.g. "Featured Project"
    section: Literal["active", "websites", "games", "utilities", "creative", "printing", "archive"]
    terminal_desc: str                # short line shown in terminal sidebar
    meta_tags: list[MetaTag]          # tag row under the title
    links: list[ProjectLink]          # action buttons
    features: Optional[list[str]] = None   # bullet list (for systems)
    media: Optional[MediaConfig] = None    # video or placeholder above description
    sort_order: int
    featured: bool = False            # if True, shown by default on load
