# SV Server Monitoring

Lightweight server health monitoring and AI cost governance for the Hetzner CPX11 hosting shadowedvaca.com.

**Architecture:** Python scripts triggered by systemd timers → SQLite for history → email alerts. No agents, no daemons, no dashboards.

---

## Directory Layout

```
monitoring/
├── checks/
│   ├── base_check.py       Base class (CheckResult, BaseCheck)
│   ├── server_health.py    Disk, memory, CPU, swap, processes
│   └── nginx_status.py     Nginx process, HTTP response, SSL cert expiry
├── alerting/
│   └── alerts.py           Alert dispatcher (Phase 1: console; Phase 2: email)
├── config/
│   ├── thresholds.yaml     Warning/critical thresholds (committed)
│   └── secrets.yaml.example  Template — copy to secrets.yaml and fill in
├── data/                   Runtime only, git-ignored
│   └── monitoring.db       SQLite: metrics history, alert log
├── deploy/                 Systemd units and install script (Phase 4)
├── run_health_check.py     Entry point for server health checks
├── run_cost_check.py       Entry point for AI cost checks (Phase 3)
└── README.md               This file
```

---

## Prerequisites

**On the server:**
```bash
pip install psutil pyyaml requests
# or
pip install -r /opt/sv-monitoring/requirements.txt
```

**On Windows (local dev/testing):**
```
pip install psutil pyyaml requests
```
Note: `systemctl` is not available on Windows. The Nginx process check degrades gracefully — it reports "skipped" instead of failing.

---

## Running Locally (Development)

From the repo root:

```bash
# Verify all prerequisites are met
python monitoring/run_health_check.py --self-check

# Run all checks, print results, write to DB (alerts suppressed in dry-run)
python monitoring/run_health_check.py --dry-run

# Normal run (writes metrics + dispatches any alerts)
python monitoring/run_health_check.py

# Show last recorded health status
python monitoring/run_health_check.py --status
```

Exit codes: `0` = all OK, `1` = at least one warning, `2` = at least one critical.

---

## Threshold Configuration

Edit `monitoring/config/thresholds.yaml`. Changes take effect on the next run — no restart needed.

Key thresholds:

| Metric | Warning | Critical |
|--------|---------|----------|
| Disk usage | 75% | 90% |
| Memory usage | 75% | 90% |
| Swap usage | 50% | 80% |
| CPU (1s sample) | 80% | 95% |
| I/O wait | 30% | 50% |
| SSL cert expiry | 14 days | 7 days |

Alert cooldowns: 30 min for warnings, 15 min for criticals (configurable).

---

## Email Alerting (Phase 2)

Phase 1 sends alerts to stdout (captured by systemd journal). Phase 2 adds email:

**Option A — Gmail App Password (recommended for simplicity):**
1. Enable 2FA on your Google account
2. Generate an App Password: https://myaccount.google.com/apppasswords
3. Copy `monitoring/config/secrets.yaml.example` → `monitoring/config/secrets.yaml`
4. Fill in your Gmail address and App Password

**Option B — SendGrid free tier (100 emails/day):**
1. Create a SendGrid account, get an API key
2. Use the SendGrid HTTP API instead of SMTP in `alerting/alerts.py`

**After configuring:**
```bash
python monitoring/run_health_check.py --test-alert  # Phase 2: verify email works
```

---

## Deploying to Server (Phase 4)

```bash
# From repo root on your Windows machine
bash monitoring/deploy/install.sh

# Then copy secrets manually (never commit secrets.yaml)
scp monitoring/config/secrets.yaml deploy@5.78.114.224:/opt/sv-monitoring/config/
```

Timers installed by `install.sh`:
- `sv-monitoring.timer` — runs health check every 5 minutes
- `sv-cost-check.timer` — runs cost check every hour

Check timer status on server:
```bash
systemctl list-timers sv-monitoring.timer sv-cost-check.timer
journalctl -u sv-monitoring --since "1 hour ago"
```

---

## AI Cost Tracking (Phase 3)

The `run_cost_check.py` script reads `monitoring/data/monitoring.db` (the `api_calls` table) and alerts if rolling cost windows exceed thresholds.

sv-tools writes API call records. Two ingestion paths:
1. **Direct SQLite write** — sv-tools inserts into `api_calls` table directly
2. **JSONL file** — sv-tools appends JSON lines to `monitoring/data/api_calls.jsonl`; the cost check ingests them on each run

---

## Troubleshooting

**`ModuleNotFoundError: No module named 'psutil'`**
→ Run `pip install psutil pyyaml requests` or install from `monitoring/requirements.txt`

**`Config not found`**
→ Run from the repo root: `python monitoring/run_health_check.py`

**Nginx check reports "skipped" on every run**
→ Normal when running on Windows — the systemctl check only works on Linux

**SSL check skipped**
→ Normal when running locally — your machine can't reach shadowedvaca.com:443 in time. The check is always active on the server.

**Alerts firing repeatedly (no cooldown)**
→ Check that `monitoring/data/monitoring.db` is writeable and that the alert_log table exists. Run `--self-check` to verify.
