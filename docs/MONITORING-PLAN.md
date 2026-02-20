# Server Monitoring & Cost Governance — Implementation Plan

## Overview

Add lightweight monitoring and cost governance to the Hetzner server (CPX11, 5.78.114.224) that hosts shadowedvaca.com. Everything lives in the `monitoring/` directory of the shadowedvaca-site repo.

**Read `MONITORING-CLAUDE.md` first.** It has the full architecture, schemas, and rationale.

---

## Phase 1: Scaffolding & Server Health Checks

**Goal:** Create the monitoring framework and get server health checks running locally and on the server.

### Tasks

1. **Update `.gitignore`** — Add:
   ```
   monitoring/config/secrets.yaml
   monitoring/data/
   ```

2. **Create `monitoring/requirements.txt`**
   ```
   psutil>=5.9
   pyyaml>=6.0
   requests>=2.31
   ```

3. **Create directory structure**
   ```
   monitoring/
   ├── checks/
   │   ├── __init__.py
   │   ├── base_check.py
   │   ├── server_health.py
   │   └── nginx_status.py
   ├── alerting/
   │   ├── __init__.py
   │   └── alerts.py
   ├── config/
   │   ├── thresholds.yaml
   │   └── secrets.yaml.example
   ├── data/                          ← Created at runtime, git-ignored
   ├── deploy/
   ├── run_health_check.py
   └── README.md
   ```

4. **Create `base_check.py`**
   - `BaseCheck` class with:
     - `name` property
     - `run()` → returns list of `CheckResult` (named tuple or dataclass: check_name, metric_name, value, unit, severity: ok/warning/critical, message)
     - Structured logging to stdout (similar to sv-tools MON BaseJob pattern)
     - Exception handling — a failed check returns a critical result, doesn't crash the runner

5. **Create `server_health.py`**
   - Inherits `BaseCheck`
   - Uses `psutil` for: disk usage (%), memory usage (%), swap usage (%), CPU percent (short sample), load average
   - Uses `os.statvfs` or `shutil.disk_usage` as fallback if psutil isn't available
   - Reads thresholds from config, returns appropriate severity per metric
   - Also checks for zombie processes and high-memory individual processes (any single process using >50% of RAM is suspicious on a 2GB box)

6. **Create `nginx_status.py`**
   - Inherits `BaseCheck`
   - Checks: `systemctl is-active nginx` (subprocess call)
   - Checks: `curl -s -o /dev/null -w '%{http_code}' http://localhost` returns 200 (or 301 for HTTP→HTTPS redirect, both acceptable)
   - Checks: SSL certificate expiry by connecting to `shadowedvaca.com:443` and reading cert `notAfter` (use `ssl` stdlib module)
   - If Nginx isn't running → critical
   - If Nginx is running but not responding → critical
   - If cert expires within threshold → warning or critical

7. **Create `thresholds.yaml`** — Copy from MONITORING-CLAUDE.md, full config with all threshold values.

8. **Create `secrets.yaml.example`** — Template showing required fields with placeholder values.

