import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  height?: number;
  showText?: boolean;
  className?: string;
};

export function BrandLogo({
  href = "/",
  height = 40,
  showText = false,
  className = "",
}: BrandLogoProps) {
  const img = (
    <Image
      src="/brand/datageo-logo.png"
      alt="DataGeo Digital"
      width={Math.round(height * 4.2)}
      height={height}
      priority
      className={`h-auto w-auto max-w-full object-contain ${className}`}
    />
  );

  if (!href) {
    return showText ? (
      <div className="flex flex-col items-start gap-1">
        {img}
        <span className="text-gradient-brand text-sm font-semibold tracking-tight">
          DataGeo Digital
        </span>
      </div>
    ) : (
      img
    );
  }

  return (
    <Link href={href} className="inline-flex flex-col items-start gap-1">
      {img}
      {showText ? (
        <span className="text-gradient-brand text-xs font-medium tracking-wide">
          Plataforma geotécnica
        </span>
      ) : null}
    </Link>
  );
}
