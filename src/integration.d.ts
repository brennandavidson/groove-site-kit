import type { AstroIntegration } from "astro";

export type GrooveSiteKitOptions = {
  /** Defaults to the PORTAL_URL env var. */
  portalUrl?: string;
  /** Defaults to the CLIENT_SLUG env var. */
  clientSlug?: string;
  /** "campaign" registers every page as a campaign page (go. projects). Default "full". */
  mode?: "campaign" | "full";
  /** Public URL sent with page registration. Defaults to astro.config `site`, then SITE_URL, then VERCEL_PROJECT_PRODUCTION_URL. */
  siteUrl?: string;
};

export declare function readEnv(root: string, mode: string): Record<string, string | undefined>;

export default function grooveSiteKit(opts?: GrooveSiteKitOptions): AstroIntegration;
