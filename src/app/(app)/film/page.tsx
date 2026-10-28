import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Empty, Field, input, NeedsTeam, PageHeader } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { requireViewer } from "@/server/auth/session";
import { listTeams, listVideos, visibleTeamIds } from "@/server/domain/club";
import { addVideoAction } from "./actions";

export default async function FilmPage() {
  const { ctx, role } = await requireViewer();
  const visible = await visibleTeamIds(ctx);
  const [videos, allTeams] = await Promise.all([listVideos(ctx, visible), listTeams(ctx)]);
  const teams = allTeams.filter((t) => visible.includes(t.id));
  const canEdit = role === "director" || role === "coach";

  return (
    <>
      <PageHeader title="Film" subtitle="Game and practice video shared by your coaches" />
      <div className={`grid gap-4 ${canEdit ? "lg:grid-cols-3" : ""}`}>
        <Card title={`Library (${videos.length})`} className={canEdit ? "lg:col-span-2" : ""}>
          {videos.length === 0 ? (
            <Empty>No film posted yet.</Empty>
          ) : (
            <ul className="divide-y divide-line">
              {videos.map((v) => (
                <li key={v.id} className="flex items-center gap-4 px-5 py-3">
                  <span
                    aria-hidden
                    className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand-dark"
                  >
                    ▶
                  </span>
                  <div className="min-w-0 flex-1">
                    <a href={v.url} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium hover:text-brand hover:underline">
                      {v.title}
                    </a>
                    <p className="text-xs text-muted">
                      {v.team} · {formatDate(v.recordedOn)} · posted by {v.addedBy}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {canEdit && (
          <Card title="Post film" className="self-start">
            {teams.length === 0 ? (
              <NeedsTeam action="post film" />
            ) : (
            <ActionForm action={addVideoAction} className="space-y-3 p-5">
              <Field label="Team">
                <select name="teamId" required className={input}>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Title">
                <input name="title" required className={input} />
              </Field>
              <Field label="Video link">
                <input name="url" type="url" required placeholder="https://" className={input} />
              </Field>
              <Field label="Recorded on">
                <input name="recordedOn" type="date" required defaultValue={todayIn(ctx.timezone)} className={input} />
              </Field>
              <SubmitButton>Post to team</SubmitButton>
              <p className="text-xs text-muted">Links only for now. Direct upload arrives with the video module.</p>
            </ActionForm>
            )}
          </Card>
        )}
      </div>
    </>
  );
}
