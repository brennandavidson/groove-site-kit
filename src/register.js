// Page registration: tells the portal which pages this site has so leads, events and numbers attach to them.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { isExcludedPath, normalizePath, pageKind, slugFromPath } from "./paths.js";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** @param {string} s */
function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[/** @type {keyof typeof ENTITIES} */ (e.toLowerCase())] ?? m;
  });
}

/** @param {string} html */
export function titleFromHtml(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decodeEntities(m[1]).replace(/\s+/g, " ").trim() : "";
}

/** @param {string} dir @param {string} path */
async function readHtml(dir, path) {
  const candidates = path === "/" ? ["index.html"] : [join(path, "index.html"), `${path}.html`];
  for (const c of candidates) {
    try {
      return await readFile(join(dir, c), "utf8");
    } catch {}
  }
  return null;
}

/**
 * Built routes -> pages to register. Skips legal, opt-in, error, API and non-HTML routes.
 * @param {{ pages: { pathname: string }[], dir: URL | string, mode?: "campaign" | "full", warn?: (msg: string) => void }} input
 * @returns {Promise<import("./register").RegisteredPage[]>}
 */
export async function collectPages({ pages, dir, mode = "full", warn = () => {} }) {
  const root = typeof dir === "string" ? dir : fileURLToPath(dir);
  /** @type {Map<string, import("./register").RegisteredPage>} */
  const bySlug = new Map();
  const paths = [...new Set(pages.map((p) => normalizePath(p.pathname)))].sort();
  for (const path of paths) {
    if (isExcludedPath(path)) continue;
    const html = await readHtml(root, path);
    if (html == null) continue;
    const slug = slugFromPath(path);
    const prev = bySlug.get(slug);
    if (prev) {
      warn(`Pages ${prev.path} and ${path} share the slug "${slug}". Only ${prev.path} is registered. Rename one.`);
      continue;
    }
    bySlug.set(slug, { slug, title: titleFromHtml(html) || slug, path, kind: pageKind(path, mode) });
  }
  return [...bySlug.values()];
}

/**
 * POST {portalUrl}/api/sites/{slug}/pages. Throws on any failure; the caller decides to warn.
 * @param {{ portalUrl: string, clientSlug: string, token: string, siteUrl: string, pages: import("./register").RegisteredPage[], fetch?: typeof fetch }} input
 */
export async function registerPages({ portalUrl, clientSlug, token, siteUrl, pages, fetch: f = fetch }) {
  const url = `${portalUrl.replace(/\/+$/, "")}/api/sites/${encodeURIComponent(clientSlug)}/pages`;
  const res = await f(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ siteUrl, pages }),
    signal: AbortSignal.timeout(15000),
  });
  const body = /** @type {any} */ (await res.json().catch(() => null));
  if (!res.ok || !body?.ok) {
    const detail = body && typeof body.error === "string" ? `: ${body.error}` : "";
    throw new Error(`portal returned HTTP ${res.status}${detail}`);
  }
  return { registered: typeof body.registered === "number" ? body.registered : pages.length };
}
