import type { SiteData } from "./site-data.js";

/**
 * Carrier reviewers (A2P 10DLC) look for these exact strings. Pages render them verbatim and tests
 * assert they are present. Do not reword.
 */
export const CARRIER = {
  noSharing: "We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.",
  rates: "Message and data rates may apply.",
} as const;

export const LEGAL_TITLES = {
  privacy: "Privacy Policy",
  terms: "Terms & Conditions",
  smsOptIn: "Text Message Opt-In",
} as const;

export type LegalKind = keyof typeof LEGAL_TITLES;

/** "Ash Cooling & Heating (Ash Cooling & Heating LLC)", or just the name when the legal name matches or is unknown. */
export function legalWho(site: SiteData): string {
  const { name, legalName } = site.client;
  return legalName && legalName !== name ? `${name} (${legalName})` : name;
}

/** "<title>" for a legal page. */
export function legalTitle(kind: LegalKind, site: SiteData): string {
  return `${LEGAL_TITLES[kind]} | ${site.client.name}`;
}

/** How to reach the business for privacy requests and HELP. */
export function contactLine(site: SiteData): string {
  return site.client.phoneDisplay ? `call us at ${site.client.phoneDisplay}` : `contact ${site.client.name}`;
}
