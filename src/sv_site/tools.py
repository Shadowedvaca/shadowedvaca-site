"""Hub tool registry.

Each entry describes a tool card that can appear in the hub.
- slug:   unique identifier, stored in user_permissions
- locked: if True, always granted; cannot be removed from a user
- admin_only: if True, only visible to is_admin users (not permission-controlled)
"""

TOOLS: list[dict] = [
    {
        "slug": "settings",
        "name": "Settings",
        "description": "Password and account preferences",
        "path": "/hub/settings/",
        "locked": True,
        "admin_only": False,
    },
    {
        "slug": "ideas",
        "name": "Ideation Board",
        "description": "Browse and search project ideas — spark to ship",
        "path": "/ideas/",
        "locked": False,
        "admin_only": False,
    },
    {
        "slug": "customer_feedback",
        "name": "Customer Feedback",
        "description": "Review feedback submitted across all apps.",
        "path": "/hub/feedback/",
        "locked": False,
        "admin_only": True,
    },
]

# Slugs that are always granted regardless of user_permissions rows
LOCKED_SLUGS: set[str] = {t["slug"] for t in TOOLS if t["locked"]}

# Slugs that are valid to store in user_permissions (non-locked, non-admin-only)
GRANTABLE_SLUGS: set[str] = {
    t["slug"] for t in TOOLS if not t["locked"] and not t["admin_only"]
}
