"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formValues, runAction, type ActionState } from "@/server/action";
import { requireViewer } from "@/server/auth/session";
import { saveCredential } from "@/server/domain/compliance";

const Credential = z.object({
  // "athlete:<id>" or "staff:<id>"
  person: z.string().regex(/^(athlete|staff):[0-9a-f-]{36}$/, "pick a person"),
  kind: z.enum(["ngb_membership", "safesport", "background_check"]),
  expiresOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date"),
  externalId: z.string().max(60),
});

export async function saveCredentialAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director");
    const input = Credential.parse(formValues(form));
    const [subject, subjectId] = input.person.split(":") as ["athlete" | "staff", string];
    await saveCredential(ctx, {
      subject,
      subjectId,
      kind: input.kind,
      expiresOn: input.expiresOn,
      externalId: input.externalId,
    });
    revalidatePath("/compliance");
    return "Credential saved.";
  });
}
