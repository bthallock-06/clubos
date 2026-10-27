/**
 * Shared wrapper for server actions. Turns domain and validation errors into a
 * message the form can show, and lets Next.js redirects pass through.
 */
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { DomainError, ForbiddenError } from "./context";

export type ActionState = { ok: boolean; message: string } | null;

export async function runAction(fn: () => Promise<string | void>): Promise<ActionState> {
  try {
    const message = await fn();
    return { ok: true, message: message ?? "Saved." };
  } catch (err) {
    unstable_rethrow(err);
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = first?.path.join(".");
      return { ok: false, message: field ? `${field}: ${first?.message}` : "Check the form." };
    }
    if (err instanceof DomainError || err instanceof ForbiddenError) {
      return { ok: false, message: err.message };
    }
    if (err instanceof Error && err.message.startsWith("Not a valid dollar amount")) {
      return { ok: false, message: err.message };
    }
    console.error(err);
    return { ok: false, message: "Something went wrong. Nothing was saved." };
  }
}

/** Reads a FormData into a plain object for zod. */
export function formValues(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") out[key] = value.trim();
  }
  return out;
}
