import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, input, PageHeader, Stat, Table, td, th } from "@/components/ui";
import { formatDate, todayIn } from "@/lib/dates";
import { requireViewer } from "@/server/auth/session";
import {
  complianceReport,
  CREDENTIAL_LABEL,
  EXPIRING_WINDOW_DAYS,
  type CredentialKind,
  type CredentialStatus,
} from "@/server/domain/compliance";
import { resolve } from "@/server/integrations/registry";
import { saveCredentialAction } from "./actions";

const TONE: Record<CredentialStatus, "ok" | "warn" | "bad"> = {
  ok: "ok",
  expiring: "warn",
  expired: "bad",
  missing: "bad",
};
const KINDS: CredentialKind[] = ["ngb_membership", "safesport", "background_check"];

export default async function CompliancePage() {
  const { ctx, role } = await requireViewer("director", "coach");
  const today = todayIn(ctx.timezone);
  const [people, membership] = await Promise.all([complianceReport(ctx, today), resolve(ctx, "membership")]);
  const count = (s: CredentialStatus) => people.filter((p) => p.worst === s).length;

  return (
    <>
      <PageHeader
        title="Compliance"
        subtitle={`Memberships and certifications. Source: ${membership.adapter.info.label.toLowerCase()}.`}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current" value={String(count("ok"))} tone="ok" />
        <Stat label={`Expiring in ${EXPIRING_WINDOW_DAYS} days`} value={String(count("expiring"))} tone="warn" />
        <Stat label="Expired" value={String(count("expired"))} tone="bad" />
        <Stat label="Missing" value={String(count("missing"))} tone="bad" />
      </div>

      <div className={`mt-4 grid gap-4 ${role === "director" ? "lg:grid-cols-3" : ""}`}>
        <Card title="Everyone on a roster or staff" className={role === "director" ? "lg:col-span-2" : ""}>
          <Table
            head={
              <tr>
                <th className={th}>Person</th>
                <th className={th}>Team</th>
                {KINDS.map((k) => (
                  <th key={k} className={th}>
                    {CREDENTIAL_LABEL[k]}
                  </th>
                ))}
              </tr>
            }
          >
            {people.map((p) => (
              <tr key={p.key}>
                <td className={td}>
                  <span className="font-medium">{p.name}</span>
                  <span className="block text-xs capitalize text-muted">{p.subject}</span>
                </td>
                <td className={td}>{p.teams.join(", ")}</td>
                {KINDS.map((k) => {
                  const item = p.items.find((i) => i.kind === k);
                  if (!item) return <td key={k} className={`${td} text-xs text-muted`}>Not required</td>;
                  return (
                    <td key={k} className={td}>
                      <Badge tone={TONE[item.status]}>{item.status}</Badge>
                      {item.expiresOn && (
                        <span className="mt-0.5 block text-xs text-muted">{formatDate(item.expiresOn)}</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </Table>
        </Card>

        {role === "director" && (
          <Card title="Update a credential" className="self-start">
            <ActionForm action={saveCredentialAction} className="space-y-3 p-5">
              <Field label="Person">
                <select name="person" required className={input}>
                  {people.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} ({p.subject})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Credential">
                <select name="kind" className={input}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {CREDENTIAL_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Expires">
                <input name="expiresOn" type="date" required className={input} />
              </Field>
              <Field label="Member number (optional)">
                <input name="externalId" className={input} />
              </Field>
              <SubmitButton>Save</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
