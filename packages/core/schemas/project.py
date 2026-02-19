from typing import Literal, Optional
from pydantic import BaseModel


class Project(BaseModel):
    id: str
    name: str
    tagline: str
    description: str
    status: Literal["shipped", "live", "launching", "in-progress", "concept"]
    category: Literal["game", "podcast", "wow", "tool"]
    featured: bool
    visibility: Literal["public", "teaser", "hidden"]
    links: dict[str, Optional[str]]
    launch_date: Optional[str] = None
    image: Optional[str] = None
    sort_order: int
