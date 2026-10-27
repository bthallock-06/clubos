/**
 * Domain events. Every state change that an outside system could care about is
 * emitted here. Each event is written to event_log (the audit trail) in the
 * same transaction as the change, then handed to in process subscribers.
 *
 * This is the extension point for plugins: an integration subscribes to the
 * events it needs instead of being called from domain code.
 */
import { eventLog } from "@/db/schema";
import type { Ctx } from "@/server/context";

export type DomainEvents = {
  "charge.created": { chargeId: string; teamId: string; invoiceCount: number; totalCents: number };
  "invoice.voided": { invoiceId: string };
  "payment.succeeded": { paymentId: string; invoiceId: string; amountCents: number; provider: string };
  "expense.recorded": { expenseId: string; amountCents: number };
  "journal.posted": { entryId: string; sourceType: string; sourceId: string };
  "event.scheduled": { eventId: string; teamId: string };
  "credential.saved": { credentialId: string; kind: string };
};

export type EventType = keyof DomainEvents;
type Handler<T extends EventType> = (ctx: Ctx, payload: DomainEvents[T]) => Promise<void> | void;

const handlers = new Map<EventType, Array<Handler<EventType>>>();

export function subscribe<T extends EventType>(type: T, handler: Handler<T>): void {
  const list = handlers.get(type) ?? [];
  list.push(handler as unknown as Handler<EventType>);
  handlers.set(type, list);
}

export async function emit<T extends EventType>(
  ctx: Ctx,
  type: T,
  payload: DomainEvents[T],
): Promise<void> {
  await ctx.db.insert(eventLog).values({
    clubId: ctx.clubId,
    type,
    payload,
    actorUserId: ctx.userId,
  });
  for (const handler of handlers.get(type) ?? []) {
    // A failing plugin must not roll back the club's own transaction.
    try {
      await handler(ctx, payload);
    } catch (err) {
      console.error(`Subscriber failed for ${type}`, err);
    }
  }
}
