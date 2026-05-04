import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

export async function generateStaticParams() {
  const rows = await prisma.furo.findMany({
    select: { id: true },
    take: 5000,
    orderBy: { id: "asc" },
  });
  return rows.map((r: { id: number }) => ({ furoId: String(r.id) }));
}

export default function RotativaFuroLayout({ children }: { children: ReactNode }) {
  return children;
}
