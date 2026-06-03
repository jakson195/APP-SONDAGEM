import { BrandLogo } from "@/components/brand/brand-logo";

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({ title, subtitle, children, footer }: Props) {
  return (
    <div className="dg-mesh-bg relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{ background: "var(--gradient-mesh)" }}
        aria-hidden
      />
      <div className="relative w-full max-w-[440px]">
        <div className="mb-8 flex flex-col items-center text-center">
          <BrandLogo href="/" height={48} showText />
          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-[var(--text)]">
            {title}
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{subtitle}</p>
        </div>

        <div className="dg-card border-gradient-brand p-6 shadow-xl shadow-black/40 sm:p-8">
          {children}
        </div>

        {footer ? (
          <div className="mt-8 text-center text-sm text-[var(--muted)]">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
