# Git & CI/CD Workflow — Personal Standard

This document defines the canonical git and deployment workflow for all projects.
Drop a reference to this file in each project's CLAUDE.md so the rules travel with you.

---

## Philosophy

- **Branches are cheap. Direct commits to main are not.**
- Every environment has a gate. Dev is the sandbox. Test is the integration check. Prod is the contract.
- Hotfixes are legitimate — they need their own fast lane, not a different philosophy.
- main should always reflect what is in or about to go to test/prod. Keep it clean.

---

## Server Architecture

Three isolated environment tiers are required. Development and test run on
separate shared-platform servers; production is per-project and dedicated.

### Server Inventory

| Environment | SSH Alias | Region | Spec | Purpose |
|-------------|-----------|--------|------|---------|
| **dev** | `shared-dev-platforms` | Falkenstein, DE | CPX22 (2vCPU / 4GB / 80GB) | Shared sandbox. All dev environments. |
| **test** | `shared-test-platforms` | Falkenstein, DE | CPX22 (2vCPU / 4GB / 80GB) | Shared integration gate. All test environments. |
| **prod** | project-specific (e.g. `hetzner`) | Hillsboro, OR or Falkenstein | CPX21 / CX32 | Live. Real users/data. |

**Why separate servers:**
- Dev changes (schema experiments, model reloads, failed deploys) cannot cascade to prod or test
- Dev and test remain separate so development changes cannot collide with the
  integration gate
- Shared-host resource controls are common; application state, credentials,
  Compose projects, ports, and deployment ownership remain repository-specific
- Prod is latency-sensitive where applicable; dev/test latency doesn't matter

### SSH Access

The shared GitHub Actions deploy key and personal key are installed on all servers.

```bash
ssh shared-dev-platforms   # shared dev server
ssh shared-test-platforms  # shared test server
ssh hetzner           # example prod alias (PATT)
```

### Port Assignments (Shared Dev / Test Servers)

Each app occupies one port slot. Nginx routes by subdomain to that port. The same port is used on both dev and test — keeps configs symmetric.

| Port | App | Subdomain (dev) | Subdomain (test) | Status |
|------|-----|-----------------|------------------|--------|
| **8100** | Pull All The Things (PATT) | `dev.pullallthethings.com` | `test.pullallthethings.com` | Active |
| **8200** | shadowedvaca.com | `dev.shadowedvaca.com` | `test.shadowedvaca.com` | Active |
| **8300** | Salt All The Things (SATT) | `dev.saltallthethings.com` | `test.saltallthethings.com` | Active |
| **8400** | _(open)_ | — | — | Available |
| **8500** | _(open)_ | — | — | Available |
| **8600** | _(open)_ | — | — | Available |
| **8700** | _(open)_ | — | — | Available |
| **8800** | _(open)_ | — | — | Available |
| **8900** | _(open)_ | — | — | Available |
| **9000** | _(open)_ | — | — | Available |

**Rules:**
- Claim the next available port, fill in the row, and copy this file into your project repo
- App's `docker-compose.dev.yml` / `docker-compose.test.yml` maps `PORT:8100` (host:container)
- Nginx vhost on each shared server proxies `subdomain → localhost:PORT`
- Prod servers are single-app — no port coordination needed there
- Every dev/test deployment holds `/run/lock/shared-platform-deployment.lock`
  throughout its active remote mutation phase. The maximum wait is 2700
  seconds. After acquiring the lock and before mutation, require at least 12
  GiB free on `/`, 1 GiB configured swap, and 2 GiB of `MemAvailable +
  SwapFree`.
- Each repository implements and tests this contract in its own workflows or
  checked-in scripts. There is no installed shared deployment helper or server
  manager. Repository-level GitHub concurrency is additive.
- Inactive exact-SHA artifact staging may occur before the lock. Active source
  replacement, backups, builds, migrations, static activation, container
  mutation, health/identity checks, diagnostics, and scoped cleanup remain
  inside it.
- Never run host-global cleanup such as `docker system prune`, `docker builder
  prune`, unfiltered `docker image prune`, `docker volume prune`, or broad
  shared-path deletion.

