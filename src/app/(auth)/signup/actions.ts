"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db/client";
import { formValues, runAction, type ActionState } from "@/server/action";
import { startSession } from "@/server/auth/session";
import { DomainError } from "@/server/context";
import { createClubWithDirector, MIN_PASSWORD_LENGTH } from "@/server/domain/onboarding";

const SignUp = z.object({
  clubName: z.string().min(2, "club name is required").max(120),
  directorName: z.string().min(1, "your name is required").max(120),
  email: z.string().email("enter a valid email").max(200),
  password: z.string().min(MIN_PASSWORD_LENGTH, `use at least ${MIN_PASSWORD_LENGTH} characters`).max(200),
  confirm: z.string(),
  timezone: z.string(),
});

export async function signUpAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const values = formValues(form);
    // formValues trims every field; passwords must be taken exactly as typed.
    values.password = String(form.get("password") ?? "");
    values.confirm = String(form.get("confirm") ?? "");
    const input = SignUp.parse(values);
    if (input.password !== input.confirm) throw new DomainError("The two passwords do not match.");
    const { userId, clubId } = await createClubWithDirector(await getDb(), input);
    await startSession(userId, clubId);
    redirect("/teams?welcome=1");
  });
}
