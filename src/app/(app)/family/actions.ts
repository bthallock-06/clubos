"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { todayIn } from "@/lib/dates";
import { runAction, type ActionState } from "@/server/action";
import { requireViewer } from "@/server/auth/session";
import { DomainError, ForbiddenError } from "@/server/context";
import { getInvoice, recordPayment } from "@/server/domain/billing";
import { householdIdsFor } from "@/server/domain/club";
import { resolve } from "@/server/integrations/registry";

/**
 * Confirms a payment through the test adapter. Only reachable when the club's
 * payments slot is the test adapter; real processors confirm by webhook.
 */
export async function confirmTestPaymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("parent", "director");
    const invoiceId = z.string().uuid().parse(form.get("invoiceId"));

    const { adapter } = await resolve(ctx, "payments");
    const allowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_PAYMENTS === "true";
    if (adapter.info.id !== "mock" || !allowed) {
      throw new DomainError("Test payments are turned off for this club.");
    }

    const invoice = await getInvoice(ctx, invoiceId);
    if (!invoice) throw new DomainError("Invoice not found.");
    if (ctx.role === "parent" && !(await householdIdsFor(ctx)).includes(invoice.householdId)) {
      throw new ForbiddenError();
    }
    const amountCents = invoice.amountCents - invoice.paidCents;
    if (invoice.status !== "open" || amountCents <= 0) throw new DomainError("This invoice is already settled.");

    await recordPayment(
      { ...ctx, role: "system" },
      {
        invoiceId,
        amountCents,
        feeCents: adapter.feeFor(amountCents),
        provider: adapter.info.id,
        providerRef: `test_${randomUUID()}`,
        paidOn: todayIn(ctx.timezone),
      },
    );
    redirect(`/family?paid=${invoiceId}`);
  });
}
