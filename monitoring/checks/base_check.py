"""Base class for all monitoring checks."""
from __future__ import annotations

import logging
import sys
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Literal

Severity = Literal["ok", "warning", "critical"]


@dataclass
class CheckResult:
    check_name: str
    metric_name: str
    value: float
    unit: str
    severity: Severity
    message: str


class BaseCheck(ABC):
    """Base class for all monitoring checks.

    Subclasses implement _run(). The public run() method wraps _run() with
    structured logging and exception handling so a crashed check never
    takes down the entire monitoring run.
    """

    @property
    @abstractmethod
    def name(self) -> str:
        """Human-readable check name."""
        ...

    @abstractmethod
    def _run(self) -> list[CheckResult]:
        """Implement the actual check logic. Called by run()."""
        ...

    def run(self) -> list[CheckResult]:
        """Run the check, log results, and return CheckResult list.

        Any unhandled exception is caught and returned as a critical result.
        """
        log = logging.getLogger(self.name)
        try:
            log.info("Starting check")
            results = self._run()
            for r in results:
                if r.severity == "ok":
                    log.info("OK   %s = %.2f%s | %s", r.metric_name, r.value, r.unit, r.message)
                elif r.severity == "warning":
                    log.warning("WARN %s = %.2f%s | %s", r.metric_name, r.value, r.unit, r.message)
                else:
                    log.error("CRIT %s = %.2f%s | %s", r.metric_name, r.value, r.unit, r.message)
            return results
        except Exception as exc:
            log.exception("Check failed with unhandled exception: %s", exc)
            return [
                CheckResult(
                    check_name=self.name,
                    metric_name="check_error",
                    value=0.0,
                    unit="",
                    severity="critical",
                    message=f"Check raised unhandled exception: {exc}",
                )
            ]
