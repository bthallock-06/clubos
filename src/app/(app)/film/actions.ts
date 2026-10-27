"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formValues, runAction, type ActionState } from "@/server/action";
import { requireViewer } from "@/server/auth/session";
import { addVideo } from "@/server/domain/club";

const Video = z.object({
  teamId: z.string().uuid(),
  title: z.string().min(1).max(160),
  url: z.string().url().startsWith("https://", "link must start with https://"),
  recordedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "pick a date"),
});

export async function addVideoAction(_: ActionState, form: FormData): Promise<ActionState> {
  return runAction(async () => {
    const { ctx } = await requireViewer("director", "coach");
    await addVideo(ctx, Video.parse(formValues(form)));
    revalidatePath("/film");
    return "Video added to the library.";
  });
}
