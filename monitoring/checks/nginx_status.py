"""Nginx process, HTTP response, and SSL certificate expiry checks."""
from __future__ import annotations

import logging
import socket
import ssl
import subprocess
from datetime import datetime, timezone

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    import urllib.request

from .base_check import BaseCheck, CheckResult

log = logging.getLogger(__name__)

DOMAIN = "shadowedvaca.com"


class NginxStatusCheck(BaseCheck):
    """Check that Nginx is running, responding, and that SSL isn't expiring soon."""

    def __init__(self, config: dict):
        self._cfg = config.get("server", {})

    @property
    def name(self) -> str:
        return "nginx_status"

    def _run(self) -> list[CheckResult]:
        results = []
        nginx_result, systemctl_available = self._check_nginx_running()
        results.append(nginx_result)
        # Only check HTTP response if systemctl is available (we're on the actual server)
        # and Nginx is not critically down
        if systemctl_available and nginx_result.severity != "critical":
            results.extend(self._check_http_response())
        elif not systemctl_available:
            log.info("Skipping HTTP response check (non-Linux environment)")
        results.extend(self._check_ssl_expiry())
        return results

    # ------------------------------------------------------------------

    def _check_nginx_running(self) -> tuple[CheckResult, bool]:
        """Returns (CheckResult, systemctl_available).

        systemctl_available=False means we're not on a systemd Linux host.
        The caller uses this to decide whether to run subsequent Nginx checks.
        """
        try:
            result = subprocess.run(
                ["systemctl", "is-active", "nginx"],
                capture_output=True,
                text=True,
                timeout=10,
            )
            state = result.stdout.strip()
            if state == "active":
                return (CheckResult(self.name, "nginx_process", 1.0, "", "ok",
                                    "Nginx is active (systemctl)"), True)
            else:
                return (CheckResult(self.name, "nginx_process", 0.0, "", "critical",
                                    f"Nginx is not active: systemctl reports '{state}'"), True)
        except FileNotFoundError:
            # systemctl not available (Windows or non-systemd environment)
            log.info("systemctl not found -- skipping Nginx checks (non-Linux env)")
            return (CheckResult(self.name, "nginx_process", 0.0, "", "ok",
                                "systemctl not available -- skipping (non-Linux environment)"), False)
        except subprocess.TimeoutExpired:
            return (CheckResult(self.name, "nginx_process", 0.0, "", "critical",
                                "systemctl timed out after 10s"), True)
        except Exception as e:
            return (CheckResult(self.name, "nginx_process", 0.0, "", "critical",
                                f"Failed to check Nginx process: {e}"), True)

    def _check_http_response(self) -> list[CheckResult]:
        try:
            if REQUESTS_AVAILABLE:
                resp = requests.get("http://localhost", timeout=10, allow_redirects=True)
                code = resp.status_code
            else:
                req = urllib.request.urlopen("http://localhost", timeout=10)
                code = req.getcode()

            # 200 OK or redirect to HTTPS are both acceptable
            if code in {200, 301, 302}:
                return [CheckResult(self.name, "nginx_http_response", float(code), "", "ok",
                                    f"Nginx responded HTTP {code} on localhost")]
            else:
                return [CheckResult(self.name, "nginx_http_response", float(code), "", "critical",
                                    f"Nginx returned unexpected HTTP {code} on localhost")]
        except Exception as e:
            return [CheckResult(self.name, "nginx_http_response", 0.0, "", "critical",
                                f"Nginx not responding on localhost: {e}")]

    def _check_ssl_expiry(self) -> list[CheckResult]:
        warn_days = self._cfg.get("ssl_warning_days", 14)
        crit_days = self._cfg.get("ssl_critical_days", 7)
        try:
            ctx = ssl.create_default_context()
            with socket.create_connection((DOMAIN, 443), timeout=15) as sock:
                with ctx.wrap_socket(sock, server_hostname=DOMAIN) as ssock:
                    cert = ssock.getpeercert()

            not_after = cert.get("notAfter", "")
            expiry = datetime.strptime(not_after, "%b %d %H:%M:%S %Y %Z").replace(
                tzinfo=timezone.utc
            )
            days_left = (expiry - datetime.now(timezone.utc)).days

            if days_left <= crit_days:
                sev = "critical"
            elif days_left <= warn_days:
                sev = "warning"
            else:
                sev = "ok"

            return [CheckResult(
                self.name, "ssl_expiry_days", float(days_left), "days", sev,
                f"SSL cert for {DOMAIN} expires in {days_left} days ({expiry.date()})",
            )]

        except ssl.SSLError as e:
            return [CheckResult(self.name, "ssl_expiry_days", 0.0, "days", "critical",
                                f"SSL error connecting to {DOMAIN}: {e}")]
        except (socket.timeout, ConnectionRefusedError, OSError) as e:
            # Can't reach the domain from this machine (local dev) -- skip gracefully
            log.info("Cannot connect to %s:443 (%s) -- skipping SSL check", DOMAIN, e)
            return [CheckResult(self.name, "ssl_expiry_days", 0.0, "days", "ok",
                                f"SSL check skipped (cannot reach {DOMAIN}:443 from this host)")]
        except Exception as e:
            return [CheckResult(self.name, "ssl_expiry_days", 0.0, "days", "critical",
                                f"Failed to check SSL expiry: {e}")]
