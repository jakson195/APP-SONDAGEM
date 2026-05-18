/** Suporte à UI de alertas sem base geotech (PostGIS) — até migração completa. */

export type GeoAlertRules = {
  project_id: string;
  displacement_mm: number;
  velocity_mm_yr: number;
  coherence_min: number;
  critical_displacement_mm: number;
  critical_velocity_mm_yr: number;
  enabled: boolean;
  updated_at: string;
};

const rulesMem = new Map<string, GeoAlertRules>();

export function getAlertRules(projectId: string): GeoAlertRules {
  let r = rulesMem.get(projectId);
  if (!r) {
    r = {
      project_id: projectId,
      displacement_mm: 10,
      velocity_mm_yr: 5,
      coherence_min: 0.4,
      critical_displacement_mm: 20,
      critical_velocity_mm_yr: 12,
      enabled: true,
      updated_at: new Date().toISOString(),
    };
    rulesMem.set(projectId, r);
  }
  return r;
}

export function updateAlertRules(
  projectId: string,
  body: Partial<
    Pick<
      GeoAlertRules,
      | "displacement_mm"
      | "velocity_mm_yr"
      | "coherence_min"
      | "critical_displacement_mm"
      | "critical_velocity_mm_yr"
      | "enabled"
    >
  >,
): GeoAlertRules {
  const cur = getAlertRules(projectId);
  const next: GeoAlertRules = {
    ...cur,
    ...body,
    project_id: projectId,
    updated_at: new Date().toISOString(),
  };
  rulesMem.set(projectId, next);
  return next;
}

export function evaluateAlertsStub(projectId: string): {
  created: number;
  skipped: number;
  evaluated: number;
  critical_areas: number;
} {
  const r = getAlertRules(projectId);
  if (!r.enabled) {
    return { created: 0, skipped: 0, evaluated: 0, critical_areas: 0 };
  }
  return {
    created: 0,
    skipped: 0,
    evaluated: 0,
    critical_areas: 0,
  };
}

export function emptyAlertList(): { items: unknown[]; total: number } {
  return { items: [], total: 0 };
}

export function emptyNotifications(): {
  items: unknown[];
  total: number;
  unread_count: number;
} {
  return { items: [], total: 0, unread_count: 0 };
}

export function emptyCriticalAreasGeoJSON(): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features: [] };
}
