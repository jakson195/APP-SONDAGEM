import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function generateStaticParams() {
  const rows = await prisma.furo.findMany({
    select: { id: true },
    take: 5000,
    orderBy: { id: "asc" },
  });
  return rows.map((r: { id: number }) => ({ furoId: String(r.id) }));
}

type Props = {
  params: Promise<{ furoId: string }>;
};

/** Links antigos /relatorio/:id passam a abrir a sondagem SPT com PDF no mesmo ecrã. */
export default async function RelatorioPorFuroRedirect({ params }: Props) {
  const { furoId } = await params;
  redirect(`/spt/${furoId}`);
}
