/**
 * The one place that knows which adapters exist and which one a club uses.
 *
 * Resolution order for a slot: the club's row in the integrations table,
 * then the environment default, then the built in default.
 *
 * To add a vendor: write the adapter, add it to CATALOG. That is all.
 */
import { and, eq } from "drizzle-orm";
import { integrations, type IntegrationSlot } from "@/db/schema";
import type { Ctx } from "@/server/context";
import { csvAccounting } from "./accounting/csv";
import { quickbooksAccounting } from "./accounting/quickbooks";
import { manualMembership } from "./membership/manual";
import { sport80Membership } from "./membership/sport80";
import { mockPayments } from "./payments/mock";
import { stripePayments } from "./payments/stripe";
import type { AccountingProvider, MembershipProvider, PaymentProvider } from "./types";

type SlotMap = {
  payments: PaymentProvider;
  accounting: AccountingProvider;
  membership: MembershipProvider;
};

export const CATALOG: { [S in IntegrationSlot]: Record<string, SlotMap[S]> } = {
  payments: { mock: mockPayments, stripe: stripePayments },
  accounting: { csv: csvAccounting, quickbooks: quickbooksAccounting },
  membership: { manual: manualMembership, sport80: sport80Membership },
};

export const SLOT_LABEL: Record<IntegrationSlot, string> = {
  payments: "Payments",
  accounting: "Accounting",
  membership: "Membership and certifications",
};

const BUILT_IN: Record<IntegrationSlot, string> = {
  payments: "mock",
  accounting: "csv",
  membership: "manual",
};

function envDefault(slot: IntegrationSlot): string {
  const fromEnv = process.env[`${slot.toUpperCase()}_PROVIDER`];
  return fromEnv && fromEnv in CATALOG[slot] ? fromEnv : BUILT_IN[slot];
}

export async function resolve<S extends IntegrationSlot>(
  ctx: Ctx,
  slot: S,
): Promise<{ adapter: SlotMap[S]; externalAccountId: string }> {
  const [row] = await ctx.db
    .select()
    .from(integrations)
    .where(and(eq(integrations.clubId, ctx.clubId), eq(integrations.slot, slot)));
  const providerId = row && row.provider in CATALOG[slot] ? row.provider : envDefault(slot);
  const adapter = CATALOG[slot][providerId] as SlotMap[S];
  return { adapter, externalAccountId: row?.externalAccountId ?? "" };
}

/** Looks up a payment adapter by id, for the webhook route. */
export function paymentProviderById(id: string): PaymentProvider | null {
  return CATALOG.payments[id] ?? null;
}

/** Everything the settings page needs to render the integrations list. */
export async function integrationOverview(ctx: Ctx) {
  const slots = Object.keys(CATALOG) as IntegrationSlot[];
  return Promise.all(
    slots.map(async (slot) => {
      const { adapter } = await resolve(ctx, slot);
      return {
        slot,
        label: SLOT_LABEL[slot],
        activeId: adapter.info.id,
        adapters: Object.values(CATALOG[slot]).map((a) => a.info),
      };
    }),
  );
}
