import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import type { SystemRole } from "@prisma/client";
import { AUTH_TOKEN_COOKIE } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";

export type JwtAuthPayload = {
  userId: number;
  systemRole: SystemRole;
};

export function getJwtSecret(): string | null {
  const s = process.env.JWT_SECRET;
  return s && s.length > 0 ? s : null;
}

/** Assina token com o mesmo formato do login (7d). */
export function signAuthToken(payload: JwtAuthPayload): string {
  const secret = getJwtSecret();
  if (!secret) throw new Error("JWT_SECRET não definido");
  return jwt.sign(payload, secret, { expiresIn: "7d" });
}

export function verifyAuthToken(token: string): JwtAuthPayload | null {
  const secret = getJwtSecret();
  if (!secret) return null;
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & Partial<JwtAuthPayload>;
    if (
      typeof decoded.userId !== "number" ||
      (decoded.systemRole !== "MASTER_ADMIN" &&
        decoded.systemRole !== "SUPER_ADMIN" &&
        decoded.systemRole !== "USER")
    ) {
      return null;
    }
    return {
      userId: decoded.userId,
      systemRole: decoded.systemRole,
    };
  } catch {
    return null;
  }
}

/** Lê Bearer ou cookie httpOnly definido no login. */
export async function getBearerOrCookieToken(req: Request): Promise<string | null> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice(7).trim();
    if (t) return t;
  }
  const jar = await cookies();
  const c = jar.get(AUTH_TOKEN_COOKIE)?.value;
  return c && c.length > 0 ? c : null;
}

export async function getAuthPayloadFromRequest(
  req: Request,
): Promise<JwtAuthPayload | null> {
  const token = await getBearerOrCookieToken(req);
  if (!token) return null;
  return verifyAuthToken(token);
}

export async function getAuthUserFromRequest(req: Request) {
  const payload = await getAuthPayloadFromRequest(req);
  if (!payload) return null;
  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: {
      id: true,
      email: true,
      name: true,
      systemRole: true,
    },
  });
  if (!user) return null;
  if (user.systemRole !== payload.systemRole) return null;
  return user;
}

export function authCookieName(): typeof AUTH_TOKEN_COOKIE {
  return AUTH_TOKEN_COOKIE;
}

export function authCookieOptions(): {
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  };
}
