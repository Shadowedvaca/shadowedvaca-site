# Server Monitoring & Cost Governance — Context for Claude Code

## What This Is

This document provides context for adding lightweight server monitoring and AI cost governance to the Hetzner server that hosts shadowedvaca.com. The monitoring system lives inside the shadowedvaca-site repo because it's infrastructure for the same server.

## Why This Matters

The Hetzner CPX11 (2 vCPU, 2GB RAM, 40GB disk) hosts the shadowedvaca.com static site today and will soon also host sv-tools (Python API services). Mike does not babysit this server — he needs automated watchdogs that alert him when something goes wrong before it becomes catastrophic.

Two categories of risk:

1. **Server health** — A runaway process eats all RAM or disk fills up, taking down the website and any future services. On a 2GB/40GB box there's very little headroom.
2. **AI API cost leaks** — sv-tools and other projects call Anthropic, OpenAI, Google AI, and Cowork APIs. A bug in a loop, a retry storm, or a forgotten background job could rack up a serious bill before Mike notices. Current spend is ~$0.22 over two days of light use, but once things are automated, a leak could 10x that overnight.

## What Already Exists on the Server

- **OS:** Ubuntu 24 on Hetzner Cloud CPX11
- **IP:** 5.78.114.224
- **Web server:** Nginx serving static files from `/var/www/shadowedvaca.com/`
- **SSL:** Let's Encrypt / Certbot
- **Nginx config pattern:** sites-available / sites-enabled (ready for multi-site)
- **SSH access:** Key-based auth, Mike connects from Windows via PowerShell
- **DNS:** Managed at Bluehost, A records point to Hetzner IP
- **Python:** 3.11+ available on server

## What Does NOT Exist Yet

- No monitoring of any kind
- No alerting mechanism (no email relay, no Twilio, no webhook configured)
- No sv-tools deployment (planned, not done yet)
- No systemd services beyond Nginx and system defaults

## Architecture Decision: Keep It Stupid Simple

This is a tiny VPS. Do not install Prometheus, Grafana, Datadog agents, or any heavy monitoring stack. The monitoring system is:

