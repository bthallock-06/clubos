/**
 * Billing: charges, invoices, payments, expenses.
 *
 * Every function that moves money does two things in one transaction:
 * it writes the operational row and it posts the matching journal entry.
 * That is what keeps the club's books in step with what parents see.
 *
 * Accounting basis: accrual. Revenue is recognized when an invoice is issued.
 *   issue invoice   DR Accounts Receivable      CR revenue (tagged to team)
 *   payment         DR Cash, DR Processing Fees CR Accounts Receivable
 *   void invoice    reverse of issue
 *   expense         DR expense (tagged to team) CR Cash
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  accounts,
  athletes,
  charges,
  expenses,
  households,
  invoices,
  payments,
  rosterEntries,
  teams,
} from "@/db/schema";
import { addMonths, todayIn, type IsoDate } from "@/lib/dates";
import { splitCents } from "@/lib/money";
import { assertRole, DomainError, inTransaction, type Ctx } from "@/server/context";
import { emit } from "@/server/events/bus";
import { ACCOUNT, accountIdByCode, postEntry } from "./ledger";

// ---------------------------------------------------------------- charges

export type ChargeInput = {
  teamId: string;
  description: string;
  /** Per athlete total. */
  amountCents: number;
  installments: number;
  firstDueOn: IsoDate;
  revenueAccountCode: string;
  /** Date revenue is recognized. Defaults to today in the club's timezone. */
  issuedOn?: IsoDate;
};

/** Bills every athlete on a team, split into monthly installments. */
export async function createCharge(ctx: Ctx, input: ChargeInput) {
  assertRole(ctx, "director");
  if (!ctx.userId) throw new DomainError("A charge needs an author.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DomainError("Amount must be greater than zero.");
  }
  if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 12) {
    throw new DomainError("Installments must be between 1 and 12.");
  }
  const authorId = ctx.userId;

  return inTransaction(ctx, async (tx) => {
    const [team] = await tx.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, input.teamId), eq(teams.clubId, tx.clubId)));
    if (!team) throw new DomainError("Team not found.");

    const roster = await tx.db
      .select({ athlete: athletes })
      .from(rosterEntries)
      .innerJoin(athletes, eq(athletes.id, rosterEntries.athleteId))
      .where(and(eq(rosterEntries.teamId, team.id), eq(rosterEntries.clubId, tx.clubId)));
    if (roster.length === 0) throw new DomainError("This team has no athletes to bill.");

    const revenueAccountId = await accountIdByCode(tx, input.revenueAccountCode);
    const receivableId = await accountIdByCode(tx, ACCOUNT.receivable);

    const [charge] = await tx.db
      .insert(charges)
      .values({
        clubId: tx.clubId,
        teamId: team.id,
        description: input.description,
        amountCents: input.amountCents,
        installments: input.installments,
        firstDueOn: input.firstDueOn,
        revenueAccountId,
        createdBy: authorId,
      })
      .returning();
    if (!charge) throw new DomainError("Charge was not created.");

    const issuedOn = input.issuedOn ?? todayIn(tx.timezone);
    const parts = splitCents(input.amountCents, input.installments);
    let invoiceCount = 0;
    for (const { athlete } of roster) {
      for (const [i, amountCents] of parts.entries()) {
        const label =
          parts.length > 1
            ? `${input.description} (${i + 1} of ${parts.length})`
            : input.description;
        const [invoice] = await tx.db
          .insert(invoices)
          .values({
            clubId: tx.clubId,
            householdId: athlete.householdId,
            athleteId: athlete.id,
            teamId: team.id,
            chargeId: charge.id,
            revenueAccountId,
            description: label,
            amountCents,
            dueOn: addMonths(input.firstDueOn, i),
          })
          .returning({ id: invoices.id });
        if (!invoice) throw new DomainError("Invoice was not created.");
        await postEntry(tx, {
          date: issuedOn,
          memo: `${label}: ${athlete.firstName} ${athlete.lastName}`,
          sourceType: "invoice",
          sourceId: invoice.id,
          lines: [
            { accountId: receivableId, teamId: team.id, debitCents: amountCents },
            { accountId: revenueAccountId, teamId: team.id, creditCents: amountCents },
          ],
        });
        invoiceCount += 1;
      }
    }

    await emit(tx, "charge.created", {
      chargeId: charge.id,
      teamId: team.id,
      invoiceCount,
      totalCents: input.amountCents * roster.length,
    });
    return { chargeId: charge.id, invoiceCount, athletes: roster.length };
  });
}

// ---------------------------------------------------------------- invoices

// Table qualified by hand: Drizzle drops the qualifier in single table selects,
// which would make a correlated subquery bind to the wrong id.
const paidSubquery = sql<number>`coalesce((
  select sum(p.amount_cents) from payments p
  where p.invoice_id = "invoices"."id" and p.status = 'succeeded'
), 0)::int`;

