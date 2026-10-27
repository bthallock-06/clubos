/**
 * QuickBooks Online adapter. CONTRACT ONLY: no live calls are made yet.
 *
 * To finish it: complete Intuit OAuth, store the realm id in
 * integrations.external_account_id and tokens in integrations.config, map
 * account codes to QuickBooks account ids, then POST one JournalEntry per
 * entryId. Subscribe to "journal.posted" in registry.ts for live sync.
 */
import { IntegrationNotConfigured, type AccountingProvider } from "../types";

export const quickbooksAccounting: AccountingProvider = {
  info: {
    id: "quickbooks",
    label: "QuickBooks Online",
    description: "Push every journal entry to the club's QuickBooks company.",
    maturity: "planned",
  },
  exportJournal: async () => {
    throw new IntegrationNotConfigured("QuickBooks", "adapter not implemented yet");
  },
};
