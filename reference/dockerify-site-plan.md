# Dockerify Shadowedvaca Site — Implementation Plan

## Feature Branch: `dockerify-site`

> **Git & CI/CD standard:** See `reference/git-cicd-workflow.md` for the canonical workflow. This plan follows that standard — three GitHub Actions workflows targeting dev (manual), test (on push to main), and prod (on `prod-*` tag).

## Context

The shadowedvaca site currently runs as a bare systemd service (`shadowedvaca.service`) — uvicorn on port 8050, installed at `/opt/shadowedvaca`, backed by a bare Postgres on localhost:5432. Static HTML is served directly by nginx from `/var/www/shadowedvaca.com/`.

The goal is to fully Dockerize this into consistent dev/test/prod environments matching the pullallthethings pattern. This is the right time to do it — doing it mid-feature-work later is painful (ask the guild site).

The site has two components:
1. **Static frontend** — built by `packages/site/build.py` → `dist/`, served by nginx directly
2. **sv_site FastAPI backend** — Python/FastAPI, PostgreSQL-backed, routes: auth, admin, ideas, feedback ingest/read

## Server: `5.78.114.224` (Hetzner CPX11)

- 2 vCPU, 2 GiB RAM, Ubuntu 24.04
- SSH: `ssh -i ~/.ssh/va_hetzner_openssh root@5.78.114.224`
- Currently ~1 GiB swap in use (under pressure — upgrade recommended before Phase F.D.4)

## Port Assignments (shadowedvaca)

| Env  | App Port | DB Port |
|------|----------|---------|
| dev  | 8053     | 5455    |
| test | 8054     | 5456    |
| prod | 8055     | 5457    |

(Current bare systemd service uses 8050 — kept running until Phase F.D.4 prod cutover.)

## Directory Layout (server)

```
/opt/shadowedvaca-site/
├── dev/
│   ├── docker-compose.yml
│   └── .env
├── test/
│   ├── docker-compose.yml
│   └── .env
└── prod/
    ├── docker-compose.yml
    └── .env

/var/www/shadowedvaca.com/          ← prod static (current, unchanged)
/var/www/dev.shadowedvaca.com/      ← dev static
/var/www/test.shadowedvaca.com/     ← test static
```

## Nginx Subdomains

| Env  | Domain                      |
|------|-----------------------------|
| prod | `shadowedvaca.com`          |
| dev  | `dev.shadowedvaca.com`      |
| test | `test.shadowedvaca.com`     |

---

## Phase F.D.0 — Server Cleanup

**Goal:** Remove the orphaned sv-tools Docker container and its nginx config. It was moved to its own server; the container on this machine is wasting ~262 MiB RAM.

**Context needed:** Server SSH access only. No repo changes.

### Steps

1. On the server, stop and remove the sv-tools container and its image:
   ```bash
   docker stop sv-tools
   docker rm sv-tools
   docker rmi $(docker images | grep sv-tools | awk '{print $3}')
   ```

2. Remove the nginx config and reload:
   ```bash
   rm /etc/nginx/sites-enabled/sv-tools
   nginx -t && systemctl reload nginx
   ```

3. The SSL cert for `sv-tools.shadowedvaca.com` can be left in place (it auto-renews harmlessly) or revoked — leave it for now.

4. Verify free memory improved:
   ```bash
   free -h
   docker ps
   ```

### Verification
- `docker ps` does not show `sv-tools`
- `free -h` shows ~260 MiB reclaimed
- `curl -I https://sv-tools.shadowedvaca.com` returns 502 (nginx is up, proxy target is gone) — that's expected

---

## Phase F.D.1 — Docker Foundation (Repo Work)

**Goal:** Create the Dockerfile and docker-compose templates for the sv_site FastAPI app. No server deployment yet — this is all repo scaffolding.

**Branch:** `dockerify-site` (create from `main`)

