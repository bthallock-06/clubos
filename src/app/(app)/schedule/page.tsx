import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, input, PageHeader } from "@/components/ui";
import { formatTime } from "@/lib/dates";
import { requireViewer } from "@/server/auth/session";
import { listEvents, listTeams, visibleTeamIds } from "@/server/domain/club";
import { scheduleEventAction } from "./actions";

const KIND_TONE = { practice: "neutral", game: "brand", tournament: "warn", meeting: "ok" } as const;

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team: teamFilter } = await searchParams;
  const { ctx, role } = await requireViewer();
  const visible = await visibleTeamIds(ctx);
  const teams = (await listTeams(ctx)).filter((t) => visible.includes(t.id));
  const teamIds = teamFilter && visible.includes(teamFilter) ? [teamFilter] : visible;
  const events = await listEvents(ctx, { from: new Date(), teamIds, limit: 80 });
  const canEdit = role === "director" || role === "coach";

  const dayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: ctx.timezone,
  });
  const days = new Map<string, typeof events>();
  for (const e of events) {
    const key = dayLabel.format(e.startsAt);
    days.set(key, [...(days.get(key) ?? []), e]);
  }

  const chip = (href: string, label: string, active: boolean) => (
    <Link
      key={href}
      href={href}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        active ? "border-brand bg-brand text-white" : "border-line bg-white text-muted hover:border-brand"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <>
      <PageHeader title="Schedule" subtitle="Upcoming practices, games and tournaments" />
      {teams.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {chip("/schedule", "All teams", teamIds.length !== 1)}
          {teams.map((t) => chip(`/schedule?team=${t.id}`, t.name, teamIds.length === 1 && teamIds[0] === t.id))}
        </div>
      )}

      <div className={`grid gap-4 ${canEdit ? "lg:grid-cols-3" : ""}`}>
        <div className={`space-y-4 ${canEdit ? "lg:col-span-2" : ""}`}>
          {days.size === 0 && (
            <Card>
              <Empty>Nothing on the calendar.</Empty>
            </Card>
          )}
          {[...days.entries()].map(([day, list]) => (
            <Card key={day} title={day}>
              <ul className="divide-y divide-line">
                {list.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="num w-36 shrink-0 text-muted">
                      {formatTime(e.startsAt, ctx.timezone)} to {formatTime(e.endsAt, ctx.timezone)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {e.team}: {e.title}
                      </p>
                      <p className="text-xs text-muted">{e.location}</p>
                      {e.notes && <p className="mt-1 text-xs">{e.notes}</p>}
                    </div>
                    <Badge tone={KIND_TONE[e.kind]}>{e.kind}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        {canEdit && (
          <Card title="Add event" className="self-start">
            <ActionForm action={scheduleEventAction} className="space-y-3 p-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Team">
                  <select name="teamId" required className={input}>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Type">
                  <select name="kind" className={input}>
                    <option value="practice">Practice</option>
                    <option value="game">Game</option>
                    <option value="tournament">Tournament</option>
                    <option value="meeting">Meeting</option>
                  </select>
                </Field>
              </div>
              <Field label="Title">
                <input name="title" required placeholder="Practice" className={input} />
              </Field>
              <Field label="Location">
                <input name="location" className={input} />
              </Field>
              <Field label="Starts">
                <input name="startsAt" type="datetime-local" required className={input} />
              </Field>
              <Field label="Ends">
                <input name="endsAt" type="datetime-local" required className={input} />
              </Field>
              <Field label="Notes for families">
                <input name="notes" className={input} />
              </Field>
              <SubmitButton>Add to schedule</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
