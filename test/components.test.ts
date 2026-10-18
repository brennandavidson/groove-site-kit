import { experimental_AstroContainer as AstroContainer } from "astro/container";
import reactRenderer from "@astrojs/react/server.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallNumber from "../src/components/CallNumber.astro";
import LeadForm from "../src/components/LeadForm.astro";
import PrivacyPage from "../src/components/PrivacyPage.astro";
import Schema from "../src/components/Schema.astro";
import SmsOptInPage from "../src/components/SmsOptInPage.astro";
import TermsPage from "../src/components/TermsPage.astro";
import Tracker from "../src/components/Tracker.astro";
import { SMS_CONSENT_TEMPLATE, smsConsentText } from "../src/consent";
import { numberFor } from "../src/numbers";
import { CARRIER } from "../src/legal";
import { clearSiteDataCache } from "../src/site-data.js";
import { MARKETING, PORTAL, SITE, SITE_MARKETING, sitesFetch } from "./fixtures";

/** Rendered HTML to plain text so assertions match what a reviewer reads. */
function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");
}

let container: AstroContainer;

async function render(component: Parameters<AstroContainer["renderToString"]>[0], props: Record<string, unknown> = {}, path = "/independent") {
  return container.renderToString(component, { props, request: new Request(`https://go.ashcooling.com${path}`) });
}

beforeEach(async () => {
  clearSiteDataCache();
  vi.stubEnv("PORTAL_URL", PORTAL);
  vi.stubEnv("CLIENT_SLUG", "ash-cooling");
  vi.stubGlobal("fetch", sitesFetch());
  container = await AstroContainer.create({ astroConfig: { site: "https://go.ashcooling.com" } });
  container.addServerRenderer({ renderer: reactRenderer, name: "@astrojs/react" });
  container.addClientRenderer({ name: "@astrojs/react", entrypoint: "@astrojs/react/client.js" });
});
afterEach(() => clearSiteDataCache());

describe("legal pages carry every carrier-required string", () => {
  it("Privacy Policy", async () => {
    const html = await render(PrivacyPage, {}, "/privacy");
    const t = text(html);
    expect(html).toContain("<title>Privacy Policy | Ash Cooling &amp; Heating</title>");
    expect(t).toContain("Privacy Policy");
    expect(t).toContain(CARRIER.noSharing);
    expect(t).toContain("We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.");
    expect(t).toContain("Ash Cooling & Heating LLC");
    expect(t).toContain("(602) 806-9897");
  });

  it("Terms & Conditions with SMS Terms", async () => {
    const t = text(await render(TermsPage, {}, "/terms"));
    expect(t).toContain("Terms & Conditions");
    expect(t).toContain("SMS Terms");
    expect(t).toContain("Message and data rates may apply.");
    expect(t).toContain(CARRIER.noSharing);
    expect(t).toContain("Ash Cooling & Heating LLC");
    expect(t).toMatch(/Reply STOP/);
    expect(t).toMatch(/Reply HELP/);
  });

  it("Text Message Opt-In shows the contact step with the portal's consent text", async () => {
    const html = await render(SmsOptInPage, { formPath: "/independent" }, "/sms-opt-in");
    const t = text(html);
    expect(t).toContain("Text Message Opt-In");
    expect(t).toContain(SITE.consent.text);
    expect(html).toContain('data-consent-version="2026-10-01"');
    expect(t).toContain("Message and data rates may apply.");
    expect(t).toContain("Ash Cooling & Heating LLC");
    expect(t).toContain("unchecked, optional");
    expect(t).toContain("After they submit");
    expect(html).toContain('href="https://go.ashcooling.com/independent"');
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });

  it("Text Message Opt-In describes a required consent box when the form requires it", async () => {
    const t = text(await render(SmsOptInPage, { formPath: "/independent", consentRequired: true }, "/sms-opt-in"));
    expect(t).toContain("unchecked text message consent checkbox that must be checked to send the request");
    expect(t).not.toContain("unchecked, optional");
    expect(t).toContain(SITE.consent.text);
  });

  it("Text Message Opt-In shows both boxes for the two-box option", async () => {
    const t = text(await render(SmsOptInPage, { formPath: "/independent", contactConsent: { text: "I agree to be contacted about my request by phone and email." } }, "/sms-opt-in"));
    expect(t).toContain("I agree to be contacted about my request by phone and email.");
    expect(t).toContain("required to send the request");
    expect(t).toContain("unchecked, optional text message consent checkbox");
    expect(t).toContain(SITE.consent.text);
  });

  it("Text Message Opt-In mentions no marketing box when site data has no marketing wording", async () => {
    const t = text(await render(SmsOptInPage, { formPath: "/independent" }, "/sms-opt-in"));
    expect(t).not.toMatch(/marketing/i);
    expect(t).toContain("We only text people who check the text message consent box.");
    expect(t).toContain("Later texts are about that request only");
  });

  it("Text Message Opt-In describes and shows the separate optional marketing box with its exact text", async () => {
    vi.stubGlobal("fetch", sitesFetch(SITE_MARKETING));
    const html = await render(SmsOptInPage, { formPath: "/independent", consentRequired: true }, "/sms-opt-in");
    const t = text(html);
    expect(t).toContain("separate, unchecked, optional checkbox for marketing texts");
    expect(t).toContain("It is never required to send the request.");
    expect(t).toContain("only send marketing texts to people who check the marketing box");
    expect(t).toContain(MARKETING.text);
    expect(html).toContain('data-marketing-consent-version="2026-10-20"');
    expect(html).toContain("gsk-marketing-consent");
    // The request box is still described as the form has it.
    expect(t).toContain("unchecked text message consent checkbox that must be checked to send the request");
    expect(t).toContain(SITE.consent.text);
    // Marketing box shows after the SMS consent box.
    expect(t.indexOf(MARKETING.text)).toBeGreaterThan(t.indexOf(SITE.consent.text));
    expect(t).toContain("people who left it unchecked never get marketing texts");
  });

  it("Text Message Opt-In marketingConsent={false} hides the marketing box even when site data has it", async () => {
    vi.stubGlobal("fetch", sitesFetch(SITE_MARKETING));
    const t = text(await render(SmsOptInPage, { formPath: "/independent", marketingConsent: false }, "/sms-opt-in"));
    expect(t).not.toMatch(/marketing/i);
    expect(t).not.toContain(MARKETING.text);
  });

  it("falls back to the business name when there is no legal name", async () => {
    vi.stubGlobal("fetch", sitesFetch({ ...SITE, client: { ...SITE.client, legalName: null } }));
    const t = text(await render(PrivacyPage, {}, "/privacy"));
    expect(t).not.toContain("LLC");
    expect(t).toContain(CARRIER.noSharing);
  });

  it("renders just the article with standalone={false}", async () => {
    const html = await render(TermsPage, { standalone: false }, "/terms");
    expect(html).not.toContain("<html");
    expect(html).toContain('class="gsk-legal"');
    expect(html).not.toContain("<main"); // the site layout owns <main>
  });
});

