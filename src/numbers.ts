import type { SiteData } from "./site-data.js";
import { toE164 } from "./lead-form/logic";

export type PhoneNumber = {
  e164: string;
  display: string;
  /** True only for the portal's tracking number for this page. */
  tracking: boolean;
  /** Where the number came from: the portal's page number, the site's fallback, or the main line. */
  source: "tracking" | "fallback" | "main";
};

/** "+16029051450" or "602-905-1450" -> "(602) 905-1450". */
export function formatUsPhone(e164: string): string {
  const d = e164.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

/**
 * The page's tracking number from the portal, else the site's fallback for the page (E.164 or a
 * display string like "(602) 905-1450"), else the client's main number, else null.
 * A portal number always wins over the fallback.
 */
export function numberFor(site: SiteData, page: string | undefined, fallback?: string | null): PhoneNumber | null {
  const n = page ? site.numbers[page] : undefined;
  if (n) return { e164: n.e164, display: n.display, tracking: true, source: "tracking" };
  const fb = fallback ? toE164(fallback) : null;
  if (fb) return { e164: fb, display: fallback!.trim().startsWith("+") ? formatUsPhone(fb) : fallback!.trim(), tracking: false, source: "fallback" };
  const { phoneE164, phoneDisplay } = site.client;
  if (phoneE164) return { e164: phoneE164, display: phoneDisplay ?? phoneE164, tracking: false, source: "main" };
  return null;
}
