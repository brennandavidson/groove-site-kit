// Server and build-time API. Import from .astro frontmatter or other Vite-compiled code.
// astro.config uses "groove-site-kit/integration" instead.

export { getSiteData, clearSiteDataCache, parseSiteData, resolveSiteConfig } from "./site-data.js";
export type { SiteData, SiteDataOptions, TrackingNumber } from "./site-data.js";
export { LEGAL_PATHS, slugFromPath, normalizePath, pageKind, isExcludedPath } from "./paths.js";
export type { PageKind, SiteMode } from "./paths.js";
export { SMS_CONSENT_TEMPLATE, smsConsentText, consentFor } from "./consent";
export { CARRIER, LEGAL_TITLES, legalWho, legalTitle, contactLine } from "./legal";
export type { LegalKind } from "./legal";
export { numberFor, formatUsPhone } from "./numbers";
export type { PhoneNumber } from "./numbers";
export { trackerScript, scriptSafeJson } from "./tracker";
export type { TrackerOptions, Attribution, GrooveGlobal, TrackProps } from "./tracker";
export type { QuizStep, CallTiming, LeadPayload, IntakeResponse, FormField, ContactConsent, MarketingConsent } from "./lead-form/logic";
export { resolveFields, splitFullName, buildFieldsPayload, validateFields, validateConsent, marketingConsentPayload, DEFAULT_SINGLE_FIELDS } from "./lead-form/logic";
export type { LeadFormProps, ThankYouCopy } from "./lead-form/LeadForm";
