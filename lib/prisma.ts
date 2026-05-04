import { PrismaClient } from "@prisma/client";

const globalForPrisma = global as any;

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Permite `import prisma from "@/lib/prisma"` além de `import { prisma } from "..."`. */
export default prisma;
