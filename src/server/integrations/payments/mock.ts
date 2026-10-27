/**
 * Test payments. No money moves and no card data is collected.
 * The payer confirms on an in app screen and a signed in server action records
 * the payment, so this adapter accepts no webhooks.
 */
import type { PaymentProvider } from "../types";

export const mockPayments: PaymentProvider = {
  info: {
    id: "mock",
    label: "Test payments",
    description: "Simulated checkout for demos and pilots. No money moves.",
    maturity: "ready",
  },
  // Mirrors a typical card rate (2.9% plus 30 cents) so the books look realistic.
  feeFor: (amountCents) => Math.round(amountCents * 0.029) + 30,
  createCheckout: async () => ({ kind: "in_app" }),
  parseWebhook: async () => null,
};
