import { useCallback, useEffect, useState } from "react";

import {
  evaluateAlerts,
  fetchAlertHistory,
  fetchAlertRules,
  fetchNotifications,
  fetchProjectAlerts,
  markAllNotificationsRead,
  markNotificationRead,
  patchAlertStatus,
  updateAlertRules,
  type AlertItem,
  type AlertRules,
  type NotificationItem,
} from "../../api/alerts";
import { useGeotechAlertLayers } from "../../hooks/useGeotechAlertLayers";

type Tab = "ativos" | "historico" | "notificacoes" | "regras";

type Props = {
  projectId: string | null;
};

const SEVERITY_LABEL: Record<string, string> = {
  info: "Info",
  warning: "Atenção",
  critical: "Crítico",
};

const TAB_LABEL: Record<Tab, string> = {
  ativos: "Ativos",
  historico: "Histórico",
  notificacoes: "Notificações",
  regras: "Regras",
};

export function AlertsPanel({ projectId }: Props) {
  const [tab, setTab] = useState<Tab>("ativos");
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [history, setHistory] = useState<AlertItem[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [rules, setRules] = useState<AlertRules | null>(null);
  const [unread, setUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showOnMap, setShowOnMap] = useState(true);

  const { refreshLayers } = useGeotechAlertLayers(projectId, showOnMap);

  const load = useCallback(async () => {
    if (!projectId) return;
    setBusy(true);
    setMsg(null);
    try {
      const [openRes, histRes, notifRes, rulesRes] = await Promise.all([
        fetchProjectAlerts(projectId, { status: "open" }),
        fetchAlertHistory(projectId),
        fetchNotifications(projectId),
        fetchAlertRules(projectId),
      ]);
      setAlerts(openRes.items);
      setHistory(histRes.items);
      setNotifications(notifRes.items);
      setUnread(notifRes.unread_count);
      setRules(rulesRes);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao carregar alertas");
    } finally {
      setBusy(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onEvaluate = async () => {
    if (!projectId) return;
    setBusy(true);
    try {
      const r = await evaluateAlerts(projectId);
      setMsg(
        `Avaliação: ${r.created} novos, ${r.skipped} existentes, ${r.critical_areas} áreas críticas`,
      );
      await load();
      await refreshLayers();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falha na avaliação");
    } finally {
      setBusy(false);
    }
  };

  const onAck = async (id: string) => {
    await patchAlertStatus(id, "acknowledged");
    await load();
    await refreshLayers();
  };

  const onResolve = async (id: string) => {
    await patchAlertStatus(id, "resolved");
    await load();
    await refreshLayers();
  };

  const onReadNotif = async (id: string) => {
    await markNotificationRead(id);
    await load();
  };

  const onReadAll = async () => {
    if (!projectId) return;
    await markAllNotificationsRead(projectId);
    await load();
  };

  const onSaveRules = async () => {
    if (!projectId || !rules) return;
    setBusy(true);
    try {
      const updated = await updateAlertRules(projectId, {
        displacement_mm: rules.displacement_mm,
        velocity_mm_yr: rules.velocity_mm_yr,
        coherence_min: rules.coherence_min,
        critical_displacement_mm: rules.critical_displacement_mm,
        critical_velocity_mm_yr: rules.critical_velocity_mm_yr,
        enabled: rules.enabled,
      });
      setRules(updated);
      setMsg("Regras guardadas");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  };

  if (!projectId) {
    return (
      <section className="alerts-panel">
        <h3>Alertas geotécnicos</h3>
        <p className="hint">Selecione um projeto.</p>
      </section>
    );
  }

  return (
    <section className="alerts-panel">
      <header className="alerts-header">
        <h3>Alertas geotécnicos</h3>
        {unread > 0 && <span className="alerts-unread">{unread}</span>}
      </header>

      <div className="alerts-tabs">
        {(["ativos", "historico", "notificacoes", "regras"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      <div className="alerts-actions">
        <button type="button" disabled={busy} onClick={() => void onEvaluate()}>
          Avaliar critérios
        </button>
        <label className="alerts-map-toggle">
          <input
            type="checkbox"
            checked={showOnMap}
            onChange={(e) => setShowOnMap(e.target.checked)}
          />
          Mapa
        </label>
      </div>

      {msg && <p className="alerts-msg">{msg}</p>}

      {tab === "ativos" && (
        <ul className="alerts-list">
          {alerts.length === 0 && <li className="hint">Nenhum alerta aberto.</li>}
          {alerts.map((a) => (
            <li key={a.id} data-severity={a.severity}>
              <span className={`sev sev-${a.severity}`}>
                {SEVERITY_LABEL[a.severity] ?? a.severity}
              </span>
              <p className="alerts-text">{a.message ?? a.alert_type}</p>
              <p className="alerts-meta">
                {a.parameter_name}: {a.measured_value?.toFixed(1)} (limiar{" "}
                {a.threshold_value?.toFixed(1)})
              </p>
              <div className="alerts-row-btns">
                <button type="button" onClick={() => void onAck(a.id)}>
                  Reconhecer
                </button>
                <button type="button" onClick={() => void onResolve(a.id)}>
                  Resolver
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "historico" && (
        <ul className="alerts-list alerts-list-compact">
          {history.map((a) => (
            <li key={a.id} data-severity={a.severity} data-status={a.status}>
              <span className={`sev sev-${a.severity}`}>{a.status}</span>
              <span>{a.message ?? a.alert_type}</span>
              <time>{new Date(a.triggered_at).toLocaleString("pt-PT")}</time>
            </li>
          ))}
        </ul>
      )}

      {tab === "notificacoes" && (
        <>
          <button type="button" className="btn-link" onClick={() => void onReadAll()}>
            Marcar todas como lidas
          </button>
          <ul className="alerts-list">
            {notifications.map((n) => (
              <li key={n.id} className={n.read_at ? "read" : ""}>
                <strong>{n.title}</strong>
                <p>{n.body}</p>
                <button type="button" onClick={() => void onReadNotif(n.id)}>
                  {n.read_at ? "Lida" : "Marcar lida"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {tab === "regras" && rules && (
        <form
          className="alerts-rules"
          onSubmit={(e) => {
            e.preventDefault();
            void onSaveRules();
          }}
        >
          <label>
            Deslocamento (mm)
            <input
              type="number"
              step="0.1"
              value={rules.displacement_mm}
              onChange={(e) =>
                setRules({ ...rules, displacement_mm: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Velocidade (mm/ano)
            <input
              type="number"
              step="0.1"
              value={rules.velocity_mm_yr}
              onChange={(e) =>
                setRules({ ...rules, velocity_mm_yr: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Coerência mínima
            <input
              type="number"
              step="0.05"
              min={0}
              max={1}
              value={rules.coherence_min}
              onChange={(e) =>
                setRules({ ...rules, coherence_min: Number(e.target.value) })
              }
            />
          </label>
          <label>
            Crítico desloc. (mm)
            <input
              type="number"
              step="0.1"
              value={rules.critical_displacement_mm}
              onChange={(e) =>
                setRules({
                  ...rules,
                  critical_displacement_mm: Number(e.target.value),
                })
              }
            />
          </label>
          <label className="alerts-check">
            <input
              type="checkbox"
              checked={rules.enabled}
              onChange={(e) => setRules({ ...rules, enabled: e.target.checked })}
            />
            Regras ativas
          </label>
          <button type="submit" disabled={busy}>
            Guardar limiares
          </button>
        </form>
      )}

      <p className="alerts-criteria-hint">
        Critérios: |desloc.| &gt; 10 mm, |vel.| &gt; 5 mm/ano, coerência baixa.
      </p>
    </section>
  );
}