describe("consent text", () => {
  it("template is unchanged (changing it changes the legal record)", () => {
    expect(SMS_CONSENT_TEMPLATE).toMatchInlineSnapshot(
      `"By checking this box, you agree to receive calls and texts from {Business} about your request, including automated messages. Message and data rates may apply. Reply STOP to opt out. Consent is not a condition of purchase."`,
    );
    expect(smsConsentText("Ash Cooling & Heating")).toBe(SITE.consent.text);
  });
});

describe("CallNumber", () => {
  it("renders the page's tracking number", async () => {
    const html = await render(CallNumber, { page: "independent", class: "btn" });
    expect(html).toContain('href="tel:+16233433189"');
    expect(html).toContain("(623) 343-3189");
    expect(html).toContain('data-track="call"');
    expect(html).toContain('class="btn"');
  });

  it("derives the page slug from the URL", async () => {
    expect(await render(CallNumber, {}, "/go/independent/")).toContain("tel:+16233433189");
  });

  it("falls back to the main number", async () => {
    const html = await render(CallNumber, { page: "beat-your-quote" });
    expect(html).toContain('href="tel:+16028069897"');
    expect(html).toContain("(602) 806-9897");
    expect(html).toContain('data-gsk-call="main"');
  });

  it("shows the fallback before the main number when the portal has no number for the page", async () => {
    const html = await render(CallNumber, { page: "beat-your-quote", fallback: "(602) 905-1450" });
    expect(html).toContain('href="tel:+16029051450"');
    expect(html).toContain("(602) 905-1450");
    expect(html).toContain('data-gsk-call="fallback"');
    // E.164 fallback is formatted for display.
    expect(await render(CallNumber, { page: "beat-your-quote", fallback: "+16029051450" })).toContain("(602) 905-1450");
  });

  it("a portal number always wins over the fallback", async () => {
    const html = await render(CallNumber, { page: "independent", fallback: "(602) 905-1450" });
    expect(html).toContain('href="tel:+16233433189"');
    expect(html).not.toContain("905-1450");
    expect(html).toContain('data-gsk-call="tracking"');
  });

  it("ignores an unusable fallback", async () => {
    expect(await render(CallNumber, { page: "beat-your-quote", fallback: "call us" })).toContain('href="tel:+16028069897"');
  });
});

