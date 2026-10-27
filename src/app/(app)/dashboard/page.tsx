import Link from "next/link";
import { Badge, Card, Empty, Meter, PageHeader, Stat, Table, td, tdNum, th, thNum } from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireViewer } from "@/server/auth/session";
import { CREDENTIAL_LABEL } from "@/server/domain/compliance";
import { directorDashboard } from "@/server/domain/dashboard";
import { columnKey } from "@/server/domain/ledger";

const ACTIVITY_LABEL: Record<string, string> = {
  "charge.created": "Charge issued",
  "invoice.voided": "Invoice voided",
  "payment.succeeded": "Payment received",
  "expense.recorded": "Expense recorded",
  "journal.posted": "Journal entry posted",
  "event.scheduled": "Event scheduled",
  "credential.saved": "Credential updated",
};

function amountOf(payload: Record<string, unknown>): number | null {
  const value = payload.amountCents ?? payload.totalCents;
  return typeof value === "number" ? value : null;
}

export default async function DashboardPage() {
  const { ctx } = await requireViewer("director");
  const d = await directorDashboard(ctx);
  const collectedPct = d.billedCents > 0 ? Math.round((d.collectedCents / d.billedCents) * 100) : 0;
  const agingTotal = d.aging.reduce((s, b) => s + b.cents, 0);
  const whole = { whole: true };

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`Season to date as of ${formatDate(d.today)}`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Billed" value={formatCents(d.billedCents, whole)} hint="All invoices this season" />
        <Stat
          label="Collected"
          value={formatCents(d.collectedCents, whole)}
          hint={`${collectedPct}% of billed`}
          tone="ok"
        />
        <Stat
          label="Outstanding"
          value={formatCents(d.outstandingCents, whole)}
          hint={`${formatCents(d.dueSoonCents, whole)} due in the next 14 days`}
        />
        <Stat
          label="Overdue"
          value={formatCents(d.overdueCents, whole)}
          hint={`${d.overdue.length} ${d.overdue.length === 1 ? "family" : "families"}`}
          tone={d.overdueCents > 0 ? "bad" : "ink"}
        />
        <Stat label="Cash on the books" value={formatCents(d.cashCents, whole)} hint="Operating Cash, per ledger" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Overdue families"
          className="lg:col-span-2"
          action={
            <Link href="/billing?status=open" className="text-xs font-medium text-brand hover:underline">
              All open invoices
            </Link>
          }
        >
          {d.overdue.length === 0 ? (
            <Empty>Nobody is behind. Every due invoice is paid.</Empty>
          ) : (
            <Table
              head={
                <tr>
                  <th className={th}>Family</th>
                  <th className={th}>Oldest due</th>
                  <th className={thNum}>Invoices</th>
                  <th className={thNum}>Past due</th>
                </tr>
              }
            >
              {d.overdue.slice(0, 7).map((o) => (
                <tr key={o.householdId}>
                  <td className={`${td} font-medium`}>{o.household}</td>
                  <td className={td}>{formatDate(o.oldestDue)}</td>
                  <td className={tdNum}>{o.invoices}</td>
                  <td className={`${tdNum} font-medium text-bad`}>{formatCents(o.cents)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Receivables aging">
          <div className="space-y-3.5 px-5 py-4">
            {d.aging.map((bucket, i) => (
              <div key={bucket.label}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>{bucket.label}</span>
                  <span className="num font-medium">{formatCents(bucket.cents, whole)}</span>
                </div>
                <Meter value={bucket.cents} total={agingTotal} tone={i === 0 ? "brand" : i === 1 ? "warn" : "bad"} />
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card
          title="Profit and loss by team, year to date"
          className="lg:col-span-2"
          action={
            <Link href="/finance" className="text-xs font-medium text-brand hover:underline">
              Full statement
            </Link>
          }
        >
          <Table
            head={
              <tr>
                <th className={th}>Team</th>
                <th className={thNum}>Revenue</th>
                <th className={thNum}>Expenses</th>
                <th className={thNum}>Net</th>
              </tr>
            }
          >
            {d.pnl.columns.map((col) => {
              const key = columnKey(col.teamId);
              const revenue = d.pnl.rows
                .filter((r) => r.type === "revenue")
                .reduce((s, r) => s + (r.byColumn[key] ?? 0), 0);
              const expense = d.pnl.rows
                .filter((r) => r.type === "expense")
                .reduce((s, r) => s + (r.byColumn[key] ?? 0), 0);
              const net = d.pnl.net[key] ?? 0;
              return (
                <tr key={key}>
                  <td className={`${td} font-medium`}>{col.label}</td>
                  <td className={tdNum}>{formatCents(revenue, whole)}</td>
                  <td className={tdNum}>{formatCents(expense, whole)}</td>
                  <td className={`${tdNum} font-medium ${net < 0 ? "text-bad" : ""}`}>{formatCents(net, whole)}</td>
                </tr>
              );
            })}
            <tr className="bg-paper font-semibold">
              <td className={td}>Club total</td>
              <td className={tdNum}>{formatCents(d.pnl.revenueCents, whole)}</td>
              <td className={tdNum}>{formatCents(d.pnl.expenseCents, whole)}</td>
              <td className={tdNum}>{formatCents(d.pnl.net.total ?? 0, whole)}</td>
            </tr>
          </Table>
        </Card>

        <Card
          title="Compliance flags"
          action={
            <Link href="/compliance" className="text-xs font-medium text-brand hover:underline">
              {d.complianceFlags.length} of {d.peopleTracked}
            </Link>
          }
        >
          {d.complianceFlags.length === 0 ? (
            <Empty>Everyone is current.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {d.complianceFlags.slice(0, 6).map((p) => {
                const issue = p.items.find((i) => i.status === p.worst);
                return (
                  <li key={p.key} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted">
                        {issue ? CREDENTIAL_LABEL[issue.kind] : ""}
                      </p>
                    </div>
                    <Badge tone={p.worst === "expiring" ? "warn" : "bad"}>{p.worst}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Coming up">
          {d.upcoming.length === 0 ? (
            <Empty>Nothing scheduled.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {d.upcoming.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {e.team}: {e.title}
                    </p>
                    <p className="truncate text-xs text-muted">{e.location}</p>
                  </div>
                  <span className="whitespace-nowrap text-xs text-muted">
                    {formatDateTime(e.startsAt, ctx.timezone)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Recent activity">
          <ul className="divide-y divide-line">
            {d.activity.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span>
                  {ACTIVITY_LABEL[a.type] ?? a.type}
                  {amountOf(a.payload) !== null && (
                    <span className="num ml-2 text-muted">{formatCents(amountOf(a.payload) ?? 0)}</span>
                  )}
                </span>
                <span className="whitespace-nowrap text-xs text-muted">
                  {formatDateTime(a.createdAt, ctx.timezone)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
