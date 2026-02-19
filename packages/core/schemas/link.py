from pydantic import BaseModel


class Link(BaseModel):
    label: str
    url: str
    platform: str
    category: str
