import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ furoId: string }>;
};

/** Links antigos /relatorio/:id passam a abrir a sondagem SPT com PDF no mesmo ecrã. */
export default async function RelatorioPorFuroRedirect({ params }: Props) {
  const { furoId } = await params;
  redirect(`/spt/${furoId}`);
}