export type InvoiceRow = Awaited<ReturnType<typeof listInvoices>>[number];

export async function listInvoices(
  ctx: Ctx,
  filter: { householdIds?: string[]; teamId?: string; status?: "open" | "paid" | "void" } = {},
) {
  const where = [eq(invoices.clubId, ctx.clubId)];
  if (filter.householdIds) {
    if (filter.householdIds.length === 0) return [];
    where.push(inArray(invoices.householdId, filter.householdIds));
  }
  if (filter.teamId) where.push(eq(invoices.teamId, filter.teamId));
  if (filter.status) where.push(eq(invoices.status, filter.status));

  return ctx.db
    .select({
      id: invoices.id,
      description: invoices.description,
      amountCents: invoices.amountCents,
      paidCents: paidSubquery,
      dueOn: invoices.dueOn,
      status: invoices.status,
      householdId: invoices.householdId,
      household: households.name,
      athlete: sql<string>`${athletes.firstName} || ' ' || ${athletes.lastName}`,
      teamId: invoices.teamId,
      team: teams.name,
    })
    .from(invoices)
    .innerJoin(households, eq(households.id, invoices.householdId))
    .innerJoin(athletes, eq(athletes.id, invoices.athleteId))
    .innerJoin(teams, eq(teams.id, invoices.teamId))
    .where(and(...where))
    .orderBy(invoices.dueOn, households.name);
}

export async function getInvoice(ctx: Ctx, invoiceId: string) {
  const [row] = await ctx.db
    .select({
      id: invoices.id,
      description: invoices.description,
      amountCents: invoices.amountCents,
      paidCents: paidSubquery,
      dueOn: invoices.dueOn,
      status: invoices.status,
      householdId: invoices.householdId,
      household: households.name,
      athlete: sql<string>`${athletes.firstName} || ' ' || ${athletes.lastName}`,
      teamId: invoices.teamId,
      team: teams.name,
    })
    .from(invoices)
    .innerJoin(households, eq(households.id, invoices.householdId))
    .innerJoin(athletes, eq(athletes.id, invoices.athleteId))
    .innerJoin(teams, eq(teams.id, invoices.teamId))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.clubId, ctx.clubId)));
  return row ?? null;
}

export async function voidInvoice(ctx: Ctx, invoiceId: string): Promise<void> {
  assertRole(ctx, "director");
  await inTransaction(ctx, async (tx) => {
    const invoice = await getInvoice(tx, invoiceId);
    if (!invoice) throw new DomainError("Invoice not found.");
    if (invoice.status !== "open") throw new DomainError("Only open invoices can be voided.");
    if (invoice.paidCents > 0) {
      throw new DomainError("This invoice has payments. Refund them before voiding.");
    }
    const [full] = await tx.db.select().from(invoices).where(eq(invoices.id, invoiceId));
    if (!full) throw new DomainError("Invoice not found.");
    await tx.db.update(invoices).set({ status: "void" }).where(eq(invoices.id, invoiceId));
    await postEntry(tx, {
      date: todayIn(tx.timezone),
      memo: `Void: ${invoice.description} (${invoice.athlete})`,
      sourceType: "invoice_void",
      sourceId: invoiceId,
      lines: [
        { accountId: full.revenueAccountId, teamId: full.teamId, debitCents: full.amountCents },
        {
          accountId: await accountIdByCode(tx, ACCOUNT.receivable),
          teamId: full.teamId,
          creditCents: full.amountCents,
        },
      ],
    });
    await emit(tx, "invoice.voided", { invoiceId });
  });
}

// ---------------------------------------------------------------- payments

export type PaymentInput = {
  invoiceId: string;
  amountCents: number;
  feeCents: number;
  provider: string;
  /** The processor's id for the payment. Replays with the same ref are ignored. */
  providerRef: string;
  paidOn: IsoDate;
};

/**
 * Records a successful payment. Safe to call twice with the same providerRef,
 * which is what makes payment webhooks safe to retry.
 */
