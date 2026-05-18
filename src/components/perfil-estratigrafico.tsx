export type CamadaEstratigrafica = {
  topo: number;
  base: number;
  cor: string;
  material: string;
};

type Props = {
  dados: CamadaEstratigrafica[];
  /** Metros verticais → pixels (ex.: 40 = mesma escala do snippet original). */
  escalaPxPorM?: number;
  larguraPx?: number;
  className?: string;
};

export function PerfilEstratigrafico({
  dados,
  escalaPxPorM = 40,
  larguraPx = 200,
  className = "",
}: Props) {
  return (
    <div
      className={`shrink-0 border border-[var(--border)] bg-[var(--surface)] ${className}`}
      style={{ width: larguraPx }}
    >
      {dados.map((camada, i) => {
        const espessuraM = camada.base - camada.topo;
        const altura = Math.max(espessuraM * escalaPxPorM, espessuraM > 0 ? 1 : 0);

        return (
          <div
            key={`${camada.topo}-${camada.base}-${camada.material}-${i}`}
            className="flex items-center justify-center border-b border-[var(--border)] text-xs text-[var(--text)]"
            style={{
              height: altura,
              backgroundColor: camada.cor,
            }}
          >
            {camada.material}
          </div>
        );
      })}
    </div>
  );
}
