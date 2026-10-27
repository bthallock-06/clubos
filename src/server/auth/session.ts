/**
 * Cookie sessions backed by the sessions table.
 *
 * This file is the whole auth surface. To move to a hosted identity provider
 * (Clerk, Auth0, WorkOS), reimplement currentCtx() and the rest of the app is
 * unchanged because pages and domain code only consume Ctx.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/db/client";
import { clubs, memberships, sessions, users, type Role } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { verifyPassword } from "./password";

const COOKIE = "clubos_session";
const SESSION_DAYS = 14;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export type Viewer = {
  ctx: Ctx;
  user: { id: string; name: string; email: string };
  club: { id: string; name: string };
  role: Role;
};

export async function signIn(email: string, password: string): Promise<boolean> {
  const db = await getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  if (!user || !(await verifyPassword(password, user.passwordHash))) return false;

  // A user with several clubs lands in the first. A club switcher goes here later.
  const [membership] = await db
    .select()
    .from(memberships)
    .where(eq(memberships.userId, user.id));
  if (!membership) return false;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId: user.id,
    clubId: membership.clubId,
    expiresAt,
  });
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
  return true;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }
  jar.delete(COOKIE);
}

/** Resolves the signed in viewer once per request, or null. */
export const currentViewer = cache(async (): Promise<Viewer | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: users, club: clubs, role: memberships.role })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .innerJoin(clubs, eq(clubs.id, sessions.clubId))
    .innerJoin(
      memberships,
      and(eq(memberships.userId, sessions.userId), eq(memberships.clubId, sessions.clubId)),
    )
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  return {
    ctx: {
      db,
      clubId: row.club.id,
      userId: row.user.id,
      role: row.role,
      timezone: row.club.timezone,
    },
    user: { id: row.user.id, name: row.user.name, email: row.user.email },
    club: { id: row.club.id, name: row.club.name },
    role: row.role,
  };
});

/** Use at the top of every page and server action. */
export async function requireViewer(...allowed: Role[]): Promise<Viewer> {
  const viewer = await currentViewer();
  if (!viewer) redirect("/login");
  if (allowed.length > 0 && !allowed.includes(viewer.role)) redirect(homeFor(viewer.role));
  return viewer;
}

export function homeFor(role: Role): string {
  if (role === "director") return "/dashboard";
  if (role === "coach") return "/teams";
  return "/family";
}