describe("numberFor", () => {
  it("tracking > fallback > main > null", () => {
    expect(numberFor(SITE, "independent", "(602) 905-1450")).toEqual({ e164: "+16233433189", display: "(623) 343-3189", tracking: true, source: "tracking" });
    expect(numberFor(SITE, "valentines", "480-536-4465")).toEqual({ e164: "+14805364465", display: "480-536-4465", tracking: false, source: "fallback" });
    expect(numberFor(SITE, "valentines")).toEqual({ e164: "+16028069897", display: "(602) 806-9897", tracking: false, source: "main" });
    expect(numberFor({ ...SITE, client: { ...SITE.client, phoneE164: null, phoneDisplay: null } }, "valentines")).toBeNull();
  });
});

describe("Schema", () => {
  function ld(html: string) {
    return JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]!);
  }

  it("emits HVACBusiness JSON-LD from site data", async () => {
    const data = ld(await render(Schema, { areaServed: ["Mesa", "Gilbert"] }));
    expect(data).toMatchObject({
      "@type": "HVACBusiness",
      name: "Ash Cooling & Heating",
      legalName: "Ash Cooling & Heating LLC",
      telephone: "+16028069897",
      url: "https://go.ashcooling.com/",
      address: { addressLocality: "Mesa", addressRegion: "AZ", addressCountry: "US" },
      areaServed: [{ "@type": "City", name: "Mesa" }, { "@type": "City", name: "Gilbert" }],
    });
    expect(data.aggregateRating).toBeUndefined();
  });

  it("adds the rating only when asked", async () => {
    const data = ld(await render(Schema, { rating: true, type: "Plumber" }));
    expect(data["@type"]).toBe("Plumber");
    expect(data.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.9, reviewCount: 212 });
  });
});

describe("Tracker", () => {
  it("inlines the tracker with the beacon URL, client, page and pixel", async () => {
    const html = await render(Tracker, {}, "/go/independent");
    expect(html).toContain('id="gsk-tracker"');
    expect(html).toContain('"e":"https://portal.test/api/t","t":"ash-cooling","p":"independent","px":"1787874271848321"');
  });
});

describe("LeadForm.astro", () => {
  it("server-renders the island with site data props and no secrets", async () => {
    vi.stubEnv("SITE_TOKEN", "tok_should_never_render");
    const html = await render(LeadForm, { page: "independent", steps: [] });
    expect(html).toContain("<astro-island");
    expect(html).toContain('client="load"');
    expect(text(html)).toContain(SITE.consent.text);
    expect(html).toContain("gpk_test_0123456789abcdef");
    expect(html).not.toContain("tok_should_never_render");
  });

  it("renders no marketing box when site data has no marketing wording", async () => {
    const html = await render(LeadForm, { page: "independent", steps: [] });
    expect(html).not.toContain("marketing_consent");
    expect(html).not.toContain("occasional offers");
  });

  it("renders the marketing box, unchecked, when site data has marketing wording", async () => {
    vi.stubGlobal("fetch", sitesFetch(SITE_MARKETING));
    const html = await render(LeadForm, { page: "independent", steps: [] });
    expect(html).toContain('name="marketing_consent"');
    expect(text(html)).toContain(MARKETING.text);
    const input = html.match(/<input[^>]*name="marketing_consent"[^>]*>/)![0];
    expect(input).not.toContain("checked");
    expect(input).not.toContain("required");
  });

  it("marketingConsent={false} hides the marketing box even when site data has it", async () => {
    vi.stubGlobal("fetch", sitesFetch(SITE_MARKETING));
    const html = await render(LeadForm, { page: "independent", steps: [], marketingConsent: false });
    expect(html).not.toContain("marketing_consent");
    expect(html).not.toContain("occasional offers");
  });

  it("single layout: class hook, footnote slot, fallback number and preview mode", async () => {
    const html = await container.renderToString(LeadForm, {
      props: {
        page: "beat-your-quote",
        layout: "single",
        class: "ash-form",
        preview: true,
        fallbackNumber: "(602) 905-1450",
        fields: [{ type: "fullName", placeholder: "Full Name *" }, { type: "phone", placeholder: "Your Phone Number *" }],
        submitLabel: "GET MY BETTER PRICE",
      },
      slots: { footnote: '<p class="fine">*Price-beat guarantee applies. <a href="#footer-terms">See terms.</a></p>' },
      request: new Request("https://go.ashcooling.com/beat-your-quote"),
    });
    expect(html).toContain('data-layout="single"');
    expect(html).toContain('class="gsk-form ash-form"');
    expect(html).toContain('placeholder="Full Name *"');
    expect(text(html)).toContain("*Price-beat guarantee applies. See terms.");
    expect(html).toContain("(602) 905-1450");
    // Preview: the intake key never reaches the page.
    expect(html).not.toContain("gpk_test_0123456789abcdef");
  });
});