9. **Create `alerting/alerts.py`**
   - `AlertDispatcher` class
   - For Phase 1: **console output only** (print alerts to stdout, captured by systemd journal)
   - Stub for email sending (reads SMTP config from secrets.yaml but doesn't send yet)
   - Alert cooldown logic: check SQLite for last alert time per (check_name, metric_name, severity), skip if within cooldown window
   - Write alert records to SQLite

10. **Create `run_health_check.py`**
    - Entry point script
    - Loads config from `monitoring/config/thresholds.yaml`
    - Initializes SQLite DB in `monitoring/data/monitoring.db` (create tables if not exist)
    - Runs all health checks, collects results
    - Writes metrics to `metrics` table in SQLite
    - Passes any warning/critical results to AlertDispatcher
    - Exit code 0 if all OK, 1 if any warnings, 2 if any criticals

11. **Create SQLite schema** (created by `run_health_check.py` on first run):
    ```sql
    CREATE TABLE IF NOT EXISTS metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        check_name TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT,
        severity TEXT NOT NULL DEFAULT 'ok'
    );

    CREATE TABLE IF NOT EXISTS alert_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL DEFAULT (datetime('now')),
        check_name TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        severity TEXT NOT NULL,
        message TEXT,
        notified INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_metrics_ts ON metrics(timestamp);
    CREATE INDEX IF NOT EXISTS idx_alerts_check ON alert_log(check_name, metric_name, timestamp);
    ```

12. **Create `monitoring/README.md`** — Setup instructions, how to run locally, how to test.

### Checkpoint
- `python monitoring/run_health_check.py` runs on the server and reports disk, memory, CPU, swap, Nginx status, and SSL cert expiry
- Results are written to `monitoring/data/monitoring.db`
- Warnings/criticals print clearly to stdout
- All checks degrade gracefully (if psutil can't read something, it logs a warning instead of crashing)
- Commit and summarize

---

## Phase 2: Email Alerting

**Goal:** Get actual email alerts working so Mike doesn't have to check logs manually.

### Tasks

1. **Choose and configure email relay on the server**
   - **Option A (recommended for simplicity):** Use a free transactional email service — SendGrid (100 emails/day free) or Mailgun (1,000/month free on Flex plan). These just need an API key, no server-side mail setup.
   - **Option B:** Configure Postfix as a relay through Gmail SMTP with an App Password. More setup but no third-party dependency.
   - **Document the setup steps** in `monitoring/README.md` for Mike to execute. Do not configure this automatically — Mike chooses which option and provides credentials.

2. **Implement email sending in `alerts.py`**
   - If using transactional API (SendGrid/Mailgun): simple HTTPS POST with API key
   - If using SMTP: Python `smtplib` with TLS
   - Read config from `secrets.yaml`
   - Email format:
     - **Subject:** `[SV-MONITOR] {severity_emoji} {SEVERITY}: {check_name} — {metric_name} at {value}{unit}`
     - **Body:** Plain text with: metric details, threshold that was exceeded, timestamp, server info, recent trend (last 5 readings from SQLite)
   - Send one email per alert (don't batch — urgency matters more than inbox cleanliness)

3. **Implement cooldown logic**
   - Query `alert_log` for matching (check_name, metric_name) within cooldown window
   - If found with `notified=1` → skip sending, still log the result
   - Configurable per severity in `thresholds.yaml`

4. **Add a test alert command**
   - `python monitoring/run_health_check.py --test-alert` sends a test email to verify SMTP/API setup works
   - Useful for Mike to verify the email pipeline without waiting for a real alert

5. **Add a `--dry-run` flag**
   - Runs all checks, shows what alerts WOULD be sent, but doesn't send them
   - Useful for testing threshold tuning

### Checkpoint
- Mike receives an email when a check exceeds threshold
- `--test-alert` sends a test email successfully
- `--dry-run` shows check results without sending
- Cooldown prevents email flooding
- Commit and summarize

---

## Phase 3: Cost Tracking

**Goal:** Track AI API spending and alert on cost anomalies.

### Tasks

1. **Create `checks/cost_tracker.py`**
   - Inherits `BaseCheck`
   - Reads cost data from the `api_calls` table in `monitoring/data/monitoring.db`
   - Computes rolling totals for each time window (hourly, daily, weekly, monthly)
   - Compares against thresholds from `thresholds.yaml`
   - Returns warning/critical results for each window that exceeds threshold

2. **Create the `api_calls` table** (schema from MONITORING-CLAUDE.md):
   ```sql
   CREATE TABLE IF NOT EXISTS api_calls (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       timestamp TEXT NOT NULL DEFAULT (datetime('now')),
       service TEXT NOT NULL,
       model TEXT,
       operation TEXT,
       input_tokens INTEGER DEFAULT 0,
       output_tokens INTEGER DEFAULT 0,
       cache_read_tokens INTEGER DEFAULT 0,
       cache_write_tokens INTEGER DEFAULT 0,
       estimated_cost_usd REAL DEFAULT 0,
       source TEXT,
       metadata TEXT
   );

   CREATE INDEX IF NOT EXISTS idx_api_calls_ts ON api_calls(timestamp);
   CREATE INDEX IF NOT EXISTS idx_api_calls_service ON api_calls(service, timestamp);
   ```

3. **Create a cost logging utility** — `monitoring/cost_logger.py`
   - A simple Python module that other projects import (or call as a subprocess) to log an API call
   - Function: `log_api_call(service, model, operation, input_tokens, output_tokens, source, **kwargs)`
   - Computes `estimated_cost_usd` using pricing table from `thresholds.yaml`
   - Writes row to SQLite
   - **Also supports ingesting from a JSON-lines file** — if sv-tools can't import this module directly, it can append JSON lines to a file like `monitoring/data/api_calls.jsonl`, and the cost tracker ingests new lines on each run
   - Both paths (direct SQLite write and JSONL ingestion) are supported for maximum flexibility

4. **Add pricing config to `thresholds.yaml`** — Token costs per model per service (see MONITORING-CLAUDE.md for starting values). These WILL change — make them easy to update.

5. **Create `run_cost_check.py`**
   - Entry point for cost tracking (separate from health checks — runs on a different schedule)
   - Ingests any new JSONL records into SQLite
   - Runs cost_tracker check
   - Passes results to AlertDispatcher
   - Designed to run hourly (not every 5 min — cost data doesn't change that fast)

6. **Add cost summary to alert emails**
   - When a cost alert fires, include breakdown: per-service totals, top models by spend, top sources by spend
   - Include the time window and comparison to previous same-length window ("$5.20 today vs $0.45 yesterday")

### Checkpoint
- `python monitoring/run_cost_check.py` computes cost totals from sample data and reports correctly
- Cost alerts fire when thresholds are exceeded (test with synthetic data)
- JSONL ingestion works (write sample lines, run cost check, verify they appear in SQLite)
- Commit and summarize

---

## Phase 4: Systemd Deployment

**Goal:** Get monitoring running automatically on the server via systemd timers.

### Tasks

1. **Create `deploy/sv-monitoring.service`**
   ```ini
   [Unit]
   Description=SV Server Health Monitoring
   After=network.target

   [Service]
   Type=oneshot
   User=root
   WorkingDirectory=/opt/sv-monitoring
   ExecStart=/usr/bin/python3 /opt/sv-monitoring/run_health_check.py
   StandardOutput=journal
   StandardError=journal
   # Don't let monitoring scripts run forever
   TimeoutStartSec=120
   ```

2. **Create `deploy/sv-monitoring.timer`**
   ```ini
   [Unit]
   Description=Run SV health checks every 5 minutes

   [Timer]
   OnBootSec=60
   OnUnitActiveSec=300
   AccuracySec=30

   [Install]
   WantedBy=timers.target
   ```

3. **Create `deploy/sv-cost-check.service`** — Same pattern, runs `run_cost_check.py`

4. **Create `deploy/sv-cost-check.timer`** — Runs hourly (`OnUnitActiveSec=3600`)

5. **Create `deploy/install.sh`**
   - Copies monitoring code to `/opt/sv-monitoring/` on the server
   - Installs Python dependencies via pip
   - Copies systemd units to `/etc/systemd/system/`
   - Creates data directory with proper permissions
   - Enables and starts timers
   - Verifies timers are active
   - **Does NOT copy secrets.yaml** — prints reminder for Mike to do this manually

6. **Create `deploy.sh` update** — Add a monitoring deploy section to the existing site `deploy.sh`, or create `deploy-monitoring.sh` as a separate script. This rsyncs the monitoring code to the server and restarts timers.

7. **Add systemd resource limits to monitoring services**
   ```ini
   # In the [Service] section
   MemoryMax=128M
   CPUQuota=25%
   ```
   The monitoring scripts themselves should not become a resource problem.

8. **Add log rotation** — systemd journal handles this by default, but add a note about `journalctl --vacuum-time=7d` for cleanup.

### Checkpoint
- `systemctl list-timers` shows both monitoring timers active
- `journalctl -u sv-monitoring` shows health check output
- `journalctl -u sv-cost-check` shows cost check output
- Alerts fire when thresholds are exceeded
- Timers survive server reboot
- Commit and summarize

---

## Phase 5: Hardening & Documentation

**Goal:** Make the monitoring system robust and self-documenting.

### Tasks

1. **Add a self-check** — The health check script verifies its own prerequisites:
   - Can it write to SQLite?
   - Is `psutil` importable?
   - Is the config file present and parseable?
   - If any fail → log clearly to journal so Mike can see why monitoring stopped working

2. **Add SQLite maintenance**
   - On each run, delete metrics older than 30 days
   - Delete alert_log entries older than 90 days
   - Delete api_calls older than 90 days
   - Vacuum SQLite monthly (check if last vacuum was >30 days ago)

3. **Add a status summary command**
   - `python monitoring/run_health_check.py --status` prints a human-readable summary:
     - Current server health (all green? any warnings?)
     - Cost totals: today, this week, this month
     - Last alert sent and when
     - Timer status (next scheduled run)
   - Mike can SSH in and run this for a quick pulse check

4. **Write comprehensive README.md**
   - Prerequisites and setup steps
   - How to configure email alerting
   - How to adjust thresholds
   - How to add sv-tools cost logging integration
   - How to test (--test-alert, --dry-run, --status)
   - Troubleshooting common issues
   - Architecture overview with diagram

5. **Add systemd resource limits for future services** — Create a template systemd unit for sv-tools that includes `MemoryMax` and `CPUQuota` limits, documented in README as a recommendation for when sv-tools is deployed. This is the "prevention" layer — even without monitoring, resource limits prevent a single service from taking down the server.

### Checkpoint
- `--status` gives a clear health summary
- Old data is cleaned up automatically
- README covers full setup from scratch
- Self-check catches missing dependencies
- Commit and summarize

---

## Working Agreements

- **Claude Code handles implementation.** Mike reviews at each checkpoint.
- **Commit at each phase boundary.** Don't continue to next phase without Mike's review.
- **Lightweight is the law.** Every design choice should favor simplicity. If you're reaching for a third-party service or a complex pattern, step back and ask if a 20-line Python script could solve it.
- **Fail safe.** Monitoring must never make things worse. Crashes are caught, resources are limited, cooldowns prevent alert floods.
- **Secrets never committed.** `secrets.yaml` is in `.gitignore` and deployed manually.
- **Test with synthetic data.** Don't wait for real cost data to test the cost tracker. Create sample JSONL files with realistic data and verify the pipeline end-to-end.

---

## Future Enhancements (Not In Scope)

- **Web dashboard** — Simple HTML page showing current status and historical charts (could be another static page generated by the monitoring script and served by Nginx)
- **Twilio SMS** — Critical alerts via text message (once Twilio is set up for sv-tools MON Phase 7)
- **sv-tools health endpoints** — Once sv-tools is deployed, add checks for its FastAPI health endpoint, queue depths, response times
- **Anomaly detection** — Instead of static thresholds, detect when metrics deviate significantly from their baseline pattern
- **Provider dashboard scraping** — For services without usage APIs, periodically check billing dashboards (complex, fragile, low priority)
- **Multi-server** — If Mike adds more servers, the monitoring framework could be generalized (way future)
