import type { Project } from "@/lib/types";

export const demoProjects: Project[] = [
  {
    id: "1",
    code: "PRJ-DEMO-0001",
    name: "Rodovia BR-101 Trecho Sul",
    location: "Florianópolis, SC",
    client: "DNIT",
    createdAt: "2024-06-01T10:00:00.000Z",
  },
  {
    id: "2",
    code: "PRJ-DEMO-0002",
    name: "Fundações Torre Comercial Aurora",
    location: "Porto Alegre, RS",
    client: "Construtora Horizonte",
    createdAt: "2024-07-15T14:30:00.000Z",
  },
  {
    id: "3",
    code: "PRJ-DEMO-0003",
    name: "Linha Metro Leste — Estação 4",
    location: "São Paulo, SP",
    client: "Metrô SP",
    createdAt: "2024-09-20T09:15:00.000Z",
  },
  {
    id: "4",
    code: "PRJ-DEMO-0004",
    name: "Barragem Rio Verde — Estudo geotécnico",
    location: "Goiânia, GO",
    client: "ANEEL / Consórcio Hidro",
    createdAt: "2024-11-08T16:45:00.000Z",
  },
];
