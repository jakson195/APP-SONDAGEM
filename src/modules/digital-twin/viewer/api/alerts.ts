import { resolveGeoApiBase } from "./geo-base";

export type AlertSeverity = "info" | "warning" | "critical";
export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface AlertItem {
  id: string;
  project_id: string;
  alert_type: string;
  severity: AlertSeverity;
  status: AlertStatus;
  parameter_name: string | null;
  measured_value: number | null;
  threshold_value: number | null;
  message: string | null;
  geometry: GeoJSON.Geometry | null;
  triggered_at: string;
  resolved_at: string | null;
  properties: Record<string, unknown>;
}

export interface AlertRules {
  project_id: string;
  displacement_mm: number;
  velocity_mm_yr: number;
  coherence_min: number;
  critical_displacement_mm: number;
  critical_velocity_mm_yr: number;
  enabled: boolean;
  updated_at: string;
}

export interface NotificationItem {
  id: string;
  project_id: string;
  alert_id: string;
  channel: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  alert_severity: AlertSeverity | null;
  alert_status: AlertStatus | null;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const base = resolveGeoApiBase();
  const res = await fetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function pid(projectId: string): string {
  return encodeURIComponent(projectId);
}

export function fetchProjectAlerts(
  projectId: string,
  params?: { status?: AlertStatus; severity?: AlertSeverity },
): Promise<{ items: AlertItem[]; total: number }> {
  const q = new URLSearchParams();
  if (params?.status) q.set("status", params.status);
  if (params?.severity) q.set("severity", params.severity);
  const qs = q.toString();
  return api(`/v1/projects/${pid(projectId)}/alerts${qs ? `?${qs}` : ""}`);
}

export function fetchAlertHistory(
  projectId: string,
): Promise<{ items: AlertItem[]; total: number }> {
  return api(`/v1/projects/${pid(projectId)}/alerts/history?limit=500`);
}

export function fetchAlertRules(projectId: string): Promise<AlertRules> {
  return api(`/v1/projects/${pid(projectId)}/alerts/rules`);
}

export function updateAlertRules(
  projectId: string,
  body: Partial<
    Pick<
      AlertRules,
      | "displacement_mm"
      | "velocity_mm_yr"
      | "coherence_min"
      | "critical_displacement_mm"
      | "critical_velocity_mm_yr"
      | "enabled"
    >
  >,
): Promise<AlertRules> {
  return api(`/v1/projects/${pid(projectId)}/alerts/rules`, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function evaluateAlerts(
  projectId: string,
): Promise<{
  created: number;
  skipped: number;
  evaluated: number;
  critical_areas: number;
}> {
  return api(`/v1/projects/${pid(projectId)}/alerts/evaluate`, { method: "POST" });
}

export function patchAlertStatus(
  alertId: string,
  status: AlertStatus,
): Promise<AlertItem> {
  return api(`/v1/alerts/${encodeURIComponent(alertId)}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function fetchNotifications(
  projectId: string,
  unreadOnly = false,
): Promise<{ items: NotificationItem[]; total: number; unread_count: number }> {
  const q = unreadOnly ? "?unread_only=true" : "";
  return api(`/v1/projects/${pid(projectId)}/notifications${q}`);
}

export function markNotificationRead(notificationId: string): Promise<void> {
  return api(`/v1/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
  });
}

export function markAllNotificationsRead(projectId: string): Promise<void> {
  return api(`/v1/projects/${pid(projectId)}/notifications/read-all`, {
    method: "POST",
  });
}

export function fetchCriticalAreasGeoJSON(
  projectId: string,
): Promise<GeoJSON.FeatureCollection> {
  return api(`/v1/projects/${pid(projectId)}/critical-areas/geojson`);
}

export function alertsToGeoJSON(items: AlertItem[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items
      .filter((a) => a.geometry)
      .map((a) => ({
        type: "Feature",
        geometry: a.geometry!,
        properties: {
          id: a.id,
          severity: a.severity,
          alert_type: a.alert_type,
          message: a.message,
          measured_value: a.measured_value,
        },
      })),
  };
}
