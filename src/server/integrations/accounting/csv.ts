/** General ledger as CSV. Opens in Excel and imports into QuickBooks or Xero. */
import type { AccountingProvider } from "../types";

const cell = (value: string) => `"${value.replace(/"/g, '""')}"`;
const dollars = (cents: number) => (cents === 0 ? "" : (cents / 100).toFixed(2));

export const csvAccounting: AccountingProvider = {
  info: {
    id: "csv",
    label: "CSV export",
    description: "Download the general ledger for your bookkeeper or CPA.",
    maturity: "ready",
  },
  exportJournal: async (rows, range) => {
    const header = ["Entry", "Date", "Memo", "Source", "Account Code", "Account", "Team", "Debit", "Credit"];
    const lines = rows.map((r) =>
      [
        cell(r.entryId.slice(0, 8)),
        r.date,
        cell(r.memo),
        r.source,
        r.accountCode,
        cell(r.accountName),
        cell(r.team ?? ""),
        dollars(r.debitCents),
        dollars(r.creditCents),
      ].join(","),
    );
    return {
      filename: `general-ledger_${range.from}_${range.to}.csv`,
      contentType: "text/csv; charset=utf-8",
      body: [header.join(","), ...lines].join("\r\n") + "\r\n",
    };
  },
};
