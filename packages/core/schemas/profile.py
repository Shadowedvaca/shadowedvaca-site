from pydantic import BaseModel


class Profile(BaseModel):
    name: str
    company: str
    location: str
    email: str
    tagline: str              # shown on sticky note
    bottom_bar_tagline: str   # shown in bottom status bar
