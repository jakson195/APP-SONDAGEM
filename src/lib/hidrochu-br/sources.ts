import type { FonteHidrologica } from "./types";

export type FonteDadosInfo = {
  id: FonteHidrologica;
  nome: string;
  descricao: string;
  url: string;
  formatos: string[];
  status: "ativo" | "parcial" | "planejado";
};

export const FONTES_HIDRO_BR: FonteDadosInfo[] = [
  {
    id: "ANA",
    nome: "ANA — HidroWeb / TelemetriaWS",
    descricao:
      "Séries de chuva, cota e vazão das estações da rede nacional (SNIRH).",
    url: "https://www.snirh.gov.br/hidroweb/",
    formatos: ["API SOAP", "CSV HidroWeb", "JSON HidroWebService"],
    status: "ativo",
  },
  {
    id: "INMET",
    nome: "INMET — BDMEP / dados meteorológicos",
    descricao: "Precipitação e variáveis meteorológicas em estações convencionais.",
    url: "https://bdmep.inmet.gov.br/",
    formatos: ["CSV", "importação manual"],
    status: "ativo",
  },
  {
    id: "CPRM",
    nome: "CPRM — GeoSGB / hidrografia",
    descricao: "Contexto de bacias, drenagem e cartografia hidrogeológica.",
    url: "https://geoservicos.sgb.gov.br/",
    formatos: ["WMS", "REST"],
    status: "parcial",
  },
  {
    id: "CEMADEN",
    nome: "CEMADEN — Alertas e desastres",
    descricao: "Integração de alertas oficiais no contexto de previsão de enchentes.",
    url: "https://www.gov.br/cemaden/",
    formatos: ["contexto informado", "RSS (planejado)"],
    status: "planejado",
  },
  {
    id: "DadosAbertos",
    nome: "Dados.gov.br",
    descricao: "Conjuntos abertos de hidrologia e clima em nível nacional.",
    url: "https://dados.gov.br/",
    formatos: ["CSV", "API CKAN"],
    status: "planejado",
  },
  {
    id: "Manual",
    nome: "Entrada manual / planilha",
    descricao: "Cole séries ou carregue CSV exportado de qualquer fonte.",
    url: "#",
    formatos: ["CSV", "TSV", "colar"],
    status: "ativo",
  },
];
