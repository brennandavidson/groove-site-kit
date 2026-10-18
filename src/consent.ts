import type { SiteData } from "./site-data.js";

/**
 * The consent label the portal fills in per client and records with every lead.
 * The portal is the source of truth (site data `consent`); this template is kept for reference and tests.
 * Changing the wording is a portal change plus a new consent version, never a kit-only edit.
 */
export const SMS_CONSENT_TEMPLATE =
  "By checking this box, you agree to receive calls and texts from {Business} about your request, including automated messages. Message and data rates may apply. Reply STOP to opt out. Consent is not a condition of purchase.";

export function smsConsentText(business: string): string {
  return SMS_CONSENT_TEMPLATE.replace("{Business}", business);
}

/** The exact consent text and version this build shows next to the checkbox. */
export function consentFor(site: SiteData): { text: string; version: string } {
  return { text: site.consent.text, version: site.consent.version };
}