**Context needed:** This repo. Understand that `src/sv_site/` is a FastAPI app using PostgreSQL (asyncpg), loaded via `PYTHONPATH=/opt/shadowedvaca/src`. Settings come from pydantic-settings reading a `.env` file. `requirements.txt` at repo root lists all deps.

### Files to create

#### `Dockerfile`

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY src/ ./src/

ENV PYTHONPATH=/app/src

EXPOSE 8000

CMD ["uvicorn", "sv_site.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

#### `docker/dev/docker-compose.yml`

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: shadowedvaca_dev
      POSTGRES_USER: shadowedvaca
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - db_data:/var/lib/postgresql/data
    ports:
      - "5455:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shadowedvaca -d shadowedvaca_dev"]
      interval: 10s
      timeout: 5s
      retries: 5

  app:
    image: shadowedvaca-site-dev
    build:
      context: ../..
      dockerfile: Dockerfile
    restart: unless-stopped
    depends_on:
      db:
        condition: service_healthy
    env_file: .env
    ports:
      - "8053:8000"

volumes:
  db_data:
```

#### `docker/test/docker-compose.yml`

Same structure as dev, but:
- DB name: `shadowedvaca_test`
- Image: `shadowedvaca-site-test`
- App port: `8054:8000`
- DB port: `5456:5432`

#### `docker/prod/docker-compose.yml`

Same structure, but:
- DB name: `shadowedvaca_prod`
- Image: `shadowedvaca-site-prod`
- App port: `8055:8000`
- DB port: `5457:5432`
- `restart: always` instead of `unless-stopped`

#### `.env.example` (repo root, committed)

```
DATABASE_URL=postgresql+asyncpg://shadowedvaca:CHANGE_ME@db:5432/shadowedvaca_dev
DB_PASSWORD=CHANGE_ME
SECRET_KEY=CHANGE_ME
ENVIRONMENT=development
SITE_URL=https://dev.shadowedvaca.com
CORS_ORIGINS=https://dev.shadowedvaca.com
SV_TOOLS_URL=https://sv-tools.shadowedvaca.com
SV_TOOLS_API_KEY=
FEEDBACK_INGEST_KEY=CHANGE_ME
ANTHROPIC_API_KEY=
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=480
```

Note: actual `.env` files per environment live on the server at `/opt/shadowedvaca-site/{env}/.env` — never committed.

#### `docker/` directory structure

```
docker/
├── dev/
│   └── docker-compose.yml
├── test/
│   └── docker-compose.yml
└── prod/
    └── docker-compose.yml
```

### Verification
- `docker build -t shadowedvaca-site-dev .` succeeds locally
- `docker/dev/docker-compose.yml` passes `docker-compose config` validation

---

## Phase F.D.2 — Dev Environment (Server Deploy)

**Goal:** Get `dev.shadowedvaca.com` running as a Docker stack with its own DB. Static files served by nginx from `/var/www/dev.shadowedvaca.com/`.

**Context needed:** Phase F.D.1 must be merged or available on the server. Hetzner server access.

### Steps

**On server:**

1. Create directory structure:
   ```bash
   mkdir -p /opt/shadowedvaca-site/dev
   mkdir -p /var/www/dev.shadowedvaca.com
   ```

2. Copy `docker/dev/docker-compose.yml` from repo to `/opt/shadowedvaca-site/dev/`

3. Create `/opt/shadowedvaca-site/dev/.env` (do NOT commit this):
   ```
   DATABASE_URL=postgresql+asyncpg://shadowedvaca:<password>@db:5432/shadowedvaca_dev
   DB_PASSWORD=<password>
   SECRET_KEY=<generated>
   ENVIRONMENT=development
   SITE_URL=https://dev.shadowedvaca.com
   CORS_ORIGINS=https://dev.shadowedvaca.com
   FEEDBACK_INGEST_KEY=<key>
   ANTHROPIC_API_KEY=<key>
   ```

4. Build and start:
   ```bash
   cd /opt/shadowedvaca-site/dev
   docker compose build
   docker compose up -d
   ```

5. Run DB migrations:
   ```bash
   docker compose exec app python -m alembic upgrade head
   # (or however migrations are run — check alembic/ or migrations/ in repo)
   ```

6. Create nginx config `/etc/nginx/sites-available/dev.shadowedvaca.com.conf`:
   ```nginx
   server {
       listen 80;
       server_name dev.shadowedvaca.com;
       return 301 https://$host$request_uri;
   }

   server {
       listen 443 ssl;
       server_name dev.shadowedvaca.com;

       ssl_certificate /etc/letsencrypt/live/dev.shadowedvaca.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/dev.shadowedvaca.com/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

       root /var/www/dev.shadowedvaca.com;
       index index.html;
       error_page 404 /404.html;

       location /api/ {
           proxy_pass http://127.0.0.1:8053;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           proxy_read_timeout 30s;
       }

       location / {
           try_files $uri $uri/ =404;
       }
   }
   ```

7. Get SSL cert:
   ```bash
   certbot certonly --nginx -d dev.shadowedvaca.com
   ```

8. Enable and reload:
   ```bash
   ln -s /etc/nginx/sites-available/dev.shadowedvaca.com.conf /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```

9. Deploy static files to dev:
   - Update `deploy.sh` or add a `deploy-dev.sh` that SCPs `dist/` to `/var/www/dev.shadowedvaca.com/`

### Verification
- `curl https://dev.shadowedvaca.com/api/health` → `{"ok": true}`
- `docker ps` shows `shadowedvaca-site-dev-app-1` and `shadowedvaca-site-dev-db-1`
- Static site loads at `https://dev.shadowedvaca.com`

