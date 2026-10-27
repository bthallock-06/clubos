/** Read model for the director dashboard. Composes the other domain modules. */
import { and, desc, eq, notInArray } from "drizzle-orm";
import { eventLog } from "@/db/schema";
import { addDays, daysBetween, todayIn } from "@/lib/dates";
import { assertRole, type Ctx } from "@/server/context";
import { listInvoices } from "./billing";
import { listEvents } from "./club";
import { complianceReport } from "./compliance";
import { ACCOUNT, accountBalance, profitAndLoss } from "./ledger";

export type AgingBucket = { label: string; cents: number; count: number };

export async function directorDashboard(ctx: Ctx) {
  assertRole(ctx, "director");
  const today = todayIn(ctx.timezone);
  const yearStart = `${today.slice(0, 4)}-01-01`;

  const [allInvoices, pnl, cashCents, compliance, upcoming, activity] = await Promise.all([
    listInvoices(ctx),
    profitAndLoss(ctx, { from: yearStart, to: today }),
    accountBalance(ctx, ACCOUNT.cash),
    complianceReport(ctx, today),
    listEvents(ctx, { from: new Date(), limit: 6 }),
    ctx.db
      .select()
      .from(eventLog)
      .where(
        and(
          eq(eventLog.clubId, ctx.clubId),
          // Bookkeeping and calendar noise stays in the full event stream.
          notInArray(eventLog.type, ["journal.posted", "event.scheduled"]),
        ),
      )
      .orderBy(desc(eventLog.createdAt))
      .limit(8),
  ]);

  const live = allInvoices.filter((i) => i.status !== "void");
  const billedCents = live.reduce((s, i) => s + i.amountCents, 0);
  const collectedCents = live.reduce((s, i) => s + i.paidCents, 0);

  const aging: AgingBucket[] = [
    { label: "Not yet due", cents: 0, count: 0 },
    { label: "1 to 30 days late", cents: 0, count: 0 },
    { label: "31 to 60 days late", cents: 0, count: 0 },
    { label: "Over 60 days late", cents: 0, count: 0 },
  ];
  const overdueByHousehold = new Map<
    string,
    { householdId: string; household: string; cents: number; oldestDue: string; invoices: number }
  >();

  for (const inv of live) {
    const balance = inv.amountCents - inv.paidCents;
    if (inv.status !== "open" || balance <= 0) continue;
    const late = daysBetween(inv.dueOn, today);
    const bucket = aging[late <= 0 ? 0 : late <= 30 ? 1 : late <= 60 ? 2 : 3];
    if (bucket) {
      bucket.cents += balance;
      bucket.count += 1;
    }
    if (late > 0) {
      const row = overdueByHousehold.get(inv.householdId) ?? {
        householdId: inv.householdId,
        household: inv.household,
        cents: 0,
        oldestDue: inv.dueOn,
        invoices: 0,
      };
      row.cents += balance;
      row.invoices += 1;
      if (inv.dueOn < row.oldestDue) row.oldestDue = inv.dueOn;
      overdueByHousehold.set(inv.householdId, row);
    }
  }

  const overdue = [...overdueByHousehold.values()].sort((a, b) => b.cents - a.cents);
  const dueSoonCents = live
    .filter((i) => i.status === "open" && i.dueOn >= today && i.dueOn <= addDays(today, 14))
    .reduce((s, i) => s + i.amountCents - i.paidCents, 0);

  return {
    today,
    billedCents,
    collectedCents,
    outstandingCents: billedCents - collectedCents,
    overdueCents: overdue.reduce((s, o) => s + o.cents, 0),
    dueSoonCents,
    cashCents,
    aging,
    overdue,
    pnl,
    complianceFlags: compliance.filter((p) => p.worst !== "ok"),
    peopleTracked: compliance.length,
    upcoming,
    activity,
  };
}
