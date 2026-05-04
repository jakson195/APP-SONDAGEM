import { redirect } from "next/navigation";
import { ssgFuroIdSegmentParams } from "@/lib/ssg-static-params-from-db";

export async function generateStaticParams() {
  return ssgFuroIdSegmentParams();
}

type Props = {
  params: Promise<{ furoId: string }>;
};

/** Links antigos /relatorio/:id passam a abrir a sondagem SPT com PDF no mesmo ecrã. */
export default async function RelatorioPorFuroRedirect({ params }: Props) {
  const { furoId } = await params;
  redirect(`/spt/${furoId}`);
}
