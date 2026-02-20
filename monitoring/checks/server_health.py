"""Server resource health checks: disk, memory, CPU, swap, processes."""
from __future__ import annotations

import logging

try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False

from .base_check import BaseCheck, CheckResult

log = logging.getLogger(__name__)


class ServerHealthCheck(BaseCheck):
    """Check disk, memory, CPU, swap, and process health via psutil."""

    def __init__(self, config: dict):
        self._cfg = config.get("server", {})

    @property
    def name(self) -> str:
        return "server_health"

    def _run(self) -> list[CheckResult]:
        if not PSUTIL_AVAILABLE:
            return [CheckResult(
                check_name=self.name,
                metric_name="psutil_import",
                value=0.0,
                unit="",
                severity="critical",
                message="psutil is not installed -- run: pip install psutil",
            )]

        results = []
        results.extend(self._check_disk())
        results.extend(self._check_memory())
        results.extend(self._check_swap())
        results.extend(self._check_cpu())
        results.extend(self._check_iowait())
        results.extend(self._check_processes())
        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _severity(self, value: float, warn: float, crit: float) -> str:
        if value >= crit:
            return "critical"
        if value >= warn:
            return "warning"
        return "ok"

    # ------------------------------------------------------------------
    # Individual checks
    # ------------------------------------------------------------------

    def _check_disk(self) -> list[CheckResult]:
        try:
            usage = psutil.disk_usage("/")
            pct = usage.percent
            warn = self._cfg.get("disk_warning_pct", 75)
            crit = self._cfg.get("disk_critical_pct", 90)
            sev = self._severity(pct, warn, crit)
            used_gb = usage.used / 1_073_741_824
            total_gb = usage.total / 1_073_741_824
            msg = f"Disk: {pct:.1f}% used ({used_gb:.1f}GB / {total_gb:.1f}GB)"
            return [CheckResult(self.name, "disk_usage_pct", pct, "%", sev, msg)]
        except Exception as e:
            return [CheckResult(self.name, "disk_usage_pct", 0.0, "%", "critical",
                                f"Could not read disk usage: {e}")]

    def _check_memory(self) -> list[CheckResult]:
        try:
            mem = psutil.virtual_memory()
            pct = mem.percent
            warn = self._cfg.get("memory_warning_pct", 75)
            crit = self._cfg.get("memory_critical_pct", 90)
            sev = self._severity(pct, warn, crit)
            used_mb = mem.used // 1_048_576
            total_mb = mem.total // 1_048_576
            msg = f"Memory: {pct:.1f}% used ({used_mb}MB / {total_mb}MB)"
            return [CheckResult(self.name, "memory_usage_pct", pct, "%", sev, msg)]
        except Exception as e:
            return [CheckResult(self.name, "memory_usage_pct", 0.0, "%", "critical",
                                f"Could not read memory usage: {e}")]

    def _check_swap(self) -> list[CheckResult]:
        try:
            swap = psutil.swap_memory()
            if swap.total == 0:
                return [CheckResult(self.name, "swap_usage_pct", 0.0, "%", "ok",
                                    "No swap configured")]
            pct = swap.percent
            warn = self._cfg.get("swap_warning_pct", 50)
            crit = self._cfg.get("swap_critical_pct", 80)
            sev = self._severity(pct, warn, crit)
            used_mb = swap.used // 1_048_576
            total_mb = swap.total // 1_048_576
            msg = f"Swap: {pct:.1f}% used ({used_mb}MB / {total_mb}MB)"
            return [CheckResult(self.name, "swap_usage_pct", pct, "%", sev, msg)]
        except Exception as e:
            return [CheckResult(self.name, "swap_usage_pct", 0.0, "%", "critical",
                                f"Could not read swap usage: {e}")]

    def _check_cpu(self) -> list[CheckResult]:
        try:
            # 1-second sample for a reasonable non-zero reading
            cpu_pct = psutil.cpu_percent(interval=1)
            warn = self._cfg.get("cpu_warning_pct", 80)
            crit = self._cfg.get("cpu_critical_pct", 95)
            sev = self._severity(cpu_pct, warn, crit)
            # Load average only on Unix
            if hasattr(psutil, "getloadavg"):
                load = psutil.getloadavg()
                msg = f"CPU: {cpu_pct:.1f}% (load avg 1m/5m/15m: {load[0]:.2f}/{load[1]:.2f}/{load[2]:.2f})"
            else:
                msg = f"CPU: {cpu_pct:.1f}%"
            return [CheckResult(self.name, "cpu_usage_pct", cpu_pct, "%", sev, msg)]
        except Exception as e:
            return [CheckResult(self.name, "cpu_usage_pct", 0.0, "%", "critical",
                                f"Could not read CPU usage: {e}")]

    def _check_iowait(self) -> list[CheckResult]:
        try:
            times = psutil.cpu_times_percent(interval=1)
            if not hasattr(times, "iowait"):
                # Not available on Windows
                return []
            iowait = times.iowait
            warn = self._cfg.get("iowait_warning_pct", 30)
            crit = self._cfg.get("iowait_critical_pct", 50)
            sev = self._severity(iowait, warn, crit)
            msg = f"I/O wait: {iowait:.1f}%"
            return [CheckResult(self.name, "iowait_pct", iowait, "%", sev, msg)]
        except Exception as e:
            log.warning("Could not read iowait: %s", e)
            return []

    def _check_processes(self) -> list[CheckResult]:
        results = []
        try:
            # Zombie processes
            zombies = [
                p for p in psutil.process_iter(["status"])
                if p.info.get("status") == psutil.STATUS_ZOMBIE
            ]
            if zombies:
                sev = "warning" if len(zombies) < 5 else "critical"
                results.append(CheckResult(
                    self.name, "zombie_processes", float(len(zombies)), "", sev,
                    f"{len(zombies)} zombie process(es) found",
                ))

            # Any single process using >50% of total RAM is suspicious on a 2GB box
            total_mem = psutil.virtual_memory().total
            threshold = 0.50
            for proc in psutil.process_iter(["pid", "name", "memory_info"]):
                try:
                    mem_info = proc.info.get("memory_info")
                    if mem_info and mem_info.rss > total_mem * threshold:
                        pct = mem_info.rss / total_mem * 100
                        results.append(CheckResult(
                            self.name, "high_memory_process", pct, "%", "warning",
                            f"Process '{proc.info['name']}' (pid {proc.info['pid']}) "
                            f"using {pct:.1f}% of total RAM",
                        ))
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    pass
        except Exception as e:
            log.warning("Could not inspect processes: %s", e)
        return results
