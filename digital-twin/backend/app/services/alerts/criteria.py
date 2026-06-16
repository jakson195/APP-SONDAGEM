"""Critérios e níveis de alerta geotécnico."""

from dataclasses import dataclass

from app.models.geotech import AlertSeverity


@dataclass(frozen=True)
class AlertThresholds:
    displacement_mm: float = 10.0
    velocity_mm_yr: float = 5.0
    coherence_min: float = 0.4
    critical_displacement_mm: float = 20.0
    critical_velocity_mm_yr: float = 12.0


def severity_for_displacement(
    abs_mm: float, thresholds: AlertThresholds
) -> AlertSeverity | None:
    if abs_mm < thresholds.displacement_mm:
        return None
    if abs_mm >= thresholds.critical_displacement_mm:
        return AlertSeverity.critical
    return AlertSeverity.warning


def severity_for_velocity(
    abs_mm_yr: float, thresholds: AlertThresholds
) -> AlertSeverity | None:
    if abs_mm_yr < thresholds.velocity_mm_yr:
        return None
    if abs_mm_yr >= thresholds.critical_velocity_mm_yr:
        return AlertSeverity.critical
    return AlertSeverity.warning


def severity_for_coherence(
    coherence: float | None, thresholds: AlertThresholds
) -> AlertSeverity | None:
    if coherence is None:
        return None
    if coherence >= thresholds.coherence_min:
        return None
    if coherence < thresholds.coherence_min * 0.5:
        return AlertSeverity.critical
    return AlertSeverity.warning


def max_severity(*levels: AlertSeverity | None) -> AlertSeverity | None:
    order = {
        AlertSeverity.info: 0,
        AlertSeverity.warning: 1,
        AlertSeverity.critical: 2,
    }
    valid = [s for s in levels if s is not None]
    if not valid:
        return None
    return max(valid, key=lambda s: order[s])
