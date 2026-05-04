"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FieldCampaignMap,
  type FieldMapMode,
} from "@/components/field-campaign-map";
import { ObraLocationStaticPreview } from "@/components/obra-location-static-preview";
import {
  buildGpx,
  buildKml,
  downloadTextFile,
  slugFieldExport,
  type FieldPlacemark,
} from "@/lib/field-export-kml-gpx";
import { CAMPO_TIPO } from "@/lib/campo-sondagem-tipo";
import { apiUrl } from "@/lib/api-url";
import {
  FIELD_GPS_OPTIONS,
  readStoredUserLatLng,
  writeStoredUserLatLng,
} from "@/lib/user-gps-storage";

type FuroRow = {
  id: number;
  codigo: string;
  obraId: number;
  /** spt | rotativa | trado | piezo */
  tipo?: string;
  latitude: number | null;
  longitude: number | null;
};

function hrefRegistoCampo(f: FuroRow): string {
  const t = f.tipo ?? CAMPO_TIPO.spt;
  if (t === CAMPO_TIPO.rotativa) return `/rotativa/${f.id}`;
  if (t === CAMPO_TIPO.trado) return `/trado/${f.id}`;
  if (t === CAMPO_TIPO.piezo) return `/pocos/${f.id}`;
  return `/spt/${f.id}`;
}

function etiquetaAbrirRegisto(f: FuroRow): string {
  const t = f.tipo ?? CAMPO_TIPO.spt;
  if (t === CAMPO_TIPO.rotativa) return "Abrir rotativa";
  if (t === CAMPO_TIPO.trado) return "Abrir trado";
  if (t === CAMPO_TIPO.piezo) return "Abrir piezo";
  return "Abrir SPT";
}

type ObraDetalhe = {
  id: number;
  nome: string;
  cliente: string;
  local: string;
  empresaId: number;
  latitude: number | null;
  longitude: number | null;
};

