"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FieldCampaignMap,
  type FieldFuroPin,
} from "@/components/field-campaign-map";
import { wgsPairFromInputs } from "@/lib/spt-map-coords";
import { apiUrl } from "@/lib/api-url";
import {
  FIELD_GPS_OPTIONS,
  readStoredUserLatLng,
  writeStoredUserLatLng,
} from "@/lib/user-gps-storage";

type MapLngLat = { lat: number; lng: number };

export type CampoFuroLocalizacaoSecaoProps = {
  furoId: number;
  codigoFuro: string;
  obraRefMapa: google.maps.LatLngLiteral | null;
  mapaRelLatStr: string;
  mapaRelLngStr: string;
  onMapaRelLatStr: (v: string) => void;
  onMapaRelLngStr: (v: string) => void;
};

export function CampoFuroLocalizacaoSecao({
  furoId,
  codigoFuro,
  obraRefMapa,
  mapaRelLatStr,
  mapaRelLngStr,
  onMapaRelLatStr,
  onMapaRelLngStr,
}: CampoFuroLocalizacaoSecaoProps) {
  const [userGps, setUserGps] = useState<MapLngLat | null>(null);
  /** Posição vinda de `localStorage` (última fixação neste dispositivo), não GPS em direto. */
  const [userGpsIsStored, setUserGpsIsStored] = useState(false);
  const [mapRecenterKey, setMapRecenterKey] = useState(0);
  const [aGuardarFuroGps, setAGuardarFuroGps] = useState(false);
  const [mapaFuroMsg, setMapaFuroMsg] = useState<string | null>(null);

  const furosParaMapa = useMemo((): FieldFuroPin[] => {
    const p = wgsPairFromInputs(mapaRelLatStr, mapaRelLngStr);
    return [
      {
        id: furoId,
        codigo: codigoFuro.trim() || "Furo",
        latitude: p?.lat ?? null,
        longitude: p?.lng ?? null,
      },
    ];
  }, [furoId, codigoFuro, mapaRelLatStr, mapaRelLngStr]);

  useEffect(() => {
    const p = readStoredUserLatLng();
    if (!p) return;
    setUserGps(p);
    setUserGpsIsStored(true);
    setMapRecenterKey((k) => k + 1);
  }, []);

  const guardarClickMapaFuro = useCallback(
    async (_fid: number, lng: number, lat: number) => {
      setAGuardarFuroGps(true);
      setMapaFuroMsg(null);
      try {
        const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ latitude: lat, longitude: lng }),
        });
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) {
          setMapaFuroMsg(
            typeof data.error === "string"
              ? data.error
              : "Erro ao guardar posição do furo",
          );
          return;
        }
        onMapaRelLatStr(lat.toFixed(6));
        onMapaRelLngStr(lng.toFixed(6));
        setMapRecenterKey((k) => k + 1);
      } catch {
        setMapaFuroMsg("Falha de rede ao guardar GPS");
      } finally {
        setAGuardarFuroGps(false);
      }
    },
    [furoId, onMapaRelLatStr, onMapaRelLngStr],
  );

  async function limparGpsFuro() {
    setAGuardarFuroGps(true);
    setMapaFuroMsg(null);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: null, longitude: null }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setMapaFuroMsg(
          typeof data.error === "string"
            ? data.error
            : "Erro ao limpar posição",
        );
        return;
      }
      onMapaRelLatStr("");
      onMapaRelLngStr("");
      setMapRecenterKey((k) => k + 1);
    } catch {
      setMapaFuroMsg("Falha de rede");
    } finally {
      setAGuardarFuroGps(false);
    }
  }

  function verMinhaPosicaoNoMapa() {
    setMapaFuroMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapaFuroMsg("Geolocalização não disponível neste dispositivo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserGpsIsStored(false);
        setUserGps({ lat, lng });
        setMapRecenterKey((k) => k + 1);
      },
      (err) => {
        const cached = readStoredUserLatLng();
        if (cached) {
          setUserGps(cached);
          setUserGpsIsStored(true);
          setMapRecenterKey((k) => k + 1);
          setMapaFuroMsg(
            "GPS indisponível — a mostrar a última posição guardada neste dispositivo.",
          );
          return;
        }
        setMapaFuroMsg(
          err.message === ""
            ? "Permissão negada ou posição indisponível."
            : err.message,
        );
      },
      FIELD_GPS_OPTIONS,
    );
  }

  function marcarFuroComGpsAutomatico() {
    setMapaFuroMsg(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setMapaFuroMsg("Geolocalização não disponível neste dispositivo.");
      return;
    }
    setAGuardarFuroGps(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserGpsIsStored(false);
        setUserGps({ lat, lng });
        void (async () => {
          try {
            const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ latitude: lat, longitude: lng }),
            });
            const data = (await r.json().catch(() => ({}))) as {
              error?: string;
            };
            if (!r.ok) {
              setMapaFuroMsg(
                typeof data.error === "string"
                  ? data.error
                  : "Erro ao guardar posição do furo",
              );
              return;
            }
            onMapaRelLatStr(lat.toFixed(6));
            onMapaRelLngStr(lng.toFixed(6));
            setMapRecenterKey((k) => k + 1);
            setMapaFuroMsg(null);
          } catch {
            setMapaFuroMsg("Falha de rede ao guardar GPS");
          } finally {
            setAGuardarFuroGps(false);
          }
        })();
      },
      (err) => {
        setAGuardarFuroGps(false);
        const cached = readStoredUserLatLng();
        if (cached) {
          setUserGps(cached);
          setUserGpsIsStored(true);
          setMapRecenterKey((k) => k + 1);
          setMapaFuroMsg(
            "GPS indisponível — a mostrar a última posição guardada neste dispositivo (não gravada no furo).",
          );
          return;
        }
        setMapaFuroMsg(
          err.message === ""
            ? "Permissão negada ou posição indisponível."
            : err.message,
        );
      },
      FIELD_GPS_OPTIONS,
    );
  }

  return (
    <section
      className="mb-8 print:hidden"
      aria-label="Localização do furo no mapa"
    >
      <h2 className="mb-2 text-lg font-semibold text-[var(--text)]">
        Localização do furo (mapa)
      </h2>
      <p className="mb-3 max-w-3xl text-sm text-[var(--muted)]">
        <strong className="text-[var(--text)]">Automático:</strong> use «Marcar
        com GPS» para gravar a posição atual do telemóvel neste furo.{" "}
        <strong className="text-[var(--text)]">Manual:</strong> toque no mapa
        no ponto exato do furo (também grava na hora). «Ver só a minha posição»
        mostra o ponto azul sem gravar. O marcador «Obra» é a referência da
        obra, se existir.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={aGuardarFuroGps}
          onClick={marcarFuroComGpsAutomatico}
          className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
        >
          Marcar com GPS (automático)
        </button>
        <button
          type="button"
          disabled={aGuardarFuroGps}
          onClick={verMinhaPosicaoNoMapa}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50"
        >
          Ver só a minha posição
        </button>
        <button
          type="button"
          disabled={
            aGuardarFuroGps || !wgsPairFromInputs(mapaRelLatStr, mapaRelLngStr)
          }
          onClick={() => void limparGpsFuro()}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--muted)] hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
        >
          Limpar posição do furo
        </button>
        {aGuardarFuroGps && (
          <span className="text-sm text-[var(--muted)]">A guardar…</span>
        )}
      </div>
      {mapaFuroMsg && (
        <p
          className="mb-3 text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {mapaFuroMsg}
        </p>
      )}
      <FieldCampaignMap
        obraPosition={obraRefMapa}
        furos={furosParaMapa}
        mapMode="furo"
        selectedFuroId={furoId}
        userPosition={userGps}
        userPositionTitle={
          userGpsIsStored
            ? "A sua posição (última guardada neste dispositivo)"
            : "A sua posição (GPS)"
        }
        recenterKey={mapRecenterKey}
        onObraMapClick={() => {}}
        onFuroMapClick={(id, lng, lat) =>
          void guardarClickMapaFuro(id, lng, lat)
        }
        hint={
          <p className="mt-2 text-xs text-[var(--muted)]">
            <strong className="text-[var(--text)]">Manual:</strong> toque no
            mapa para definir ou corrigir o pino do furo.
          </p>
        }
      />
    </section>
  );
}
