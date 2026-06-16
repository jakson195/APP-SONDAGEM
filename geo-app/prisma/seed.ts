import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("Defina DATABASE_URL no .env (ex.: postgresql://postgres:123456@localhost:5432/geoapp).");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString })),
});

async function main() {
  // Adicione modelos em prisma/schema.prisma e migrações antes de popular dados.
  console.log("Seed concluído (sem modelos definidos ainda).");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
