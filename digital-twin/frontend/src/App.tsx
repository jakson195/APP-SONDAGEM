import { useEffect, useState } from "react";
import { DigitalTwinView } from "./components/DigitalTwinView";
import { GeotechAlertsBell } from "./components/GeotechAlertsBell";
import "./App.css";

type Health = { status: string; postgis?: string };

export default function App() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [postgis, setPostgis] = useState<string | null>(null);
  const [headerProjectId, setHeaderProjectId] = useState<string | null>(null);

  useEffect(() => {
    const base = import.meta.env.VITE_API_URL ?? "";
    fetch(`${base}/api/v1/health/db`)
      .then((r) => r.json())
      .then((d: Health) => {
        setApiOk(d.status === "ok");
        setPostgis(d.postgis ?? null);
      })
      .catch(() => setApiOk(false));
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>Digital Twin</h1>
        <span className="badge" data-ok={String(apiOk)}>
          API {apiOk === null ? "…" : apiOk ? "OK" : "offline"}
        </span>
        {postgis && <span className="meta">PostGIS {postgis}</span>}
        <GeotechAlertsBell
          projectId={headerProjectId}
          onClick={() => {
            document.querySelector(".alerts-panel")?.scrollIntoView({
              behavior: "smooth",
              block: "nearest",
            });
          }}
        />
      </header>
      <main className="app-main">
        <DigitalTwinView onProjectIdChange={setHeaderProjectId} />
      </main>
    </div>
  );
}
