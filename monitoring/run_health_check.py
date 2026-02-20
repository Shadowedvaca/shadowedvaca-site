#!/usr/bin/env python3
"""Entry point for SV server health checks.

Usage:
    python monitoring/run_health_check.py             # Normal run
    python monitoring/run_health_check.py --dry-run   # Run checks, no alerts sent
    python monitoring/run_health_check.py --status    # Print summary from DB
    python monitoring/run_health_check.py --self-check  # Verify prerequisites only

Exit codes:
    0 -- all checks OK
    1 -- at least one warning, no criticals
    2 -- at least one critical
"""
from __future__ import annotations

import argparse
import logging
import sqlite3
import sys
from pathlib import Path

# Ensure the repo root is importable from any working directory
_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

import yaml

from monitoring.checks.server_health import ServerHealthCheck
from monitoring.checks.nginx_status import NginxStatusCheck
from monitoring.alerting.alerts import AlertDispatcher

# ------------------------------------------------------------------
# Paths
# ------------------------------------------------------------------
_MONITORING_DIR = Path(__file__).resolve().parent
CONFIG_PATH = _MONITORING_DIR / "config" / "thresholds.yaml"
DB_PATH = _MONITORING_DIR / "data" / "monitoring.db"

# ------------------------------------------------------------------
# Database setup
# ------------------------------------------------------------------

_SCHEMA = """
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
"""


def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.executescript(_SCHEMA)


def write_metrics(db_path: Path, results) -> None:
    with sqlite3.connect(db_path) as conn:
        conn.executemany(
            "INSERT INTO metrics (check_name, metric_name, value, unit, severity) VALUES (?,?,?,?,?)",
            [(r.check_name, r.metric_name, r.value, r.unit, r.severity) for r in results],
        )


# ------------------------------------------------------------------
# Status summary
# ------------------------------------------------------------------

def print_status(db_path: Path) -> None:
    if not db_path.exists():
        print("No monitoring data yet. Run the health check first.")
        return

    with sqlite3.connect(db_path) as conn:
        # Most recent reading per (check_name, metric_name)
        rows = conn.execute("""
            SELECT check_name, metric_name, value, unit, severity, timestamp
            FROM metrics
            WHERE id IN (
                SELECT MAX(id) FROM metrics GROUP BY check_name, metric_name
            )
            ORDER BY
                CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
                check_name, metric_name
        """).fetchall()

        print("\n=== Server Health Status ===")
        if not rows:
            print("  (no data)")
        for check_name, metric, value, unit, sev, ts in rows:
            tag = "[OK]  " if sev == "ok" else ("[WARN] " if sev == "warning" else "[CRIT] ")
            print(f"  {tag} {check_name}/{metric}: {value:.2f}{unit or ''} (as of {ts})")

        last_alert = conn.execute("""
            SELECT timestamp, check_name, metric_name, severity
            FROM alert_log WHERE notified = 1
            ORDER BY timestamp DESC LIMIT 1
        """).fetchone()
        print()
        if last_alert:
            print(f"Last alert sent: {last_alert[3].upper()} on "
                  f"{last_alert[1]}/{last_alert[2]} at {last_alert[0]}")
        else:
            print("No alerts have been sent yet.")


# ------------------------------------------------------------------
# Self-check
# ------------------------------------------------------------------

def self_check(config_path: Path, db_path: Path) -> bool:
    ok = True
    print("=== Self-check ===")

    # Config readable?
    if not config_path.exists():
        print(f"  FAIL  Config not found: {config_path}")
        ok = False
    else:
        try:
            import yaml
            yaml.safe_load(config_path.read_text())
            print(f"  OK    Config readable: {config_path}")
        except Exception as e:
            print(f"  FAIL  Config parse error: {e}")
            ok = False

    # psutil importable?
    try:
        import psutil  # noqa: F401
        print("  OK    psutil importable")
    except ImportError:
        print("  FAIL  psutil not installed -- run: pip install psutil")
        ok = False

    # pyyaml importable?
    try:
        import yaml  # noqa: F401
        print("  OK    pyyaml importable")
    except ImportError:
        print("  FAIL  pyyaml not installed -- run: pip install pyyaml")
        ok = False

    # Can we write to the data directory?
    try:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        test_file = db_path.parent / ".write_test"
        test_file.write_text("ok")
        test_file.unlink()
        print(f"  OK    Data directory writable: {db_path.parent}")
    except Exception as e:
        print(f"  FAIL  Cannot write to data directory: {e}")
        ok = False

    print()
    return ok


# ------------------------------------------------------------------
# Main
# ------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="SV Server Health Monitor")
    parser.add_argument("--dry-run", action="store_true",
                        help="Run checks, show results, but do not send alerts")
    parser.add_argument("--status", action="store_true",
                        help="Print last recorded health status from database")
    parser.add_argument("--self-check", action="store_true",
                        help="Verify prerequisites without running checks")
    args = parser.parse_args()

    logging.basicConfig(
        stream=sys.stdout,
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    log = logging.getLogger("sv-monitor")

    if args.self_check:
        ok = self_check(CONFIG_PATH, DB_PATH)
        return 0 if ok else 2

    if args.status:
        print_status(DB_PATH)
        return 0

    # --- Normal run ---

    if not CONFIG_PATH.exists():
        log.critical("Config not found: %s", CONFIG_PATH)
        return 2

    try:
        config = yaml.safe_load(CONFIG_PATH.read_text())
    except Exception as e:
        log.critical("Failed to parse config: %s", e)
        return 2

    init_db(DB_PATH)

    checks = [
        ServerHealthCheck(config),
        NginxStatusCheck(config),
    ]

    all_results = []
    for check in checks:
        all_results.extend(check.run())

    write_metrics(DB_PATH, all_results)

    warnings = [r for r in all_results if r.severity == "warning"]
    criticals = [r for r in all_results if r.severity == "critical"]

    if args.dry_run:
        if warnings or criticals:
            print("\n[DRY RUN] Alerts that would be sent:")
            for r in criticals + warnings:
                print(f"  {r.severity.upper()}: {r.check_name}/{r.metric_name} -- {r.message}")
        else:
            print("[DRY RUN] All checks OK -- no alerts would be sent")
    else:
        dispatcher = AlertDispatcher(DB_PATH, config)
        dispatcher.process(all_results)

    if criticals:
        return 2
    if warnings:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
