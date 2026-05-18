"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { geotiffToPngDataUrlAndBounds } from "@/lib/geotiff-for-leaflet";
import {
  parseGeoDecimal,
  renderPdfFirstPageToPngWithGeo,
} from "@/lib/render-pdf-first-page-png";
import {
  FIELD_GPS_OPTIONS,
  readStoredUserLatLng,
  writeStoredUserLatLng,
} from "@/lib/user-gps-storage";

/** Ícones padrão do Leaflet em bundlers (ex.: Next.js). */
const LEAFLET_ICON_CDN =
  "https://unpkg.com/leaflet@1.9.4/dist/images/";

/** Fundo estilo «vista aérea» (satélite Esri); não é o produto Google Earth. */
export type GeoBasemapMode = "osm" | "satellite" | "hybrid";

function fillBasemapGroup(group: L.LayerGroup, mode: GeoBasemapMode): void {
  group.clearLayers();
  if (mode === "osm") {
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      maxNativeZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(group);
    return;
  }
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        "Tiles © Esri (Maxar, Earthstar Geographics, etc.) — uso sujeito aos termos Esri",
    },
  ).addTo(group);
  if (mode === "hybrid") {
    L.tileLayer(
      "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
      {
        maxZoom: 19,
        attribution: "Labels © Esri",
        opacity: 0.95,
        className: "geo-leaflet-hybrid-labels",
      },
    ).addTo(group);
  }
}

