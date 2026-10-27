import Link from "next/link";
import { Badge, Card, Empty, PageHeader, Stat } from "@/components/ui";
import { formatDate, formatDateTime, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireViewer } from "@/server/auth/session";
import { listInvoices } from "@/server/domain/billing";
import { athletesInHouseholds, householdIdsFor, listEvents, visibleTeamIds } from "@/server/domain/club";

export default async function FamilyPage({ searchParams }: { searchParams: Promise<{ paid?: string }> }) {
  const { paid } = await searchParams;
  const { ctx, user, role } = await requireViewer("parent", "athlete");
  const today = todayIn(ctx.timezone);
  const householdIds = await householdIdsFor(ctx);
  const [athletes, teamIds] = await Promise.all([athletesInHouseholds(ctx, householdIds), visibleTeamIds(ctx)]);
  const upcoming = await listEvents(ctx, { from: new Date(), teamIds, limit: 5 });
  // Athletes see their schedule. Money is for parents.
  const invoices = role === "parent" ? (await listInvoices(ctx, { householdIds })).filter((i) => i.status !== "void") : [];
  const open = invoices.filter((i) => i.status === "open");
  const paidInvoices = invoices.filter((i) => i.status === "paid");
  const balanceCents = open.reduce((s, i) => s + i.amountCents - i.paidCents, 0);
  const dueNowCents = open.filter((i) => i.dueOn <= today).reduce((s, i) => s + i.amountCents - i.paidCents, 0);
  const justPaid = invoices.find((i) => i.id === paid && i.status === "paid");

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(" ")[0]}`} subtitle={athletes.map((a) => `${a.firstName} (${a.team ?? "no team"})`).join(", ")} />

      {justPaid && (
        <p role="status" className="mb-4 rounded-lg bg-ok-soft px-4 py-3 text-sm text-ok">
          Payment received: {formatCents(justPaid.amountCents)} for {justPaid.description}. Thank you.
        </p>
      )}

      {role === "parent" && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Due now" value={formatCents(dueNowCents)} tone={dueNowCents > 0 ? "bad" : "ok"} />
            <Stat label="Total balance" value={formatCents(balanceCents)} hint="Including future installments" />
            <Stat
              label="Paid this season"
              value={formatCents(invoices.reduce((s, i) => s + i.paidCents, 0))}
              hint={`${paidInvoices.length} payments`}
            />
          </div>

          <Card title="What you owe" className="mt-4">
            {open.length === 0 ? (
              <Empty>You are all paid up.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {open.map((inv) => (
                  <li key={inv.id} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{inv.description}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                        <span>{inv.athlete}</span>
                        <span>Due {formatDate(inv.dueOn)}</span>
                        {inv.dueOn < today ? (
                          <Badge tone="bad">Overdue</Badge>
                        ) : inv.dueOn === today ? (
                          <Badge tone="warn">Due today</Badge>
                        ) : null}
                      </p>
                    </div>
                    <span className="num whitespace-nowrap text-sm font-semibold">
                      {formatCents(inv.amountCents - inv.paidCents)}
                    </span>
                    <Link
                      href={`/family/pay/${inv.id}`}
                      className="inline-flex h-9 items-center rounded-md bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark"
                    >
                      Pay
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      <div className={`mt-4 grid gap-4 ${role === "parent" ? "lg:grid-cols-2" : ""}`}>
        <Card
          title="Coming up"
          action={
            <Link href="/schedule" className="text-xs font-medium text-brand hover:underline">
              Full schedule
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <Empty>Nothing scheduled.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {e.team}: {e.title}
                    </p>
                    <p className="truncate text-xs text-muted">{e.location}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted">{formatDateTime(e.startsAt, ctx.timezone)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {role === "parent" && (
          <Card title="Payment history">
            {paidInvoices.length === 0 ? (
              <Empty>No payments yet.</Empty>
            ) : (
              <ul className="divide-y divide-line">
                {paidInvoices.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{inv.description}</p>
                      <p className="text-xs text-muted">{inv.athlete}</p>
                    </div>
                    <span className="num whitespace-nowrap">{formatCents(inv.paidCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
