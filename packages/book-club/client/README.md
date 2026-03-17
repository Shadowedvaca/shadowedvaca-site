# Book Club — React Frontend

React 18 + Vite + Tailwind CSS frontend for the Book Club app.

## Dev server

From the repo root (`packages/book-club/`):

```bash
npm run dev
```

Client runs on `http://localhost:5173`. Requires the Express API to be running on port 3001.

## Pages

| Route | Page |
|-------|------|
| `/` | Login / Register |
| `/dashboard` | Dashboard (open round, winning book, upcoming meeting) |
| `/rounds/:id` | Round detail (proposals, voting, meetings) |
| `/rounds` | Past rounds archive |
| `/profile` | Edit profile and notification prefs |
| `/admin` | Admin panel (invite codes, round management, notifications) |

## Environment

Copy `.env.example` to `.env` and set `VITE_API_URL` if the API runs on a non-default port:

```
VITE_API_URL=http://localhost:3001/api
```

## Build

```bash
npm run build
```

Output goes to `dist/`. Serve statically or configure Nginx to proxy the API.
