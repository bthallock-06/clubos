/**
 * Demo data: one fictional water polo club with three teams, a season of dues,
 * partial collections, expenses, credentials and a schedule.
 *
 * Money rows are created through the domain layer, so the seeded ledger is
 * exactly what the app itself would have produced. Dates are relative to today
 * so the demo never goes stale.
 */
import { addDays, addMonths, todayIn, zonedToInstant } from "@/lib/dates";
import { hashPassword } from "@/server/auth/password";
import type { Ctx } from "@/server/context";
import { createCharge, listInvoices, recordExpense, recordPayment } from "@/server/domain/billing";
import { scheduleEvent } from "@/server/domain/club";
import { saveCredential } from "@/server/domain/compliance";
import { ensureChart } from "@/server/domain/ledger";
import { mockPayments } from "@/server/integrations/payments/mock";
import { openDb } from "./client";
import * as t from "./schema";

export const DEMO_PASSWORD = "clubos-demo";
const TZ = "America/Los_Angeles";

// Small deterministic generator so every seed run produces the same club.
let state = 42;
const rand = () => {
  state = (state * 1664525 + 1013904223) % 4294967296;
  return state / 4294967296;
};

const FIRST = [
  "Avery", "Mateo", "Lucas", "Noah", "Kai", "Owen", "Diego", "Ethan", "Leo", "Jack",
  "Maya", "Sofia", "Zoe", "Chloe", "Ella", "Nina", "Ruby", "Isla", "Tessa", "Quinn",
  "Riley", "Jordan", "Sam", "Drew", "Cole", "Finn", "Luke", "Max", "Theo", "Wes",
];
const LAST = [
  "Alvarez", "Bennett", "Castillo", "Donovan", "Ellis", "Fischer", "Garza", "Hoang",
  "Ito", "Jensen", "Kovac", "Lindqvist", "Moreno", "Nakamura", "Okafor", "Pratt",
  "Quintero", "Rossi", "Sato", "Tran", "Underwood", "Vargas", "Whitfield", "Yamada",
  "Zimmer", "Abbott", "Brandt", "Cruz",
];

