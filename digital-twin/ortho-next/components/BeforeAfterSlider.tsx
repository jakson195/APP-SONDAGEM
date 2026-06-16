"use client";

type BeforeAfterSliderProps = {
  beforeLabel?: string;
  afterLabel?: string;
  beforeUrl: string | null;
  afterUrl: string | null;
};

export function BeforeAfterSlider({
  beforeLabel = "T0 · Antes",
  afterLabel = "T1 · Depois",
  beforeUrl,
  afterUrl,
}: BeforeAfterSliderProps) {
  if (!beforeUrl || !afterUrl) {
    return (
      <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 text-sm text-slate-400">
        Carregue T0 e T1 para ativar a comparação temporal.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-xl backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
          Comparação temporal
        </h2>
        <div className="flex gap-3 text-[11px] text-slate-400">
          <span>{beforeLabel}</span>
          <span>{afterLabel}</span>
        </div>
      </div>

      <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-700 bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={afterUrl} alt={afterLabel} className="absolute inset-0 h-full w-full object-cover" />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: "inset(0 50% 0 0)" }}
          id="before-clip"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={beforeUrl} alt={beforeLabel} className="h-full w-full object-cover" />
        </div>

        <input
          type="range"
          min={0}
          max={100}
          defaultValue={50}
          aria-label="Slider before/after"
          className="absolute inset-x-4 bottom-3 z-10 h-2 cursor-ew-resize appearance-none rounded-full bg-white/30 accent-sky-400"
          onInput={(event) => {
            const value = Number((event.target as HTMLInputElement).value);
            const clip = document.getElementById("before-clip");
            if (clip) clip.style.clipPath = `inset(0 ${100 - value}% 0 0)`;
          }}
        />

        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">
          {beforeLabel}
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[10px] text-white">
          {afterLabel}
        </div>
      </div>
    </section>
  );
}
