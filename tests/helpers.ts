import { openDb, type DbHandle } from "@/db/client";
import * as t from "@/db/schema";
import type { Ctx } from "@/server/context";
import { ensureChart } from "@/server/domain/ledger";

/** A fresh in memory Postgres with one club, one team and two rostered athletes. */
export async function testClub() {
  const handle: DbHandle = await openDb({ memory: true });
  await handle.migrate();
  const db = handle.db;
  const [club] = await db.insert(t.clubs).values({ name: "Test Club" }).returning();
  const [user] = await db
    .insert(t.users)
    .values({ email: "d@test.club", name: "Director", passwordHash: "x" })
    .returning();
  if (!club || !user) throw new Error("setup failed");
  const ctx: Ctx = {
    db,
    clubId: club.id,
    userId: user.id,
    role: "director",
    timezone: "America/Los_Angeles",
  };
  await ensureChart(ctx);
  const [team] = await db
    .insert(t.teams)
    .values({ clubId: club.id, name: "14U", season: "Fall" })
    .returning();
  if (!team) throw new Error("setup failed");
  for (const name of ["Ana", "Ben"]) {
    const [h] = await db.insert(t.households).values({ clubId: club.id, name }).returning();
    const [a] = await db
      .insert(t.athletes)
      .values({ clubId: club.id, householdId: h!.id, firstName: name, lastName: "Test" })
      .returning();
    await db.insert(t.rosterEntries).values({ clubId: club.id, teamId: team.id, athleteId: a!.id });
  }
  return { handle, ctx, teamId: team.id };
}
