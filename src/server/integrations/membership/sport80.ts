/**
 * Sport:80 adapter (USA Water Polo membership). CONTRACT ONLY.
 *
 * Whether Sport:80 exposes roster and certification data by API or export is
 * an open question in the launch plan. Once answered, implement
 * fetchCredentials and call saveCredential() for each row with
 * source = "sport80".
 */
import { IntegrationNotConfigured, type MembershipProvider } from "../types";

export const sport80Membership: MembershipProvider = {
  info: {
    id: "sport80",
    label: "Sport:80",
    description: "Sync USA Water Polo memberships and SafeSport status automatically.",
    maturity: "planned",
  },
  fetchCredentials: async () => {
    throw new IntegrationNotConfigured("Sport:80", "data access not yet agreed");
  },
};
