// Astro integration. Plain JS so astro.config can load it straight from node_modules.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { getSiteData, resolveSiteConfig } from "./site-data.js";
import { collectPages, registerPages } from "./register.js";

/**
 * Astro only exposes .env files to Vite code, not to astro.config. Read them the same way
 * (later files win, real env vars win over all) without touching process.env.
 * @param {string} root
 * @param {string} mode
 * @returns {Record<string, string | undefined>}
 */
export function readEnv(root, mode) {
  /** @type {Record<string, string | undefined>} */
  const out = {};
  for (const name of [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`]) {
    const file = join(root, name);
    if (existsSync(file)) Object.assign(out, parseEnv(readFileSync(file, "utf8")));
  }
  return { ...out, ...process.env };
}

/** @param {import("./integration").GrooveSiteKitOptions} [opts] */
export default function grooveSiteKit(opts = {}) {
  const mode = opts.mode ?? "full";
  /** @type {Record<string, string | undefined>} */
  let env = {};
  /** @type {string | undefined} */
  let site;

  /** @type {import("astro").AstroIntegration} */
  const integration = {
    name: "groove-site-kit",
    hooks: {
      "astro:config:setup": async ({ config, command, updateConfig, logger }) => {
        env = readEnv(fileURLToPath(config.root), command === "dev" ? "development" : "production");
        const portalUrl = opts.portalUrl || env.PORTAL_URL;
        const clientSlug = opts.clientSlug || env.CLIENT_SLUG;
        // Components read these at render time. Neither is secret. SITE_TOKEN never leaves this file.
        if (portalUrl) process.env.PORTAL_URL = portalUrl;
        if (clientSlug) process.env.CLIENT_SLUG = clientSlug;

        updateConfig({
          vite: {
            ssr: { noExternal: ["groove-site-kit"] },
            optimizeDeps: { exclude: ["groove-site-kit"] },
          },
        });

        if (command === "build") {
          // Throws on any failure, which fails the build. Stale legal text must never ship silently.
          const data = await getSiteData();
          logger.info(`Site data loaded for ${data.client.name} (consent ${data.consent.version}).`);
        } else if (command === "dev") {
          try {
            await getSiteData();
          } catch (err) {
            logger.warn(err instanceof Error ? err.message : String(err));
          }
        }
      },

      "astro:config:done": ({ config }) => {
        site = config.site;
      },

      "astro:build:done": async ({ pages, dir, logger }) => {
        const token = env.SITE_TOKEN;
        if (!token) {
          logger.info("SITE_TOKEN not set, skipping page registration.");
          return;
        }
        if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") {
          logger.info(`Vercel ${env.VERCEL_ENV} build, skipping page registration.`);
          return;
        }
        const siteUrl = resolveSiteUrl(opts.siteUrl, site, env);
        if (!siteUrl) {
          logger.warn("Page registration skipped: no site URL. Set `site` in astro.config or SITE_URL.");
          return;
        }
        try {
          const list = await collectPages({ pages, dir, mode, warn: (m) => logger.warn(m) });
          const { portalUrl, clientSlug } = resolveSiteConfig();
          const { registered } = await registerPages({ portalUrl, clientSlug, token, siteUrl, pages: list });
          logger.info(`Registered ${registered} page(s) with the portal for ${siteUrl}.`);
        } catch (err) {
          logger.warn(`Page registration failed (${err instanceof Error ? err.message : String(err)}). The site built fine; leads and events for new pages may not attach until the next successful build.`);
        }
      },
    },
  };
  return integration;
}

/**
 * @param {string | undefined} explicit
 * @param {string | undefined} site
 * @param {Record<string, string | undefined>} env
 */
function resolveSiteUrl(explicit, site, env) {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL;
  const url = explicit || site || env.SITE_URL || (host ? `https://${host}` : "");
  return url.replace(/\/+$/, "");
}
