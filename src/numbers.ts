import type { SiteData } from "./site-data.js";

export type PhoneNumber = { e164: string; display: string; tracking: boolean };

/** The page's tracking number, else the client's main number, else null. */
export function numberFor(site: SiteData, page: string | undefined): PhoneNumber | null {
  const n = page ? site.numbers[page] : undefined;
  if (n) return { e164: n.e164, display: n.display, tracking: true };
  const { phoneE164, phoneDisplay } = site.client;
  if (phoneE164) return { e164: phoneE164, display: phoneDisplay ?? phoneE164, tracking: false };
  return null;
}
