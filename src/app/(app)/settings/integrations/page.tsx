import { desc, eq } from "drizzle-orm";
import { Badge, Card, PageHeader, Table, td, th } from "@/components/ui";
import { eventLog } from "@/db/schema";
import { formatDateTime } from "@/lib/dates";
import { requireViewer } from "@/server/auth/session";
import { integrationOverview } from "@/server/integrations/registry";

export default async function IntegrationsPage() {
  const { ctx } = await requireViewer("director");
  const [slots, events] = await Promise.all([
    integrationOverview(ctx),
    ctx.db.select().from(eventLog).where(eq(eventLog.clubId, ctx.clubId)).orderBy(desc(eventLog.createdAt)).limit(15),
  ]);

  return (
    <>
      <PageHeader
        title="Integrations"
        subtitle="Club OS connects to outside systems through swappable adapters, one per slot."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {slots.map((slot) => (
          <Card key={slot.slot} title={slot.label}>
            <ul className="divide-y divide-line">
              {slot.adapters.map((a) => (
                <li key={a.id} className="px-5 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{a.label}</p>
                    {a.id === slot.activeId ? (
                      <Badge tone="ok">Active</Badge>
                    ) : a.maturity === "planned" ? (
                      <Badge>Planned</Badge>
                    ) : (
                      <Badge tone="brand">Available</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted">{a.description}</p>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <Card title="Event stream" className="mt-4">
        <p className="border-b border-line px-5 py-3 text-xs text-muted">
          Every change in the club is recorded here. Integrations subscribe to these events, and this log is the
          club&apos;s audit trail.
        </p>
        <Table
          head={
            <tr>
              <th className={th}>When</th>
              <th className={th}>Event</th>
              <th className={th}>Details</th>
            </tr>
          }
        >
          {events.map((e) => (
            <tr key={e.id}>
              <td className={`${td} whitespace-nowrap text-muted`}>{formatDateTime(e.createdAt, ctx.timezone)}</td>
              <td className={`${td} font-mono text-xs`}>{e.type}</td>
              <td className={`${td} max-w-md truncate font-mono text-xs text-muted`}>{JSON.stringify(e.payload)}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
