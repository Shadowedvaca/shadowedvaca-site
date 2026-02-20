from typing import Optional

from pydantic import BaseModel


class SocialLink(BaseModel):
    label: str
    url: str


class Profile(BaseModel):
    name: str
    company: str
    location: str
    email: str
    tagline: str              # shown on sticky note
    bottom_bar_tagline: str   # shown in bottom status bar
    calendly_url: Optional[str] = None   # booking link shown on sticky note
    social_links: list[SocialLink] = []   # shown in terminal contact section
    funding_links: list[SocialLink] = []  # shown in terminal funding section
