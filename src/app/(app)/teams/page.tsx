import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, input, PageHeader } from "@/components/ui";
import { requireViewer } from "@/server/auth/session";
import { listTeams, visibleTeamIds } from "@/server/domain/club";
import { createTeamAction } from "./actions";

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  const { ctx, role, club } = await requireViewer("director", "coach");
  const visible = new Set(await visibleTeamIds(ctx));
  const teams = (await listTeams(ctx)).filter((t) => visible.has(t.id));
  const isDirector = role === "director";

  return (
    <>
      <PageHeader title="Teams" subtitle="Rosters and staff by team" />

      {welcome && (
        <div role="status" className="mb-4 rounded-xl border border-brand/30 bg-brand-soft px-5 py-4 text-sm">
          <p className="font-semibold text-brand-dark">Welcome to Club OS. {club.name} is set up.</p>
          <p className="mt-1 text-ink">
            Start here: create your first team, open it to add athletes, then bill the team from Billing. Your
            chart of accounts is already in place, so the books post themselves.
          </p>
        </div>
      )}

      <div className={`grid gap-4 ${isDirector ? "lg:grid-cols-3" : ""}`}>
        <div className={isDirector ? "lg:col-span-2" : ""}>
          {teams.length === 0 ? (
            <Card>
              <Empty>
                {isDirector ? "No teams yet. Create your first one." : "You are not assigned to a team yet."}
              </Empty>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((team) => (
                <Link
                  key={team.id}
                  href={`/teams/${team.id}`}
                  className="rounded-xl border border-line bg-white p-5 transition hover:border-brand"
                >
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{team.season}</p>
                  <p className="mt-1 text-lg font-semibold">{team.name}</p>
                  <p className="mt-3 text-sm text-muted">
                    <span className="num font-medium text-ink">{team.athletes}</span> athletes
                  </p>
                  <p className="text-sm text-muted">{team.coaches || "No coach assigned"}</p>
                </Link>
              ))}
            </div>
          )}
        </div>

        {isDirector && (
          <Card title="New team" className="self-start">
            <ActionForm action={createTeamAction} className="space-y-3 p-5">
              <Field label="Team name">
                <input name="name" required placeholder="14U Boys" className={input} />
              </Field>
              <Field label="Season">
                <input name="season" required placeholder="Fall 2026" className={input} />
              </Field>
              <SubmitButton>Create team</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
