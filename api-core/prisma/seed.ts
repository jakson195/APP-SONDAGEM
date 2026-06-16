import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import { garantirModulosPadraoEmpresa } from "../lib/seed-empresa-modulos";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.MASTER_ADMIN_EMAIL?.trim();
  const plain = process.env.MASTER_ADMIN_PASSWORD;

  if (!email || !plain) {
    console.warn(
      "Seed: defina MASTER_ADMIN_EMAIL e MASTER_ADMIN_PASSWORD no .env para criar o ADM mestre.",
    );
    return;
  }

  const password = await bcrypt.hash(plain, 10);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      password,
      name: "Administrador mestre",
      systemRole: "MASTER_ADMIN",
    },
    update: {
      password,
      systemRole: "MASTER_ADMIN",
    },
  });
  console.log("ADM mestre garantido:", email);

  const empresas = await prisma.company.findMany({
    select: { id: true, userId: true },
  });
  for (const e of empresas) {
    await prisma.orgMembership.upsert({
      where: { userId_empresaId: { userId: e.userId, empresaId: e.id } },
      create: {
        userId: e.userId,
        empresaId: e.id,
        orgRole: "ADMIN",
      },
      update: {},
    });
  }
  if (empresas.length > 0) {
    console.log("Vínculos OrgMembership (dono → ADMIN) atualizados:", empresas.length);
  }

  for (const e of empresas) {
    await garantirModulosPadraoEmpresa(e.id);
  }
  if (empresas.length > 0) {
    console.log("Módulos padrão da empresa garantidos:", empresas.length);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    void prisma.$disconnect();
    process.exit(1);
  });
