import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, input } from "@/components/ui";
import { currentViewer, homeFor } from "@/server/auth/session";
import { CLUB_TIMEZONES, MIN_PASSWORD_LENGTH } from "@/server/domain/onboarding";
import { signUpAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function SignUpPage() {
  const viewer = await currentViewer();
  if (viewer) redirect(homeFor(viewer.role));

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <p className="text-sm font-semibold uppercase tracking-widest text-brand">Club OS</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Create your club</h1>
        <p className="mt-1 text-sm text-muted">
          You will be the club director. Teams, athletes and billing come next.
        </p>
      </div>

      <div className="rounded-xl border border-line bg-white p-5">
        <ActionForm action={signUpAction} resetOnSuccess={false} className="space-y-3">
          <Field label="Club name">
            <input name="clubName" required placeholder="Harbor Aquatics Water Polo" className={input} />
          </Field>
          <Field label="Your name">
            <input name="directorName" required autoComplete="name" className={input} />
          </Field>
          <Field label="Email">
            <input name="email" type="email" required autoComplete="email" className={input} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className={input}
              />
            </Field>
            <Field label="Confirm password">
              <input
                name="confirm"
                type="password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                autoComplete="new-password"
                className={input}
              />
            </Field>
          </div>
          <Field label="Club timezone">
            <select name="timezone" defaultValue="America/Los_Angeles" className={input}>
              {Object.entries(CLUB_TIMEZONES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton>Create club</SubmitButton>
        </ActionForm>
      </div>

      <p className="mt-4 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}
