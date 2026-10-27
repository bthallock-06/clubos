import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db/client";
import { clubs } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { recordPayment } from "@/server/domain/billing";
import { paymentProviderById } from "@/server/integrations/registry";
import { IntegrationNotConfigured } from "@/server/integrations/types";

/**
 * Inbound webhooks from payment processors: POST /api/webhooks/{provider}.
 * The adapter verifies the signature and translates the payload. This route
 * only hands a verified event to the domain layer. recordPayment is
 * idempotent, so processor retries are safe.
 */
export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const adapter = paymentProviderById(provider);
  if (!adapter) return NextResponse.json({ error: "Unknown provider." }, { status: 404 });

  let event;
  try {
    event = await adapter.parseWebhook({ headers: request.headers, rawBody: await request.text() });
  } catch (err) {
    const status = err instanceof IntegrationNotConfigured ? 501 : 400;
    return NextResponse.json({ error: "Webhook rejected." }, { status });
  }
  if (!event) return NextResponse.json({ received: true, handled: false });

  const db = await getDb();
  const [club] = await db.select().from(clubs).where(eq(clubs.id, event.clubId));
  if (!club) return NextResponse.json({ error: "Unknown club." }, { status: 404 });

  const ctx: Ctx = { db, clubId: club.id, userId: null, role: "system", timezone: club.timezone };
  await recordPayment(ctx, {
    invoiceId: event.invoiceId,
    amountCents: event.amountCents,
    feeCents: event.feeCents,
    provider: adapter.info.id,
    providerRef: event.providerRef,
    paidOn: event.paidOn,
  });
  return NextResponse.json({ received: true, handled: true });
}
