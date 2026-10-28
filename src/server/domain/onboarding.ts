/**
 * Club sign up: one transaction creates the director's account, the club,
 * the director membership and the club's starter chart of accounts.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { clubs, memberships, users } from "@/db/schema";
import { hashPassword } from "@/server/auth/password";
import { DomainError } from "@/server/context";
import { ensureChart } from "./ledger";

/** Timezones offered at sign up. Keys are IANA names stored on the club. */
export const CLUB_TIMEZONES: Record<string, string> = {
  "America/Los_Angeles": "Pacific",
  "America/Denver": "Mountain",
  "America/Phoenix": "Arizona",
  "America/Chicago": "Central",
  "America/New_York": "Eastern",
  "America/Anchorage": "Alaska",
  "Pacific/Honolulu": "Hawaii",
};

export const MIN_PASSWORD_LENGTH = 8;

export type NewClubInput = {
  clubName: string;
  directorName: string;
  email: string;
  password: string;
  timezone: string;
};

export async function createClubWithDirector(
  db: Db,
  input: NewClubInput,
): Promise<{ userId: string; clubId: string }> {
  const email = input.email.trim().toLowerCase();
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    throw new DomainError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  }
  if (!(input.timezone in CLUB_TIMEZONES)) throw new DomainError("Pick a timezone.");

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new DomainError("An account with this email already exists. Sign in instead.");

  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, name: input.directorName.trim(), passwordHash })
      .returning({ id: users.id });
    const [club] = await tx
      .insert(clubs)
      .values({ name: input.clubName.trim(), timezone: input.timezone })
      .returning({ id: clubs.id });
    if (!user || !club) throw new DomainError("Sign up failed. Nothing was saved.");
    await tx.insert(memberships).values({ clubId: club.id, userId: user.id, role: "director" });
    await ensureChart({
      db: tx,
      clubId: club.id,
      userId: user.id,
      role: "director",
      timezone: input.timezone,
    });
    return { userId: user.id, clubId: club.id };
  });
}
