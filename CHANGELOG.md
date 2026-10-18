# Changelog

## v0.1.0 (2026-10-17)

First release. Ported from groove-portal `src/sites` (LeadForm, consent, tracker, legal pages).

- `grooveSiteKit()` integration: `ssr.noExternal`, build fails when site data can't load, page registration after production builds when `SITE_TOKEN` is set (warns on failure, skips Vercel previews).
- `getSiteData()` for portal contract v1, cached per process, one retry on network errors and 5xx.
- `LeadForm` island + `LeadForm.astro` wrapper: quiz steps, contact step, portal consent text, honeypot, `leadEventId` shared with the pixel Lead, form events, call-timing thank-you, copy overrides.
- `Tracker.astro`: first-party events and attribution, Meta pixel. Beacon now sent as `text/plain` so cross-origin sites need no CORS preflight.
- `CallNumber.astro`, `Schema.astro`.
- `PrivacyPage.astro`, `TermsPage.astro` (SMS Terms), `SmsOptInPage.astro` with the carrier-required strings.
- CSS tokens (`--gsk-*`), Tailwind-independent class names.