export default function ObraDetalhe() {
  const params = useParams();
  const idParam = params.id as string;
  const obraId = Number(idParam);

  const [obra, setObra] = useState<ObraDetalhe | null>(null);
  const [furos, setFuros] = useState<FuroRow[]>([]);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [coordX, setCoordX] = useState("");
  const [coordY, setCoordY] = useState("");
  const [mapDirty, setMapDirty] = useState(false);
  const [aGuardarMapa, setAGuardarMapa] = useState(false);
  const [mapMode, setMapMode] = useState<FieldMapMode>("obra");
  const [selectedFuroId, setSelectedFuroId] = useState<number | null>(null);
  const [userGps, setUserGps] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [userGpsIsStored, setUserGpsIsStored] = useState(false);
  const [geoMensagem, setGeoMensagem] = useState<string | null>(null);
  const [recenterKey, setRecenterKey] = useState(0);
  const [furoAGuardar, setFuroAGuardar] = useState<number | null>(null);
  const [aObterGpsParaFuro, setAObterGpsParaFuro] = useState(false);

  const carregarObra = useCallback(async () => {
    if (!Number.isFinite(obraId)) {
      setErro("ID da obra inválido");
      setObra(null);
      return;
    }
    setErro(null);
    try {
      const r = await fetch(apiUrl(`/api/obras/${obraId}`));
      const data = await r.json();
      if (!r.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Erro ao carregar obra",
        );
        setObra(null);
        return;
      }
      const o = data as ObraDetalhe;
      setObra(o);
      if (
        o.latitude != null &&
        o.longitude != null &&
        Number.isFinite(o.latitude) &&
        Number.isFinite(o.longitude)
      ) {
        setCoordX(o.longitude.toFixed(6));
        setCoordY(o.latitude.toFixed(6));
      } else {
        setCoordX("");
        setCoordY("");
      }
      setMapDirty(false);
    } catch {
      setErro("Falha de rede");
      setObra(null);
    }
  }, [obraId]);

  const carregarFuros = useCallback(async () => {
    if (!Number.isFinite(obraId)) {
      setFuros([]);
      return;
    }
    try {
      const r = await fetch(apiUrl(`/api/obra/${obraId}/furos`));
      const data = await r.json();
      if (!r.ok) {
        setFuros([]);
        return;
      }
      setFuros(Array.isArray(data) ? (data as FuroRow[]) : []);
    } catch {
      setFuros([]);
    }
  }, [obraId]);

  useEffect(() => {
    void carregarObra();
  }, [carregarObra]);

  useEffect(() => {
    void carregarFuros();
  }, [carregarFuros]);

  useEffect(() => {
    const p = readStoredUserLatLng();
    if (!p) return;
    setUserGps(p);
    setUserGpsIsStored(true);
    setRecenterKey((k) => k + 1);
  }, []);

  async function criarFuro() {
    if (!Number.isFinite(obraId)) return;
    setErro(null);
    try {
      const r = await fetch(apiUrl("/api/furo"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: codigo.trim(),
          obraId,
          tipo: CAMPO_TIPO.spt,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(
          typeof data.error === "string" ? data.error : "Erro ao criar furo",
        );
        return;
      }
      setCodigo("");
      await carregarFuros();
    } catch {
      setErro("Falha de rede");
    }
  }

  async function guardarLocalizacaoMapa() {
    if (!Number.isFinite(obraId)) return;
    setErro(null);
    const xTrim = coordX.trim();
    const yTrim = coordY.trim();
    const lng = parseFloat(xTrim);
    const lat = parseFloat(yTrim);
    const hasAny = xTrim !== "" || yTrim !== "";
    const bothValid = Number.isFinite(lat) && Number.isFinite(lng);
    if (hasAny && !bothValid) {
      setErro("Preencha longitude e latitude com números válidos, ou deixe os dois vazios para limpar.");
      return;
    }
    setAGuardarMapa(true);
    try {
      const body = bothValid
        ? { latitude: lat, longitude: lng }
        : { latitude: null, longitude: null };

      const r = await fetch(apiUrl(`/api/obras/${obraId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(
          typeof data.error === "string"
            ? data.error
            : "Erro ao guardar localização",
        );
        return;
      }
      setObra(data as ObraDetalhe);
      setMapDirty(false);
    } catch {
      setErro("Falha de rede");
    } finally {
      setAGuardarMapa(false);
    }
  }

  function onMapCoordsChange(x: string, y: string) {
    setCoordX(x);
    setCoordY(y);
    setMapDirty(true);
  }

  const pontoMapaEstatico = useMemo(() => {
    const lng = parseFloat(coordX.trim());
    const lat = parseFloat(coordY.trim());
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }, [coordX, coordY]);

  const obraLatLngMap = pontoMapaEstatico;

  const placemarksExport = useMemo((): FieldPlacemark[] => {
    const out: FieldPlacemark[] = [];
    if (obra && pontoMapaEstatico) {
      out.push({
        name: `Obra: ${obra.nome}`,
        description: "Referência WGS84 (ponto da obra no mapa)",
        lat: pontoMapaEstatico.lat,
        lng: pontoMapaEstatico.lng,
      });
    }
    for (const f of furos) {
      if (
        f.latitude != null &&
        f.longitude != null &&
        Number.isFinite(f.latitude) &&
        Number.isFinite(f.longitude)
      ) {
        out.push({
          name: `Furo ${f.codigo}`,
          description: obra?.nome
            ? `Obra: ${obra.nome}`
            : "Sondagem / SPT",
          lat: f.latitude,
          lng: f.longitude,
        });
      }
    }
    return out;
  }, [obra, pontoMapaEstatico, furos]);

  async function guardarPosicaoFuroNoMapa(furoId: number, lng: number, lat: number) {
    setErro(null);
    setFuroAGuardar(furoId);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(
          typeof data.error === "string"
            ? data.error
            : "Erro ao guardar posição do furo",
        );
        return;
      }
      await carregarFuros();
      setRecenterKey((k) => k + 1);
    } catch {
      setErro("Falha de rede ao guardar furo");
    } finally {
      setFuroAGuardar(null);
    }
  }

  async function limparPosicaoFuro(furoId: number) {
    setErro(null);
    setFuroAGuardar(furoId);
    try {
      const r = await fetch(apiUrl(`/api/furo/${furoId}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: null, longitude: null }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(
          typeof data.error === "string"
            ? data.error
            : "Erro ao limpar posição",
        );
        return;
      }
      await carregarFuros();
      setRecenterKey((k) => k + 1);
    } catch {
      setErro("Falha de rede");
    } finally {
      setFuroAGuardar(null);
    }
  }

  function ondeEstouGps() {
    setGeoMensagem(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMensagem("Geolocalização não disponível neste dispositivo.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserGpsIsStored(false);
        setUserGps({ lat, lng });
        setRecenterKey((k) => k + 1);
      },
      (err) => {
        const cached = readStoredUserLatLng();
        if (cached) {
          setUserGps(cached);
          setUserGpsIsStored(true);
          setRecenterKey((k) => k + 1);
          setGeoMensagem(
            "GPS indisponível — a mostrar a última posição guardada neste dispositivo.",
          );
          return;
        }
        setGeoMensagem(
          err.message === ""
            ? "Permissão negada ou posição indisponível."
            : err.message,
        );
      },
      FIELD_GPS_OPTIONS,
    );
  }

  function usarGpsParaFuroSelecionado() {
    if (selectedFuroId == null) {
      setGeoMensagem("Escolha um furo na lista.");
      return;
    }
    setGeoMensagem(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoMensagem("Geolocalização não disponível neste dispositivo.");
      return;
    }
    const furoId = selectedFuroId;
    setAObterGpsParaFuro(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserGpsIsStored(false);
        setUserGps({ lat, lng });
        setRecenterKey((k) => k + 1);
        void guardarPosicaoFuroNoMapa(furoId, lng, lat).finally(() => {
          setAObterGpsParaFuro(false);
        });
      },
      (err) => {
        setAObterGpsParaFuro(false);
        const cached = readStoredUserLatLng();
        if (cached) {
          setUserGps(cached);
          setUserGpsIsStored(true);
          setRecenterKey((k) => k + 1);
          setGeoMensagem(
            "GPS indisponível — a mostrar a última posição guardada (não gravada no furo).",
          );
          return;
        }
        setGeoMensagem(
          err.message === ""
            ? "Permissão negada ou posição indisponível."
            : err.message,
        );
      },
      FIELD_GPS_OPTIONS,
    );
  }

  function exportarKml() {
    if (!obra || placemarksExport.length === 0) return;
    const slug = slugFieldExport(obra.nome, obra.id);
    const xml = buildKml(placemarksExport, `${obra.nome} — pontos de campo`);
    downloadTextFile(
      `${slug}_pontos.kml`,
      xml,
      "application/vnd.google-earth.kml+xml",
    );
  }

  function exportarGpx() {
    if (!obra || placemarksExport.length === 0) return;
    const slug = slugFieldExport(obra.nome, obra.id);
    const xml = buildGpx(placemarksExport, {
      creator: "APP-SONDAGEM",
      trackName: `${obra.nome} — pontos`,
    });
    downloadTextFile(`${slug}_pontos.gpx`, xml, "application/gpx+xml");
  }

  if (!Number.isFinite(obraId)) {
    return (
      <div className="max-w-2xl p-4 text-[var(--text)]">
        <p className="text-red-600 dark:text-red-400">ID da obra inválido.</p>
      </div>
    );
  }

  if (!obra && !erro) {
    return (
      <div className="max-w-3xl text-[var(--text)]">
        <Link
          href="/obras"
          className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          ← Obras
        </Link>
        <p className="mt-4 text-sm text-[var(--muted)]">A carregar obra…</p>
      </div>
    );
  }

  if (erro && !obra) {
    return (
      <div className="max-w-3xl text-[var(--text)]">
        <Link
          href="/obras"
          className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          ← Obras
        </Link>
        <p className="mt-4 text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl text-[var(--text)]">
      <div className="mb-4">
        <Link
          href="/obras"
          className="text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
        >
          ← Obras
        </Link>
      </div>

      {obra && (
        <div className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
          <h1 className="text-xl font-bold">{obra.nome}</h1>
          <p className="mt-1 text-[var(--muted)]">
            <span className="text-[var(--text)]">{obra.cliente}</span>
          </p>
          <p className="mt-1 text-[var(--muted)]">{obra.local}</p>
        </div>
      )}

      <h2
        id="mapa-campo"
        className="mb-2 scroll-mt-20 text-lg font-semibold"
      >
        Localização no campo (Google Maps)
      </h2>
      <p className="mb-3 text-sm text-[var(--muted)]">
        Estilo aplicativo de mapa no terreno: referência da obra, um pin por furo com GPS
        real, e a sua posição no dispositivo. Coordenadas em WGS84 (graus decimais).
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--muted)]">Modo do mapa:</span>
        <div className="inline-flex rounded-lg border border-[var(--border)] p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setMapMode("obra")}
            className={`rounded-md px-3 py-1.5 font-medium ${
              mapMode === "obra"
                ? "bg-teal-600 text-white"
                : "text-[var(--text)] hover:bg-[var(--surface)]"
            }`}
          >
            Referência da obra
          </button>
          <button
            type="button"
            onClick={() => setMapMode("furo")}
            className={`rounded-md px-3 py-1.5 font-medium ${
              mapMode === "furo"
                ? "bg-teal-600 text-white"
                : "text-[var(--text)] hover:bg-[var(--surface)]"
            }`}
          >
            Marcar furos
          </button>
        </div>
        <button
          type="button"
          onClick={() => ondeEstouGps()}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
        >
          Onde estou (GPS)
        </button>
        <button
          type="button"
          onClick={() => setRecenterKey((k) => k + 1)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)]"
        >
          Ajustar vista
        </button>
        {obra && (
          <>
            <span className="hidden w-px self-stretch bg-[var(--border)] sm:block" aria-hidden />
            <span className="w-full text-[10px] font-medium uppercase tracking-wide text-[var(--muted)] sm:w-auto">
              Exportar
            </span>
            <button
              type="button"
              onClick={() => exportarKml()}
              disabled={placemarksExport.length === 0}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-45"
              title="Google Earth / Avenza Maps"
            >
              KML
            </button>
            <button
              type="button"
              onClick={() => exportarGpx()}
              disabled={placemarksExport.length === 0}
              className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-45"
              title="GPS e aplicações de trilhos"
            >
              GPX
            </button>
          </>
        )}
      </div>
      {obra && placemarksExport.length === 0 && (
        <p className="mb-2 text-[10px] text-[var(--muted)]">
          KML/GPX: defina a referência da obra ou posicione pelo menos um furo para exportar pontos.
        </p>
      )}

      {mapMode === "furo" && (
        <div className="mb-3 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-[var(--muted)]">Furo a posicionar</span>
            <select
              value={selectedFuroId ?? ""}
              onChange={(e) =>
                setSelectedFuroId(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
              className="min-w-[12rem] rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
            >
              <option value="">— Escolher furo —</option>
              {furos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.codigo}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => usarGpsParaFuroSelecionado()}
            disabled={
              selectedFuroId == null ||
              aObterGpsParaFuro ||
              furoAGuardar !== null
            }
            className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {aObterGpsParaFuro ||
            (selectedFuroId != null && furoAGuardar === selectedFuroId)
              ? "A aplicar GPS…"
              : "Usar posição GPS neste furo"}
          </button>
          <p className="max-w-xl text-xs text-[var(--muted)]">
            Toque no mapa no local exato ou use o botão azul com o GPS do telemóvel (em campo).
            Pins com o código do furo; exporte KML/GPX para o Avenza ou outro app.
          </p>
        </div>
      )}

      {geoMensagem && (
        <p className="mb-2 text-xs text-amber-800 dark:text-amber-200" role="status">
          {geoMensagem}
        </p>
      )}

      <div className="mb-3 flex flex-wrap gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted)]">Longitude (°)</span>
          <input
            type="text"
            inputMode="decimal"
            value={coordX}
            onChange={(e) => {
              setCoordX(e.target.value);
              setMapDirty(true);
            }}
            className="w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm"
            placeholder="ex. -48.55"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-[var(--muted)]">Latitude (°)</span>
          <input
            type="text"
            inputMode="decimal"
            value={coordY}
            onChange={(e) => {
              setCoordY(e.target.value);
              setMapDirty(true);
            }}
            className="w-36 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-sm"
            placeholder="ex. -27.59"
          />
        </label>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={() => void guardarLocalizacaoMapa()}
            disabled={aGuardarMapa || !mapDirty}
            className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
          >
            {aGuardarMapa ? "A guardar…" : "Guardar localização da obra"}
          </button>
        </div>
      </div>

      <p className="mb-3 text-xs text-[var(--muted)]">
        Os furos são guardados ao tocar no mapa em modo “Marcar furos”. A referência da obra
        usa o botão acima.
      </p>

      <FieldCampaignMap
        obraPosition={obraLatLngMap}
        furos={furos}
        mapMode={mapMode}
        selectedFuroId={selectedFuroId}
        userPosition={userGps}
        userPositionTitle={
          userGpsIsStored
            ? "A sua posição (última guardada neste dispositivo)"
            : "A sua posição (GPS)"
        }
        recenterKey={recenterKey}
        onObraMapClick={(lng, lat) => {
          onMapCoordsChange(lng.toFixed(6), lat.toFixed(6));
        }}
        onFuroMapClick={(furoId, lng, lat) => {
          void guardarPosicaoFuroNoMapa(furoId, lng, lat);
        }}
        hint={
          <p className="mt-2 text-xs text-[var(--muted)]">
            {mapMode === "obra"
              ? "Toque no mapa para mover a referência da obra; depois use Guardar localização."
              : "Escolha o furo na lista e toque no mapa. Ponto azul = a sua posição (GPS ou última guardada neste dispositivo se estiver offline)."}
          </p>
        }
      />

      {obra && pontoMapaEstatico && (
        <ObraLocationStaticPreview
          lat={pontoMapaEstatico.lat}
          lng={pontoMapaEstatico.lng}
          obraId={obra.id}
          obraNome={obra.nome}
        />
      )}

      <div className="mb-4 mt-10 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Furos da obra</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Link
            href={`/spt?obraId=${obraId}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-[var(--surface)] dark:text-teal-400"
          >
            Hub SPT
          </Link>
          <Link
            href={`/rotativa?obraId=${obraId}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-[var(--surface)] dark:text-teal-400"
          >
            Hub rotativa
          </Link>
          <Link
            href={`/trado?obraId=${obraId}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-[var(--surface)] dark:text-teal-400"
          >
            Hub trado
          </Link>
          <Link
            href={`/pocos?obraId=${obraId}`}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm font-medium text-teal-600 hover:bg-[var(--surface)] dark:text-teal-400"
          >
            Hub piezo
          </Link>
        </div>
      </div>

      {erro && (
        <p className="mb-3 text-sm text-red-600 dark:text-red-400" role="alert">
          {erro}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Código do furo"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          className="min-w-[12rem] flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 text-sm"
        />
        <button
          type="button"
          onClick={() => void criarFuro()}
          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Criar
        </button>
      </div>

      <ul className="mt-4 space-y-2">
        {furos.map((f) => (
          <li
            key={f.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] p-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <span className="font-mono font-medium">{f.codigo}</span>
              {f.tipo != null && f.tipo !== "" && (
                <span className="ml-2 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-medium uppercase text-[var(--muted)]">
                  {f.tipo}
                </span>
              )}
              {f.latitude != null &&
                f.longitude != null &&
                Number.isFinite(f.latitude) &&
                Number.isFinite(f.longitude) && (
                  <p className="mt-1 font-mono text-[10px] text-[var(--muted)]">
                    {f.latitude.toFixed(6)}°, {f.longitude.toFixed(6)}°
                  </p>
                )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(f.latitude != null || f.longitude != null) && (
                <button
                  type="button"
                  disabled={furoAGuardar === f.id}
                  onClick={() => void limparPosicaoFuro(f.id)}
                  className="text-xs font-medium text-[var(--muted)] underline hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400"
                >
                  Limpar GPS
                </button>
              )}
              <Link
                href={hrefRegistoCampo(f)}
                className="font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
              >
                {etiquetaAbrirRegisto(f)}
              </Link>
            </div>
          </li>
        ))}
      </ul>

      {!erro && furos.length === 0 && obra && (
        <p className="mt-4 text-sm text-[var(--muted)]">Nenhum furo registado.</p>
      )}
    </div>
  );
}
