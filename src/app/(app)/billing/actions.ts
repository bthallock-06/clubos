"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { todayIn } from "@/lib/dates";
import { parseDollars } from "@/lib/money";
import { formValues, runAction, type ActionState } from "@/server/action";
import { requireViewer } from "@/server/auth/session";
import { DomainError } from "@/server/context";
import { createCharge, getInvoice, recordPayment, voidInvoice } from "@/server/domain/billing";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date");

const Charge = z.object({
  teamId: z.string().uuid(),
  description: z.string().min(1).max(120),
  amount: z.string().min(1),
  installments: z.coerce.number().int().min(1).max(12),
  firstDueOn: isoDate,
  revenueAccountCode: z.string().min(1),
});

export async function createChargeAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director");
    const input = Charge.parse(formValues(form));
    const result = await createCharge(ctx, {
      teamId: input.teamId,
      description: input.description,
      amountCents: parseDollars(input.amount),
      installments: input.installments,
      firstDueOn: input.firstDueOn,
      revenueAccountCode: input.revenueAccountCode,
    });
    revalidatePath("/billing");
    const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
    return `Billed ${plural(result.athletes, "athlete")} with ${plural(result.invoiceCount, "invoice")}. The books are updated.`;
  });
}

export async function voidInvoiceAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director");
    await voidInvoice(ctx, z.string().uuid().parse(form.get("invoiceId")));
    revalidatePath("/billing");
    return "Invoice voided.";
  });
}

/** A check or cash payment the director received outside the app. */
export async function recordOfflinePaymentAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director");
    const invoice = await getInvoice(ctx, z.string().uuid().parse(form.get("invoiceId")));
    if (!invoice) throw new DomainError("Invoice not found.");
    await recordPayment(ctx, {
      invoiceId: invoice.id,
      amountCents: invoice.amountCents - invoice.paidCents,
      feeCents: 0,
      provider: "offline",
      providerRef: randomUUID(),
      paidOn: todayIn(ctx.timezone),
    });
    revalidatePath("/billing");
    return "Payment recorded.";
  });
}
