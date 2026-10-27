import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, input, PageHeader, Table, td, tdNum, th, thNum } from "@/components/ui";
import { CONTRACTOR_1099_THRESHOLD_CENTS } from "@/lib/config";
import { formatDate, todayIn } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireViewer } from "@/server/auth/session";
import { contractorPayTotals, listExpenses } from "@/server/domain/billing";
import { listTeams } from "@/server/domain/club";
import { columnKey, listAccounts, profitAndLoss, trialBalance, type PnlRow } from "@/server/domain/ledger";
import { recordExpenseAction } from "./actions";

export default async function FinancePage() {
  const { ctx } = await requireViewer("director");
  const today = todayIn(ctx.timezone);
  const year = Number(today.slice(0, 4));
  const range = { from: `${year}-01-01`, to: today };
  const [pnl, tb, expenses, contractors, teams, expenseAccounts] = await Promise.all([
    profitAndLoss(ctx, range),
    trialBalance(ctx, range),
    listExpenses(ctx, 12),
    contractorPayTotals(ctx, year, CONTRACTOR_1099_THRESHOLD_CENTS),
    listTeams(ctx),
    listAccounts(ctx, "expense"),
  ]);
  const whole = { whole: true };
  const debits = tb.reduce((s, r) => s + r.debitCents, 0);
  const credits = tb.reduce((s, r) => s + r.creditCents, 0);

  const section = (label: string, rows: PnlRow[], totalCents: number) => (
    <>
      <tr className="bg-paper">
        <td className={`${td} text-xs font-semibold uppercase tracking-wide text-muted`} colSpan={pnl.columns.length + 2}>
          {label}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.code}>
          <td className={td}>
            <span className="num mr-2 text-xs text-muted">{row.code}</span>
            {row.name}
          </td>
          {pnl.columns.map((col) => (
            <td key={columnKey(col.teamId)} className={tdNum}>
              {row.byColumn[columnKey(col.teamId)] ? formatCents(row.byColumn[columnKey(col.teamId)] ?? 0, whole) : ""}
            </td>
          ))}
          <td className={`${tdNum} font-medium`}>{formatCents(row.totalCents, whole)}</td>
        </tr>
      ))}
      <tr className="font-semibold">
        <td className={td}>Total {label.toLowerCase()}</td>
        {pnl.columns.map((col) => {
          const key = columnKey(col.teamId);
          return (
            <td key={key} className={tdNum}>
              {formatCents(rows.reduce((s, r) => s + (r.byColumn[key] ?? 0), 0), whole)}
            </td>
          );
        })}
        <td className={tdNum}>{formatCents(totalCents, whole)}</td>
      </tr>
    </>
  );

  return (
    <>
      <PageHeader title="Finance" subtitle={`Books for ${year}, through ${formatDate(today)}. Accrual basis.`}>
        <a
          href={`/api/exports/ledger?from=${range.from}&to=${range.to}`}
          className="inline-flex h-9 items-center rounded-md bg-brand px-3.5 text-sm font-medium text-white hover:bg-brand-dark"
        >
          Export general ledger (CSV)
        </a>
      </PageHeader>

      <Card
        title="Profit and loss by team"
        action={
          <Badge tone={debits === credits ? "ok" : "bad"}>
            {debits === credits ? "Ledger in balance" : "Ledger out of balance"}
          </Badge>
        }
      >
        <Table
          head={
            <tr>
              <th className={th}>Account</th>
              {pnl.columns.map((c) => (
                <th key={columnKey(c.teamId)} className={thNum}>
                  {c.label}
                </th>
              ))}
              <th className={thNum}>Total</th>
            </tr>
          }
        >
          {section("Revenue", pnl.rows.filter((r) => r.type === "revenue"), pnl.revenueCents)}
          {section("Expenses", pnl.rows.filter((r) => r.type === "expense"), pnl.expenseCents)}
          <tr className="border-t-2 border-ink bg-paper font-semibold">
            <td className={td}>Net income</td>
            {pnl.columns.map((col) => {
              const net = pnl.net[columnKey(col.teamId)] ?? 0;
              return (
                <td key={columnKey(col.teamId)} className={`${tdNum} ${net < 0 ? "text-bad" : ""}`}>
                  {formatCents(net, whole)}
                </td>
              );
            })}
            <td className={tdNum}>{formatCents(pnl.net.total ?? 0, whole)}</td>
          </tr>
        </Table>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Record an expense" className="self-start">
          <ActionForm action={recordExpenseAction} className="space-y-3 p-5">
            <Field label="Paid to">
              <input name="payee" required className={input} />
            </Field>
            <Field label="What for">
              <input name="description" required className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Amount">
                <input name="amount" required inputMode="decimal" className={input} />
              </Field>
              <Field label="Date">
                <input name="spentOn" type="date" required defaultValue={today} className={input} />
              </Field>
            </div>
            <Field label="Account">
              <select name="accountCode" className={input}>
                {expenseAccounts.map((a) => (
                  <option key={a.id} value={a.code}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Team">
              <select name="teamId" className={input}>
                <option value="">Club wide</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isContractorPay" className="size-4 accent-brand" />
              Contractor pay (counts toward 1099)
            </label>
            <SubmitButton>Record expense</SubmitButton>
          </ActionForm>
        </Card>

        <Card title="Recent expenses" className="lg:col-span-2">
          {expenses.length === 0 ? (
            <Empty>No expenses yet.</Empty>
          ) : (
            <Table
              head={
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Paid to</th>
                  <th className={th}>Account</th>
                  <th className={th}>Team</th>
                  <th className={thNum}>Amount</th>
                </tr>
              }
            >
              {expenses.map((e) => (
                <tr key={e.id}>
                  <td className={`${td} whitespace-nowrap`}>{formatDate(e.spentOn)}</td>
                  <td className={td}>
                    <span className="font-medium">{e.payee}</span>
                    <span className="block text-xs text-muted">{e.description}</span>
                  </td>
                  <td className={td}>{e.account}</td>
                  <td className={td}>{e.team ?? "Club wide"}</td>
                  <td className={tdNum}>{formatCents(e.amountCents)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>

      <Card title={`Contractor pay, ${year}`} className="mt-4">
        {contractors.length === 0 ? (
          <Empty>No contractor pay recorded this year.</Empty>
        ) : (
          <Table
            head={
              <tr>
                <th className={th}>Payee</th>
                <th className={thNum}>Payments</th>
                <th className={thNum}>Paid this year</th>
                <th className={th}>1099 NEC</th>
              </tr>
            }
          >
            {contractors.map((c) => (
              <tr key={c.payee}>
                <td className={`${td} font-medium`}>{c.payee}</td>
                <td className={tdNum}>{c.payments}</td>
                <td className={tdNum}>{formatCents(c.totalCents)}</td>
                <td className={td}>
                  {c.needs1099 ? <Badge tone="warn">Likely required</Badge> : <Badge>Below threshold</Badge>}
                </td>
              </tr>
            ))}
          </Table>
        )}
        <p className="border-t border-line px-5 py-3 text-xs text-muted">
          Flagged at {formatCents(CONTRACTOR_1099_THRESHOLD_CENTS, whole)} or more in the calendar year. This is a
          preparation aid. Filing stays with the club&apos;s CPA.
        </p>
      </Card>
    </>
  );
}
