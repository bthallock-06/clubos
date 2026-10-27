/**
 * Double entry ledger. The one place journal entries are written.
 *
 * Invariants enforced here and covered by tests/ledger.test.ts:
 *  - an entry has at least two lines
 *  - each line is a debit or a credit, never both, never zero, never negative
 *  - total debits equal total credits
 *  - a (sourceType, sourceId) pair posts at most once
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { accounts, journalEntries, journalLines, teams, type AccountType } from "@/db/schema";
import type { IsoDate } from "@/lib/dates";
import { DomainError, type Ctx } from "@/server/context";
import { emit } from "@/server/events/bus";

/** Starter chart of accounts for a club. Codes are stable; names are editable. */
export const DEFAULT_CHART: Array<{ code: string; name: string; type: AccountType }> = [
  { code: "1000", name: "Operating Cash", type: "asset" },
  { code: "1100", name: "Accounts Receivable", type: "asset" },
  { code: "3000", name: "Net Assets", type: "equity" },
  { code: "4000", name: "Membership Dues", type: "revenue" },
  { code: "4100", name: "Tournament Fees", type: "revenue" },
  { code: "4200", name: "Gear and Apparel", type: "revenue" },
  { code: "4900", name: "Other Income", type: "revenue" },
  { code: "5000", name: "Coach Pay", type: "expense" },
  { code: "5100", name: "Pool Rental", type: "expense" },
  { code: "5200", name: "Tournament Entry Fees", type: "expense" },
  { code: "5300", name: "Referees", type: "expense" },
  { code: "5400", name: "Equipment", type: "expense" },
  { code: "5500", name: "Travel", type: "expense" },
  { code: "5600", name: "Payment Processing Fees", type: "expense" },
  { code: "5700", name: "Insurance", type: "expense" },
  { code: "5800", name: "Software and Admin", type: "expense" },
];

export const ACCOUNT = {
  cash: "1000",
  receivable: "1100",
  processingFees: "5600",
} as const;

export async function ensureChart(ctx: Ctx): Promise<void> {
  await ctx.db
    .insert(accounts)
    .values(DEFAULT_CHART.map((a) => ({ ...a, clubId: ctx.clubId })))
    .onConflictDoNothing();
}

export async function listAccounts(ctx: Ctx, type?: AccountType) {
  return ctx.db
    .select()
    .from(accounts)
    .where(
      type
        ? and(eq(accounts.clubId, ctx.clubId), eq(accounts.type, type))
        : eq(accounts.clubId, ctx.clubId),
    )
    .orderBy(accounts.code);
}

export async function accountIdByCode(ctx: Ctx, code: string): Promise<string> {
  const [row] = await ctx.db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.clubId, ctx.clubId), eq(accounts.code, code)));
  if (!row) throw new DomainError(`Account ${code} does not exist for this club.`);
  return row.id;
}

export type EntryLine = {
  accountId: string;
  teamId?: string | null;
  debitCents?: number;
  creditCents?: number;
};

export type EntryInput = {
  date: IsoDate;
  memo: string;
  sourceType: string;
  sourceId: string;
  lines: EntryLine[];
};

export function validateEntry(lines: EntryLine[]): void {
  if (lines.length < 2) throw new DomainError("A journal entry needs at least two lines.");
  let debits = 0;
  let credits = 0;
  for (const line of lines) {
    const d = line.debitCents ?? 0;
    const c = line.creditCents ?? 0;
    if (!Number.isInteger(d) || !Number.isInteger(c) || d < 0 || c < 0) {
      throw new DomainError("Journal amounts must be whole, non negative cents.");
    }
    if ((d === 0) === (c === 0)) {
      throw new DomainError("Each journal line must be either a debit or a credit.");
    }
    debits += d;
    credits += c;
  }
  if (debits !== credits) {
    throw new DomainError(`Entry does not balance: debits ${debits}, credits ${credits}.`);
  }
}

/** Posts one balanced entry. Call inside the transaction that made the change. */
export async function postEntry(ctx: Ctx, input: EntryInput): Promise<string> {
  // Zero value lines (for example a zero fee) are dropped before validation.
  const lines = input.lines.filter((l) => (l.debitCents ?? 0) + (l.creditCents ?? 0) !== 0);
  validateEntry(lines);

  const [entry] = await ctx.db
    .insert(journalEntries)
    .values({
      clubId: ctx.clubId,
      entryDate: input.date,
      memo: input.memo,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
    })
    .returning({ id: journalEntries.id });
  if (!entry) throw new DomainError("Journal entry was not created.");

  await ctx.db.insert(journalLines).values(
    lines.map((l) => ({
      clubId: ctx.clubId,
      entryId: entry.id,
      accountId: l.accountId,
      teamId: l.teamId ?? null,
      debitCents: l.debitCents ?? 0,
      creditCents: l.creditCents ?? 0,
    })),
  );
  await emit(ctx, "journal.posted", {
    entryId: entry.id,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
  });
  return entry.id;
}

