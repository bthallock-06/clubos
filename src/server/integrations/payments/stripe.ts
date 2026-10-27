/**
 * Stripe Connect adapter. CONTRACT ONLY: no live calls are made yet.
 *
 * To finish it:
 *  1. createCheckout: POST /v1/checkout/sessions with
 *     payment_intent_data[transfer_data][destination] = req.externalAccountId,
 *     metadata { clubId, invoiceId }, success_url and cancel_url = req.returnUrl.
 *     Return { kind: "redirect", url: session.url }.
 *  2. parseWebhook: verify the Stripe-Signature header against
 *     STRIPE_WEBHOOK_SECRET, then map checkout.session.completed to a
 *     PaymentWebhookEvent using the metadata above and the balance
 *     transaction fee. Use the payment intent id as providerRef.
 *  3. Point a Stripe webhook endpoint at /api/webhooks/stripe.
 *
 * Card data never touches this app in either step.
 */
import { IntegrationNotConfigured, type PaymentProvider } from "../types";

export const stripePayments: PaymentProvider = {
  info: {
    id: "stripe",
    label: "Stripe Connect",
    description: "Card and ACH payments paid out to the club's own bank account.",
    maturity: "planned",
  },
  feeFor: (amountCents) => Math.round(amountCents * 0.029) + 30,
  createCheckout: async () => {
    throw new IntegrationNotConfigured("Stripe", "adapter not implemented yet");
  },
  parseWebhook: async () => {
    throw new IntegrationNotConfigured("Stripe", "adapter not implemented yet");
  },
};
