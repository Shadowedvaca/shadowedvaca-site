from pydantic import BaseModel


class Role(BaseModel):
    title: str
    org: str


class Profile(BaseModel):
    name: str
    title: str
    company: str
    location: str
    bio: str
    skills: list[str]
    roles: list[Role]
    contact: dict[str, str]
