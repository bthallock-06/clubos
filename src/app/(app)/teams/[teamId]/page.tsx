import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, input, LinkButton, PageHeader, Table, td, tdNum, th, thNum } from "@/components/ui";
import { requireViewer } from "@/server/auth/session";
import { getTeam, visibleTeamIds } from "@/server/domain/club";
import { addAthleteAction } from "../actions";

export default async function TeamPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const { ctx } = await requireViewer("director", "coach");
  if (!(await visibleTeamIds(ctx)).includes(teamId)) notFound();
  const data = await getTeam(ctx, teamId);
  if (!data) notFound();

  return (
    <>
      <PageHeader
        title={data.team.name}
        subtitle={`${data.team.season} · ${data.staff.map((s) => `${s.name}, ${s.title}`).join(" · ") || "No staff assigned"}`}
      >
        <LinkButton href="/teams">All teams</LinkButton>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Roster (${data.roster.length})`} className="lg:col-span-2">
          {data.roster.length === 0 ? (
            <Empty>No athletes yet. Add the first one.</Empty>
          ) : (
            <Table
              head={
                <tr>
                  <th className={thNum}>Cap</th>
                  <th className={th}>Athlete</th>
                  <th className={th}>Billing household</th>
                  <th className={thNum}>Grad year</th>
                </tr>
              }
            >
              {data.roster.map((a) => (
                <tr key={a.athleteId}>
                  <td className={tdNum}>{a.capNumber ?? ""}</td>
                  <td className={`${td} font-medium`}>
                    {a.firstName} {a.lastName}
                  </td>
                  <td className={td}>{a.household}</td>
                  <td className={tdNum}>{a.gradYear ?? ""}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Add athlete">
          <ActionForm action={addAthleteAction} className="space-y-3 p-5">
            <input type="hidden" name="teamId" value={data.team.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="First name">
                <input name="firstName" required className={input} />
              </Field>
              <Field label="Last name">
                <input name="lastName" required className={input} />
              </Field>
            </div>
            <Field label="Billing household">
              <input name="householdName" required placeholder="Nguyen family" className={input} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cap number">
                <input name="capNumber" inputMode="numeric" className={input} />
              </Field>
              <Field label="Grad year">
                <input name="gradYear" inputMode="numeric" className={input} />
              </Field>
            </div>
            <SubmitButton>Add to roster</SubmitButton>
            <p className="text-xs text-muted">
              Siblings share a bill when the household name matches an existing one.
            </p>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
