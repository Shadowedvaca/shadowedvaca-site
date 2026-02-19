from typing import Literal

from pydantic import BaseModel


class Announcement(BaseModel):
    id: str
    text: str
    dot_style: Literal["live", "soon"]  # "live" = green dot, "soon" = amber dot
    active: bool
    sort_order: int
