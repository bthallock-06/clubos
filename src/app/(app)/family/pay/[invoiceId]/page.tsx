import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { requireViewer } from "@/server/auth/session";
import { getInvoice } from "@/server/domain/billing";
import { householdIdsFor } from "@/server/domain/club";
import { resolve } from "@/server/integrations/registry";
import { confirmTestPaymentAction } from "../../actions";

export default async function PayPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const { ctx, club } = await requireViewer("parent");
  const invoice = await getInvoice(ctx, invoiceId);
  if (!invoice || !(await householdIdsFor(ctx)).includes(invoice.householdId)) notFound();
  const amountCents = invoice.amountCents - invoice.paidCents;
  if (invoice.status !== "open" || amountCents <= 0) redirect("/family");

  // Ask the club's payment adapter how to collect. A real processor sends the
  // parent to its hosted page; the test adapter keeps them here.
  const { adapter, externalAccountId } = await resolve(ctx, "payments");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const checkout = await adapter.createCheckout({
    clubId: ctx.clubId,
    invoiceId: invoice.id,
    amountCents,
    description: `${invoice.description}: ${invoice.athlete}`,
    returnUrl: `${origin}/family?paid=${invoice.id}`,
    externalAccountId,
  });
  if (checkout.kind === "redirect") redirect(checkout.url);

  return (
    <div className="mx-auto max-w-lg">
      <PageHeader title="Pay invoice">
        <LinkButton href="/family">Back</LinkButton>
      </PageHeader>
      <Card>
        <dl className="divide-y divide-line text-sm">
          {[
            ["Paying", club.name],
            ["For", invoice.description],
            ["Athlete", `${invoice.athlete}, ${invoice.team}`],
            ["Due", formatDate(invoice.dueOn)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 px-5 py-3">
              <dt className="text-muted">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 px-5 py-4">
            <dt className="font-semibold">Total today</dt>
            <dd className="num text-2xl font-semibold">{formatCents(amountCents)}</dd>
          </div>
        </dl>
        <div className="border-t border-line p-5">
          <p className="mb-4 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
            Test mode. No card is charged and no card details are collected. In production this step is the
            payment processor&apos;s secure checkout page.
          </p>
          <ActionForm action={confirmTestPaymentAction} resetOnSuccess={false}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <SubmitButton>Pay {formatCents(amountCents)}</SubmitButton>
          </ActionForm>
        </div>
      </Card>
    </div>
  );
}
