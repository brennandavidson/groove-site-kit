import type { SiteData } from "../src/site-data.js";

export const PORTAL = "https://portal.test";

export const SITE: SiteData = {
  v: 1,
  client: {
    slug: "ash-cooling",
    name: "Ash Cooling & Heating",
    legalName: "Ash Cooling & Heating LLC",
    city: "Mesa",
    state: "AZ",
    phoneDisplay: "(602) 806-9897",
    phoneE164: "+16028069897",
  },
  intake: { url: "https://portal.test/api/intake", key: "gpk_test_0123456789abcdef" },
  beacon: { url: "https://portal.test/api/t" },
  pixelId: "1787874271848321",
  numbers: { independent: { e164: "+16233433189", display: "(623) 343-3189", label: "Patriarch" } },
  consent: {
    version: "2026-10-01",
    text: "By checking this box, you agree to receive calls and texts from Ash Cooling & Heating about your request, including automated messages. Message and data rates may apply. Reply STOP to opt out. Consent is not a condition of purchase.",
  },
  // Portals before build 13 send no marketing wording: the default, so forms show no marketing box.
  marketingConsent: null,
  reviews: { rating: 4.9, count: 212, source: "Google" },
};

/** Marketing box wording as the portal sends it (GET /api/sites/<slug> marketingConsent). */
export const MARKETING = {
  version: "2026-10-20",
  text: "Yes, text me occasional offers and seasonal reminders from Ash Cooling & Heating. Up to 4 msgs/month. Message and data rates may apply. Reply STOP to opt out. Consent is not a condition of purchase.",
};

/** Site data from a portal that sends marketing consent wording. */
export const SITE_MARKETING: SiteData = { ...SITE, marketingConsent: MARKETING };

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** fetch stub that serves SITE for the site data URL. */
export function sitesFetch(site: SiteData = SITE) {
  return async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === `${PORTAL}/api/sites/${site.client.slug}`) return jsonResponse(site);
    return jsonResponse({ ok: false, error: "not found" }, 404);
  };
}
