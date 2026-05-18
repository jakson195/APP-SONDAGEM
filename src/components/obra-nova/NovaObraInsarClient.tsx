"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Polygon } from "geojson";
import {
  ArrowLeft,
  FolderPlus,
  Layers,
  MapPin,
  Radar,
  Satellite,
  Trash2,
} from "lucide-react";

import { useObraModulos } from "@/components/obra-context";
import { ObraNovaCesiumPreview } from "@/components/obra-nova/ObraNovaCesiumPreview";
import { ObraNovaLeafletMap } from "@/lib/mapa";
import type { LeafletLatLng } from "@/components/obra-nova/ObraNovaLeafletMap";
import { apiUrl } from "@/lib/api-url";
import { geoJsonPolygonToWkt } from "@/lib/geojson-polygon-wkt";
import { DIGITAL_TWIN_BASE } from "@/modules/registry";
import {
  defaultModulosProjetoTodosAtivos,
  type ModuloProjetoChave,
} from "@/lib/modulos-projeto";
import { polygonCentroidLngLat } from "@/lib/obra-aoi-polygon";
import { OBRA_STATUS_LABEL, OBRA_STATUS_ORDER } from "@/lib/obra-status";

type EmpresaOpt = { id: number; nome: string };

const MONITORAMENTO_TIPOS = [
  { value: "INSAR_SENTINEL1", label: "InSAR · Sentinel-1" },
  { value: "INSAR_TSX", label: "InSAR · TerraSAR-X / TanDEM-X" },
  { value: "GNSS_PERMANENTE", label: "GNSS permanente" },
  { value: "GNSS_CAMPAIGN", label: "GNSS campanha" },
  { value: "MULTI_SENSOR", label: "Multi-sensor / integrado" },
  { value: "OUTRO", label: "Outro (notas na descrição)" },
] as const;

function modulesPresetInsar(): Record<ModuloProjetoChave, boolean> {
  return {
    ...defaultModulosProjetoTodosAtivos(),
    insar: true,
    digital_twin: true,
  };
}

function verticesLeafletToPolygon(
  vertices: LeafletLatLng[],
): Polygon | null {
  if (vertices.length < 3) return null;
  const outer = vertices.map(([lat, lng]) => [lng, lat] as [number, number]);
  const first = outer[0]!;
  const last = outer[outer.length - 1]!;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    outer.push([first[0], first[1]]);
  }
  return { type: "Polygon", coordinates: [outer] };
}

