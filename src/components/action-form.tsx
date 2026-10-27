"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/server/action";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** A form bound to a server action that shows the result inline. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);

  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state && (
        <p
          role="status"
          className={`mt-3 rounded-md px-3 py-2 text-sm ${
            state.ok ? "bg-ok-soft text-ok" : "bg-bad-soft text-bad"
          }`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
}: {
  children: React.ReactNode;
  variant?: "primary" | "quiet" | "danger";
}) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    quiet: "border border-line bg-white text-ink hover:bg-paper",
    danger: "border border-line bg-white text-bad hover:bg-bad-soft",
  }[variant];
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex h-9 items-center justify-center rounded-md px-3.5 text-sm font-medium transition disabled:opacity-50 ${styles}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
