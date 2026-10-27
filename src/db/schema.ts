/**
 * Club OS data model.
 *
 * Rules that hold across the schema:
 *  1. Every tenant owned row carries club_id. Queries always filter on it.
 *  2. Money is stored as integer cents. Never floats.
 *  3. The ledger (accounts, journal_entries, journal_lines) is the financial
 *     source of truth. Invoices, payments and expenses post into it.
 *  4. Athlete records hold the minimum needed to run a roster (no birth date,
 *     no address) because most athletes are minors.
 */
import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ---------------------------------------------------------------- enums

export const roleEnum = pgEnum("role", ["director", "coach", "parent", "athlete"]);
export const eventKindEnum = pgEnum("event_kind", [
  "practice",
  "game",
  "tournament",
  "meeting",
]);
export const invoiceStatusEnum = pgEnum("invoice_status", ["open", "paid", "void"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);
export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);
export const credentialKindEnum = pgEnum("credential_kind", [
  "ngb_membership",
  "safesport",
  "background_check",
]);
export const integrationSlotEnum = pgEnum("integration_slot", [
  "payments",
  "accounting",
  "membership",
]);

// ---------------------------------------------------------------- tenancy and identity

export const clubs = pgTable("clubs", {
  id: id(),
  name: text("name").notNull(),
  sport: text("sport").notNull().default("water_polo"),
  timezone: text("timezone").notNull().default("America/Los_Angeles"),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: createdAt(),
});

/** A user's role inside one club. One user can belong to several clubs. */
export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_club_user").on(t.clubId, t.userId)],
);

export const sessions = pgTable("sessions", {
  /** SHA 256 of the cookie token. The raw token never touches the database. */
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- club structure

export const teams = pgTable(
  "teams",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    name: text("name").notNull(),
    season: text("season").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("teams_club").on(t.clubId)],
);

export const teamStaff = pgTable(
  "team_staff",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    title: text("title").notNull().default("Coach"),
  },
  (t) => [uniqueIndex("team_staff_team_user").on(t.teamId, t.userId)],
);

/** The billing unit. Invoices go to a household, not to an athlete. */
export const households = pgTable(
  "households",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("households_club").on(t.clubId)],
);

export const householdMembers = pgTable(
  "household_members",
  {
    id: id(),
    householdId: uuid("household_id").notNull().references(() => households.id),
    userId: uuid("user_id").notNull().references(() => users.id),
  },
  (t) => [uniqueIndex("household_members_unique").on(t.householdId, t.userId)],
);

export const athletes = pgTable(
  "athletes",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    householdId: uuid("household_id").notNull().references(() => households.id),
    /** Set only when the athlete has their own login. */
    userId: uuid("user_id").references(() => users.id),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    gradYear: integer("grad_year"),
    createdAt: createdAt(),
  },
  (t) => [index("athletes_club").on(t.clubId)],
);

export const rosterEntries = pgTable(
  "roster_entries",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    athleteId: uuid("athlete_id").notNull().references(() => athletes.id),
    capNumber: integer("cap_number"),
  },
  (t) => [uniqueIndex("roster_team_athlete").on(t.teamId, t.athleteId)],
);

export const events = pgTable(
  "events",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    kind: eventKindEnum("kind").notNull(),
    title: text("title").notNull(),
    location: text("location").notNull().default(""),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    notes: text("notes").notNull().default(""),
  },
  (t) => [index("events_club_start").on(t.clubId, t.startsAt)],
);

export const videos = pgTable(
  "videos",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    title: text("title").notNull(),
    /** A link for now. Swap for an upload key when video storage is added. */
    url: text("url").notNull(),
    recordedOn: date("recorded_on").notNull(),
    addedBy: uuid("added_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("videos_club_team").on(t.clubId, t.teamId)],
);

// ---------------------------------------------------------------- billing

/** One director action ("Fall dues, 14U, $1,800 in 3 installments"). */
export const charges = pgTable("charges", {
  id: id(),
  clubId: uuid("club_id").notNull().references(() => clubs.id),
  teamId: uuid("team_id").notNull().references(() => teams.id),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  installments: integer("installments").notNull().default(1),
  firstDueOn: date("first_due_on").notNull(),
  revenueAccountId: uuid("revenue_account_id").notNull(),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: createdAt(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    householdId: uuid("household_id").notNull().references(() => households.id),
    athleteId: uuid("athlete_id").notNull().references(() => athletes.id),
    teamId: uuid("team_id").notNull().references(() => teams.id),
    chargeId: uuid("charge_id").references(() => charges.id),
    revenueAccountId: uuid("revenue_account_id").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    dueOn: date("due_on").notNull(),
    status: invoiceStatusEnum("status").notNull().default("open"),
    issuedAt: createdAt(),
  },
  (t) => [
    index("invoices_club_status").on(t.clubId, t.status),
    index("invoices_household").on(t.householdId),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    invoiceId: uuid("invoice_id").notNull().references(() => invoices.id),
    amountCents: integer("amount_cents").notNull(),
    /** Processor fee withheld from the payout. Posts to an expense account. */
    feeCents: integer("fee_cents").notNull().default(0),
    provider: text("provider").notNull(),
    /** The processor's id for this payment. Unique, so webhooks are idempotent. */
    providerRef: text("provider_ref").notNull(),
    status: paymentStatusEnum("status").notNull(),
    paidOn: date("paid_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payments_provider_ref").on(t.provider, t.providerRef),
    index("payments_invoice").on(t.invoiceId),
  ],
);

// ---------------------------------------------------------------- ledger

export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: accountTypeEnum("type").notNull(),
  },
  (t) => [uniqueIndex("accounts_club_code").on(t.clubId, t.code)],
);