export async function recordPayment(
  ctx: Ctx,
  input: PaymentInput,
): Promise<{ paymentId: string; duplicate: boolean }> {
  return inTransaction(ctx, async (tx) => {
    const [existing] = await tx.db
      .select({ id: payments.id })
      .from(payments)
      .where(
        and(eq(payments.provider, input.provider), eq(payments.providerRef, input.providerRef)),
      );
    if (existing) return { paymentId: existing.id, duplicate: true };

    const invoice = await getInvoice(tx, input.invoiceId);
    if (!invoice) throw new DomainError("Invoice not found.");
    if (invoice.status === "void") throw new DomainError("This invoice was voided.");
    const balance = invoice.amountCents - invoice.paidCents;
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw new DomainError("Payment must be greater than zero.");
    }
    if (input.amountCents > balance) {
      throw new DomainError("Payment is larger than the balance due.");
    }
    if (input.feeCents < 0 || input.feeCents >= input.amountCents) {
      throw new DomainError("Processing fee is out of range.");
    }

    const [payment] = await tx.db
      .insert(payments)
      .values({
        clubId: tx.clubId,
        invoiceId: invoice.id,
        amountCents: input.amountCents,
        feeCents: input.feeCents,
        provider: input.provider,
        providerRef: input.providerRef,
        status: "succeeded",
        paidOn: input.paidOn,
      })
      .returning({ id: payments.id });
    if (!payment) throw new DomainError("Payment was not created.");

    if (input.amountCents === balance) {
      await tx.db.update(invoices).set({ status: "paid" }).where(eq(invoices.id, invoice.id));
    }

    await postEntry(tx, {
      date: input.paidOn,
      memo: `Payment: ${invoice.description} (${invoice.athlete})`,
      sourceType: "payment",
      sourceId: payment.id,
      lines: [
        {
          accountId: await accountIdByCode(tx, ACCOUNT.cash),
          debitCents: input.amountCents - input.feeCents,
        },
        {
          accountId: await accountIdByCode(tx, ACCOUNT.processingFees),
          teamId: invoice.teamId,
          debitCents: input.feeCents,
        },
        {
          accountId: await accountIdByCode(tx, ACCOUNT.receivable),
          teamId: invoice.teamId,
          creditCents: input.amountCents,
        },
      ],
    });
    await emit(tx, "payment.succeeded", {
      paymentId: payment.id,
      invoiceId: invoice.id,
      amountCents: input.amountCents,
      provider: input.provider,
    });
    return { paymentId: payment.id, duplicate: false };
  });
}

// ---------------------------------------------------------------- expenses

export type ExpenseInput = {
  teamId: string | null;
  accountCode: string;
  payee: string;
  description: string;
  amountCents: number;
  spentOn: IsoDate;
  isContractorPay: boolean;
};

export async function recordExpense(ctx: Ctx, input: ExpenseInput): Promise<string> {
  assertRole(ctx, "director");
  if (!ctx.userId) throw new DomainError("An expense needs an author.");
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new DomainError("Amount must be greater than zero.");
  }
  const authorId = ctx.userId;

  return inTransaction(ctx, async (tx) => {
    const [account] = await tx.db
      .select()
      .from(accounts)
      .where(and(eq(accounts.clubId, tx.clubId), eq(accounts.code, input.accountCode)));
    if (!account || account.type !== "expense") {
      throw new DomainError("Pick an expense account.");
    }
    const [expense] = await tx.db
      .insert(expenses)
      .values({
        clubId: tx.clubId,
        teamId: input.teamId,
        accountId: account.id,
        payee: input.payee,
        description: input.description,
        amountCents: input.amountCents,
        spentOn: input.spentOn,
        isContractorPay: input.isContractorPay,
        createdBy: authorId,
      })
      .returning({ id: expenses.id });
    if (!expense) throw new DomainError("Expense was not created.");

    await postEntry(tx, {
      date: input.spentOn,
      memo: `${input.payee}: ${input.description}`,
      sourceType: "expense",
      sourceId: expense.id,
      lines: [
        { accountId: account.id, teamId: input.teamId, debitCents: input.amountCents },
        { accountId: await accountIdByCode(tx, ACCOUNT.cash), creditCents: input.amountCents },
      ],
    });
    await emit(tx, "expense.recorded", { expenseId: expense.id, amountCents: input.amountCents });
    return expense.id;
  });
}

export async function listExpenses(ctx: Ctx, limit = 50) {
  return ctx.db
    .select({
      id: expenses.id,
      spentOn: expenses.spentOn,
      payee: expenses.payee,
      description: expenses.description,
      amountCents: expenses.amountCents,
      account: accounts.name,
      team: teams.name,
      isContractorPay: expenses.isContractorPay,
    })
    .from(expenses)
    .innerJoin(accounts, eq(accounts.id, expenses.accountId))
    .leftJoin(teams, eq(teams.id, expenses.teamId))
    .where(eq(expenses.clubId, ctx.clubId))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
    .limit(limit);
}

/**
 * Contractor pay by payee for one calendar year, for 1099 NEC preparation.
 * The reporting threshold is a parameter because it changes with tax law;
 * confirm the current figure with the club's CPA.
 */
export async function contractorPayTotals(ctx: Ctx, year: number, thresholdCents: number) {
  const rows = await ctx.db
    .select({
      payee: expenses.payee,
      totalCents: sql<number>`sum(${expenses.amountCents})::int`,
      payments: sql<number>`count(*)::int`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.clubId, ctx.clubId),
        eq(expenses.isContractorPay, true),
        sql`extract(year from ${expenses.spentOn}) = ${year}`,
      ),
    )
    .groupBy(expenses.payee)
    .orderBy(desc(sql`sum(${expenses.amountCents})`));
  return rows.map((r) => ({ ...r, needs1099: r.totalCents >= thresholdCents }));
}
