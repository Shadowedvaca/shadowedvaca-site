# Phase UI-4 — Artifact Proxy Route

**Branch:** `ideation-ui-upgrade` (off `main`)
**Prereq:** Phase UI-3 complete (viewer page exists and is deployed).
Read `reference/ideation-ui-upgrade.md` for full context and architecture.

---

## Goal
Add `GET /api/ideas/{idea_id}/artifacts/{artifact_id}` to the sv-site proxy layer.
This lets the viewer page fetch full artifact content (title, type, format, and the actual
content string) through the authenticated API.

The route is built now so the viewer wires up cleanly. It will return 503 until sv-tools
exposes the matching endpoint — the viewer already shows a graceful error in that state.

---

## sv-tools dependency

This route proxies to:
```
GET /api/v1/ideas/{idea_id}/artifacts/{artifact_id}
```
Expected response shape:
```json
{
  "id": 7,
  "title": "Order Process Flow — Mar 2026",
  "artifact_type": "process_flow",
  "content": "...",
  "format": "mermaid",
  "created_at": "2026-03-15T10:22:00"
}
```

Until sv-tools exposes this endpoint, every request returns 503 (from the `httpx.RequestError`
branch). That is correct — the viewer surfaces the error cleanly.

---

## Files Changed
```
src/sv_site/routes/ideas.py
```

No changes to `main.py` — the new route is added to the existing `ideas` router which is
already registered.

---

## Step 1 — Add the route

File: `src/sv_site/routes/ideas.py`

**Find** the end of the `get_idea` route function (the last line of it, just before the end of
the file or the next function):

```python
@router.get("/{idea_id}")
async def get_idea(
    idea_id: str = Path(...),
    _user: dict = Depends(require_auth),
) -> dict:
    ...
```

**Add** the following new route immediately after `get_idea`:

```python
@router.get("/{idea_id}/artifacts/{artifact_id}")
async def get_idea_artifact(
    idea_id: str = Path(...),
    artifact_id: str = Path(...),
    _user: dict = Depends(require_auth),
) -> dict:
    """Proxy to sv-tools artifact detail. Returns full artifact content."""
    is_admin: bool = _user.get("is_admin", False)
    url = f"{_sv_tools_url()}/api/v1/ideas/{idea_id}/artifacts/{artifact_id}"
    headers = _admin_headers() if is_admin else {}

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            return resp.json()
        except httpx.HTTPStatusError as e:
            raise HTTPException(
                status_code=e.response.status_code, detail="sv-tools error"
            )
        except httpx.RequestError:
            raise HTTPException(status_code=503, detail="sv-tools unavailable")
```

No other changes to the file.

---

## Step 2 — Deploy

The static site does not need a rebuild for this phase (no HTML/CSS/JS changed).
Only the FastAPI service needs to restart.

```bash
# Push the branch and let CI/CD deploy, OR manually on the server:
ssh -i ~/.ssh/va_hetzner_openssh deploy@5.78.114.224

cd /opt/shadowedvaca
git pull
source venv/bin/activate
pip install -r requirements.txt   # no new deps; safe to run anyway
sudo systemctl restart shadowedvaca
```

Or trigger via `bash deploy.sh` if you want to push static assets at the same time.

---

## Step 3 — Smoke test

```bash
# From Git Bash — replace TOKEN with a valid JWT from browser localStorage
TOKEN="<your-jwt>"

# Before sv-tools has the endpoint — expect 503
curl -s -w "\n%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "https://shadowedvaca.com/api/ideas/1/artifacts/1"
# Expected: {"detail":"sv-tools unavailable"} \n 503

# After sv-tools exposes the endpoint — expect the artifact object
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  "https://shadowedvaca.com/api/ideas/1/artifacts/1" | python -m json.tool
# Expected: { "id": ..., "title": ..., "artifact_type": ..., "content": ..., "format": ..., "created_at": ... }
```

Once sv-tools is ready, open an idea in the board that has artifacts, click an artifact link,
and confirm the viewer renders the content correctly (markdown, mermaid, or HTML).

---

## Full deploy checklist (all four phases)

Run this after Phase UI-4 is deployed to confirm the full feature end-to-end:

- [ ] Cards show full pitch text (no truncation at 3 lines)
- [ ] Long titles truncate with ellipsis; badges stay on-screen
- [ ] Tags collapse to 1 line; `···` toggle appears only when needed; state persists per-card
- [ ] "N docs · M artifacts" plain text in badge area (or nothing when both are zero)
- [ ] Clicking a card opens the expanded overlay (not the old inline reader)
- [ ] Overlay shows full pitch + all tags
- [ ] Doc links in overlay: first shown, `··· N more` expands, each opens viewer in new tab
- [ ] Viewer renders markdown documents correctly (headings, code, tables, lists)
- [ ] Viewer auth-gates: incognito → redirect to login
- [ ] Artifact links in overlay open viewer; renders mermaid / markdown / HTML by format
- [ ] `GET /api/ideas/{id}/artifacts/{artifact_id}` returns 503 gracefully pre-sv-tools
- [ ] After sv-tools endpoint is live: artifact viewer renders content correctly

---

## Done
Phase 4 complete when the route is deployed and smoke test passes.

`ideation-ui-upgrade` is now feature-complete. Merge to `main`, then begin
`ideation-voting` (see `reference/ideation-voting-plan.md`).
