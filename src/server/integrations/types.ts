/**
 * Integration contracts.
 *
 * The app talks to outside systems only through these interfaces. Each slot
 * (payments, accounting, membership) has one active adapter per club. Adding a
 * vendor means writing one adapter file and registering it; nothing in the
 * domain layer or the UI changes.
 */
import type { IsoDate } from "@/lib/dates";

export class IntegrationNotConfigured extends Error {
  constructor(provider: string, missing: string) {
    super(`${provider} is not configured: ${missing}`);
    this.name = "IntegrationNotConfigured";
  }
}

export type AdapterInfo = {
  id: string;
  label: string;
  description: string;
  /** "ready" adapters work today. "planned" adapters are contracts with no live calls yet. */
  maturity: "ready" | "planned";
};

// ---------------------------------------------------------------- payments

export type CheckoutRequest = {
  clubId: string;
  invoiceId: string;
  amountCents: number;
  description: string;
  /** Where the payer lands after paying or cancelling. */
  returnUrl: string;
  /** e.g. the Stripe connected account id for this club. */
  externalAccountId: string;
};

/** Either send the payer to the processor, or render the in app test checkout. */
export type Checkout = { kind: "redirect"; url: string } | { kind: "in_app" };

export type PaymentWebhookEvent = {
  type: "payment.succeeded";
  clubId: string;
  invoiceId: string;
  amountCents: number;
  feeCents: number;
  providerRef: string;
  paidOn: IsoDate;
};

export interface PaymentProvider {
  info: AdapterInfo;
  /** Estimated processor fee, used for display and by the test adapter. */
  feeFor(amountCents: number): number;
  createCheckout(req: CheckoutRequest): Promise<Checkout>;
  /** Verifies and translates a webhook. Returns null for events we ignore. */
  parseWebhook(req: { headers: Headers; rawBody: string }): Promise<PaymentWebhookEvent | null>;
}

// ---------------------------------------------------------------- accounting

export type JournalExportRow = {
  entryId: string;
  date: IsoDate;
  memo: string;
  source: string;
  accountCode: string;
  accountName: string;
  team: string | null;
  debitCents: number;
  creditCents: number;
};

export type ExportFile = { filename: string; contentType: string; body: string };

export interface AccountingProvider {
  info: AdapterInfo;
  /** Hands the period's journal to the outside books (file or API push). */
  exportJournal(rows: JournalExportRow[], range: { from: IsoDate; to: IsoDate }): Promise<ExportFile>;
}

// ---------------------------------------------------------------- membership

export type ExternalCredential = {
  /** The governing body's member number. */
  externalId: string;
  firstName: string;
  lastName: string;
  kind: "ngb_membership" | "safesport" | "background_check";
  expiresOn: IsoDate;
};

export interface MembershipProvider {
  info: AdapterInfo;
  /** Pulls current credentials for a club from the governing body. */
  fetchCredentials(externalAccountId: string): Promise<ExternalCredential[]>;
}
