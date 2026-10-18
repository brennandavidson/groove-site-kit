# groove-site-kit

Shared plumbing for Design Groove client sites (Astro). Everything that touches leads, consent, legal pages and tracking lives here, so a fix ships to every client by bumping one tag.

What's in it:

- `grooveSiteKit()` Astro integration: compiles the kit in the site, fails the build if portal data can't load, registers the site's pages with the portal after each production build.
- `getSiteData()`: build-time fetch of the client's public data from the portal.
- `<LeadForm>`: multi-step quiz + contact step + consent, posts to portal intake, fires the pixel Lead with the same event id.
- `<Tracker>`: first-party page events + attribution + Meta pixel.
- `<CallNumber>`: the page's tracking number (or the main line) as a `tel:` link.
- `<Schema>`: LocalBusiness / HVACBusiness JSON-LD.
- `<PrivacyPage>`, `<TermsPage>`, `<SmsOptInPage>`: carrier-ready legal and opt-in pages.

Requires Astro 7+ (Node 22.22+), React 19, `@astrojs/react`.

## Install

```json
"dependencies": {
  "groove-site-kit": "github:brennandavidson/groove-site-kit#v0.1.0"
}
```

Peer deps the site already has: `astro`, `react`, `react-dom`, plus `@astrojs/react`.

The repo is public, so Vercel, CI and anyone working on a client repo install it with a plain `npm install`. No tokens. It holds no secrets: only the form, tracker, consent wording and legal page templates. Client data and keys live in the portal.

## Env vars

| Var | Example | Notes |
| --- | --- | --- |
| `PORTAL_URL` | `https://app.designgroove.io` | Required. |
| `CLIENT_SLUG` | `ash-cooling` | Required. |
| `SITE_TOKEN` | `st_...` | Optional, secret, build-time only. Enables page registration. Never reaches the browser: only the integration reads it. |
| `SITE_URL` | `https://go.ashcooling.com` | Optional. Used for registration when `site` isn't set in astro.config. |

`.env` files work (the integration reads `.env`, `.env.local`, `.env.<mode>`, `.env.<mode>.local`, real env vars win).

## Integration

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import grooveSiteKit from "groove-site-kit/integration";