- **Python scripts** run by **systemd timers** (the Linux equivalent of Mike's Windows Task Scheduler pattern from sv-tools MON agent)
- **SQLite database** for historical metrics and cost tracking
- **JSON config file** for thresholds and API keys
- **Alerting via email** using a lightweight SMTP relay (Postfix with a relay like Gmail SMTP, or a transactional service like Mailgun/SendGrid free tier) — this is the simplest alerting that doesn't require another paid service
- **Optional future upgrade** to Twilio SMS once that's set up for sv-tools

No web dashboard. No fancy UI. Just scripts that check things and yell when something's wrong.

## Directory Structure

```
shadowedvaca-site/
├── monitoring/
│   ├── checks/
│   │   ├── __init__.py
│   │   ├── base_check.py            ← Base class for all checks (logging, alerting interface)
│   │   ├── server_health.py         ← Disk, memory, CPU, swap, Nginx process
│   │   ├── nginx_status.py          ← Nginx responding, SSL cert expiry
│   │   └── cost_tracker.py          ← AI API usage/spend tracking
│   ├── alerting/
│   │   ├── __init__.py
│   │   └── alerts.py                ← Alert dispatcher (email, future: SMS)
│   ├── config/
│   │   ├── thresholds.yaml          ← Warning/critical thresholds
│   │   └── secrets.yaml.example     ← Template for API keys and SMTP creds (NOT committed)
│   ├── data/
│   │   └── monitoring.db            ← SQLite: metrics history, cost tracking, alert log
│   ├── deploy/
│   │   ├── sv-monitoring.service    ← Systemd service unit (oneshot)
│   │   ├── sv-monitoring.timer      ← Systemd timer (runs every 5 min)
│   │   ├── sv-cost-check.service    ← Systemd service for cost checks (oneshot)
│   │   ├── sv-cost-check.timer      ← Systemd timer for cost checks (runs hourly)
│   │   └── install.sh               ← Copies units, enables timers
│   ├── run_health_check.py          ← Entry point: runs all server health checks
│   ├── run_cost_check.py            ← Entry point: runs cost tracking check
│   ├── requirements.txt             ← pyyaml, psutil, requests
│   └── README.md                    ← Setup and troubleshooting
├── # ... rest of shadowedvaca-site repo
```

## Server Health Checks

### What to Monitor

| Check | Warning Threshold | Critical Threshold | Notes |
|-------|------------------|--------------------|-------|
| Disk usage (/) | 75% | 90% | 40GB total, fills fast with logs |
| Memory usage | 75% | 90% | Only 2GB, OOM killer will wreck things |
| Swap usage | 50% | 80% | Heavy swap = server is struggling |
| CPU (5-min avg) | 80% | 95% | Sustained high CPU = runaway process |
| Nginx process | — | Not running | Check `systemctl is-active nginx` |
| Nginx responds | — | HTTP != 200 | Curl localhost, check for 200 |
| SSL cert expiry | 14 days | 7 days | Certbot should auto-renew, but verify |
| Disk I/O wait | 30% | 50% | High iowait = disk bottleneck |

### How It Works

1. `run_health_check.py` runs every 5 minutes via systemd timer
2. Calls each check module, collects results
3. Writes metrics to `monitoring.db` (for trends, optional future dashboard)
4. If any check exceeds warning or critical threshold → calls alerting module
5. Alerting module sends email with check name, current value, threshold, and server context
6. **Cooldown:** Don't re-alert for the same condition within 30 minutes (configurable). Track last-alert timestamps in SQLite.

## AI Cost Governance

### Services to Track

| Service | How to Get Usage | Pricing Model |
|---------|-----------------|---------------|
| Anthropic (Claude API) | Track via response headers (`usage` field in API responses) or check admin console API | Per-token (input/output) |
| OpenAI (ChatGPT API) | `/v1/organization/usage` endpoint or `/dashboard/billing/usage` | Per-token |
| Google AI (Gemini) | Cloud Billing API or usage metadata in responses | Per-token/per-request |
| Cowork (Anthropic) | Usage included in Anthropic billing | Bundled with Claude |

### Practical Approach: Local Token Tracking

The most reliable method (works for all providers) is **local tracking**:

1. **sv-tools wraps all API calls** through a common provider layer (it already does this — see `common/ai/provider.py` in sv-tools). That layer logs token counts per call.
2. **A cost log file** (or SQLite table) on the server records every API call: timestamp, service, model, input_tokens, output_tokens, estimated_cost.
3. **The cost check script** reads this log, computes rolling totals (hourly, daily, weekly), and compares against thresholds.

For services where Mike uses the web UI (not API), he sets a monthly budget cap in each provider's dashboard as a backstop — the monitoring system handles the API-side tracking.

### Cost Thresholds (Configurable)

| Window | Warning | Critical | Notes |
|--------|---------|----------|-------|
| Hourly | $0.50 | $2.00 | A single hour shouldn't cost much |
| Daily | $2.00 | $10.00 | Normal day is well under $1 |
| Weekly | $10.00 | $50.00 | Catches sustained slow leaks |
| Monthly | $30.00 | $100.00 | Overall budget governance |

These are starting points. Mike will tune them as he gets baseline data.

### Cost Log Schema (SQLite)

```sql
CREATE TABLE api_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,           -- ISO 8601
    service TEXT NOT NULL,             -- 'anthropic', 'openai', 'google'
    model TEXT,                        -- 'claude-sonnet-4-5-20250929', 'gpt-4o', etc.
    operation TEXT,                    -- 'chat', 'embedding', 'completion'
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cache_read_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0, -- Computed from token counts + known pricing
    source TEXT,                       -- 'sv-tools-pma', 'sv-tools-raa', etc.
    metadata TEXT                      -- JSON blob for anything else
);

CREATE TABLE cost_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    window TEXT NOT NULL,              -- 'hourly', 'daily', 'weekly', 'monthly'
    total_cost_usd REAL NOT NULL,
    threshold_usd REAL NOT NULL,
    severity TEXT NOT NULL,            -- 'warning', 'critical'
    notified INTEGER DEFAULT 0        -- 1 if alert was sent
);
```

### How Cost Tracking Integrates with sv-tools

The sv-tools `AIProvider` class already returns token usage in its `AIResponse` object. The integration point is:

1. After each API call, sv-tools writes a row to the cost log (either directly to the SQLite DB or to a JSON-lines file that the monitoring system ingests).
2. The monitoring cost check reads the log, computes rolling windows, and alerts if thresholds are exceeded.

This is a **loose coupling** — sv-tools writes, monitoring reads. They share a file path, not code.

## Alerting

### Phase 1: Email

Use Python's `smtplib` with a Gmail App Password or free-tier transactional email service (SendGrid gives 100 emails/day free). The alert email includes:

- Subject: `[SV-MONITOR] ⚠️ WARNING: Disk at 78%` or `[SV-MONITOR] 🔴 CRITICAL: Daily API cost $12.50`
- Body: Check name, current value, threshold, timestamp, server hostname
- For cost alerts: breakdown by service and model

### Phase 2 (Future): Twilio SMS

Once Twilio is set up for sv-tools (MON Phase 7), add SMS for critical alerts only. Warning = email, Critical = email + SMS.

### Alert Cooldown

Store last-alert timestamps per check in SQLite. Default cooldown: 30 minutes for warnings, 15 minutes for criticals. Configurable in `thresholds.yaml`.

## Configuration

### thresholds.yaml

```yaml
server:
  disk_warning_pct: 75
  disk_critical_pct: 90
  memory_warning_pct: 75
  memory_critical_pct: 90
  swap_warning_pct: 50
  swap_critical_pct: 80
  cpu_warning_pct: 80
  cpu_critical_pct: 95
  ssl_warning_days: 14
  ssl_critical_days: 7
  iowait_warning_pct: 30
  iowait_critical_pct: 50

cost:
  hourly_warning_usd: 0.50
  hourly_critical_usd: 2.00
  daily_warning_usd: 2.00
  daily_critical_usd: 10.00
  weekly_warning_usd: 10.00
  weekly_critical_usd: 50.00
  monthly_warning_usd: 30.00
  monthly_critical_usd: 100.00

alerting:
  cooldown_warning_minutes: 30
  cooldown_critical_minutes: 15
  email_to: "mike@shadowedvaca.com"   # Or whatever email Mike uses

# Token pricing (cents per 1K tokens) — update when pricing changes
pricing:
  anthropic:
    claude-sonnet-4-5-20250929:
      input: 0.3
      output: 1.5
      cache_read: 0.03
      cache_write: 0.375
    claude-haiku-4-5-20251001:
      input: 0.08
      output: 0.4
      cache_read: 0.008
      cache_write: 0.1
  openai:
    gpt-4o:
      input: 0.25
      output: 1.0
  google:
    gemini-2.0-flash:
      input: 0.01
      output: 0.04
```

### secrets.yaml (NOT committed — .gitignore'd)

```yaml
smtp:
  host: "smtp.gmail.com"
  port: 587
  username: "alerts@shadowedvaca.com"
  password: "app-password-here"

# Optional: direct API usage endpoint access
anthropic_admin_api_key: ""
openai_api_key: ""
```

## Key Constraints

- **Lightweight.** The monitoring scripts themselves must use negligible resources. psutil + SQLite + a few HTTP calls. No background daemons — oneshot scripts triggered by systemd timers.
- **Fail safe.** If the monitoring script itself crashes, it should not take down the server. Systemd will just try again next cycle.
- **No new ports.** Don't open any new ports on the firewall for monitoring. Everything runs locally or makes outbound connections only.
- **Secrets stay secret.** `secrets.yaml` is in `.gitignore`. Deployed to server manually or via secure copy, never committed.
- **Mike is on Windows.** Any local scripts for testing must work on Windows. The server scripts run on Ubuntu but should be testable locally with mocked data.

## Relationship to sv-tools

The monitoring system is **independent of sv-tools** but will **benefit from sv-tools data** once deployed:

- sv-tools writes API call logs → monitoring reads them for cost tracking
- sv-tools may eventually have its own health endpoints → monitoring can check them
- The shared integration point is a file path or SQLite DB on the server, not imported code

Do not import from sv-tools. Do not create dependencies on sv-tools code. Loose coupling only.

## What This Is NOT

- Not a replacement for provider-side budget caps (set those too in Anthropic/OpenAI/Google dashboards)
- Not a real-time monitoring system (5-minute checks are fine for a personal server)
- Not a dashboard or web UI (just scripts and alerts — a dashboard is a future nice-to-have)
- Not application performance monitoring (no request tracing, no APM)
