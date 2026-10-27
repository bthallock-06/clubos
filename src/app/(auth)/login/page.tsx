import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, input } from "@/components/ui";
import { currentViewer, homeFor } from "@/server/auth/session";
import { signInAction } from "./actions";

export const dynamic = "force-dynamic";

// One click sign in for the seeded demo club. Off in production unless DEMO_LOGIN=true.
const DEMO_ENABLED =
  process.env.DEMO_LOGIN === "true" ||
  (process.env.NODE_ENV !== "production" && process.env.DEMO_LOGIN !== "false");
const DEMO_ACCOUNTS = [
  { email: "director@demo.club", label: "Club director", blurb: "Dashboard, billing, books" },
  { email: "coach@demo.club", label: "Coach", blurb: "Roster, schedule, film" },
  { email: "parent@demo.club", label: "Parent", blurb: "Balance and payments" },
  { email: "athlete@demo.club", label: "Athlete", blurb: "Schedule and film" },
];

export default async function LoginPage() {
  const viewer = await currentViewer();
  if (viewer) redirect(homeFor(viewer.role));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">Club OS</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Sign in to your club</h1>
      </div>

      <div className="rounded-xl border border-line bg-white p-5">
        <ActionForm action={signInAction} resetOnSuccess={false} className="space-y-3">
          <Field label="Email">
            <input name="email" type="email" autoComplete="email" required className={input} />
          </Field>
          <Field label="Password">
            <input name="password" type="password" autoComplete="current-password" required className={input} />
          </Field>
          <SubmitButton>Sign in</SubmitButton>
        </ActionForm>
      </div>

      {DEMO_ENABLED && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
            Demo club: sign in as
          </p>
          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((account) => (
              <ActionForm key={account.email} action={signInAction} resetOnSuccess={false}>
                <input type="hidden" name="email" value={account.email} />
                <input type="hidden" name="password" value="clubos-demo" />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-line bg-white px-3 py-2.5 text-left hover:border-brand"
                >
                  <span className="block text-sm font-medium">{account.label}</span>
                  <span className="block text-xs text-muted">{account.blurb}</span>
                </button>
              </ActionForm>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}
