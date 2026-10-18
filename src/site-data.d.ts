/** Public site data from GET {PORTAL_URL}/api/sites/{slug}. Contract version 1. */
export type SiteData = {
  v: 1;
  client: {
    slug: string;
    name: string;
    legalName: string | null;
    city: string | null;
    state: string | null;
    phoneDisplay: string | null;
    phoneE164: string | null;
  };
  intake: { url: string; key: string | null };
  beacon: { url: string };
  pixelId: string | null;
  /** Tracking numbers keyed by page slug. */
  numbers: Record<string, TrackingNumber>;
  consent: { version: string; text: string };
  reviews: { rating: number; count: number; source: string } | null;
};

export type TrackingNumber = { e164: string; display: string; label?: string | null };

export type SiteDataOptions = {
  /** Defaults to the PORTAL_URL env var. */
  portalUrl?: string;
  /** Defaults to the CLIENT_SLUG env var. */
  clientSlug?: string;
  /** Injectable for tests. */
  fetch?: typeof fetch;
  /** Skip the per-process cache. */
  fresh?: boolean;
};

/**
 * Loads site data once per process (cached by portal URL + slug).
 * Throws on a missing env var, unknown slug, network failure or a bad payload.
 * Build-time only: never call this from client code.
 */
export declare function getSiteData(opts?: SiteDataOptions): Promise<SiteData>;

/** Drops the per-process cache. */
export declare function clearSiteDataCache(): void;

/** Validates and returns a site data payload, or throws with the first problem found. */
export declare function parseSiteData(input: unknown): SiteData;

/** Resolves portal URL and client slug from options, then env. Throws when either is missing. */
export declare function resolveSiteConfig(opts?: { portalUrl?: string; clientSlug?: string }): { portalUrl: string; clientSlug: string };
