import { PrismaClient } from "@prisma/client";

import { resolveDatabaseUrl } from "@/lib/resolve-database-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const dbUrl = resolveDatabaseUrl();

function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    ...(dbUrl ? { datasources: { db: { url: dbUrl } } } : {}),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

/** Cliente em cache pode ficar stale após `prisma generate` — validar delegados SaaS. */
function isPrismaClientStale(client: PrismaClient): boolean {
  return !("subscription" in client) || typeof (client as { subscription?: unknown }).subscription === "undefined";
}

let prismaInstance = globalForPrisma.prisma;
if (!prismaInstance || isPrismaClientStale(prismaInstance)) {
  prismaInstance = createPrismaClient();
}

export const prisma = prismaInstance;

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Permite `import prisma from "@/lib/prisma"` além de `import { prisma } from "..."`. */
export default prisma;
