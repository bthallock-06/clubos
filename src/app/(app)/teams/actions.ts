"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formValues, runAction, type ActionState } from "@/server/action";
import { requireViewer } from "@/server/auth/session";
import { addAthlete } from "@/server/domain/club";

const optionalInt = z
  .string()
  .transform((v) => (v === "" ? null : Number(v)))
  .refine((v) => v === null || Number.isInteger(v), "must be a whole number");

const Athlete = z.object({
  teamId: z.string().uuid(),
  firstName: z.string().min(1).max(60),
  lastName: z.string().min(1).max(60),
  householdName: z.string().min(1).max(80),
  gradYear: optionalInt,
  capNumber: optionalInt,
});

export async function addAthleteAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director", "coach");
    const input = Athlete.parse(formValues(form));
    await addAthlete(ctx, input);
    revalidatePath(`/teams/${input.teamId}`);
    return `${input.firstName} ${input.lastName} added to the roster.`;
  });
}