async function main() {
  // Against a hosted database, only seed when explicitly asked, so a real club
  // never gets demo families mixed into its data.
  if (process.env.DATABASE_URL && process.env.SEED_DEMO !== "true") {
    console.log("Hosted database and SEED_DEMO is not true. Skipping demo data.");
    return;
  }
  const handle = await openDb();
  await handle.migrate();
  const db = handle.db;

  const existing = await db.select({ id: t.clubs.id }).from(t.clubs).limit(1);
  if (existing.length > 0) {
    console.log("Database already has a club. Run `npm run db:reset` to start over.");
    await handle.close();
    return;
  }

  const today = todayIn(TZ);
  const thisMonth = `${today.slice(0, 7)}-01`;
  const lastMonth = addMonths(thisMonth, -1);
  const issued = addDays(lastMonth, -17);

  const [club] = await db
    .insert(t.clubs)
    .values({ name: "Pacific Tide Water Polo Club", timezone: TZ })
    .returning();
  if (!club) throw new Error("club insert failed");

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const mkUser = async (email: string, name: string, role: t.Role) => {
    const [user] = await db.insert(t.users).values({ email, name, passwordHash }).returning();
    if (!user) throw new Error("user insert failed");
    await db.insert(t.memberships).values({ clubId: club.id, userId: user.id, role });
    return user;
  };
  const director = await mkUser("director@demo.club", "Dana Reyes", "director");
  const coachHale = await mkUser("coach@demo.club", "Marcus Hale", "coach");
  const coachPetrov = await mkUser("elena@demo.club", "Elena Petrov", "coach");
  const coachKim = await mkUser("jordan@demo.club", "Jordan Kim", "coach");
  const parent = await mkUser("parent@demo.club", "Priya Shah", "parent");
  const athleteUser = await mkUser("athlete@demo.club", "Arjun Shah", "athlete");

  const ctx: Ctx = { db, clubId: club.id, userId: director.id, role: "director", timezone: TZ };
  await ensureChart(ctx);

  // ---------------------------------------------------------------- teams and rosters
  const teamDefs = [
    { name: "12U Coed", coach: coachKim, dues: 135_000, coachPay: 120_000, size: 9 },
    { name: "14U Boys", coach: coachHale, dues: 165_000, coachPay: 180_000, size: 11 },
    { name: "16U Girls", coach: coachPetrov, dues: 180_000, coachPay: 180_000, size: 10 },
  ];
  const teams: Array<(typeof teamDefs)[number] & { id: string }> = [];
  for (const def of teamDefs) {
    const [team] = await db
      .insert(t.teams)
      .values({ clubId: club.id, name: def.name, season: "Fall 2026" })
      .returning();
    if (!team) throw new Error("team insert failed");
    await db.insert(t.teamStaff).values({
      clubId: club.id,
      teamId: team.id,
      userId: def.coach.id,
      title: "Head Coach",
    });
    teams.push({ ...def, id: team.id });
  }

  const mkAthlete = async (
    teamId: string,
    householdId: string,
    firstName: string,
    lastName: string,
    cap: number,
    gradYear: number,
    userId?: string,
  ) => {
    const [athlete] = await db
      .insert(t.athletes)
      .values({ clubId: club.id, householdId, firstName, lastName, gradYear, userId })
      .returning();
    if (!athlete) throw new Error("athlete insert failed");
    await db
      .insert(t.rosterEntries)
      .values({ clubId: club.id, teamId, athleteId: athlete.id, capNumber: cap });
    return athlete;
  };
  const mkHousehold = async (name: string) => {
    const [h] = await db.insert(t.households).values({ clubId: club.id, name }).returning();
    if (!h) throw new Error("household insert failed");
    return h;
  };

  // The demo parent: two kids on two teams, one of them with a login.
  const shah = await mkHousehold("Shah family");
  await db.insert(t.householdMembers).values({ householdId: shah.id, userId: parent.id });
  const athleteIds: string[] = [];
  const [u12, u14, u16] = teams;
  if (!u12 || !u14 || !u16) throw new Error("teams missing");
  athleteIds.push((await mkAthlete(u14.id, shah.id, "Arjun", "Shah", 7, 2031, athleteUser.id)).id);
  athleteIds.push((await mkAthlete(u12.id, shah.id, "Meera", "Shah", 4, 2033)).id);

  let nameIndex = 0;
  for (const team of teams) {
    const already = team.id === u14.id || team.id === u12.id ? 1 : 0;
    for (let i = 0; i < team.size - already; i++) {
      const first = FIRST[nameIndex % FIRST.length] ?? "Alex";
      const last = LAST[nameIndex % LAST.length] ?? "Lee";
      nameIndex += 1;
      const household = await mkHousehold(`${last} family`);
      const gradYear = team.id === u12.id ? 2033 : team.id === u14.id ? 2031 : 2029;
      const athlete = await mkAthlete(team.id, household.id, first, last, i + 1 + already * 7, gradYear);
      athleteIds.push(athlete.id);
    }
  }

  // ---------------------------------------------------------------- billing
  for (const team of teams) {
    await createCharge(ctx, {
      teamId: team.id,
      description: "Fall 2026 dues",
      amountCents: team.dues,
      installments: 3,
      firstDueOn: lastMonth,
      revenueAccountCode: "4000",
      issuedOn: issued,
    });
  }
  for (const team of [u14, u16]) {
    await createCharge(ctx, {
      teamId: team.id,
      description: "Fall Classic tournament fee",
      amountCents: 17_500,
      installments: 1,
      firstDueOn: thisMonth,
      revenueAccountCode: "4100",
      issuedOn: addDays(thisMonth, -20),
    });
  }

  // Collections: nearly all of the first installment, most of the second,
  // a few families who paid ahead, and a handful who are well behind.
  const system: Ctx = { ...ctx, userId: null, role: "system" };
  const invoices = await listInvoices(ctx);
  let ref = 0;
  for (const inv of invoices) {
    const isShah = inv.householdId === shah.id;
    let pay: boolean;
    if (isShah) pay = inv.dueOn < thisMonth;
    else if (inv.dueOn < thisMonth) pay = rand() < 0.9;
    else if (inv.dueOn === thisMonth) pay = rand() < (inv.description.includes("tournament") ? 0.55 : 0.7);
    else pay = rand() < 0.12;
    if (!pay) continue;
    const paidOn = inv.dueOn > today ? addDays(today, -1) : addDays(inv.dueOn, Math.floor(rand() * 5) - 3);
    await recordPayment(system, {
      invoiceId: inv.id,
      amountCents: inv.amountCents,
      feeCents: mockPayments.feeFor(inv.amountCents),
      provider: "mock",
      providerRef: `seed_${++ref}`,
      paidOn: paidOn > today ? today : paidOn,
    });
  }

  // ---------------------------------------------------------------- expenses
  const expense = (
    teamId: string | null,
    accountCode: string,
    payee: string,
    description: string,
    amountCents: number,
    spentOn: string,
    isContractorPay = false,
  ) =>
    recordExpense(ctx, { teamId, accountCode, payee, description, amountCents, spentOn, isContractorPay });

  for (const month of [lastMonth, thisMonth]) {
    if (addDays(month, 4) > today) continue;
    for (const team of teams) {
      await expense(team.id, "5000", team.coach.name, "Monthly coaching", team.coachPay, addDays(month, 4), true);
      await expense(team.id, "5100", "Marina Aquatic Center", "Lane rental", 90_000, addDays(month, 2));
    }
  }
  await expense(u14.id, "5200", "SoCal Fall Classic", "Team entry", 65_000, addDays(thisMonth, -12));
  await expense(u16.id, "5200", "SoCal Fall Classic", "Team entry", 65_000, addDays(thisMonth, -12));
  await expense(u16.id, "5300", "Chris Weller", "Scrimmage referee", 24_000, addDays(lastMonth, 19), true);
  await expense(null, "5400", "KAP7", "Game balls and caps", 115_000, addDays(lastMonth, 6));
  await expense(null, "5700", "K&K Insurance", "Annual club liability policy", 140_000, addDays(lastMonth, 1));
  await expense(null, "5800", "Club OS", "Software subscription", 8_900, addDays(lastMonth, 1));

  // ---------------------------------------------------------------- credentials
  for (const [i, athleteId] of athleteIds.entries()) {
    if (i === 5) continue; // one athlete never registered
    const offset = i === 9 || i === 17 ? -14 : i === 3 || i === 12 || i === 21 ? 9 + i : 200 + i;
    await saveCredential(ctx, {
      subject: "athlete",
      subjectId: athleteId,
      kind: "ngb_membership",
      expiresOn: addDays(today, offset),
      externalId: `USAWP-${100200 + i}`,
    });
  }
  const staffCreds: Array<[string, "ngb_membership" | "safesport" | "background_check", number]> = [
    [coachHale.id, "ngb_membership", 240],
    [coachHale.id, "safesport", 12],
    [coachHale.id, "background_check", 400],
    [coachPetrov.id, "ngb_membership", 240],
    [coachPetrov.id, "safesport", 190],
    [coachPetrov.id, "background_check", 310],
    [coachKim.id, "ngb_membership", 240],
    [coachKim.id, "safesport", 150],
    // Jordan Kim has no background check on file.
  ];
  for (const [userId, kind, offset] of staffCreds) {
    await saveCredential(ctx, { subject: "staff", subjectId: userId, kind, expiresOn: addDays(today, offset) });
  }

  // ---------------------------------------------------------------- schedule
  const at = (day: string, time: string) => zonedToInstant(`${day}T${time}`, TZ);
  const practiceTimes: Record<string, [string, string]> = {
    [u12.id]: ["16:00", "17:15"],
    [u14.id]: ["17:15", "18:45"],
    [u16.id]: ["18:45", "20:30"],
  };
  for (let d = 0; d < 14; d++) {
    const day = addDays(today, d);
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    for (const team of teams) {
      const [start, end] = practiceTimes[team.id] ?? ["17:00", "18:30"];
      if ([1, 3, 5].includes(weekday)) {
        await scheduleEvent(ctx, {
          teamId: team.id,
          kind: "practice",
          title: "Practice",
          location: "Marina Aquatic Center",
          startsAt: at(day, start),
          endsAt: at(day, end),
          notes: "",
        });
      }
    }
    if (weekday === 6 && d < 7) {
      await scheduleEvent(ctx, {
        teamId: u14.id,
        kind: "game",
        title: "vs. Harbor Aquatics",
        location: "Marina Aquatic Center",
        startsAt: at(day, "10:00"),
        endsAt: at(day, "11:15"),
        notes: "Arrive 45 minutes early. White caps.",
      });
    }
    if (weekday === 6 && d >= 7) {
      for (const team of [u14, u16]) {
        await scheduleEvent(ctx, {
          teamId: team.id,
          kind: "tournament",
          title: "SoCal Fall Classic",
          location: "Woollett Aquatics Center, Irvine",
          startsAt: at(day, "08:00"),
          endsAt: at(day, "17:00"),
          notes: "Bracket posted Thursday. Bring both cap colors.",
        });
      }
    }
  }
  await scheduleEvent(ctx, {
    teamId: u12.id,
    kind: "meeting",
    title: "Parent meeting: winter season",
    location: "Pool deck classroom",
    startsAt: at(addDays(today, 5), "19:00"),
    endsAt: at(addDays(today, 5), "19:45"),
    notes: "",
  });

  // ---------------------------------------------------------------- film
  await db.insert(t.videos).values([
    {
      clubId: club.id,
      teamId: u14.id,
      title: "Scrimmage vs. Harbor Aquatics: full game",
      url: "https://example.com/film/14u-harbor-scrimmage",
      recordedOn: addDays(today, -10),
      addedBy: coachHale.id,
    },
    {
      clubId: club.id,
      teamId: u14.id,
      title: "6 on 5 sets: clips to review before Saturday",
      url: "https://example.com/film/14u-6on5",
      recordedOn: addDays(today, -4),
      addedBy: coachHale.id,
    },
    {
      clubId: club.id,
      teamId: u16.id,
      title: "Press defense breakdown",
      url: "https://example.com/film/16u-press",
      recordedOn: addDays(today, -6),
      addedBy: coachPetrov.id,
    },
  ]);

  await handle.close();
  console.log(`Seeded "${club.name}". Sign in with any of:`);
  for (const who of ["director", "coach", "parent", "athlete"]) {
    console.log(`  ${who}@demo.club  /  ${DEMO_PASSWORD}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