export default defineConfig({
  site: "https://go.ashcooling.com",
  integrations: [react(), grooveSiteKit({ mode: "campaign" })],
});
```

Options (all optional): `portalUrl`, `clientSlug` (override env), `mode` (`"full"` default, `"campaign"` for go. projects), `siteUrl`.

What it does:

- Sets Vite `ssr.noExternal: ["groove-site-kit"]` so the site compiles the kit's TS/TSX/.astro source. No kit build step.
- `astro build`: loads site data first and **fails the build** if it can't (missing env, unknown slug, portal down, bad payload). Stale legal text never ships silently. `astro dev` only warns.
- After a production build, if `SITE_TOKEN` is set, registers pages with the portal:
  - every built HTML route except `/privacy`, `/terms`, `/sms-terms`, `/sms-opt-in`, `/404`, `/500`, `/api/*` and files like `robots.txt`
  - `kind`: `"campaign"` for routes under `/go/` or every route in `mode: "campaign"`, else `"site"`
  - `slug`: last path segment, `"home"` for `/` (two routes with the same last segment: the first wins, with a warning)
  - `title`: the built page's `<title>`
  - failure logs a warning, the build still succeeds
  - skipped when `SITE_TOKEN` is unset or on Vercel preview builds (`VERCEL_ENV` other than `production`)

## Components

All components read site data at build time. Page slugs default to the last path segment (`/go/independent` -> `independent`, `/` -> `home`), the same rule registration uses, so you rarely pass `page`.

```astro
---
import { LeadForm, Tracker, CallNumber, Schema } from "groove-site-kit/components";
---
```

### Tracker

Put it in `<head>` on every page so `window.groove` exists before islands hydrate.

```astro
<head>
  <Tracker />
  <!-- <Tracker page="independent" pixel={false} /> -->
</head>
```

Sends batched events to the portal beacon as `text/plain` (no CORS preflight): `page_view`, `scroll_50`, `scroll_90`, `cta_click` (any `[data-track]`), `call_click` (any `tel:` link, plus pixel `Contact`), `form_*`, `video_*` (any `<video data-track-video="id">`). Captures `utm_*`, `fbclid`, `gclid`, `gbraid`, `wbraid`, `_fbc`, `_fbp`. Strips PII from event props.

### LeadForm

```astro
<LeadForm
  page="independent"
  title="Get your free estimate"
  subtitle="Takes 30 seconds"
  proof="The owner calls you back"
  submitLabel="Get my free estimate"
  steps={[
    { id: "system_age", question: "How old is your system?", options: ["Under 10 years", "10 to 15 years", "15+ years"] },
    { id: "timeline", question: "When do you need it?", options: ["ASAP", "This month", "Just pricing"] },
  ]}
  thanks={{ heading: "Thanks, {first}!", now: "We'll call you in a few minutes from {phone}." }}
/>
```

Don't add `client:load`: the wrapper already hydrates the island (Astro warns if you do). Use `hydrate="idle"` or `hydrate="visible"` for forms below the fold.

- Contact step: first name, mobile phone, zip, email (optional), consent checkbox (unchecked, optional) with the portal's exact consent text, links to `/terms` and `/privacy` (override with `termsUrl` / `privacyUrl`).
- Posts to `intake.url` with `x-intake-key`, page slug, answers, consent `{ checked, text }`, visitor id, attribution and a `leadEventId` (uuid). Fires pixel `Lead` with `eventID` = that `leadEventId` (or the one the portal returns) for CAPI dedupe. A retry after an error reuses the id.
- Honeypot field `website`: if a bot fills it, the form fakes success and sends nothing.
- Thank-you copy follows the portal's call timing (`now` / `later` / `none`). Template vars: `{first}`, `{business}`, `{phone}`, `{when}`, `{number}`.
- No `intake.key` in site data = preview mode: walks through, sends nothing.
- Anchor id `estimate` by default (`id` prop), so `href="#estimate"` buttons work.

For a custom wrapper, the raw island is `groove-site-kit/react` (you pass every prop yourself).

### CallNumber

```astro
<CallNumber />                                       <!-- (623) 343-3189 on /independent, else main line -->
<CallNumber page="independent" class="btn" track="hero_call">Call now</CallNumber>
```

Renders nothing if the client has no number at all.

### Schema

```astro
<Schema
  areaServed={["Mesa", "Gilbert", "Chandler"]}
  openingHours={["Mo-Fr 07:00-18:00"]}
  sameAs={["https://g.page/..."]}
  priceRange="$$"
/>
```

`type` defaults to `HVACBusiness` (`type="Plumber"` etc.). `rating` adds `aggregateRating` from the portal review summary; off by default because Google treats self-served LocalBusiness ratings as ineligible. `extra` is merged last.

## Legal pages

Three files, three lines each:

```astro
---
// src/pages/privacy.astro
import { PrivacyPage } from "groove-site-kit/components";
---
<PrivacyPage />
```

```astro
---
// src/pages/terms.astro
import { TermsPage } from "groove-site-kit/components";
---
<TermsPage />
```

```astro
---
// src/pages/sms-opt-in.astro
import { SmsOptInPage } from "groove-site-kit/components";
---
<SmsOptInPage formPath="/go/independent" />
```

- Paths must be `/privacy`, `/terms`, `/sms-opt-in` (forms and pages link there).
- Filled from portal data: business name, legal name, phone, consent text + version.
- Carrier strings are verbatim and tested: titles "Privacy Policy" / "Terms & Conditions" / "Text Message Opt-In", "We do not sell or share your SMS opt-in data or personal information with third parties for marketing purposes.", "Message and data rates may apply.", the legal name, an "SMS Terms" section with STOP/HELP.
- The opt-in page shows the form's contact step statically (unchecked box, real consent text), the first text people get, and links.
- They render a full standalone document. To use the site's header/footer instead, wrap them: `<Layout><PrivacyPage standalone={false} /></Layout>`. To restyle a standalone page, import your global CSS in the page file.
- Plain template. Have counsel review.

## Styling

Plain CSS with `gsk-` class names, independent of the site's Tailwind config. Restyle through tokens:

```css
:root {
  --gsk-brand: #c2410c;     /* buttons, progress, selected options */
  --gsk-on-brand: #fff;
  --gsk-ink: #1c1917;
  --gsk-muted: #57534e;
  --gsk-paper: #f5f5f4;     /* consent box background */
  --gsk-card: #fff;
  --gsk-line: #d6d3d1;
  --gsk-radius: 12px;
  --gsk-font: inherit;
  --gsk-focus: var(--gsk-brand);
}
```

Defaults sit in `:where(:root)`, so any rule in the site wins.

## Server API

Import from `.astro` frontmatter or other Vite-compiled code (not astro.config; use `/integration` there):

```ts
import { getSiteData, numberFor, legalWho, CARRIER, slugFromPath } from "groove-site-kit";

