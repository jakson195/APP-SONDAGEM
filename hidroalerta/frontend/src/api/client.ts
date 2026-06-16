import type { ApiDashboard } from "./types";

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export function apiEnabled(): boolean {
  return Boolean(API_BASE);
}

export function wsUrl(): string | null {
  const explicit = import.meta.env.VITE_WS_URL as string | undefined;
  if (explicit) return explicit;
  if (!API_BASE) return null;
  const u = new URL(API_BASE);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/api/v1/ws/live";
  u.search = "";
  return u.toString();
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  if (!res.ok) {
    throw new Error(`API ${res.status}: ${path}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchDashboard(): Promise<ApiDashboard> {
  return request<ApiDashboard>("/api/v1/dashboard");
}

export async function tickDashboard(): Promise<ApiDashboard> {
  return request<ApiDashboard>("/api/v1/dashboard/tick", { method: "POST" });
}