function ensureDefaultMarkerIcons() {
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${LEAFLET_ICON_CDN}marker-icon-2x.png`,
    iconUrl: `${LEAFLET_ICON_CDN}marker-icon.png`,
    shadowUrl: `${LEAFLET_ICON_CDN}marker-shadow.png`,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type OsmLeafletMapProps = {
  className?: string;
  /** `[latitude, longitude]` — default: costa Sul do Brasil (exemplo). */
  center?: L.LatLngTuple;
  zoom?: number;
  /** Barra com modo «Ponto» (marcar sondagens ao clicar). */
  showPointToolbar?: boolean;
  /** Importar PDF (1.ª página) ou GeoTIFF WGS84; TIFF usa limites embutidos. */
  showPdfMapImport?: boolean;
  /** Marcador da sua posição (GPS + última posição guardada no dispositivo). */
  showMyLocation?: boolean;
  /** Fundo inicial: satélite (estilo vista aérea), híbrido (satélite + nomes) ou ruas OSM. */
  defaultBasemap?: GeoBasemapMode;
  /** Mostrar botões de troca de fundo (satélite / híbrido / OSM). */
  showBasemapSwitcher?: boolean;
};

const DEFAULT_CENTER: L.LatLngTuple = [-29.0, -49.6];
const DEFAULT_ZOOM = 13;

/**
 * OpenStreetMap tiles com Leaflet (só cliente; inicializa em `useEffect`).
 *
 * - **Ponto**: nome + descrição antes do marcador.
 * - **Mapa**: PDF (1.ª página → PNG + cantos) ou GeoTIFF EPSG:4326 (limites do ficheiro).
 * - **Minha posição**: círculo azul (GPS ou última guardada em `localStorage`).
 * - **Fundo**: satélite Esri (vista aérea), híbrido com nomes, ou ruas OSM.
 */
export function OsmLeafletMap({
  className = "h-[70vh] w-full min-h-[280px]",
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  showPointToolbar = true,
  showPdfMapImport = true,
  showMyLocation = true,
  defaultBasemap = "satellite",
  showBasemapSwitcher = true,
}: OsmLeafletMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const placementBlockedRef = useRef(false);
  const pdfImportOpenRef = useRef(false);
  const pdfOverlaysRef = useRef<L.ImageOverlay[]>([]);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const geoTiffInputRef = useRef<HTMLInputElement | null>(null);
  const pdfPickMarkersRef = useRef<L.Layer[]>([]);
  const pdfBoundsPickStepRef = useRef<"sw" | "ne" | null>(null);
  const pdfPickSwRef = useRef<{ lat: number; lng: number } | null>(null);
  const pdfDraftRef = useRef<{ dataUrl: string; name: string } | null>(null);
  const pdfImgSizeRef = useRef<{ w: number; h: number } | null>(null);
  const userMarkerRef = useRef<L.CircleMarker | null>(null);

  const [pointMode, setPointMode] = useState(false);
  const [placementDraft, setPlacementDraft] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [draftNome, setDraftNome] = useState("");
  const [draftDescricao, setDraftDescricao] = useState("");

  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfDraft, setPdfDraft] = useState<{
    dataUrl: string;
    name: string;
  } | null>(null);
  const [pdfSwLat, setPdfSwLat] = useState("");
  const [pdfSwLng, setPdfSwLng] = useState("");
  const [pdfNeLat, setPdfNeLat] = useState("");
  const [pdfNeLng, setPdfNeLng] = useState("");
  const [pdfLayerCount, setPdfLayerCount] = useState(0);
  /** Dois cliques no mapa: sudoeste depois nordeste da área útil do PDF (norte em cima). */
  const [pdfBoundsPickStep, setPdfBoundsPickStep] = useState<"sw" | "ne" | null>(
    null,
  );
  const [pdfPickSw, setPdfPickSw] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [pdfStretchNote, setPdfStretchNote] = useState<string | null>(null);

  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [userLocFromStored, setUserLocFromStored] = useState(false);
  const [basemap, setBasemap] = useState<GeoBasemapMode>(defaultBasemap);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    ensureDefaultMarkerIcons();

    const map = L.map(el, { zoomControl: true }).setView(center, zoom);
    mapRef.current = map;

    const baseGroup = L.layerGroup().addTo(map);
    baseLayerGroupRef.current = baseGroup;

    const fixSize = () => {
      map.invalidateSize();
    };
    requestAnimationFrame(fixSize);
    window.addEventListener("resize", fixSize);

    return () => {
      window.removeEventListener("resize", fixSize);
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      baseLayerGroupRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- centro/zoom iniciais; updates em efeito separado
  }, []);

  useEffect(() => {
    const g = baseLayerGroupRef.current;
    if (!g) return;
    fillBasemapGroup(g, basemap);
  }, [basemap]);

  useEffect(() => {
    mapRef.current?.setView(center, zoom);
  }, [center, zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const cached = readStoredUserLatLng();
    if (cached) {
      setUserLocation(cached);
      setUserLocFromStored(true);
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserLocFromStored(false);
        setUserLocation({ lat, lng });
      },
      () => {
        /* manter última posição em cache, se existir */
      },
      FIELD_GPS_OPTIONS,
    );
  }, []);

  useEffect(() => {
    if (!showMyLocation) {
      const map = mapRef.current;
      if (map && userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      return;
    }

    const map = mapRef.current;
    if (!map) return;

    if (!userLocation) {
      if (userMarkerRef.current) {
        map.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      return;
    }

    const label = userLocFromStored
      ? "A sua posição (última guardada neste dispositivo)"
      : "A sua posição (GPS)";

    if (!userMarkerRef.current) {
      userMarkerRef.current = L.circleMarker(
        [userLocation.lat, userLocation.lng],
        {
          radius: 9,
          color: "#ffffff",
          weight: 2,
          fillColor: "#1a73e8",
          fillOpacity: 1,
        },
      )
        .addTo(map)
        .bindTooltip(label, { sticky: true });
    } else {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
      userMarkerRef.current.unbindTooltip();
      userMarkerRef.current.bindTooltip(label, { sticky: true });
    }
  }, [userLocation, userLocFromStored, showMyLocation]);

  useEffect(() => {
    pdfDraftRef.current = pdfDraft;
  }, [pdfDraft]);

  useEffect(() => {
    pdfBoundsPickStepRef.current = pdfBoundsPickStep;
  }, [pdfBoundsPickStep]);

  useEffect(() => {
    pdfPickSwRef.current = pdfPickSw;
  }, [pdfPickSw]);

  const aplicarPdfNoMapa = useCallback(
    (
      draft: { dataUrl: string; name: string },
      bounds: L.LatLngBounds,
      imgSize: { w: number; h: number } | null,
    ) => {
      const map = mapRef.current;
      if (!map) return;

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const minLat = sw.lat;
      const maxLat = ne.lat;
      const minLng = sw.lng;
      const maxLng = ne.lng;

      let stretchNote: string | null = null;
      if (imgSize && imgSize.w > 0 && imgSize.h > 0) {
        const midLat = (minLat + maxLat) / 2;
        const mPerDegLat = 110574;
        const cosLat = Math.cos((midLat * Math.PI) / 180);
        const mPerDegLng = 111320 * Math.max(0.02, Math.abs(cosLat));
        const geoH = (maxLat - minLat) * mPerDegLat;
        const geoW = (maxLng - minLng) * mPerDegLng;
        if (geoW > 10 && geoH > 10) {
          const geoAspect = geoH / geoW;
          const imgAspect = imgSize.h / imgSize.w;
          const ratio = geoAspect / imgAspect;
          if (ratio < 0.82 || ratio > 1.22) {
            stretchNote =
              "A proporção deste retângulo no terreno não coincide com a imagem (cantos errados ou rotação). No PDF use os cantos do desenho do mapa (norte em cima); no GeoTIFF confirme o CRS e a exportação.";
          }
        }
      }

      const overlay = L.imageOverlay(draft.dataUrl, bounds, {
        opacity: 0.88,
        interactive: false,
        className: "geo-pdf-overlay",
      }).addTo(map);
      pdfOverlaysRef.current.push(overlay);
      setPdfLayerCount((n) => n + 1);
      map.fitBounds(bounds, { padding: [28, 28] });
      setPdfStretchNote(stretchNote);
      if (stretchNote) {
        window.setTimeout(() => setPdfStretchNote(null), 20000);
      }
    },
    [],
  );

  function limparPreviewMarcadoresPdf() {
    const map = mapRef.current;
    if (map) {
      for (const layer of pdfPickMarkersRef.current) {
        map.removeLayer(layer);
      }
    }
    pdfPickMarkersRef.current = [];
  }

  function cancelarMarcacaoCantosPdf() {
    limparPreviewMarcadoresPdf();
    pdfBoundsPickStepRef.current = null;
    setPdfBoundsPickStep(null);
    setPdfPickSw(null);
    pdfPickSwRef.current = null;
  }

  function iniciarMarcacaoCantosPdf() {
    limparPreviewMarcadoresPdf();
    setPdfPickSw(null);
    pdfPickSwRef.current = null;
    setPdfError(null);
    pdfBoundsPickStepRef.current = "sw";
    setPdfBoundsPickStep("sw");
  }

  function preencherLimitesComVistaAtual() {
    const map = mapRef.current;
    if (!map) return;
    const b = map.getBounds();
    setPdfSwLat(b.getSouth().toFixed(6));
    setPdfSwLng(b.getWest().toFixed(6));
    setPdfNeLat(b.getNorth().toFixed(6));
    setPdfNeLng(b.getEast().toFixed(6));
  }

  useEffect(() => {
    if (!pointMode) {
      placementBlockedRef.current = false;
      setPlacementDraft(null);
      setDraftNome("");
      setDraftDescricao("");
    }
  }, [pointMode]);

  useEffect(() => {
    if (!pdfDraft) {
      pdfImgSizeRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      pdfImgSizeRef.current = {
        w: img.naturalWidth,
        h: img.naturalHeight,
      };
    };
    img.src = pdfDraft.dataUrl;
  }, [pdfDraft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !pdfDraft || !pdfBoundsPickStep) return;

    const onMapClick = (e: L.LeafletMouseEvent) => {
      const step = pdfBoundsPickStepRef.current;
      const draft = pdfDraftRef.current;
      if (!draft) return;

      if (step === "sw") {
        limparPreviewMarcadoresPdf();
        const m = L.circleMarker(e.latlng, {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#16a34a",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip("Sudoeste", { permanent: true, direction: "top" });
        pdfPickMarkersRef.current.push(m);
        const ll = { lat: e.latlng.lat, lng: e.latlng.lng };
        pdfPickSwRef.current = ll;
        setPdfPickSw(ll);
        pdfBoundsPickStepRef.current = "ne";
        setPdfBoundsPickStep("ne");
      } else if (step === "ne") {
        const sw = pdfPickSwRef.current;
        if (!sw) return;
        const ne = { lat: e.latlng.lat, lng: e.latlng.lng };
        const m = L.circleMarker(e.latlng, {
          radius: 7,
          color: "#ffffff",
          weight: 2,
          fillColor: "#ea580c",
          fillOpacity: 1,
        })
          .addTo(map)
          .bindTooltip("Nordeste", { permanent: true, direction: "top" });
        pdfPickMarkersRef.current.push(m);

        const bounds = L.latLngBounds(
          [Math.min(sw.lat, ne.lat), Math.min(sw.lng, ne.lng)],
          [Math.max(sw.lat, ne.lat), Math.max(sw.lng, ne.lng)],
        );
        aplicarPdfNoMapa(draft, bounds, pdfImgSizeRef.current);

        limparPreviewMarcadoresPdf();
        pdfBoundsPickStepRef.current = null;
        setPdfBoundsPickStep(null);
        setPdfPickSw(null);
        pdfPickSwRef.current = null;
        pdfImportOpenRef.current = false;
        setPdfDraft(null);
        setPdfError(null);
      }
    };

    map.on("click", onMapClick);
    return () => {
      map.off("click", onMapClick);
    };
  }, [pdfBoundsPickStep, pdfDraft, aplicarPdfNoMapa]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getContainer()) return;
    const el = map.getContainer();
    if (pdfBoundsPickStep || pointMode) {
      el.style.cursor = "crosshair";
    } else {
      el.style.cursor = "";
    }
  }, [pdfBoundsPickStep, pointMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const container = map.getContainer();

    if (!pointMode) {
      return;
    }

    const onMapClick = (e: L.LeafletMouseEvent) => {
      if (pdfBoundsPickStepRef.current) return;
      if (pdfImportOpenRef.current) return;
      if (placementBlockedRef.current) return;
      placementBlockedRef.current = true;
      setDraftNome("");
      setDraftDescricao("");
      setPlacementDraft({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      });
    };

    map.on("click", onMapClick);

    return () => {
      map.off("click", onMapClick);
    };
  }, [pointMode]);

  function cancelarPonto() {
    placementBlockedRef.current = false;
    setPlacementDraft(null);
    setDraftNome("");
    setDraftDescricao("");
  }

  function confirmarPonto() {
    const map = mapRef.current;
    const d = placementDraft;
    if (!map || !d) return;

    const nome = draftNome.trim() || "Ponto";
    const desc = draftDescricao.trim();
    const nomeEsc = escapeHtml(nome);
    const descEsc = escapeHtml(desc).replace(/\n/g, "<br/>");
    const popupHtml =
      desc.length > 0
        ? `<div class="osm-popup"><strong>${nomeEsc}</strong><p style="margin:0.5em 0 0;font-size:0.9em;line-height:1.35">${descEsc}</p></div>`
        : `<div class="osm-popup"><strong>${nomeEsc}</strong></div>`;

    L.marker(L.latLng(d.lat, d.lng), { title: nome })
      .addTo(map)
      .bindPopup(popupHtml)
      .openPopup();

    placementBlockedRef.current = false;
    setPlacementDraft(null);
    setDraftNome("");
    setDraftDescricao("");
  }

  function encerrarModalPdfAposImportacaoOk() {
    cancelarMarcacaoCantosPdf();
    pdfImportOpenRef.current = false;
    setPdfDraft(null);
    setPdfError(null);
  }

  async function importarGeoTiffAutomatico(
    file: File,
    options?: { fecharUiPdf?: boolean },
  ) {
    const map = mapRef.current;
    if (!map) {
      throw new Error(
        "Mapa ainda não está pronto. Tente de novo dentro de momentos.",
      );
    }
    const { dataUrl, bounds, imgSize } =
      await geotiffToPngDataUrlAndBounds(file);
    const leafletBounds = L.latLngBounds(
      L.latLng(bounds.south, bounds.west),
      L.latLng(bounds.north, bounds.east),
    );
    aplicarPdfNoMapa({ dataUrl, name: file.name }, leafletBounds, imgSize);
    if (options?.fecharUiPdf) {
      encerrarModalPdfAposImportacaoOk();
    }
  }

  async function onGeoTiffAutomaticoFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPdfError(null);
    setPdfBusy(true);
    try {
      await importarGeoTiffAutomatico(file, { fecharUiPdf: true });
    } catch (err) {
      setPdfError(
        err instanceof Error
          ? err.message
          : "Não foi possível ler o GeoTIFF.",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  async function onPdfFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const map = mapRef.current;
    if (!map) {
      setPdfError(
        "Mapa ainda não está pronto. Tente de novo dentro de momentos.",
      );
      return;
    }

    setPdfError(null);
    setPdfBusy(true);
    const isTiff =
      /\.(tif|tiff)$/i.test(file.name) ||
      file.type === "image/tiff" ||
      file.type === "image/tif";

    try {
      if (isTiff) {
        await importarGeoTiffAutomatico(file, {
          fecharUiPdf: Boolean(pdfDraft),
        });
        return;
      }

      const buf = await file.arrayBuffer();
      const { dataUrl, width, height, pdfGeoBounds } =
        await renderPdfFirstPageToPngWithGeo(buf);

      if (pdfGeoBounds) {
        pdfImgSizeRef.current = { w: width, h: height };
        const leafletBounds = L.latLngBounds(
          L.latLng(pdfGeoBounds.south, pdfGeoBounds.west),
          L.latLng(pdfGeoBounds.north, pdfGeoBounds.east),
        );
        aplicarPdfNoMapa(
          { dataUrl, name: file.name },
          leafletBounds,
          { w: width, h: height },
        );
        return;
      }

      pdfImportOpenRef.current = true;
      setPdfSwLat("");
      setPdfSwLng("");
      setPdfNeLat("");
      setPdfNeLng("");
      setPdfStretchNote(null);
      cancelarMarcacaoCantosPdf();
      pdfImgSizeRef.current = { w: width, h: height };
      setPdfDraft({ dataUrl, name: file.name });
    } catch (err) {
      setPdfError(
        err instanceof Error
          ? err.message
          : isTiff
            ? "Não foi possível ler o GeoTIFF."
            : "Não foi possível ler o PDF.",
      );
    } finally {
      setPdfBusy(false);
    }
  }

  function fecharPdfSemImportar() {
    cancelarMarcacaoCantosPdf();
    pdfImportOpenRef.current = false;
    setPdfDraft(null);
    setPdfError(null);
    setPdfStretchNote(null);
  }

  function confirmarImportarPdf() {
    const map = mapRef.current;
    const draft = pdfDraft;
    if (!map || !draft) return;

    const swLat = parseGeoDecimal(pdfSwLat);
    const swLng = parseGeoDecimal(pdfSwLng);
    const neLat = parseGeoDecimal(pdfNeLat);
    const neLng = parseGeoDecimal(pdfNeLng);
    if (
      swLat == null ||
      swLng == null ||
      neLat == null ||
      neLng == null
    ) {
      setPdfError("Preencha as quatro coordenadas (números decimais, vírgula ou ponto).");
      return;
    }
    if (
      swLat < -90 ||
      swLat > 90 ||
      neLat < -90 ||
      neLat > 90 ||
      swLng < -180 ||
      swLng > 180 ||
      neLng < -180 ||
      neLng > 180
    ) {
      setPdfError("Latitude entre -90 e 90; longitude entre -180 e 180.");
      return;
    }

    const minLat = Math.min(swLat, neLat);
    const maxLat = Math.max(swLat, neLat);
    const minLng = Math.min(swLng, neLng);
    const maxLng = Math.max(swLng, neLng);
    const bounds = L.latLngBounds(
      L.latLng(minLat, minLng),
      L.latLng(maxLat, maxLng),
    );

    aplicarPdfNoMapa(draft, bounds, pdfImgSizeRef.current);

    pdfImportOpenRef.current = false;
    setPdfDraft(null);
    setPdfError(null);
  }

  function removerCamadasPdf() {
    const map = mapRef.current;
    if (!map) return;
    for (const layer of pdfOverlaysRef.current) {
      map.removeLayer(layer);
    }
    pdfOverlaysRef.current = [];
    setPdfLayerCount(0);
  }

  function atualizarMinhaPosicao() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        writeStoredUserLatLng(lat, lng);
        setUserLocFromStored(false);
        setUserLocation({ lat, lng });
        mapRef.current?.panTo([lat, lng]);
      },
      () => {
        const c = readStoredUserLatLng();
        if (c) {
          setUserLocation(c);
          setUserLocFromStored(true);
          mapRef.current?.panTo([c.lat, c.lng]);
        }
      },
      FIELD_GPS_OPTIONS,
    );
  }

  const toolbarBtn =
    "rounded-lg border border-neutral-200 bg-white px-3 py-2 text-left text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700";

  return (
    <div className={`relative ${className}`}>
      {(showPointToolbar ||
        showPdfMapImport ||
        showMyLocation ||
        showBasemapSwitcher) && (
        <div
          className="toolbar pointer-events-auto absolute left-[10px] top-3 z-[1000] flex max-w-[min(280px,calc(100%-24px))] flex-col gap-[10px] rounded-[10px] bg-white p-[10px] shadow-lg dark:border dark:border-zinc-600 dark:bg-zinc-900"
          role="toolbar"
          aria-label="Ferramentas do mapa"
        >
          {showBasemapSwitcher && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-zinc-400">
                Fundo (vista aérea)
              </span>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setBasemap("satellite")}
                  className={
                    basemap === "satellite"
                      ? "rounded-lg border border-teal-600 bg-teal-50 px-2 py-1.5 text-left text-xs font-semibold text-teal-900 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-50"
                      : `${toolbarBtn} py-1.5 text-xs`
                  }
                >
                  Satélite
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap("hybrid")}
                  className={
                    basemap === "hybrid"
                      ? "rounded-lg border border-teal-600 bg-teal-50 px-2 py-1.5 text-left text-xs font-semibold text-teal-900 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-50"
                      : `${toolbarBtn} py-1.5 text-xs`
                  }
                >
                  Satélite + nomes
                </button>
                <button
                  type="button"
                  onClick={() => setBasemap("osm")}
                  className={
                    basemap === "osm"
                      ? "rounded-lg border border-teal-600 bg-teal-50 px-2 py-1.5 text-left text-xs font-semibold text-teal-900 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-50"
                      : `${toolbarBtn} py-1.5 text-xs`
                  }
                >
                  Ruas (OSM)
                </button>
              </div>
            </div>
          )}
          {showMyLocation && (
            <button
              type="button"
              className={toolbarBtn}
              onClick={atualizarMinhaPosicao}
              title="Atualizar posição GPS"
            >
              📍 Minha posição
            </button>
          )}
          {showPointToolbar && (
            <>
              <button
                type="button"
                onClick={() => setPointMode((v) => !v)}
                className={
                  pointMode
                    ? "rounded-lg border border-teal-600 bg-teal-50 px-3 py-2 text-left text-sm font-semibold text-teal-900 ring-2 ring-teal-500/30 dark:border-teal-500 dark:bg-teal-950/60 dark:text-teal-50"
                    : toolbarBtn
                }
              >
                📍 Ponto
              </button>
              {pointMode && (
                <p className="text-xs leading-snug text-neutral-600 dark:text-zinc-300">
                  Clique no mapa e preencha o nome e a descrição do ponto.
                </p>
              )}
            </>
          )}
          {showPdfMapImport && (
            <>
              <button
                type="button"
                disabled={pdfBusy}
                className={toolbarBtn}
                onClick={() => pdfInputRef.current?.click()}
              >
                {pdfBusy ? "A ler ficheiro…" : "📄 Mapa PDF / GeoTIFF"}
              </button>
              <button
                type="button"
                disabled={pdfBusy}
                className={`${toolbarBtn} text-xs leading-tight`}
                title="Limites lidos do ficheiro (EPSG:4326). Exporte assim no QGIS."
                onClick={() => geoTiffInputRef.current?.click()}
              >
                🛰️ Só GeoTIFF (automático)
              </button>
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf,.pdf,image/tiff,.tif,.tiff"
                className="sr-only"
                aria-hidden
                onChange={(e) => void onPdfFileChange(e)}
              />
              <input
                ref={geoTiffInputRef}
                type="file"
                accept="image/tiff,.tif,.tiff"
                className="sr-only"
                aria-hidden
                onChange={(e) => void onGeoTiffAutomaticoFileChange(e)}
              />
              {pdfLayerCount > 0 && (
                <button
                  type="button"
                  className={toolbarBtn}
                  onClick={removerCamadasPdf}
                >
                  Remover mapa importado
                </button>
              )}
            </>
          )}
        </div>
      )}

      {pdfError && !pdfDraft && (
        <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-[1005] max-w-md rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 shadow-md dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200">
          {pdfError}
        </div>
      )}

      {pdfStretchNote && (
        <div className="pointer-events-auto absolute bottom-3 left-3 right-3 z-[1005] max-w-lg rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 shadow-md dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100">
          {pdfStretchNote}
        </div>
      )}

      {placementDraft && (
        <div
          className="absolute inset-0 z-[1100] flex items-center justify-center bg-black/35 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="osm-ponto-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) cancelarPonto();
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-zinc-600 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="osm-ponto-titulo"
              className="text-base font-semibold text-neutral-900 dark:text-zinc-100"
            >
              Novo ponto
            </h2>
            <p className="mt-1 text-xs text-neutral-500 dark:text-zinc-400">
              {placementDraft.lat.toFixed(5)}, {placementDraft.lng.toFixed(5)}
            </p>
            <label className="mt-3 block text-sm font-medium text-neutral-800 dark:text-zinc-200">
              Nome
              <input
                type="text"
                value={draftNome}
                onChange={(e) => setDraftNome(e.target.value)}
                placeholder="Ex.: Sondagem SP-01"
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none ring-teal-500/30 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                autoFocus
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-neutral-800 dark:text-zinc-200">
              Descrição
              <textarea
                value={draftDescricao}
                onChange={(e) => setDraftDescricao(e.target.value)}
                placeholder="Notas de campo, solo, profundidade…"
                rows={3}
                className="mt-1 w-full resize-y rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 outline-none ring-teal-500/30 focus:ring-2 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelarPonto}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarPonto}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Adicionar
              </button>
            </div>
          </div>
        </div>
      )}

      {pdfDraft && pdfBoundsPickStep && (
        <div className="pointer-events-auto absolute left-2 right-2 top-14 z-[1125] flex flex-col gap-2 rounded-lg border border-teal-600 bg-white/95 p-3 text-sm shadow-lg dark:border-teal-500 dark:bg-zinc-900/95">
          <p className="font-medium text-neutral-900 dark:text-zinc-100">
            {pdfBoundsPickStep === "sw"
              ? "1/2 — Clique no mapa no canto sudoeste da área desenhada do mapa no PDF (vértice do desenho, não a margem em branco)."
              : "2/2 — Clique no canto nordeste da mesma área desenhada. O PDF deve estar com o norte para cima."}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={cancelarMarcacaoCantosPdf}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Voltar ao formulário
            </button>
            <button
              type="button"
              onClick={fecharPdfSemImportar}
              className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
            >
              Cancelar importação
            </button>
          </div>
        </div>
      )}

      {pdfDraft && !pdfBoundsPickStep && (
        <div
          className="absolute inset-0 z-[1120] flex items-center justify-center bg-black/40 p-3"
          role="dialog"
          aria-modal="true"
          aria-labelledby="osm-pdf-titulo"
          onClick={(e) => {
            if (e.target === e.currentTarget) fecharPdfSemImportar();
          }}
        >
          <div
            className="max-h-[min(90dvh,640px)] w-full max-w-md overflow-y-auto rounded-xl border border-neutral-200 bg-white p-4 shadow-xl dark:border-zinc-600 dark:bg-zinc-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="osm-pdf-titulo"
              className="text-base font-semibold text-neutral-900 dark:text-zinc-100"
            >
              Importar mapa
            </h2>
            <p className="mt-1 break-all text-xs text-neutral-600 dark:text-zinc-300">
              PDF em pré-visualização: <strong>{pdfDraft.name}</strong>
            </p>

            <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/90 p-3 dark:border-teal-700/80 dark:bg-teal-950/40">
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-900 dark:text-teal-100">
                Colocação automática
              </p>
              <p className="mt-1 text-xs leading-snug text-teal-950 dark:text-teal-100/95">
                <strong>GeoTIFF</strong> WGS 84 (EPSG:4326) ou{" "}
                <strong>PDF GeoPDF</strong> (QGIS: exportar com georreferência ISO
                / OGC). Os limites vêm do ficheiro. Se o PDF for só «desenho» sem
                metadados geo, use a secção abaixo.
              </p>
              <button
                type="button"
                disabled={pdfBusy}
                onClick={() => geoTiffInputRef.current?.click()}
                className="mt-2 w-full rounded-lg bg-teal-600 px-3 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-teal-700 disabled:opacity-50"
              >
                Escolher GeoTIFF (automático)
              </button>
            </div>

            <div className="my-4 flex items-center gap-2">
              <hr className="min-h-px flex-1 border-neutral-200 dark:border-zinc-600" />
              <span className="shrink-0 text-[11px] font-medium text-neutral-500 dark:text-zinc-400">
                PDF — posição manual
              </span>
              <hr className="min-h-px flex-1 border-neutral-200 dark:border-zinc-600" />
            </div>

            <p className="text-xs text-neutral-500 dark:text-zinc-400">
              Ao importar, o app <strong>tenta ler</strong> georreferência GeoPDF
              (GPTS / XML OGC) no PDF. Se não aparecer no mapa sozinho, o ficheiro
              não expõe esses dados em texto legível (comum em PDF comprimido) —
              use cantos ou coordenadas. Só a <strong>1.ª página</strong> é
              rasterizada.
            </p>
            <p className="mt-2 text-xs font-medium text-teal-800 dark:text-teal-200">
              Sem GeoPDF detetado: marque os cantos no mapa (desenho, norte em
              cima) ou preencha SW/NE (graus decimais, ex.: -29,123456).
            </p>
            <button
              type="button"
              onClick={iniciarMarcacaoCantosPdf}
              className="mt-2 w-full rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
            >
              Marcar cantos no mapa (2 cliques)
            </button>
            <button
              type="button"
              onClick={preencherLimitesComVistaAtual}
              className="mt-2 w-full rounded-lg border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Preencher com a vista atual (só se coincidir com o PDF)
            </button>
            <p className="mt-3 text-xs font-medium text-neutral-700 dark:text-zinc-300">
              Ou introduza manualmente sudoeste / nordeste:
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs font-medium text-neutral-700 dark:text-zinc-300">
                Lat. sudoeste
                <input
                  value={pdfSwLat}
                  onChange={(e) => setPdfSwLat(e.target.value)}
                  placeholder="-29.xxx"
                  className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="text-xs font-medium text-neutral-700 dark:text-zinc-300">
                Lon. sudoeste
                <input
                  value={pdfSwLng}
                  onChange={(e) => setPdfSwLng(e.target.value)}
                  placeholder="-49.xxx"
                  className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="text-xs font-medium text-neutral-700 dark:text-zinc-300">
                Lat. nordeste
                <input
                  value={pdfNeLat}
                  onChange={(e) => setPdfNeLat(e.target.value)}
                  className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
              <label className="text-xs font-medium text-neutral-700 dark:text-zinc-300">
                Lon. nordeste
                <input
                  value={pdfNeLng}
                  onChange={(e) => setPdfNeLng(e.target.value)}
                  className="mt-0.5 w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </label>
            </div>
            {pdfError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400" role="alert">
                {pdfError}
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={fecharPdfSemImportar}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarImportarPdf}
                className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white hover:bg-teal-700"
              >
                Colocar no mapa
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={containerRef} className="absolute inset-0 z-0" />
    </div>
  );
}
