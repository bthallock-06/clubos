/** Teams, rosters, households, schedule and film. Read heavy, thin writes. */
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import {
  athletes,
  events,
  householdMembers,
  households,
  rosterEntries,
  teamStaff,
  teams,
  users,
  videos,
} from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { assertRole, DomainError, type Ctx } from "@/server/context";
import { emit } from "@/server/events/bus";

// ---------------------------------------------------------------- teams

export async function listTeams(ctx: Ctx) {
  return ctx.db
    .select({
      id: teams.id,
      name: teams.name,
      season: teams.season,
      athletes: sql<number>`(select count(*) from roster_entries r where r.team_id = "teams"."id")::int`,
      coaches: sql<string>`coalesce((
        select string_agg(u.name, ', ' order by u.name) from team_staff s
        join users u on u.id = s.user_id where s.team_id = "teams"."id"
      ), '')`,
    })
    .from(teams)
    .where(eq(teams.clubId, ctx.clubId))
    .orderBy(teams.name);
}

export async function getTeam(ctx: Ctx, teamId: string) {
  const [team] = await ctx.db
    .select()
    .from(teams)
    .where(and(eq(teams.id, teamId), eq(teams.clubId, ctx.clubId)));
  if (!team) return null;
  const roster = await ctx.db
    .select({
      athleteId: athletes.id,
      firstName: athletes.firstName,
      lastName: athletes.lastName,
      gradYear: athletes.gradYear,
      capNumber: rosterEntries.capNumber,
      household: households.name,
    })
    .from(rosterEntries)
    .innerJoin(athletes, eq(athletes.id, rosterEntries.athleteId))
    .innerJoin(households, eq(households.id, athletes.householdId))
    .where(and(eq(rosterEntries.teamId, teamId), eq(rosterEntries.clubId, ctx.clubId)))
    .orderBy(asc(rosterEntries.capNumber), athletes.lastName);
  const staff = await ctx.db
    .select({ userId: users.id, name: users.name, title: teamStaff.title })
    .from(teamStaff)
    .innerJoin(users, eq(users.id, teamStaff.userId))
    .where(and(eq(teamStaff.teamId, teamId), eq(teamStaff.clubId, ctx.clubId)));
  return { team, roster, staff };
}

export async function addAthlete(
  ctx: Ctx,
  input: {
    teamId: string;
    firstName: string;
    lastName: string;
    gradYear: number | null;
    capNumber: number | null;
    householdName: string;
  },
): Promise<string> {
  assertRole(ctx, "director", "coach");
  return ctx.db.transaction(async (tx) => {
    const [team] = await tx
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.id, input.teamId), eq(teams.clubId, ctx.clubId)));
    if (!team) throw new DomainError("Team not found.");

    // Reuse a household with the same name so siblings share one bill.
    let [household] = await tx
      .select()
      .from(households)
      .where(and(eq(households.clubId, ctx.clubId), eq(households.name, input.householdName)));
    if (!household) {
      [household] = await tx
        .insert(households)
        .values({ clubId: ctx.clubId, name: input.householdName })
        .returning();
    }
    if (!household) throw new DomainError("Household was not created.");

    const [athlete] = await tx
      .insert(athletes)
      .values({
        clubId: ctx.clubId,
        householdId: household.id,
        firstName: input.firstName,
        lastName: input.lastName,
        gradYear: input.gradYear,
      })
      .returning({ id: athletes.id });
    if (!athlete) throw new DomainError("Athlete was not created.");
    await tx.insert(rosterEntries).values({
      clubId: ctx.clubId,
      teamId: team.id,
      athleteId: athlete.id,
      capNumber: input.capNumber,
    });
    return athlete.id;
  });
}

// ---------------------------------------------------------------- what a viewer can see

/** Households the signed in user belongs to. */
export async function householdIdsFor(ctx: Ctx): Promise<string[]> {
  if (!ctx.userId) return [];
  const asGuardian = await ctx.db
    .select({ id: households.id })
    .from(householdMembers)
    .innerJoin(households, eq(households.id, householdMembers.householdId))
    .where(and(eq(householdMembers.userId, ctx.userId), eq(households.clubId, ctx.clubId)));
  const asAthlete = await ctx.db
    .select({ id: athletes.householdId })
    .from(athletes)
    .where(and(eq(athletes.userId, ctx.userId), eq(athletes.clubId, ctx.clubId)));
  return [...new Set([...asGuardian, ...asAthlete].map((r) => r.id))];
}

/**
 * Teams the viewer may see. Directors see all, coaches their own teams,
 * parents and athletes the teams their household's athletes play on.
 */
