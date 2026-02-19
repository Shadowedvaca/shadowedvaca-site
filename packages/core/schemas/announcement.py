from pydantic import BaseModel


class Announcement(BaseModel):
    id: str
    text: str
    date: str
    active: bool
    priority: int
