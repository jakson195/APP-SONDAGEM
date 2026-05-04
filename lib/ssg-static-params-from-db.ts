import { CAMPO_TIPO } from "@/lib/campo-sondagem-tipo";
import { prisma } from "@/lib/prisma";

function warnStaticParams(cause: unknown) {
  console.warn(
    "[generateStaticParams] BD indisponível no build (ex.: sem prisma/dev.db na CI). SSG destes paths fica vazio; páginas geram sob pedido.",
    cause,
  );
}

/** `{ id }` segmento de obra. */
export async function ssgObraIdParams(): Promise<{ id: string }[]> {
  try {
    const rows = await prisma.obra.findMany({
      select: { id: true },
      take: 5000,
      orderBy: { id: "asc" },
    });
    return rows.map((r: { id: number }) => ({ id: String(r.id) }));
  } catch (e) {
    warnStaticParams(e);
    return [];
  }
}

/** `{ id }` onde o segmento é id de furo. */
export async function ssgFuroIdParams(): Promise<{ id: string }[]> {
  try {
    const rows = await prisma.furo.findMany({
      select: { id: true },
      take: 5000,
      orderBy: { id: "asc" },
    });
    return rows.map((r: { id: number }) => ({ id: String(r.id) }));
  } catch (e) {
    warnStaticParams(e);
    return [];
  }
}

/** `{ furoId }` (layouts SPT, poços, trado, rotativa, relatório). */
export async function ssgFuroIdSegmentParams(): Promise<{ furoId: string }[]> {
  try {
    const rows = await prisma.furo.findMany({
      select: { id: true },
      take: 5000,
      orderBy: { id: "asc" },
    });
    return rows.map((r: { id: number }) => ({ furoId: String(r.id) }));
  } catch (e) {
    warnStaticParams(e);
    return [];
  }
}

export async function ssgSptRowIdParams(): Promise<{ id: string }[]> {
  try {
    const rows = await prisma.sPT.findMany({
      select: { id: true },
      take: 5000,
      orderBy: { id: "asc" },
    });
    return rows.map((r: { id: number }) => ({ id: String(r.id) }));
  } catch (e) {
    warnStaticParams(e);
    return [];
  }
}

export async function ssgObraIdCampoTipoParams(): Promise<
  { id: string; tipo: string }[]
> {
  try {
    const rows = await prisma.obra.findMany({
      select: { id: true },
      take: 5000,
      orderBy: { id: "asc" },
    });
    const tipos = Object.values(CAMPO_TIPO);
    return rows.flatMap((r: { id: number }) =>
      tipos.map((tipo) => ({ id: String(r.id), tipo })),
    );
  } catch (e) {
    warnStaticParams(e);
    return [];
  }
}