export async function visibleTeamIds(ctx: Ctx): Promise<string[]> {
  if (ctx.role === "director" || ctx.role === "system") {
    const rows = await ctx.db.select({ id: teams.id }).from(teams).where(eq(teams.clubId, ctx.clubId));
    return rows.map((r) => r.id);
  }
  if (!ctx.userId) return [];
  if (ctx.role === "coach") {
    const rows = await ctx.db
      .select({ id: teamStaff.teamId })
      .from(teamStaff)
      .where(and(eq(teamStaff.userId, ctx.userId), eq(teamStaff.clubId, ctx.clubId)));
    return rows.map((r) => r.id);
  }
  const householdIds = await householdIdsFor(ctx);
  if (householdIds.length === 0) return [];
  const rows = await ctx.db
    .selectDistinct({ id: rosterEntries.teamId })
    .from(rosterEntries)
    .innerJoin(athletes, eq(athletes.id, rosterEntries.athleteId))
    .where(and(eq(rosterEntries.clubId, ctx.clubId), inArray(athletes.householdId, householdIds)));
  return rows.map((r) => r.id);
}

export async function athletesInHouseholds(ctx: Ctx, householdIds: string[]) {
  if (householdIds.length === 0) return [];
  return ctx.db
    .select({
      id: athletes.id,
      firstName: athletes.firstName,
      lastName: athletes.lastName,
      team: teams.name,
      capNumber: rosterEntries.capNumber,
    })
    .from(athletes)
    .leftJoin(rosterEntries, eq(rosterEntries.athleteId, athletes.id))
    .leftJoin(teams, eq(teams.id, rosterEntries.teamId))
    .where(and(eq(athletes.clubId, ctx.clubId), inArray(athletes.householdId, householdIds)))
    .orderBy(athletes.firstName);
}

// ---------------------------------------------------------------- schedule

export type EventKind = (typeof events.kind.enumValues)[number];

export async function listEvents(
  ctx: Ctx,
  opts: { from: Date; teamIds?: string[]; limit?: number },
) {
  const where = [eq(events.clubId, ctx.clubId), gte(events.endsAt, opts.from)];
  if (opts.teamIds) {
    if (opts.teamIds.length === 0) return [];
    where.push(inArray(events.teamId, opts.teamIds));
  }
  return ctx.db
    .select({
      id: events.id,
      kind: events.kind,
      title: events.title,
      location: events.location,
      startsAt: events.startsAt,
      endsAt: events.endsAt,
      notes: events.notes,
      teamId: events.teamId,
      team: teams.name,
    })
    .from(events)
    .innerJoin(teams, eq(teams.id, events.teamId))
    .where(and(...where))
    .orderBy(events.startsAt)
    .limit(opts.limit ?? 200);
}

export async function scheduleEvent(
  ctx: Ctx,
  input: {
    teamId: string;
    kind: EventKind;
    title: string;
    location: string;
    startsAt: Date;
    endsAt: Date;
    notes: string;
  },
): Promise<string> {
  assertRole(ctx, "director", "coach");
  if (input.endsAt <= input.startsAt) throw new DomainError("End time must be after start time.");
  const allowed = await visibleTeamIds(ctx);
  if (!allowed.includes(input.teamId)) throw new DomainError("You cannot schedule for that team.");
  const [event] = await ctx.db
    .insert(events)
    .values({ ...input, clubId: ctx.clubId })
    .returning({ id: events.id });
  if (!event) throw new DomainError("Event was not created.");
  await emit(ctx, "event.scheduled", { eventId: event.id, teamId: input.teamId });
  return event.id;
}

// ---------------------------------------------------------------- film

export async function listVideos(ctx: Ctx, teamIds: string[]) {
  if (teamIds.length === 0) return [];
  return ctx.db
    .select({
      id: videos.id,
      title: videos.title,
      url: videos.url,
      recordedOn: videos.recordedOn,
      team: teams.name,
      addedBy: users.name,
    })
    .from(videos)
    .innerJoin(teams, eq(teams.id, videos.teamId))
    .innerJoin(users, eq(users.id, videos.addedBy))
    .where(and(eq(videos.clubId, ctx.clubId), inArray(videos.teamId, teamIds)))
    .orderBy(desc(videos.recordedOn));
}

export async function addVideo(
  ctx: Ctx,
  input: { teamId: string; title: string; url: string; recordedOn: IsoDate },
): Promise<void> {
  assertRole(ctx, "director", "coach");
  if (!ctx.userId) throw new DomainError("A video needs an author.");
  const allowed = await visibleTeamIds(ctx);
  if (!allowed.includes(input.teamId)) throw new DomainError("You cannot post to that team.");
  await ctx.db.insert(videos).values({ ...input, clubId: ctx.clubId, addedBy: ctx.userId });
}