### Per-App Server Layout

Each app on a shared server follows this pattern:

```
/opt/<app-name>/
├── .env                     # env vars for app + DB_PASSWORD for compose (never committed)
├── docker-compose.dev.yml   # (or docker-compose.test.yml on test server)
└── ... (rest of repo)
```

`.env` must contain:
- `DB_PASSWORD` — used by compose to set the postgres container password
- `DATABASE_URL` — must use service name `db` and database `guild_db` (not the old multi-container names)
- All other app env vars

---

## Branch Types

| Prefix | Purpose | Version bump |
|--------|---------|-------------|
| `feature/*` | New functionality | MINOR (`x.Y.0`) |
| `fix/*` | Planned bug fix | PATCH (`x.y.Z`) |
| `hotfix/*` | Emergency production fix | PATCH (`x.y.Z`) |
| `chore/*` | Deps, docs, config, cleanup | none |
| `refactor/*` | Internal restructuring, no behavior change | none |

---

## Environments

Three environments, three gates:

| Environment | Purpose | Deployed by |
|-------------|---------|-------------|
| **dev** | Fast feedback sandbox. Break things here. | Manual trigger from feature branch → `shared-dev-platforms` |
| **test** | Integration gate. Matches prod config. | Auto on push to `main` (i.e. merged PR) → `shared-test-platforms` |
| **prod** | Live. Real users/data. | Auto on `prod-*` tag only → prod server |

---

## GitHub Actions Workflows

Each project must have **three workflow files** targeting the three servers:

### deploy-dev.yml — Manual, targets `shared-dev-platforms`

The development workflow resolves the selected branch to one immutable SHA,
stages only SHA-specific inactive artifacts, waits for the common lock, applies
resource admission, and then checks out and activates that exact SHA. It keeps
the lock through app-scoped backup/rollback capture, build, migration or static
activation, local health and identity validation, bounded diagnostics, and
scoped cleanup. Public health follows the successful remote phase. The workflow
uses a non-cancelling repository concurrency group and a timeout that includes
the 45-minute lock wait.

### deploy-test.yml — Auto on push to `main`, targets `shared-test-platforms`

The test workflow uses the pushed `github.sha` as its immutable source and
implements the same shared lock, admission, mutation boundary, application
scope, evidence, timeout, and cleanup contract as development. A mutable
`git pull` is not deployment identity, and no shared-host workflow may perform
global Docker cleanup.

### deploy.yml (prod) — Auto on `prod-*` tag, targets prod server

```yaml
name: Deploy Prod

on:
  push:
    tags:
      - 'prod-*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to prod
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.PROD_HOST }}
          username: root
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/<app-name>
            git fetch --tags --force --prune origin
            git checkout ${{ github.ref_name }}
            docker compose -f docker-compose.prod.yml up -d --build
            docker image prune -f

      - name: Health check
        run: |
          sleep 10
          curl --fail https://<app-domain>/api/health
```

---

## Required GitHub Secrets

Each project repo needs these secrets set under **Settings → Secrets → Actions**:

| Secret | Value |
|--------|-------|
| `DEV_HOST` | IP of `shared-dev-platforms` (shared dev server — same for all projects) |
| `TEST_HOST` | IP of `shared-test-platforms` (shared test server — same for all projects) |
| `PROD_HOST` | IP of the prod server for this app |
| `DEPLOY_SSH_KEY` | Private key that has root access on all three servers |

> **Single key for all three servers** — add the same public key to `/root/.ssh/authorized_keys` on dev, test, and prod. The private key lives only in GitHub Secrets.

---

## Adapting to a New Project

When setting up CI/CD for a new project:

1. Copy this file into `reference/git-cicd-workflow.md` in the new repo
2. Claim the next open port in the Port Assignments table above; update the row and copy back
3. Create three workflow files matching the templates above; replace `<app-name>` and `<app-domain>`
4. Set `DEV_HOST`, `TEST_HOST`, `PROD_HOST`, and `DEPLOY_SSH_KEY` in GitHub repo secrets
5. On `shared-dev-platforms` and `shared-test-platforms`: clone the repo to `/opt/<app-name>`, create `.env`
6. On each shared server: create nginx vhost proxying the assigned port, get SSL cert via certbot
7. On the prod server: set up repo, `.env`, nginx, SSL as appropriate

