/**
 * Compliance: who is missing or about to lose a credential they need.
 *
 * Requirements are data, not scattered ifs. To change what a sport requires,
 * edit REQUIRED below.
 */
import { and, eq } from "drizzle-orm";
import { athletes, credentials, rosterEntries, teamStaff, teams, users } from "@/db/schema";
import { daysBetween, type IsoDate } from "@/lib/dates";
import { assertRole, DomainError, type Ctx } from "@/server/context";
import { emit } from "@/server/events/bus";

export type CredentialKind = (typeof credentials.kind.enumValues)[number];
export type CredentialStatus = "ok" | "expiring" | "expired" | "missing";

export const CREDENTIAL_LABEL: Record<CredentialKind, string> = {
  ngb_membership: "USA Water Polo membership",
  safesport: "SafeSport training",
  background_check: "Background check",
};

export const REQUIRED: Record<"athlete" | "staff", CredentialKind[]> = {
  athlete: ["ngb_membership"],
  staff: ["ngb_membership", "safesport", "background_check"],
};

/** Credentials inside this many days of expiry are flagged. */
export const EXPIRING_WINDOW_DAYS = 45;

export function statusFor(expiresOn: IsoDate | null, today: IsoDate): CredentialStatus {
  if (!expiresOn) return "missing";
  const days = daysBetween(today, expiresOn);
  if (days < 0) return "expired";
  if (days <= EXPIRING_WINDOW_DAYS) return "expiring";
  return "ok";
}

export type ComplianceItem = {
  kind: CredentialKind;
  status: CredentialStatus;
  expiresOn: IsoDate | null;
};
export type CompliancePerson = {
  key: string;
  subject: "athlete" | "staff";
  id: string;
  name: string;
  teams: string[];
  items: ComplianceItem[];
  /** Worst status across this person's required credentials. */
  worst: CredentialStatus;
};

const SEVERITY: Record<CredentialStatus, number> = { ok: 0, expiring: 1, expired: 2, missing: 3 };

export async function complianceReport(ctx: Ctx, today: IsoDate): Promise<CompliancePerson[]> {
  assertRole(ctx, "director", "coach");
  const creds = await ctx.db.select().from(credentials).where(eq(credentials.clubId, ctx.clubId));
  // Keep the latest expiry per person and kind.
  const latest = new Map<string, IsoDate>();
  for (const c of creds) {
    const key = `${c.athleteId ? "athlete" : "staff"}:${c.athleteId ?? c.userId}:${c.kind}`;
    const prev = latest.get(key);
    if (!prev || c.expiresOn > prev) latest.set(key, c.expiresOn);
  }

  const people = new Map<string, CompliancePerson>();
  const upsert = (subject: "athlete" | "staff", id: string, name: string, team: string) => {
    const key = `${subject}:${id}`;
    const person = people.get(key) ?? { key, subject, id, name, teams: [], items: [], worst: "ok" as const };
    if (!person.teams.includes(team)) person.teams.push(team);
    people.set(key, person);
  };

  const rostered = await ctx.db
    .select({ id: athletes.id, first: athletes.firstName, last: athletes.lastName, team: teams.name })
    .from(rosterEntries)
    .innerJoin(athletes, eq(athletes.id, rosterEntries.athleteId))
    .innerJoin(teams, eq(teams.id, rosterEntries.teamId))
    .where(eq(rosterEntries.clubId, ctx.clubId));
  for (const r of rostered) upsert("athlete", r.id, `${r.first} ${r.last}`, r.team);

  const staff = await ctx.db
    .select({ id: users.id, name: users.name, team: teams.name })
    .from(teamStaff)
    .innerJoin(users, eq(users.id, teamStaff.userId))
    .innerJoin(teams, eq(teams.id, teamStaff.teamId))
    .where(eq(teamStaff.clubId, ctx.clubId));
  for (const s of staff) upsert("staff", s.id, s.name, s.team);

  for (const person of people.values()) {
    person.items = REQUIRED[person.subject].map((kind) => {
      const expiresOn = latest.get(`${person.key}:${kind}`) ?? null;
      return { kind, expiresOn, status: statusFor(expiresOn, today) };
    });
    person.worst = person.items.reduce<CredentialStatus>(
      (worst, item) => (SEVERITY[item.status] > SEVERITY[worst] ? item.status : worst),
      "ok",
    );
  }

  return [...people.values()].sort(
    (a, b) => SEVERITY[b.worst] - SEVERITY[a.worst] || a.name.localeCompare(b.name),
  );
}

export async function saveCredential(
  ctx: Ctx,
  input: {
    subject: "athlete" | "staff";
    subjectId: string;
    kind: CredentialKind;
    expiresOn: IsoDate;
    externalId?: string;
    source?: string;
  },
): Promise<void> {
  assertRole(ctx, "director", "system");
  // Confirm the person belongs to this club before writing.
  if (input.subject === "athlete") {
    const [row] = await ctx.db
      .select({ id: athletes.id })
      .from(athletes)
      .where(and(eq(athletes.id, input.subjectId), eq(athletes.clubId, ctx.clubId)));
    if (!row) throw new DomainError("Athlete not found.");
  } else {
    const [row] = await ctx.db
      .select({ id: teamStaff.id })
      .from(teamStaff)
      .where(and(eq(teamStaff.userId, input.subjectId), eq(teamStaff.clubId, ctx.clubId)));
    if (!row) throw new DomainError("Staff member not found.");
  }
  const [cred] = await ctx.db
    .insert(credentials)
    .values({
      clubId: ctx.clubId,
      athleteId: input.subject === "athlete" ? input.subjectId : null,
      userId: input.subject === "staff" ? input.subjectId : null,
      kind: input.kind,
      expiresOn: input.expiresOn,
      externalId: input.externalId ?? "",
      source: input.source ?? "manual",
    })
    .returning({ id: credentials.id });
  if (cred) await emit(ctx, "credential.saved", { credentialId: cred.id, kind: input.kind });
}
