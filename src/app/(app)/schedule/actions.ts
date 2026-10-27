"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { zonedToInstant } from "@/lib/dates";
import { formValues, runAction, type ActionState } from "@/server/action";
import { requireViewer } from "@/server/auth/session";
import { scheduleEvent } from "@/server/domain/club";

const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "pick a date and time");
const Event = z.object({
  teamId: z.string().uuid(),
  kind: z.enum(["practice", "game", "tournament", "meeting"]),
  title: z.string().min(1).max(120),
  location: z.string().max(160),
  startsAt: localDateTime,
  endsAt: localDateTime,
  notes: z.string().max(500),
});

export async function scheduleEventAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director", "coach");
    const input = Event.parse(formValues(form));
    await scheduleEvent(ctx, {
      ...input,
      startsAt: zonedToInstant(input.startsAt, ctx.timezone),
      endsAt: zonedToInstant(input.endsAt, ctx.timezone),
    });
    revalidatePath("/schedule");
    return "Event added to the schedule.";
  });
}