---

## Normal Feature Flow

```
1. Branch from main
   git checkout main && git pull
   git checkout -b feature/my-thing

2. Develop, iterate
   [write code, run tests locally]

3. Deploy to dev — verify it works
   git push origin feature/my-thing
   gh workflow run deploy-dev.yml --ref feature/my-thing -f branch=feature/my-thing
   # Deploys to shared-dev-platforms → https://dev.<app-domain>
   [verify in dev environment]

4. Merge to main → test auto-deploys
   git checkout main
   git merge feature/my-thing --no-ff
   git push origin main
   # deploy-test.yml fires → shared-test-platforms → https://test.<app-domain>
   [verify in test environment]

5. Tag to release to prod
   git tag prod-vX.Y.Z && git push origin prod-vX.Y.Z
   # deploy.yml fires → prod server → https://<app-domain>
```

**Rules:**
- Always use `--no-ff` on merges so the branch history is visible in the log
- Delete feature branches after merge — don't let them accumulate
- Don't skip dev verification just because the change feels small
- Never deploy directly to prod by SSH — always go through the tag gate

---

## Hotfix Flow (something is broken in prod RIGHT NOW)

Hotfixes follow the same branch discipline — no shortcuts on that — but they have a fast lane to prod that bypasses the normal test-first requirement.

```
1. Branch from main (not from a stale feature branch)
   git checkout main && git pull
   git checkout -b hotfix/describe-the-break

2. Make the minimal fix
   [fix only what is broken]

3. Deploy to dev — confirm the fix works
   git push origin hotfix/describe-the-break
   gh workflow run deploy-dev.yml --ref hotfix/describe-the-break -f branch=hotfix/describe-the-break
   [verify fix in dev]

4. Merge directly to main and tag — test will auto-deploy but don't wait for it
   git checkout main
   git merge hotfix/describe-the-break --no-ff
   git push origin main
   git tag prod-vX.Y.Z && git push origin prod-vX.Y.Z
   [prod deploys immediately via tag]

5. Verify prod is healthy, then clean up
   [smoke test prod]
   git branch -d hotfix/describe-the-break
```

**What makes hotfix different:**
- You still verify in dev (don't skip — a broken hotfix makes things worse)
- You **do not wait** for test to fully pass before tagging to prod
- Test will still deploy (main push triggers it) — treat it as a parallel smoke test
- Document the incident in the commit message

---

## Versioning

```
X.Y.Z
│ │ └── PATCH: bug fix, hotfix
│ └──── MINOR: new feature (feature/* branch)
└────── MAJOR: breaking change or major milestone
```

Tag format: `prod-vX.Y.Z` — always use this exact format. Workflows match on `prod-*`.

---

## Quick Reference

```bash
# --- NORMAL FEATURE ---
git checkout main && git pull
git checkout -b feature/thing
# ... work ...
git push origin feature/thing
gh workflow run deploy-dev.yml --ref feature/thing -f branch=feature/thing   # → shared-dev-platforms
git checkout main && git merge feature/thing --no-ff && git push origin main  # → shared-test-platforms (auto)
git tag prod-vX.Y.Z && git push origin prod-vX.Y.Z       # → prod (auto)

# --- HOTFIX ---
git checkout main && git pull
git checkout -b hotfix/what-is-broken
# ... minimal fix ...
git push origin hotfix/what-is-broken
gh workflow run deploy-dev.yml --ref hotfix/what-is-broken -f branch=hotfix/what-is-broken  # → shared-dev-platforms
git checkout main && git merge hotfix/what-is-broken --no-ff && git push origin main
git tag prod-vX.Y.Z && git push origin prod-vX.Y.Z  # → prod immediately
```

---

*Last updated: 2026-09-23*
