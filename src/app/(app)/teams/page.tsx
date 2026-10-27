import Link from "next/link";
import { Empty, PageHeader } from "@/components/ui";
import { requireViewer } from "@/server/auth/session";
import { listTeams, visibleTeamIds } from "@/server/domain/club";

export default async function TeamsPage() {
  const { ctx } = await requireViewer("director", "coach");
  const visible = new Set(await visibleTeamIds(ctx));
  const teams = (await listTeams(ctx)).filter((t) => visible.has(t.id));

  return (
    <>
      <PageHeader title="Teams" subtitle="Rosters and staff by team" />
      {teams.length === 0 ? (
        <Empty>You are not assigned to a team yet.</Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
    </>
  );
}
