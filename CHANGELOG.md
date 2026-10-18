# Changelog

## v0.2.0 (2026-10-17)

All additions are opt-in. The quiz layout, its markup and its defaults are unchanged.

- LeadForm `layout="single"`: every field on one card, no steps or progress bar. `fields` sets the fields in order (`fullName`, `phone`, `address`, `zip`, `email`, `select`), each with exact placeholder, label, required flag and error text. Selects are native `<select>` elements with a disabled placeholder option. `labels="hidden"` gives a placeholder-only look with screen-reader labels.
- Single-layout payload: full name split into `first` / `last`; address and select answers in `answers` keyed by label (the intake API has no address field); `zip` / `email` left out when the form has no such field. Consent, leadEventId, visitorId, attribution, honeypot, pixel Lead and form events work as in the quiz.
- Exact-copy hooks: `reassurance` + `reassuranceIcon` (line under the button), `footnote` slot, `sendingLabel`, `class` on the root, CSS tokens (`--gsk-card-padding`, `--gsk-input-*`, `--gsk-btn-*`, ...) and `gsk-single-*` class hooks (see README, Styling).
- Thank-you: `thanks.message` (fixed copy instead of call timing), `thanks.icon: "badge"`, `thanks.callCta: ""` hides the call button.
- Consent: `consentRequired` (SMS box must be checked, inline error; default false) and `contactConsent` (a separate, by default required, contact-by-phone-and-email box whose text is recorded in `answers`). Both layouts.
- SmsOptInPage `consentRequired` / `contactConsent`: the carrier-review page describes and shows the boxes the live form really has (required SMS box, or contact box + optional SMS box). Default wording unchanged.
- LeadForm.astro: `preview` (send nothing even with an intake key), `class`, `fallbackNumber`, `footnote` slot forwarding.
- CallNumber `fallback`: shown when the portal has no tracking number for the page, before the main line; a portal number always wins. Function children get the resolved number. `numberFor(site, page, fallback?)` returns `source` (`tracking` / `fallback` / `main`), mirrored in `data-gsk-call`.
- Payload type: `last?`, `zip?`.

## v0.1.1 (2026-10-19)
- LeadForm sends `consent.version` (the portal keeps it with the agreed text as the legal record).
- LeadForm title is an `<h2>` (no skipped heading levels).
- Legal pages with `standalone={false}` render without their own `<main>`, so the site layout owns the landmark.

## v0.1.0 (2026-10-17)

First release. Ported from groove-portal `src/sites` (LeadForm, consent, tracker, legal pages).

- `grooveSiteKit()` integration: `ssr.noExternal`, build fails when site data can't load, page registration after production builds when `SITE_TOKEN` is set (warns on failure, skips Vercel previews).
- `getSiteData()` for portal contract v1, cached per process, one retry on network errors and 5xx.
- `LeadForm` island + `LeadForm.astro` wrapper: quiz steps, contact step, portal consent text, honeypot, `leadEventId` shared with the pixel Lead, form events, call-timing thank-you, copy overrides.
- `Tracker.astro`: first-party events and attribution, Meta pixel. Beacon now sent as `text/plain` so cross-origin sites need no CORS preflight.
- `CallNumber.astro`, `Schema.astro`.
- `PrivacyPage.astro`, `TermsPage.astro` (SMS Terms), `SmsOptInPage.astro` with the carrier-required strings.
- CSS tokens (`--gsk-*`), Tailwind-independent class names.
