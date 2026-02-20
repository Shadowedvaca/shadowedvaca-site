"""Alert dispatcher -- processes check results and sends alerts."""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from ..checks.base_check import CheckResult

log = logging.getLogger(__name__)

SEVERITY_TAG = {"warning": "[WARNING]", "critical": "[CRITICAL]"}


class AlertDispatcher:
    """Dispatches alerts for warning/critical check results.

    Phase 1: console output only (captured by systemd journal).
    Phase 2 stub: email sending (reads config but doesn't send yet).
    """

    def __init__(self, db_path: Path, config: dict):
        self.db_path = db_path
        alerting = config.get("alerting", {})
        # Convert minutes to seconds for comparison
        self._cooldown_warning = alerting.get("cooldown_warning_minutes", 30) * 60
        self._cooldown_critical = alerting.get("cooldown_critical_minutes", 15) * 60
        self._email_to = alerting.get("email_to", "")

    def process(self, results: list[CheckResult]) -> None:
        """Evaluate results and dispatch alerts for anything non-OK."""
        actionable = [r for r in results if r.severity in ("warning", "critical")]
        if not actionable:
            log.info("All checks OK -- no alerts to dispatch")
            return

        for result in actionable:
            if self._is_in_cooldown(result):
                log.info(
                    "Suppressed (cooldown): %s/%s [%s]",
                    result.check_name, result.metric_name, result.severity,
                )
                self._record_alert(result, notified=False)
            else:
                self._dispatch(result)
                self._record_alert(result, notified=True)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _is_in_cooldown(self, result: CheckResult) -> bool:
        cooldown = (
            self._cooldown_critical
            if result.severity == "critical"
            else self._cooldown_warning
        )
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                """
                SELECT timestamp FROM alert_log
                WHERE check_name = ? AND metric_name = ? AND notified = 1
                ORDER BY timestamp DESC LIMIT 1
                """,
                (result.check_name, result.metric_name),
            ).fetchone()

        if row is None:
            return False

        last_ts = datetime.fromisoformat(row[0])
        if last_ts.tzinfo is None:
            last_ts = last_ts.replace(tzinfo=timezone.utc)
        elapsed = (datetime.now(timezone.utc) - last_ts).total_seconds()
        return elapsed < cooldown

    def _dispatch(self, result: CheckResult) -> None:
        """Send the alert. Phase 1 = console/journal only."""
        tag = SEVERITY_TAG.get(result.severity, "[ALERT]")
        subject = (
            f"[SV-MONITOR] {tag} {result.check_name} -- {result.metric_name} "
            f"at {result.value:.2f}{result.unit}"
        )
        body = (
            f"Check:     {result.check_name}\n"
            f"Metric:    {result.metric_name}\n"
            f"Value:     {result.value:.2f}{result.unit}\n"
            f"Severity:  {result.severity.upper()}\n"
            f"Message:   {result.message}\n"
            f"Timestamp: {datetime.now(timezone.utc).isoformat()}\n"
        )

        # Phase 1: print to stdout so systemd captures it in the journal
        print(f"\n{'='*60}")
        print(subject)
        print(body)
        print("="*60)

        log.warning("ALERT dispatched: %s", subject)

        # Phase 2 stub
        self._send_email_stub(subject, body)

    def _send_email_stub(self, subject: str, body: str) -> None:
        """Placeholder for Phase 2 email implementation."""
        # TODO Phase 2: load secrets.yaml, use smtplib or SendGrid HTTP API
        # smtp_config = load_secrets().get("smtp", {})
        # send_via_smtp(smtp_config, self._email_to, subject, body)
        pass

    def _record_alert(self, result: CheckResult, notified: bool) -> None:
        """Persist alert record to SQLite for cooldown tracking."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO alert_log (timestamp, check_name, metric_name, severity, message, notified)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    datetime.now(timezone.utc).isoformat(),
                    result.check_name,
                    result.metric_name,
                    result.severity,
                    result.message,
                    1 if notified else 0,
                ),
            )