function parseCoord(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function NovaObraInsarClient() {
  const router = useRouter();
  const { setObraContext } = useObraModulos();

  const [nome, setNome] = useState("");
  const [cliente, setCliente] = useState("");
  const [local, setLocal] = useState("Área de estudo InSAR");
  const [description, setDescription] = useState("");
  const [latitudeStr, setLatitudeStr] = useState("-15.75");
  const [longitudeStr, setLongitudeStr] = useState("-47.75");
  const [tipoMonitoramento, setTipoMonitoramento] = useState<string>(
    MONITORAMENTO_TIPOS[0]!.value,
  );
  const [obraStatus, setObraStatus] = useState<string>("DRAFT");

  const [empresas, setEmpresas] = useState<EmpresaOpt[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [novaEmpresaNome, setNovaEmpresaNome] = useState("");

  const [drawing, setDrawing] = useState(false);
  const [vertices, setVertices] = useState<LeafletLatLng[]>([]);
  const [aoiPolygon, setAoiPolygon] = useState<Polygon | null>(null);

  const [loadingEmpresas, setLoadingEmpresas] = useState(true);
  const [loadingSave, setLoadingSave] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const selectedCompany = empresas.find((e) => String(e.id) === companyId);

  const carregarEmpresas = useCallback(async () => {
    setLoadingEmpresas(true);
    setErro(null);
    try {
      const r = await fetch(apiUrl("/api/empresas"));
      const data = await r.json();
      if (!r.ok) {
        setErro(
          typeof data.error === "string"
            ? data.error
            : "Erro ao carregar empresas",
        );
        setEmpresas([]);
        return;
      }
      const list = Array.isArray(data) ? (data as EmpresaOpt[]) : [];
      setEmpresas(list);
      setCompanyId((prev) => {
        if (prev && list.some((e) => String(e.id) === prev)) return prev;
        return list[0] ? String(list[0].id) : "";
      });
    } catch {
      setErro("Falha de rede ao carregar empresas");
      setEmpresas([]);
    } finally {
      setLoadingEmpresas(false);
    }
  }, []);

  useEffect(() => {
    void carregarEmpresas();
  }, [carregarEmpresas]);

  useEffect(() => {
    const sel = empresas.find((e) => String(e.id) === companyId);
    if (sel) setCliente(sel.nome);
  }, [companyId, empresas]);

  const latN = parseCoord(latitudeStr);
  const lngN = parseCoord(longitudeStr);
  const mapCenter = useMemo<LeafletLatLng>(() => {
    if (latN != null && lngN != null) return [latN, lngN];
    return [-15.75, -47.75];
  }, [latN, lngN]);

  async function criarEmpresa() {
    const n = novaEmpresaNome.trim();
    if (!n) {
      setErro("Indique o nome da empresa.");
      return;
    }
    setErro(null);
    setLoadingSave(true);
    try {
      const r = await fetch(apiUrl("/api/empresas"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: n }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErro(
          typeof data.error === "string"
            ? data.error
            : "Não foi possível criar a empresa",
        );
        return;
      }
      setNovaEmpresaNome("");
      await carregarEmpresas();
      if (typeof data.id === "number") {
        setCompanyId(String(data.id));
      }
    } catch {
      setErro("Falha de rede ao criar empresa");
    } finally {
      setLoadingSave(false);
    }
  }

  function onAddVertex(lat: number, lng: number) {
    if (!drawing || aoiPolygon) return;
    setVertices((prev) => [...prev, [lat, lng]]);
  }

  function toggleDrawing() {
    setDrawing((prev) => {
      const next = !prev;
      if (next && aoiPolygon) {
        setAoiPolygon(null);
        setVertices([]);
      }
      return next;
    });
  }

  function fecharPoligono() {
    setErro(null);
    const poly = verticesLeafletToPolygon(vertices);
    if (!poly || !geoJsonPolygonToWkt(poly)) {
      setErro(
        "Polígono inválido: são necessários pelo menos 3 vértices e um polígono fechado.",
      );
      return;
    }
    setAoiPolygon(poly);
    const c = polygonCentroidLngLat(poly);
    setLatitudeStr(String(Number(c.lat.toFixed(7))));
    setLongitudeStr(String(Number(c.lng.toFixed(7))));
    setDrawing(false);
  }

  function limparAoi() {
    setVertices([]);
    setAoiPolygon(null);
    setDrawing(false);
    setErro(null);
  }

  async function salvar() {
    setErro(null);
    const cid = Number(companyId);
    if (!Number.isFinite(cid)) {
      setErro("Selecione uma empresa.");
      return;
    }
    const n = nome.trim();
    if (!n) {
      setErro("Indique o nome da obra.");
      return;
    }
    if (!aoiPolygon || !geoJsonPolygonToWkt(aoiPolygon)) {
      setErro("Desenhe e feche o polígono da área de interesse antes de guardar.");
      return;
    }
    const lat = latN;
    const lng = lngN;
    if (lat == null || lng == null || lat < -90 || lat > 90) {
      setErro("Latitude inválida.");
      return;
    }
    if (lng < -180 || lng > 180) {
      setErro("Longitude inválida.");
      return;
    }

    setLoadingSave(true);
    try {
      const res = await fetch(apiUrl("/api/obra"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: n,
          cliente: cliente.trim() || selectedCompany?.nome,
          local: local.trim() || "Área de estudo InSAR",
          description: description.trim() || undefined,
          status: obraStatus,
          companyId: cid,
          latitude: lat,
          longitude: lng,
          tipo_monitoramento: tipoMonitoramento,
          aoi_geojson: aoiPolygon,
          modules: modulesPresetInsar(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(
          typeof data.error === "string"
            ? data.error
            : "Não foi possível criar a obra (verifique PostGIS / migrações).",
        );
        return;
      }
      const id = typeof data.id === "number" ? data.id : null;
      if (id != null) {
        setObraContext(id);
        router.push(`${DIGITAL_TWIN_BASE}/insar?obraId=${id}`);
      }
    } catch {
      setErro("Falha de rede ao criar obra.");
    } finally {
      setLoadingSave(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 pb-16 text-[var(--text)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Link
            href={`${DIGITAL_TWIN_BASE}/insar`}
            className="inline-flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700 dark:text-teal-400"
          >
            <ArrowLeft className="h-4 w-4" />
            InSAR · Digital Twin
          </Link>
          <h1 className="mt-3 flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight sm:text-3xl">
            <FolderPlus className="h-8 w-8 text-teal-600" />
            Nova obra — InSAR
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            Defina o projeto com empresa, coordenadas e uma{" "}
            <strong className="text-[var(--text)]">área de interesse</strong>{" "}
            georreferenciada (PostGIS). Após guardar, abrimos o viewer InSAR para
            esta obra.
          </p>
        </div>
        <Link
          href="/obra"
          className="inline-flex items-center gap-2 self-start rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-xs font-semibold uppercase tracking-wide hover:bg-[var(--card)]"
        >
          Versão simples (sem mapa)
        </Link>
      </div>

      <div className="grid gap-8 xl:grid-cols-2">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              <Radar className="h-4 w-4 text-teal-500" />
              Empresa
            </h2>
            {loadingEmpresas ? (
              <p className="mt-4 text-sm text-[var(--muted)]">
                A carregar empresas…
              </p>
            ) : empresas.length === 0 ? (
              <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
                <p className="mb-3 font-medium text-amber-900 dark:text-amber-100">
                  Nenhuma empresa registada.
                </p>
                <div className="flex flex-wrap gap-2">
                  <input
                    placeholder="Nome da empresa"
                    value={novaEmpresaNome}
                    onChange={(e) => setNovaEmpresaNome(e.target.value)}
                    className="min-w-[12rem] flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
                  />
                  <button
                    type="button"
                    disabled={loadingSave}
                    onClick={() => void criarEmpresa()}
                    className="rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    Criar empresa
                  </button>
                </div>
              </div>
            ) : (
              <label className="mt-4 block text-sm font-medium">
                Empresa proprietária <span className="text-red-500">*</span>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[var(--text)]"
                >
                  {empresas.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-4">
              <label className="text-sm font-medium">
                Cliente / contratante{" "}
                <span className="text-[var(--muted)]">(pré-preenchido)</span>
              </label>
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
              />
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm sm:p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              Projeto & monitoramento
            </h2>
            <div className="mt-4 flex flex-col gap-4">
              <div>
                <label className="text-sm font-medium">
                  Nome da obra <span className="text-red-500">*</span>
                </label>
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                  placeholder="Ex.: Barragem Norte · campanha 2026"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Local / referência</label>
                <input
                  value={local}
                  onChange={(e) => setLocal(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição / âmbito</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                  placeholder="Objetivos InSAR, épocas desejadas, limitações…"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">
                    Tipo de monitoramento
                  </label>
                  <select
                    value={tipoMonitoramento}
                    onChange={(e) => setTipoMonitoramento(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                  >
                    {MONITORAMENTO_TIPOS.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium">Estado</label>
                  <select
                    value={obraStatus}
                    onChange={(e) => setObraStatus(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-sm"
                  >
                    {OBRA_STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {OBRA_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="h-4 w-4 text-sky-500" />
                    Latitude (WGS84)
                  </label>
                  <input
                    value={latitudeStr}
                    onChange={(e) => setLatitudeStr(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="h-4 w-4 text-sky-500" />
                    Longitude (WGS84)
                  </label>
                  <input
                    value={longitudeStr}
                    onChange={(e) => setLongitudeStr(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 font-mono text-sm"
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--muted)]">
                As coordenadas centram os mapas e identificam a obra no viewer.
                Ao fechar o polígono, o centro é calculado automaticamente (pode
                editar).
              </p>
            </div>
          </section>

          {erro ? (
            <p
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300"
              role="alert"
            >
              {erro}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => void salvar()}
            disabled={
              loadingSave ||
              loadingEmpresas ||
              empresas.length === 0 ||
              !aoiPolygon
            }
            className="w-full rounded-xl bg-teal-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-600/25 hover:bg-teal-500 disabled:opacity-50 sm:w-auto sm:min-w-[240px]"
          >
            {loadingSave ? "A guardar…" : "Guardar obra e abrir InSAR"}
          </button>
        </div>

        <div className="space-y-5">
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                <Layers className="h-4 w-4 text-sky-500" />
                Mapa 2D — desenho AOI
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={toggleDrawing}
                  disabled={loadingEmpresas || empresas.length === 0}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                    drawing
                      ? "bg-sky-600 text-white"
                      : "border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface)]/80"
                  }`}
                >
                  {drawing ? "Parar desenho" : "Desenhar AOI"}
                </button>
                <button
                  type="button"
                  onClick={fecharPoligono}
                  disabled={
                    vertices.length < 3 || !!aoiPolygon || loadingEmpresas
                  }
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-emerald-500 disabled:opacity-45"
                >
                  Fechar polígono
                </button>
                <button
                  type="button"
                  onClick={limparAoi}
                  disabled={vertices.length === 0 && !aoiPolygon}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide hover:bg-[var(--surface)] disabled:opacity-45"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Limpar
                </button>
              </div>
            </div>
            <ObraNovaLeafletMap
              center={mapCenter}
              zoom={6}
              vertices={vertices}
              drawing={drawing && !aoiPolygon}
              polygonClosed={!!aoiPolygon}
              onAddVertex={onAddVertex}
            />
          </section>

          <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
              <Satellite className="h-4 w-4 text-violet-500" />
              Pré-visualização Cesium
            </h2>
            <ObraNovaCesiumPreview
              polygon={aoiPolygon}
              latitude={latN}
              longitude={lngN}
            />
            <p className="mt-2 text-xs text-[var(--muted)]">
              Terrain mundo + imagem satélite (Ion). O AOI aparece colado ao
              globo após fechar o polígono no mapa 2D.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
