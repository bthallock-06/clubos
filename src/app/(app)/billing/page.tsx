import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, input, NeedsTeam, PageHeader, Table, td, tdNum, th, thNum } from "@/components/ui";
import { addDays, formatDate, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireViewer } from "@/server/auth/session";
import { listInvoices } from "@/server/domain/billing";
import { listTeams } from "@/server/domain/club";
import { listAccounts } from "@/server/domain/ledger";
import { createChargeAction, recordOfflinePaymentAction, voidInvoiceAction } from "./actions";

const STATUSES = ["open", "paid", "void"] as const;
type Status = (typeof STATUSES)[number];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; team?: string }>;
}) {
  const sp = await searchParams;
  const { ctx } = await requireViewer("director");
  const status = STATUSES.find((s) => s === sp.status) as Status | undefined;
  const today = todayIn(ctx.timezone);
  const [teams, revenueAccounts, invoices] = await Promise.all([
    listTeams(ctx),
    listAccounts(ctx, "revenue"),
    listInvoices(ctx, { status, teamId: sp.team || undefined }),
  ]);

  const link = (next: { status?: string; team?: string }) => {
    const q = new URLSearchParams();
    const merged = { status: sp.status, team: sp.team, ...next };
    if (merged.status) q.set("status", merged.status);
    if (merged.team) q.set("team", merged.team);
    const s = q.toString();
    return s ? `/billing?${s}` : "/billing";
  };
  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={label}
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Billing"
        subtitle="Charge a team once. Every family gets invoices and the ledger posts itself."
      />

      <Card title="New charge">
        {teams.length === 0 ? (
          <NeedsTeam action="bill it" />
        ) : (
        <ActionForm action={createChargeAction} className="p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Team">
              <select name="teamId" required className={input}>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.athletes})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" className="lg:col-span-2">
              <input name="description" required placeholder="Winter 2027 dues" className={input} />
            </Field>
            <Field label="Amount per athlete">
              <input name="amount" required inputMode="decimal" placeholder="1,650" className={input} />
            </Field>
            <Field label="Monthly installments">
              <select name="installments" defaultValue="1" className={input}>
                {[1, 2, 3, 4, 6].map((n) => (
                  <option key={n} value={n}>
                    {n === 1 ? "Pay in full" : `${n} payments`}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="First due date">
              <input name="firstDueOn" type="date" required defaultValue={addDays(today, 14)} className={input} />
            </Field>
            <Field label="Books to" className="sm:col-span-2 lg:col-span-2">
              <select name="revenueAccountCode" className={input}>
                {revenueAccounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <SubmitButton>Bill the team</SubmitButton>
          </div>
        </ActionForm>
        )}
      </Card>

      <div className="mb-3 mt-6 flex flex-wrap items-center gap-2">
        {chip(link({ status: "" }), "All", !status)}
        {STATUSES.map((s) => chip(link({ status: s }), s[0]!.toUpperCase() + s.slice(1), status === s))}
        <span className="mx-1 h-4 w-px bg-line" />
        {chip(link({ team: "" }), "All teams", !sp.team)}
        {teams.map((t) => chip(link({ team: t.id }), t.name, sp.team === t.id))}
      </div>

      <Card title={`Invoices (${invoices.length})`}>
        {invoices.length === 0 ? (
          <Empty>No invoices match.</Empty>
        ) : (
          <Table
            head={
              <tr>
                <th className={th}>Family</th>
                <th className={th}>Athlete</th>
                <th className={th}>For</th>
                <th className={th}>Due</th>
                <th className={thNum}>Amount</th>
                <th className={thNum}>Balance</th>
                <th className={th}>Status</th>
                <th className={th} />
              </tr>
            }
          >
            {invoices.map((inv) => {
              const balance = inv.amountCents - inv.paidCents;
              const overdue = inv.status === "open" && inv.dueOn < today;
              return (
                <tr key={inv.id}>
                  <td className={`${td} font-medium`}>{inv.household}</td>
                  <td className={td}>
                    {inv.athlete} <span className="text-xs text-muted">{inv.team}</span>
                  </td>
                  <td className={td}>{inv.description}</td>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(inv.dueOn)}</td>
                  <td className={tdNum}>{formatCents(inv.amountCents)}</td>
                  <td className={tdNum}>{inv.status === "void" ? "" : formatCents(balance)}</td>
                  <td className={td}>
                    {inv.status === "paid" ? (
                      <Badge tone="ok">Paid</Badge>
                    ) : inv.status === "void" ? (
                      <Badge>Void</Badge>
                    ) : overdue ? (
                      <Badge tone="bad">Overdue</Badge>
                    ) : (
                      <Badge tone="brand">Open</Badge>
                    )}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    {inv.status === "open" && (
                      <div className="flex justify-end gap-2">
                        <ActionForm action={recordOfflinePaymentAction} resetOnSuccess={false}>
                          <input type="hidden" name="invoiceId" value={inv.id} />
                          <SubmitButton variant="quiet">Paid by check</SubmitButton>
                        </ActionForm>
                        {inv.paidCents === 0 && (
                          <ActionForm action={voidInvoiceAction} resetOnSuccess={false}>
                            <input type="hidden" name="invoiceId" value={inv.id} />
                            <SubmitButton variant="danger">Void</SubmitButton>
                          </ActionForm>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
