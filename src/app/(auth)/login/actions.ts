"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { formValues, runAction, type ActionState } from "@/server/action";
import { currentViewer, homeFor, signIn, signOut } from "@/server/auth/session";
import { DomainError } from "@/server/context";

const Credentials = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function signInAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { email, password } = Credentials.parse(formValues(form));
    if (!(await signIn(email, password))) throw new DomainError("Email or password is incorrect.");
    const viewer = await currentViewer();
    redirect(viewer ? homeFor(viewer.role) : "/");
  });
}

export async function signOutAction(): Promise<void> {
  await signOut();
  redirect("/login");
}
