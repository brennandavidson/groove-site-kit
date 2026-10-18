// Build-time site data loader. Plain JS so astro.config can import it without a build step.
// Types live in site-data.d.ts.

const CACHE_KEY = Symbol.for("groove-site-kit.site-data");
const TIMEOUT_MS = 15000;

/** @returns {Map<string, Promise<import("./site-data").SiteData>>} */
function cache() {
  const g = /** @type {any} */ (globalThis);
  // Shared across module instances: the integration and Vite SSR each load their own copy of this file.
  return (g[CACHE_KEY] ??= new Map());
}

export function clearSiteDataCache() {
  cache().clear();
}

/** @param {{ portalUrl?: string, clientSlug?: string }} [opts] */
export function resolveSiteConfig(opts = {}) {
  const env = typeof process !== "undefined" ? process.env : {};
  const portalUrl = (opts.portalUrl || env.PORTAL_URL || "").trim().replace(/\/+$/, "");
  const clientSlug = (opts.clientSlug || env.CLIENT_SLUG || "").trim();
  if (!portalUrl) throw new Error("[groove-site-kit] PORTAL_URL is not set. Add it to the site's env (e.g. https://app.designgroove.io).");
  if (!clientSlug) throw new Error("[groove-site-kit] CLIENT_SLUG is not set. Add it to the site's env (e.g. ash-cooling).");
  return { portalUrl, clientSlug };
}

/** @param {import("./site-data").SiteDataOptions} [opts] */
export function getSiteData(opts = {}) {
  const { portalUrl, clientSlug } = resolveSiteConfig(opts);
  const url = `${portalUrl}/api/sites/${encodeURIComponent(clientSlug)}`;
  const c = cache();
  if (!opts.fresh && c.has(url)) return /** @type {Promise<any>} */ (c.get(url));
  const p = load(url, clientSlug, opts.fetch ?? fetch);
  c.set(url, p);
  // Never cache a failure: the next call tries again.
  p.catch(() => c.delete(url));
  return p;
}

/**
 * @param {string} url
 * @param {string} slug
 * @param {typeof fetch} f
 */
async function load(url, slug, f) {
  let res;
  let lastErr;
  // One retry for network blips and 5xx. A 404 or a bad payload fails immediately.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      res = await f(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status < 500) break;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
      res = undefined;
    }
  }
  if (!res || res.status >= 500) {
    const why = lastErr instanceof Error ? lastErr.message : String(lastErr);
    throw new Error(`[groove-site-kit] Could not load site data from ${url} (${why}). Refusing to build with stale or missing legal text.`);
  }
  if (res.status === 404) throw new Error(`[groove-site-kit] Unknown client slug "${slug}" at ${url} (404). Check CLIENT_SLUG.`);
  if (!res.ok) throw new Error(`[groove-site-kit] Site data request failed: ${url} returned HTTP ${res.status}.`);
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`[groove-site-kit] Site data from ${url} is not valid JSON.`);
  }
  return parseSiteData(body);
}

/** @param {unknown} input */
export function parseSiteData(input) {
  const d = /** @type {any} */ (input);
  /** @param {boolean} ok @param {string} what */
  const need = (ok, what) => {
    if (!ok) throw new Error(`[groove-site-kit] Site data is missing or has a bad ${what}.`);
  };
  const str = (/** @type {unknown} */ v) => typeof v === "string" && v.length > 0;
  const strOrNull = (/** @type {unknown} */ v) => v == null || typeof v === "string";
  need(d && typeof d === "object", "body");
  need(d.v === 1, `contract version (got ${JSON.stringify(d.v)}, kit supports 1)`);
  const c = d.client;
  need(c && str(c.slug) && str(c.name), "client.slug / client.name");
  for (const k of ["legalName", "city", "state", "phoneDisplay", "phoneE164"]) need(strOrNull(c[k]), `client.${k}`);
  need(d.intake && str(d.intake.url) && strOrNull(d.intake.key), "intake");
  need(d.beacon && str(d.beacon.url), "beacon.url");
  need(strOrNull(d.pixelId), "pixelId");
  need(d.consent && str(d.consent.text) && str(d.consent.version), "consent");
  const mc = d.marketingConsent;
  need(mc == null || (str(mc.text) && str(mc.version)), "marketingConsent");
  const numbers = d.numbers ?? {};
  need(typeof numbers === "object" && !Array.isArray(numbers), "numbers");
  for (const [k, n] of Object.entries(numbers)) need(n && str(/** @type {any} */ (n).e164) && str(/** @type {any} */ (n).display), `numbers.${k}`);
  const r = d.reviews;
  need(r == null || (typeof r.rating === "number" && typeof r.count === "number"), "reviews");
  return {
    v: 1,
    client: {
      slug: c.slug,
      name: c.name,
      legalName: c.legalName ?? null,
      city: c.city ?? null,
      state: c.state ?? null,
      phoneDisplay: c.phoneDisplay ?? null,
      phoneE164: c.phoneE164 ?? null,
    },
    intake: { url: d.intake.url, key: d.intake.key ?? null },
    beacon: { url: d.beacon.url },
    pixelId: d.pixelId ?? null,
    numbers,
    consent: { version: d.consent.version, text: d.consent.text },
    marketingConsent: mc ? { version: mc.version, text: mc.text } : null,
    reviews: r ? { rating: r.rating, count: r.count, source: r.source ?? "Google" } : null,
  };
}
