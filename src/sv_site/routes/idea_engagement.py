"""
Outbound engagement API for sv-tools.

Exposes vote, favorite, and access-override data so sv-tools can map
sv-site users (People) to the ideas they have engaged with or can see.

Auth: X-API-Key header must match sv_tools_callback_key in settings.
This is a server-to-server surface — no JWT, no user session.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Path
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from sv_site.config import get_settings
from sv_site.database import get_db
from sv_site.models import IdeaAccessOverride, IdeaFavorite, IdeaVote, User

router = APIRouter(prefix="/api/external/ideas", tags=["Idea Engagement (External)"])


# ---------------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------------


def _require_callback_key(x_api_key: str = Header(..., alias="X-API-Key")) -> None:
    key = get_settings().sv_tools_callback_key
    if not key or x_api_key != key:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")


# ---------------------------------------------------------------------------
# Shared query helpers
# ---------------------------------------------------------------------------


async def _fetch_engagement(idea_ids: list[int] | None, db: AsyncSession) -> dict:
    """
    Return engagement data keyed by idea_id.

    If idea_ids is None, returns data for all ideas that have any activity
    (votes, favorites, or overrides). Otherwise scoped to the given IDs.
    """

    # --- Vote aggregates ---
    vote_q = select(
        IdeaVote.idea_id,
        func.sum(IdeaVote.vote).label("score"),
        func.sum(case((IdeaVote.vote == 1, 1), else_=0)).label("ups"),
        func.sum(case((IdeaVote.vote == -1, 1), else_=0)).label("downs"),
    ).group_by(IdeaVote.idea_id)
    if idea_ids is not None:
        vote_q = vote_q.where(IdeaVote.idea_id.in_(idea_ids))
    vote_rows = (await db.execute(vote_q)).all()

    # --- Per-voter detail ---
    voter_q = (
        select(IdeaVote.idea_id, IdeaVote.vote, User.id.label("user_id"), User.username)
        .join(User, User.id == IdeaVote.user_id)
    )
    if idea_ids is not None:
        voter_q = voter_q.where(IdeaVote.idea_id.in_(idea_ids))
    voter_detail: dict[int, list] = {}
    for row in (await db.execute(voter_q)).all():
        voter_detail.setdefault(row.idea_id, []).append(
            {"user_id": row.user_id, "username": row.username, "vote": row.vote}
        )

    # --- Favorite aggregates ---
    fav_q = select(
        IdeaFavorite.idea_id,
        func.count().label("count"),
    ).group_by(IdeaFavorite.idea_id)
    if idea_ids is not None:
        fav_q = fav_q.where(IdeaFavorite.idea_id.in_(idea_ids))
    fav_rows = (await db.execute(fav_q)).all()

    # --- Per-favorite detail ---
    fav_user_q = (
        select(IdeaFavorite.idea_id, User.id.label("user_id"), User.username)
        .join(User, User.id == IdeaFavorite.user_id)
    )
    if idea_ids is not None:
        fav_user_q = fav_user_q.where(IdeaFavorite.idea_id.in_(idea_ids))
    fav_detail: dict[int, list] = {}
    for row in (await db.execute(fav_user_q)).all():
        fav_detail.setdefault(row.idea_id, []).append(
            {"user_id": row.user_id, "username": row.username}
        )

    # --- Access overrides ---
    override_q = (
        select(
            IdeaAccessOverride.idea_id,
            IdeaAccessOverride.can_view,
            User.id.label("user_id"),
            User.username,
        )
        .join(User, User.id == IdeaAccessOverride.user_id)
    )
    if idea_ids is not None:
        override_q = override_q.where(IdeaAccessOverride.idea_id.in_(idea_ids))
    override_detail: dict[int, list] = {}
    for row in (await db.execute(override_q)).all():
        override_detail.setdefault(row.idea_id, []).append(
            {"user_id": row.user_id, "username": row.username, "can_view": row.can_view}
        )

    # --- Collect all idea IDs that appear in any table ---
    all_ids: set[int] = (
        {r.idea_id for r in vote_rows}
        | {r.idea_id for r in fav_rows}
        | set(override_detail.keys())
    )
    if idea_ids is not None:
        all_ids |= set(idea_ids)

    result: dict[int, dict] = {}
    for iid in sorted(all_ids):
        vote_row = next((r for r in vote_rows if r.idea_id == iid), None)
        fav_row = next((r for r in fav_rows if r.idea_id == iid), None)
        result[iid] = {
            "idea_id": iid,
            "votes": {
                "score":  int(vote_row.score or 0) if vote_row else 0,
                "ups":    int(vote_row.ups   or 0) if vote_row else 0,
                "downs":  int(vote_row.downs or 0) if vote_row else 0,
                "voters": voter_detail.get(iid, []),
            },
            "favorites": {
                "count":        int(fav_row.count) if fav_row else 0,
                "favorited_by": fav_detail.get(iid, []),
            },
            "access_overrides": override_detail.get(iid, []),
        }
    return result


# ---------------------------------------------------------------------------
# GET /api/external/ideas  — all ideas with any engagement data
# ---------------------------------------------------------------------------


@router.get("")
async def get_all_engagement(
    _: None = Depends(_require_callback_key),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return engagement data for every idea that has votes, favorites, or access overrides.

    sv-tools uses this to map its ideas to sv-site users (People).
    The `access_overrides` list contains explicit grants/denials only; sv-tools
    should combine these with each idea's own `public` flag to determine full visibility.
    """
    data = await _fetch_engagement(None, db)
    return {"ideas": list(data.values())}


# ---------------------------------------------------------------------------
# GET /api/external/ideas/{idea_id}  — single idea
# ---------------------------------------------------------------------------


@router.get("/{idea_id}")
async def get_idea_engagement(
    idea_id: int = Path(...),
    _: None = Depends(_require_callback_key),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Return engagement data for a single idea.

    Returns the engagement record even if the idea has no activity yet
    (all counts will be zero, lists will be empty).
    """
    data = await _fetch_engagement([idea_id], db)
    return data.get(idea_id, {
        "idea_id": idea_id,
        "votes": {"score": 0, "ups": 0, "downs": 0, "voters": []},
        "favorites": {"count": 0, "favorited_by": []},
        "access_overrides": [],
    })
