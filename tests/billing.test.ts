import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createCharge,
  listInvoices,
  recordExpense,
  recordPayment,
  voidInvoice,
} from "@/server/domain/billing";
import { ACCOUNT, accountBalance, profitAndLoss, trialBalance } from "@/server/domain/ledger";
import { testClub } from "./helpers";

const RANGE = { from: "2026-01-01", to: "2026-12-31" };
let env: Awaited<ReturnType<typeof testClub>>;

beforeAll(async () => {
  env = await testClub();
});
afterAll(async () => {
  await env.handle.close();
});

async function expectBooksBalance() {
  const tb = await trialBalance(env.ctx, RANGE);
  const debits = tb.reduce((s, r) => s + r.debitCents, 0);
  const credits = tb.reduce((s, r) => s + r.creditCents, 0);
  expect(debits).toBe(credits);
  expect(debits).toBeGreaterThan(0);
}

describe("billing posts to the ledger", () => {
  it("bills each athlete in installments and books receivable and revenue", async () => {
    const result = await createCharge(env.ctx, {
      teamId: env.teamId,
      description: "Fall dues",
      amountCents: 100_000,
      installments: 3,
      firstDueOn: "2026-09-01",
      revenueAccountCode: "4000",
      issuedOn: "2026-08-15",
    });
    expect(result).toMatchObject({ athletes: 2, invoiceCount: 6 });

    const invoices = await listInvoices(env.ctx);
    expect(invoices.map((i) => i.dueOn).sort()).toEqual([
      "2026-09-01", "2026-09-01", "2026-10-01", "2026-10-01", "2026-11-01", "2026-11-01",
    ]);
    expect(invoices.reduce((s, i) => s + i.amountCents, 0)).toBe(200_000);
    expect(await accountBalance(env.ctx, ACCOUNT.receivable)).toBe(200_000);
    await expectBooksBalance();
  });

  it("records a payment net of fees and closes the invoice", async () => {
    const [invoice] = await listInvoices(env.ctx);
    await recordPayment(env.ctx, {
      invoiceId: invoice!.id,
      amountCents: invoice!.amountCents,
      feeCents: 1_000,
      provider: "mock",
      providerRef: "pay_1",
      paidOn: "2026-09-01",
    });
    const after = (await listInvoices(env.ctx)).find((i) => i.id === invoice!.id);
    expect(after).toMatchObject({ status: "paid", paidCents: invoice!.amountCents });
    expect(await accountBalance(env.ctx, ACCOUNT.cash)).toBe(invoice!.amountCents - 1_000);
    expect(await accountBalance(env.ctx, ACCOUNT.receivable)).toBe(200_000 - invoice!.amountCents);
    await expectBooksBalance();
  });

  it("ignores a replayed payment with the same processor reference", async () => {
    const [invoice] = await listInvoices(env.ctx);
    const cashBefore = await accountBalance(env.ctx, ACCOUNT.cash);
    const replay = await recordPayment(env.ctx, {
      invoiceId: invoice!.id,
      amountCents: invoice!.amountCents,
      feeCents: 1_000,
      provider: "mock",
      providerRef: "pay_1",
      paidOn: "2026-09-01",
    });
    expect(replay.duplicate).toBe(true);
    expect(await accountBalance(env.ctx, ACCOUNT.cash)).toBe(cashBefore);
  });

  it("accepts partial payments and rejects overpayment", async () => {
    const open = (await listInvoices(env.ctx, { status: "open" }))[0]!;
    await recordPayment(env.ctx, {
      invoiceId: open.id,
      amountCents: 10_000,
      feeCents: 0,
      provider: "mock",
      providerRef: "pay_2",
      paidOn: "2026-09-02",
    });
    const after = (await listInvoices(env.ctx)).find((i) => i.id === open.id);
    expect(after).toMatchObject({ status: "open", paidCents: 10_000 });
    await expect(
      recordPayment(env.ctx, {
        invoiceId: open.id,
        amountCents: open.amountCents,
        feeCents: 0,
        provider: "mock",
        providerRef: "pay_3",
        paidOn: "2026-09-03",
      }),
    ).rejects.toThrow(/larger than the balance/);
    await expectBooksBalance();
  });

  it("voids an unpaid invoice with a reversing entry and refuses a paid one", async () => {
    const invoices = await listInvoices(env.ctx);
    const untouched = invoices.find((i) => i.status === "open" && i.paidCents === 0)!;
    const receivableBefore = await accountBalance(env.ctx, ACCOUNT.receivable);
    await voidInvoice(env.ctx, untouched.id);
    expect(await accountBalance(env.ctx, ACCOUNT.receivable)).toBe(
      receivableBefore - untouched.amountCents,
    );
    const partlyPaid = invoices.find((i) => i.paidCents > 0 && i.status === "open")!;
    await expect(voidInvoice(env.ctx, partlyPaid.id)).rejects.toThrow(/payments/);
    await expectBooksBalance();
  });

  it("books expenses to the team and produces a team level P&L", async () => {
    await recordExpense(env.ctx, {
      teamId: env.teamId,
      accountCode: "5000",
      payee: "Coach",
      description: "September",
      amountCents: 50_000,
      spentOn: "2026-09-05",
      isContractorPay: true,
    });
    await recordExpense(env.ctx, {
      teamId: null,
      accountCode: "5700",
      payee: "Insurer",
      description: "Policy",
      amountCents: 20_000,
      spentOn: "2026-09-05",
      isContractorPay: false,
    });
    const pnl = await profitAndLoss(env.ctx, RANGE);
    const invoices = (await listInvoices(env.ctx)).filter((i) => i.status !== "void");
    const billed = invoices.reduce((s, i) => s + i.amountCents, 0);
    expect(pnl.revenueCents).toBe(billed);
    expect(pnl.expenseCents).toBe(50_000 + 20_000 + 1_000);
    expect(pnl.net[env.teamId]).toBe(billed - 50_000 - 1_000);
    expect(pnl.net.club).toBe(-20_000);
    expect(pnl.net.total).toBe(pnl.revenueCents - pnl.expenseCents);
    await expectBooksBalance();
  });

  it("keeps one club's data out of another club's reports", async () => {
    const other = { ...env.ctx, clubId: "00000000-0000-0000-0000-000000000000" };
    expect(await listInvoices(other)).toEqual([]);
    expect(await trialBalance(other, RANGE)).toEqual([]);
  });

  it("blocks non directors from billing", async () => {
    await expect(
      createCharge(
        { ...env.ctx, role: "parent" },
        {
          teamId: env.teamId,
          description: "x",
          amountCents: 100,
          installments: 1,
          firstDueOn: "2026-09-01",
          revenueAccountCode: "4000",
        },
      ),
    ).rejects.toThrow(/access/);
  });
});