const site = await getSiteData(); // cached per process
const n = numberFor(site, "independent"); // { e164, display, tracking } | null
```

## Rolling out kit updates

1. Change the kit, add a CHANGELOG entry, bump `version` in package.json.
2. `npm test`, then commit, tag (`git tag v0.2.0`) and push the tag.
3. In each client repo, bump the dependency to `#v0.2.0`, `npm install`, build, deploy.

Client sites only move when their tag is bumped, so a kit change never breaks a live site by surprise. Never move an existing tag.

## Portal contract (v1)

1. `GET {PORTAL_URL}/api/sites/{slug}` (public, 404 for an unknown slug):

```json
{ "v": 1,
  "client": { "slug": "ash-cooling", "name": "Ash Cooling & Heating", "legalName": "Ash Cooling & Heating LLC", "city": "Mesa", "state": "AZ", "phoneDisplay": "(602) 806-9897", "phoneE164": "+16028069897" },
  "intake": { "url": "https://app.designgroove.io/api/intake", "key": "gpk_..." },
  "beacon": { "url": "https://app.designgroove.io/api/t" },
  "pixelId": "1787874271848321",
  "numbers": { "independent": { "e164": "+16233433189", "display": "(623) 343-3189", "label": "Patriarch" } },
  "consent": { "version": "2026-10-01", "text": "By checking this box, ..." },
  "reviews": { "rating": 4.9, "count": 212, "source": "Google" } }
```

`legalName`, `city`, `state`, phone fields, `intake.key`, `pixelId`, `reviews` may be null. `numbers` is keyed by page slug. The kit rejects any other `v`.

2. `POST {PORTAL_URL}/api/sites/{slug}/pages`, header `authorization: Bearer <SITE_TOKEN>`:

```json
{ "siteUrl": "https://go.ashcooling.com",
  "pages": [{ "slug": "independent", "title": "...", "path": "/go/independent", "kind": "campaign" }] }
```

Returns `{ "ok": true, "registered": 3 }`.

3. Lead intake: `POST {intake.url}`, header `x-intake-key`, body `{ first, phone, zip, email?, answers, consent: { checked, text }, page, visitorId?, attribution, leadEventId }`. Returns `{ ok, leadEventId, call: { when: "now" } | { when: "later", at, display } | { when: "none" } }`. 429 = slow down, 401 = bad key.

4. Page events: `POST {beacon.url}` (`text/plain` body, JSON) `{ v: 1, vid, sid, t: clientSlug, pg: pageSlug, path, a: attribution, ev: [{ n, t, p }] }`.

## Development

```sh
npm install
npm test        # vitest: site data, registration, integration, LeadForm, tracker, components and legal pages
npm run typecheck
```
