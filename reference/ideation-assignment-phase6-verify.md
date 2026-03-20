# Phase 6 — Integration Verification

## Context

This is phase 6 of 6 for the ideation board per-user access control feature. Read `reference/ideation-assignment-plan.md` for the full picture.

**Prereqs:** All phases 1–5 complete and deployed.

This phase is verification only. No code changes. Walk through the full end-to-end flow and confirm everything works together.

---

## Checklist

### Database

```bash
ssh -i ~/.ssh/va_hetzner_openssh deploy@5.78.114.224
psql "postgresql://sv_site_user:SvSiteDb2026@127.0.0.1:5432/sv_site_db"
\d shadowedvaca.idea_access_overrides
```

Expected: 5 columns (idea_id, user_id, can_view, created_at, updated_at), primary key on both, two indexes.

---

### API Endpoints (use a valid admin JWT from browser localStorage)

```bash
TOKEN="<paste from browser>"

# GET — returns user list for a known idea
curl -s -H "Authorization: Bearer $TOKEN" \
  https://shadowedvaca.com/api/admin/ideas/30/access | python3 -m json.tool
# Expected: {"idea_id": 30, "users": [...]} — all overrides null initially

# PUT — grant access
curl -s -X PUT \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"can_view": true}' \
  https://shadowedvaca.com/api/admin/ideas/30/access/3
# Expected: {"ok": true, ...}

# GET again — confirm override is set
curl -s -H "Authorization: Bearer $TOKEN" \
  https://shadowedvaca.com/api/admin/ideas/30/access | python3 -m json.tool
# Expected: user 3 now has "override": true

# DELETE — remove override
curl -s -X DELETE \
  -H "Authorization: Bearer $TOKEN" \
  https://shadowedvaca.com/api/admin/ideas/30/access/3
# Expected: {"ok": true}

# GET again — confirm override is null
curl -s -H "Authorization: Bearer $TOKEN" \
  https://shadowedvaca.com/api/admin/ideas/30/access | python3 -m json.tool
# Expected: user 3 back to "override": null
```

---

### Access Enforcement (non-admin browser test)

**Test 1 — Revoke access on a public idea:**
1. As admin, PUT `can_view: false` for a non-admin user on a public idea.
2. Log in as that user.
3. Confirm the idea does NOT appear in their list.
4. Confirm direct URL `/ideas/` does not show it.
5. As admin, DELETE the override.
6. As that user, refresh — idea reappears.

**Test 2 — Grant access to a secret idea:**
1. Pick a secret idea (visible only to admin).
2. As admin, PUT `can_view: true` for a non-admin user.
3. Log in as that user.
4. Confirm the secret idea now appears in their list.
5. As admin, DELETE the override.
6. As that user, refresh — secret idea disappears.

**Test 3 — Admin is unaffected:**
1. Set any override (PUT or DELETE) for any user on any idea.
2. Log in as admin.
3. Confirm admin still sees all ideas regardless of overrides.

---

### Frontend Panel (browser)

1. Log in as admin — "Access ▾" button visible on every card.
2. Log in as non-admin — "Access ▾" button NOT visible.
3. Admin: open a panel — user list loads, checkboxes reflect current state.
4. Close and reopen the same panel — loads instantly from cache (no network request visible in devtools).
5. Uncheck a user on a public idea — checkbox briefly disables, panel refreshes, amber dot appears next to username.
6. Recheck that user — dot disappears.
7. Click anywhere else on the card (not the panel or toggle) — overlay opens normally.
8. Click inside the panel or on the toggle — overlay does NOT open.

---

### Edge Cases

- **User deleted:** Delete a non-admin user via the hub users page. Confirm their override rows are gone: `SELECT * FROM shadowedvaca.idea_access_overrides WHERE user_id = <deleted_id>` returns 0 rows.
- **No non-admin users:** If only admins exist, the access panel shows "No non-admin users." instead of an empty list.
- **sv-tools down:** The ideas list returns 503 as before — the override check is not reached.
- **Non-admin hits admin endpoint:** `GET /api/admin/ideas/30/access` with non-admin token returns 403.

---

## Done When

All checklist items pass. The feature is complete.
