"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDollars } from "@/lib/money";
import { formValues, runAction, type ActionState } from "@/server/action";
import { requireViewer } from "@/server/auth/session";
import { recordExpense } from "@/server/domain/billing";

const Expense = z.object({
  teamId: z.string(),
  accountCode: z.string().min(1),
  payee: z.string().min(1).max(120),
  description: z.string().min(1).max(200),
  amount: z.string().min(1),
  spentOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date"),
  isContractorPay: z.string().optional(),
});

export async function recordExpenseAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director");
    const input = Expense.parse(formValues(form));
    await recordExpense(ctx, {
      teamId: input.teamId === "" ? null : z.string().uuid().parse(input.teamId),
      accountCode: input.accountCode,
      payee: input.payee,
      description: input.description,
      amountCents: parseDollars(input.amount),
      spentOn: input.spentOn,
      isContractorPay: input.isContractorPay === "on",
    });
    revalidatePath("/finance");
    return "Expense recorded and posted to the ledger.";
  });
}
