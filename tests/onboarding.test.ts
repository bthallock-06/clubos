import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openDb, type DbHandle } from "@/db/client";
import { verifyPassword } from "@/server/auth/password";
import type { Ctx } from "@/server/context";
import { createTeam, listTeams } from "@/server/domain/club";
import { listAccounts } from "@/server/domain/ledger";
import { createClubWithDirector } from "@/server/domain/onboarding";
import * as t from "@/db/schema";
import { eq } from "drizzle-orm";

let handle: DbHandle;
beforeAll(async () => {
  handle = await openDb({ memory: true });
  await handle.migrate();
});
afterAll(async () => {
  await handle.close();
});

const base = {
  clubName: "Harbor Aquatics",
  directorName: "Pat Director",
  email: "Pat@Harbor.Club ",
  password: "correct horse battery",
  timezone: "America/Chicago",
};

describe("club sign up", () => {
  it("creates the director, the club, the membership and the chart of accounts", async () => {
    const { userId, clubId } = await createClubWithDirector(handle.db, base);
    const [user] = await handle.db.select().from(t.users).where(eq(t.users.id, userId));
    expect(user?.email).toBe("pat@harbor.club");
    expect(await verifyPassword(base.password, user!.passwordHash)).toBe(true);
    const [club] = await handle.db.select().from(t.clubs).where(eq(t.clubs.id, clubId));
    expect(club).toMatchObject({ name: "Harbor Aquatics", timezone: "America/Chicago" });
    const [m] = await handle.db.select().from(t.memberships).where(eq(t.memberships.userId, userId));
    expect(m?.role).toBe("director");

    const ctx: Ctx = { db: handle.db, clubId, userId, role: "director", timezone: "America/Chicago" };
    expect((await listAccounts(ctx)).length).toBeGreaterThan(10);
    expect(await listTeams(ctx)).toEqual([]);
    await createTeam(ctx, { name: "14U Boys", season: "Fall" });
    expect((await listTeams(ctx)).map((x) => x.name)).toEqual(["14U Boys"]);
  });

  it("rejects a second account with the same email, in any case", async () => {
    await expect(
      createClubWithDirector(handle.db, { ...base, email: "PAT@harbor.club", clubName: "Other" }),
    ).rejects.toThrow(/already exists/);
    expect(await handle.db.select().from(t.clubs)).toHaveLength(1);
  });

  it("rejects short passwords and unknown timezones", async () => {
    await expect(
      createClubWithDirector(handle.db, { ...base, email: "a@b.co", password: "short" }),
    ).rejects.toThrow(/at least/);
    await expect(
      createClubWithDirector(handle.db, { ...base, email: "a@b.co", timezone: "Mars/Base" }),
    ).rejects.toThrow(/timezone/);
  });

  it("keeps new clubs apart from each other", async () => {
    const a = await createClubWithDirector(handle.db, { ...base, email: "a@club.a", clubName: "A" });
    const b = await createClubWithDirector(handle.db, { ...base, email: "b@club.b", clubName: "B" });
    const ctxA: Ctx = { db: handle.db, clubId: a.clubId, userId: a.userId, role: "director", timezone: "UTC" };
    const ctxB: Ctx = { db: handle.db, clubId: b.clubId, userId: b.userId, role: "director", timezone: "UTC" };
    await createTeam(ctxA, { name: "Only in A", season: "Fall" });
    expect(await listTeams(ctxB)).toEqual([]);
  });
});
