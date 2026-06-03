import { createHash, randomBytes } from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";

const RESET_TTL_MS = 60 * 60 * 1000;

export function generatePasswordResetToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPasswordResetForEmail(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.password) return null;

  const token = generatePasswordResetToken();
  const tokenHash = hashResetToken(token);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash, expiresAt },
  });

  return { user, token, expiresAt };
}

export async function consumePasswordResetToken(token: string, newPassword: string) {
  const tokenHash = hashResetToken(token);
  const row = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, usedAt: null },
    include: { user: true },
  });
  if (!row || row.expiresAt < new Date()) {
    return { ok: false as const, error: "Token inválido ou expirado." };
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { password: passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
  ]);

  return { ok: true as const };
}