export const journalEntries = pgTable(
  "journal_entries",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    entryDate: date("entry_date").notNull(),
    memo: text("memo").notNull(),
    /** What produced this entry, e.g. ("invoice", id). Unique: no double posting. */
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("journal_source").on(t.clubId, t.sourceType, t.sourceId),
    index("journal_club_date").on(t.clubId, t.entryDate),
  ],
);

export const journalLines = pgTable(
  "journal_lines",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    entryId: uuid("entry_id").notNull().references(() => journalEntries.id),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    /** Optional tag that makes team level P&L possible. */
    teamId: uuid("team_id").references(() => teams.id),
    debitCents: integer("debit_cents").notNull().default(0),
    creditCents: integer("credit_cents").notNull().default(0),
  },
  (t) => [
    index("journal_lines_entry").on(t.entryId),
    index("journal_lines_club_account").on(t.clubId, t.accountId),
  ],
);

export const expenses = pgTable(
  "expenses",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    teamId: uuid("team_id").references(() => teams.id),
    accountId: uuid("account_id").notNull().references(() => accounts.id),
    payee: text("payee").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull(),
    spentOn: date("spent_on").notNull(),
    /** True for coach and referee pay. Feeds the 1099 report. */
    isContractorPay: boolean("is_contractor_pay").notNull().default(false),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index("expenses_club_date").on(t.clubId, t.spentOn)],
);

// ---------------------------------------------------------------- compliance

export const credentials = pgTable(
  "credentials",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    /** Exactly one of athleteId or userId is set. */
    athleteId: uuid("athlete_id").references(() => athletes.id),
    userId: uuid("user_id").references(() => users.id),
    kind: credentialKindEnum("kind").notNull(),
    externalId: text("external_id").notNull().default(""),
    expiresOn: date("expires_on").notNull(),
    /** Which membership adapter wrote this row ("manual", "sport80"). */
    source: text("source").notNull().default("manual"),
  },
  (t) => [index("credentials_club").on(t.clubId, t.expiresOn)],
);

// ---------------------------------------------------------------- platform

/** Per club connection to an outside system. Falls back to env defaults. */
export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    slot: integrationSlotEnum("slot").notNull(),
    provider: text("provider").notNull(),
    /** e.g. the Stripe connected account id or the QuickBooks realm id. */
    externalAccountId: text("external_account_id").notNull().default(""),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("integrations_club_slot").on(t.clubId, t.slot)],
);

/** Append only record of what happened. Audit trail and the hook for plugins. */
export const eventLog = pgTable(
  "event_log",
  {
    id: id(),
    clubId: uuid("club_id").notNull().references(() => clubs.id),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    actorUserId: uuid("actor_user_id"),
    createdAt: createdAt(),
  },
  (t) => [index("event_log_club_time").on(t.clubId, t.createdAt)],
);

// ---------------------------------------------------------------- relations

export const teamsRelations = relations(teams, ({ many }) => ({
  roster: many(rosterEntries),
  staff: many(teamStaff),
}));

export const rosterRelations = relations(rosterEntries, ({ one }) => ({
  team: one(teams, { fields: [rosterEntries.teamId], references: [teams.id] }),
  athlete: one(athletes, {
    fields: [rosterEntries.athleteId],
    references: [athletes.id],
  }),
}));

export const teamStaffRelations = relations(teamStaff, ({ one }) => ({
  team: one(teams, { fields: [teamStaff.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamStaff.userId], references: [users.id] }),
}));

export const athletesRelations = relations(athletes, ({ one, many }) => ({
  household: one(households, {
    fields: [athletes.householdId],
    references: [households.id],
  }),
  roster: many(rosterEntries),
}));

export type Role = (typeof roleEnum.enumValues)[number];
export type AccountType = (typeof accountTypeEnum.enumValues)[number];
export type IntegrationSlot = (typeof integrationSlotEnum.enumValues)[number];
