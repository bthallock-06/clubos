import { describe, expect, it } from "vitest";
import { addMonths, zonedToInstant } from "@/lib/dates";
import { parseDollars, splitCents } from "@/lib/money";
import { statusFor } from "@/server/domain/compliance";
import { validateEntry } from "@/server/domain/ledger";

describe("money", () => {
  it("parses dollars into cents without float error", () => {
    expect(parseDollars("$1,800")).toBe(180000);
    expect(parseDollars("19.99")).toBe(1999);
    expect(parseDollars("0.1")).toBe(10);
    expect(() => parseDollars("12.345")).toThrow();
    expect(() => parseDollars("-5")).toThrow();
  });

  it("splits installments so they always sum to the total", () => {
    expect(splitCents(165000, 3)).toEqual([55000, 55000, 55000]);
    expect(splitCents(100000, 3)).toEqual([33334, 33333, 33333]);
    for (const n of [1, 2, 3, 7, 12]) {
      expect(splitCents(99999, n).reduce((a, b) => a + b, 0)).toBe(99999);
    }
  });
});

describe("dates", () => {
  it("clamps month ends", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-11-15", 2)).toBe("2027-01-15");
  });

  it("converts club wall clock time to the right instant", () => {
    // 4:30 pm Pacific daylight time is 23:30 UTC.
    expect(zonedToInstant("2026-10-12T16:30", "America/Los_Angeles").toISOString()).toBe(
      "2026-10-12T23:30:00.000Z",
    );
    // After the switch to standard time it is 00:30 UTC the next day.
    expect(zonedToInstant("2026-11-12T16:30", "America/Los_Angeles").toISOString()).toBe(
      "2026-11-13T00:30:00.000Z",
    );
  });
});

describe("journal entry validation", () => {
  it("accepts a balanced entry", () => {
    expect(() =>
      validateEntry([
        { accountId: "a", debitCents: 500 },
        { accountId: "b", creditCents: 500 },
      ]),
    ).not.toThrow();
  });

  it("rejects unbalanced, one sided and malformed entries", () => {
    expect(() =>
      validateEntry([
        { accountId: "a", debitCents: 500 },
        { accountId: "b", creditCents: 499 },
      ]),
    ).toThrow(/balance/);
    expect(() => validateEntry([{ accountId: "a", debitCents: 500 }])).toThrow();
    expect(() =>
      validateEntry([
        { accountId: "a", debitCents: 500, creditCents: 500 },
        { accountId: "b", creditCents: 0 },
      ]),
    ).toThrow();
    expect(() =>
      validateEntry([
        { accountId: "a", debitCents: 10.5 },
        { accountId: "b", creditCents: 10.5 },
      ]),
    ).toThrow();
  });
});

describe("credential status", () => {
  it("classifies by days to expiry", () => {
    expect(statusFor(null, "2026-10-07")).toBe("missing");
    expect(statusFor("2026-10-06", "2026-10-07")).toBe("expired");
    expect(statusFor("2026-10-20", "2026-10-07")).toBe("expiring");
    expect(statusFor("2027-06-01", "2026-10-07")).toBe("ok");
  });
});
