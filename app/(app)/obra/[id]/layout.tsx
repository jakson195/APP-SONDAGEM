import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";

export async function generateStaticParams() {
  const rows = await prisma.obra.findMany({
    select: { id: true },
    take: 5000,
    orderBy: { id: "asc" },
  });
  return rows.map((r: { id: number }) => ({ id: String(r.id) }));
}

export default function ObraIdLayout({ children }: { children: ReactNode }) {
  return children;
}
