import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ furoId: string }>;
};

export default async function PerfilEstatigraficoAliasPage({ params }: Props) {
  const { furoId } = await params;
  redirect(`/rotativa/${furoId}/perfil-estratigrafico`);
}
