"use client";

import type { Furo } from "../types";
import {
  ESCALA_X,
  ESCALA_Y,
  SVG_LARGURA_PERFIL_PX,
} from "../utils/escala";
import { gerarLinhaInterpolada, type Ponto2D } from "../utils/interpolacao";
import {
  corParaMaterial,
  listarMateriais,
  profundidadeMaxCamadasFuro,
} from "../utils/materiais";

function surfaceY(f: Furo, cotaMax: number): number {
  return (cotaMax - f.cotaTerreno) * ESCALA_Y;
}

function depthY(f: Furo, profundidadeMetros: number, cotaMax: number): number {
  return surfaceY(f, cotaMax) + profundidadeMetros * ESCALA_Y;
}

function materialTemAreia(nome: string): boolean {
  return /areia/i.test(nome);
}

function materialTemArgila(nome: string): boolean {
  return /argila/i.test(nome);
}

export type SecaoGeologicaProps = {
  furos: Furo[];
};

export default function SecaoGeologica({ furos }: SecaoGeologicaProps) {
  const cotaMax =
    furos.length > 0 ? Math.max(...furos.map((f) => f.cotaTerreno)) : 0;

  const maxProf =
    furos.length === 0
      ? 0
      : Math.max(...furos.flatMap((f) => f.camadas.map((c) => c.base)));

  const svgHeight = Math.max(
    ...furos.map(
      (f) => surfaceY(f, cotaMax) + profundidadeMaxCamadasFuro(f) * ESCALA_Y,
    ),
    maxProf * ESCALA_Y,
    1,
  );

  const materiais = listarMateriais(furos);
  const matAreia = materiais.find((m) => materialTemAreia(m));
  const matArgila = materiais.find((m) => materialTemArgila(m));
  const corAreia = matAreia ? corParaMaterial(furos, matAreia) : "#f4a460";
  const corArgila = matArgila ? corParaMaterial(furos, matArgila) : "#8B4513";

  const naPontos: Ponto2D[] = [...furos]
    .filter((f) => f.nivelAgua != null && Number.isFinite(f.nivelAgua))
    .sort((a, b) => a.x - b.x)
    .map((f) => ({
      x: f.x * ESCALA_X,
      y: depthY(f, f.nivelAgua!, cotaMax),
    }));

  const superficiePontos: Ponto2D[] = [...furos]
    .sort((a, b) => a.x - b.x)
    .map((f) => ({
      x: f.x * ESCALA_X,
      y: surfaceY(f, cotaMax),
    }));

  return (
    <svg
      width={SVG_LARGURA_PERFIL_PX}
      height={svgHeight}
      style={{ background: "#fff", overflow: "visible" }}
      role="img"
      aria-label="Secção geológica com correlação por material"
    >
      <defs>
        {matAreia != null && (
          <pattern
            id="areia"
            patternUnits="userSpaceOnUse"
            width={6}
            height={6}
          >
            <rect width={6} height={6} fill={corAreia} />
            <circle cx={3} cy={3} r={1} fill="#000" />
          </pattern>
        )}
        {matArgila != null && (
          <pattern
            id="argila"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
          >
            <rect width={6} height={6} fill={corArgila} />
            <line
              x1={0}
              y1={0}
              x2={6}
              y2={6}
              stroke="#000"
              strokeWidth={0.5}
            />
          </pattern>
        )}
      </defs>

      {naPontos.length > 0 && (
        <path
          d={gerarLinhaInterpolada(naPontos)}
          stroke="blue"
          fill="none"
          strokeWidth={2}
        />
      )}

      <path
        d={gerarLinhaInterpolada(superficiePontos)}
        stroke="black"
        fill="none"
        strokeWidth={2}
      />

      {materiais.map((mat, i) => {
        const topo: Ponto2D[] = furos
          .map((f) => {
            const c = f.camadas.find((layer) => layer.material === mat);
            return c
              ? { x: f.x * ESCALA_X, y: depthY(f, c.topo, cotaMax) }
              : null;
          })
          .filter((p): p is Ponto2D => p != null);

        const base: Ponto2D[] = furos
          .map((f) => {
            const c = f.camadas.find((layer) => layer.material === mat);
            return c
              ? { x: f.x * ESCALA_X, y: depthY(f, c.base, cotaMax) }
              : null;
          })
          .filter((p): p is Ponto2D => p != null)
          .reverse();

        if (topo.length < 2) return null;

        const pathTopo = gerarLinhaInterpolada(topo);
        const fechoBase = base.map((p) => `${p.x} ${p.y}`).join(" L ");
        const cor = corParaMaterial(furos, mat);
        const fill = materialTemAreia(mat)
          ? "url(#areia)"
          : materialTemArgila(mat)
            ? "url(#argila)"
            : cor;

        return (
          <path
            key={`${mat}-${i}`}
            d={`${pathTopo} L ${fechoBase} Z`}
            fill={fill}
            fillOpacity={materialTemAreia(mat) || materialTemArgila(mat) ? 1 : 0.7}
            stroke="#000"
          />
        );
      })}

      {furos.map((f) => {
        const x = f.x * ESCALA_X;
        const y0 = surfaceY(f, cotaMax);
        const y1 = y0 + profundidadeMaxCamadasFuro(f) * ESCALA_Y;
        return (
          <g key={f.id}>
            <line
              x1={x}
              y1={y0}
              x2={x}
              y2={y1}
              stroke="black"
              strokeDasharray="4"
            />
            <text x={x - 10} y={y0 - 5} fontSize={11} fill="#000">
              {f.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