---

## Phase F.D.3 — Test Environment (Server Deploy)

**Goal:** Get `test.shadowedvaca.com` running as a Docker stack. Mirrors Phase F.D.2 exactly but using test config.

**Context needed:** Phase F.D.2 complete and working. Same process, different env values.

### Steps

Same as Phase F.D.2 with these substitutions:

| Phase F.D.2 value | Phase F.D.3 value |
|-------------------|-------------------|
| `dev` | `test` |
| `8053` | `8054` |
| `5455` | `5456` |
| `shadowedvaca_dev` | `shadowedvaca_test` |
| `dev.shadowedvaca.com` | `test.shadowedvaca.com` |
| `/var/www/dev.shadowedvaca.com` | `/var/www/test.shadowedvaca.com` |

Use separate secrets/keys from dev (don't share keys between envs).

### Verification
- `curl https://test.shadowedvaca.com/api/health` → `{"ok": true}`
- `docker ps` shows test containers alongside dev containers

---

## Phase F.D.4 — Prod Cutover

**Goal:** Migrate production from bare systemd service to Docker. This is the riskiest phase — existing prod data must be preserved.

**Context needed:** Phases F.D.1–F.D.3 complete. Server upgrade to CPX21 (4 GiB RAM) **strongly recommended before this phase** — the current server is already swapping.

### Pre-requisites
- [ ] Server upgraded to CPX21 (or at minimum F.D.0 cleanup done and memory confirmed adequate)
- [ ] Dev and test envs confirmed stable
- [ ] Production DB backup taken

### Steps

1. **Back up prod database** (the bare postgres on localhost:5432):
   ```bash
   pg_dump -U shadowedvaca shadowedvaca > /opt/shadowedvaca-backup-$(date +%Y%m%d).sql
   ```

2. Create `/opt/shadowedvaca-site/prod/` and `.env` with prod values (same keys as current `/opt/shadowedvaca/.env`, update `DATABASE_URL` to point to `db:5432`).

3. Start the prod Docker stack (DB only first):
   ```bash
   cd /opt/shadowedvaca-site/prod
   docker compose up -d db
   ```

4. Restore the database into the new container:
   ```bash
   cat /opt/shadowedvaca-backup-YYYYMMDD.sql | docker compose exec -T db psql -U shadowedvaca -d shadowedvaca_prod
   ```

5. Start the app container and verify it connects:
   ```bash
   docker compose up -d app
   curl http://127.0.0.1:8055/api/health
   ```

6. Update nginx `shadowedvaca.com` config — change `proxy_pass` from `http://127.0.0.1:8050` to `http://127.0.0.1:8055`:
   ```bash
   nginx -t && systemctl reload nginx
   ```

7. Smoke test production:
   - `curl https://shadowedvaca.com/api/health`
   - Log into the ideas board
   - Verify feedback routes work

8. Stop and disable the old systemd service:
   ```bash
   systemctl stop shadowedvaca
   systemctl disable shadowedvaca
   ```

9. (Optional, after 1 week stable) Remove old install:
   ```bash
   rm -rf /opt/shadowedvaca
   ```

### Rollback Plan
If anything breaks in step 6+:
```bash
# Revert nginx proxy_pass back to 8050, reload nginx
# systemctl start shadowedvaca
```
The old systemd service stays untouched until step 8, so rollback is fast.

### Verification
- `docker ps` shows prod app + db running
- `systemctl status shadowedvaca` shows `inactive (dead)`
- All production routes functional
- No swap pressure increase after migration

---

## Phase F.D.5 — GitHub Actions CI/CD

**Goal:** Replace the manual `deploy.sh` with three GitHub Actions workflows matching the standard in `reference/git-cicd-workflow.md`. After this phase, the deploy process is automated and branch-gated.

**Context needed:** Phases F.D.1–F.D.4 complete (all Docker environments running). GitHub repo must have the following secrets set under Settings → Secrets → Actions:

| Secret | Value |
|--------|-------|
| `DEPLOY_HOST` | `5.78.114.224` |
| `DEPLOY_USER` | `deploy` (or `root`) |
| `DEPLOY_SSH_KEY` | Contents of `~/.ssh/va_hetzner_openssh` |

### Workflow: `deploy-dev.yml` (manual dispatch)

**Trigger:** `workflow_dispatch` with a `branch` input (defaults to current branch)
**Target:** dev environment on server

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy → Dev

on:
  workflow_dispatch:
    inputs:
      branch:
        description: Branch to deploy
        required: true
        default: main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          ref: ${{ github.event.inputs.branch }}

      - name: Build static site
        run: python packages/site/build.py

      - name: Copy static files to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          source: dist/
          target: /var/www/dev.shadowedvaca.com/
          strip_components: 1

      - name: Rebuild and restart dev app container
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/shadowedvaca-site/dev
            # Sync source (copy changed files from a checkout or git pull a deploy key)
            # Option A: server has a git checkout
            git pull origin ${{ github.event.inputs.branch }}
            docker compose build app
            docker compose up -d app

      - name: Health check
        run: |
          sleep 5
          curl --fail https://dev.shadowedvaca.com/api/health
```

> **Note on source sync:** The workflow above assumes the server has a git checkout of the repo at `/opt/shadowedvaca-site/dev`. If not, use SCP to copy `src/` instead of `git pull`. Add a deploy SSH key to the GitHub repo for the git-pull approach.

### Workflow: `deploy-test.yml` (auto on push to main)

**Trigger:** `push` to `main` branch
**Target:** test environment

```yaml
# .github/workflows/deploy-test.yml
name: Deploy → Test

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build static site
        run: python packages/site/build.py

      - name: Copy static files to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          source: dist/
          target: /var/www/test.shadowedvaca.com/
          strip_components: 1

      - name: Rebuild and restart test app container
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/shadowedvaca-site/test
            git pull origin main
            docker compose build app
            docker compose up -d app

      - name: Health check
        run: |
          sleep 5
          curl --fail https://test.shadowedvaca.com/api/health
```

### Workflow: `deploy.yml` (prod, on `prod-*` tag)

**Trigger:** `push` of a tag matching `prod-v*`
**Target:** prod environment

```yaml
# .github/workflows/deploy.yml
name: Deploy → Prod

on:
  push:
    tags:
      - 'prod-v*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build static site
        run: python packages/site/build.py

      - name: Copy static files to server
        uses: appleboy/scp-action@v0.1.7
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          source: dist/
          target: /var/www/shadowedvaca.com/
          strip_components: 1

      - name: Rebuild and restart prod app container
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/shadowedvaca-site/prod
            git pull origin main
            docker compose build app
            docker compose up -d app

      - name: Health check
        run: |
          sleep 5
          curl --fail https://shadowedvaca.com/api/health
```

### GitHub Repo Setup Required

Before these workflows run:
1. Set the three secrets listed above under repo Settings → Secrets → Actions
2. If using `git pull` on server: add a GitHub deploy key (read-only) to the repo, and set the corresponding private key as a secret `DEPLOY_GIT_KEY`; configure the server checkout to use it
3. Python 3.11+ must be available in the GH Actions runner — add a setup step if needed:
   ```yaml
   - uses: actions/setup-python@v5
     with:
       python-version: '3.12'
   - run: pip install -r requirements.txt
   ```

### Verification
- Push to a feature branch, manually trigger `deploy-dev.yml` → dev updates
- Merge to main → test auto-deploys within ~2 minutes
- `git tag prod-v0.2.0 && git push origin prod-v0.2.0` → prod deploys

---

## Phase F.D.6 — Remove Legacy Deploy Script

**Goal:** Once CI/CD is live (Phase F.D.5), retire `deploy.sh`. It was manual SCP — the GitHub Actions workflows replace it entirely.

**Context needed:** Phase F.D.5 complete and all three workflows confirmed working.

### Steps

1. Delete `deploy.sh` from the repo
2. Update `README.md` to document the new deploy process:
   - Dev: `gh workflow run deploy-dev.yml -f branch=<branch-name>`
   - Test: automatic on merge to `main`
   - Prod: `git tag prod-vX.Y.Z && git push origin prod-vX.Y.Z`

### Verification
- `deploy.sh` no longer exists in the repo
- README has accurate deploy instructions

---

## Phase F.D.7 — Server Upgrade (Recommended)

**Goal:** Upgrade the Hetzner server from CPX11 (2 vCPU / 2 GiB RAM) to CPX21 (3 vCPU / 4 GiB RAM) to give headroom for all planned Docker stacks.

**When:** Do this before Phase F.D.4 (prod cutover). Can be done anytime after F.D.0.

### Steps (Hetzner Cloud Console)

1. Log into `console.hetzner.cloud`
2. Select the server → **Rescale** → Choose CPX21
3. Server must be powered off for rescale (~2 min downtime)
4. Power it back on — all data preserved

### Why CPX21
Current: 7 containers using ~709 MiB, plus ~600 MiB OS/nginx/etc = ~1.3 GiB used, **1 GiB swap active**.

Projected final state (all three sites fully Dockerized):
- shadowedvaca: 3 app + 3 db containers (~450 MiB)
- guild-portal: 3 app + 3 db containers (~700 MiB — already running)
- saltallthethings: 3 app + 3 db containers (~450 MiB — future)
- OS + nginx overhead: ~300 MiB
- **Total: ~1.9 GiB** — fits in 4 GiB with comfortable headroom

CPX21 pricing: ~€8.21/month vs €4.45/month for CPX11.

---

## Summary Checklist

Recommended execution order:

| Phase | Description | Touches Server | Risk |
|-------|-------------|----------------|------|
| F.D.0 | Remove orphaned sv-tools container | Yes | Low — isolated container |
| F.D.1 | Docker foundation (repo scaffolding) | No | Low |
| F.D.2 | Dev environment live | Yes | Low — new subdomain |
| F.D.3 | Test environment live | Yes | Low — new subdomain |
| F.D.7 | Server upgrade to CPX21 | Yes | Low (Hetzner resize) |
| F.D.4 | Prod cutover | Yes | **Medium — prod migration, plan rollback** |
| F.D.5 | GitHub Actions CI/CD | Repo + server | Low |
| F.D.6 | Remove legacy deploy.sh | Repo only | Low |
