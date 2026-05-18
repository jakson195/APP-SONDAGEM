import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function notImplemented(method: string, path: string[]) {
  return NextResponse.json(
    {
      error: "Endpoint geoespacial em migração para o monólito.",
      hint: "Implementar em src/app/api/geo/v1/ ou portar de src/modules/digital-twin/server/",
      method,
      path: path.join("/"),
    },
    { status: 501 },
  );
}

export async function GET(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notImplemented("GET", path);
}

export async function POST(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notImplemented("POST", path);
}

export async function PUT(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notImplemented("PUT", path);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notImplemented("PATCH", path);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return notImplemented("DELETE", path);
}