export type DateRange = { from: IsoDate; to: IsoDate };

const inRange = (ctx: Ctx, range: DateRange) =>
  and(
    eq(journalLines.clubId, ctx.clubId),
    gte(journalEntries.entryDate, range.from),
    lte(journalEntries.entryDate, range.to),
  );

/** Debit and credit totals per account. Debits always equal credits overall. */
export async function trialBalance(ctx: Ctx, range: DateRange) {
  return ctx.db
    .select({
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      debitCents: sql<number>`coalesce(sum(${journalLines.debitCents}), 0)::int`,
      creditCents: sql<number>`coalesce(sum(${journalLines.creditCents}), 0)::int`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(inRange(ctx, range))
    .groupBy(accounts.code, accounts.name, accounts.type)
    .orderBy(accounts.code);
}

export type PnlColumn = { teamId: string | null; label: string };
export type PnlRow = {
  code: string;
  name: string;
  type: "revenue" | "expense";
  /** Cents by column key. The key for club wide lines is "club". */
  byColumn: Record<string, number>;
  totalCents: number;
};
export type ProfitAndLoss = {
  columns: PnlColumn[];
  rows: PnlRow[];
  /** Net income by column key, plus "total". */
  net: Record<string, number>;
  revenueCents: number;
  expenseCents: number;
};

export const columnKey = (teamId: string | null) => teamId ?? "club";

/** Profit and loss for the range, broken out by team. */
export async function profitAndLoss(ctx: Ctx, range: DateRange): Promise<ProfitAndLoss> {
  const raw = await ctx.db
    .select({
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      teamId: journalLines.teamId,
      debitCents: sql<number>`coalesce(sum(${journalLines.debitCents}), 0)::int`,
      creditCents: sql<number>`coalesce(sum(${journalLines.creditCents}), 0)::int`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(and(inRange(ctx, range), sql`${accounts.type} in ('revenue', 'expense')`))
    .groupBy(accounts.code, accounts.name, accounts.type, journalLines.teamId)
    .orderBy(accounts.code);

  const teamRows = await ctx.db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(eq(teams.clubId, ctx.clubId))
    .orderBy(teams.name);
  const columns: PnlColumn[] = [
    ...teamRows.map((t) => ({ teamId: t.id as string | null, label: t.name })),
    { teamId: null, label: "Club wide" },
  ];

  const rows = new Map<string, PnlRow>();
  const net: Record<string, number> = { total: 0 };
  let revenueCents = 0;
  let expenseCents = 0;

  for (const r of raw) {
    const type = r.type as "revenue" | "expense";
    // Revenue is credit normal, expense is debit normal.
    const amount =
      type === "revenue" ? r.creditCents - r.debitCents : r.debitCents - r.creditCents;
    const key = columnKey(r.teamId);
    const row = rows.get(r.code) ?? { code: r.code, name: r.name, type, byColumn: {}, totalCents: 0 };
    row.byColumn[key] = (row.byColumn[key] ?? 0) + amount;
    row.totalCents += amount;
    rows.set(r.code, row);

    const signed = type === "revenue" ? amount : -amount;
    net[key] = (net[key] ?? 0) + signed;
    net.total = (net.total ?? 0) + signed;
    if (type === "revenue") revenueCents += amount;
    else expenseCents += amount;
  }

  return { columns, rows: [...rows.values()], net, revenueCents, expenseCents };
}

/** Balance of one account: debits minus credits, all time. */
export async function accountBalance(ctx: Ctx, code: string): Promise<number> {
  const [row] = await ctx.db
    .select({
      balance: sql<number>`coalesce(sum(${journalLines.debitCents} - ${journalLines.creditCents}), 0)::int`,
    })
    .from(journalLines)
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .where(and(eq(journalLines.clubId, ctx.clubId), eq(accounts.code, code)));
  return row?.balance ?? 0;
}

/** Flat general ledger for export. One row per journal line. */
export async function journalForExport(ctx: Ctx, range: DateRange) {
  return ctx.db
    .select({
      entryId: journalEntries.id,
      date: journalEntries.entryDate,
      memo: journalEntries.memo,
      source: journalEntries.sourceType,
      accountCode: accounts.code,
      accountName: accounts.name,
      team: teams.name,
      debitCents: journalLines.debitCents,
      creditCents: journalLines.creditCents,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .innerJoin(accounts, eq(accounts.id, journalLines.accountId))
    .leftJoin(teams, eq(teams.id, journalLines.teamId))
    .where(inRange(ctx, range))
    .orderBy(journalEntries.entryDate, journalEntries.createdAt, journalEntries.id, desc(journalLines.debitCents));
}
