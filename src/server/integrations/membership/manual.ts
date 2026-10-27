/** Credentials are typed in by the director. Nothing to fetch. */
import type { MembershipProvider } from "../types";

export const manualMembership: MembershipProvider = {
  info: {
    id: "manual",
    label: "Manual entry",
    description: "Enter membership and certification expiry dates by hand.",
    maturity: "ready",
  },
  fetchCredentials: async () => [],
};
