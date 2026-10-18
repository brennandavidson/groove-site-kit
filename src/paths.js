// Path rules shared by components (page slug for tracking) and the integration (page registration).

/** Where the kit's legal pages live. Forms and footers link here. */
export const LEGAL_PATHS = Object.freeze({
  privacy: "/privacy",
  terms: "/terms",
  smsOptIn: "/sms-opt-in",
});

/** Routes never registered with the portal. */
const EXCLUDED = new Set(["/404", "/500", "/privacy", "/terms", "/sms-terms", "/sms-opt-in"]);

/** "go/independent/" -> "/go/independent", "" -> "/" */
export function normalizePath(pathname) {
  const p = ("/" + String(pathname || "")).replace(/\/+/g, "/").replace(/\/index\.html$|\.html$/, "").replace(/\/$/, "");
  return p || "/";
}

/** Page slug = last path segment, "home" for "/". */
export function slugFromPath(pathname) {
  const p = normalizePath(pathname);
  if (p === "/") return "home";
  return decodeURIComponent(p.slice(p.lastIndexOf("/") + 1)).toLowerCase();
}

/** Legal, opt-in, error pages, API routes and non-HTML files (robots.txt, sitemap.xml) are not pages. */
export function isExcludedPath(pathname) {
  const p = normalizePath(pathname);
  if (EXCLUDED.has(p)) return true;
  if (p === "/api" || p.startsWith("/api/")) return true;
  return /\.[a-z0-9]+$/i.test(p);
}

/** "campaign" for routes under /go/ or anything in a campaign-only project, else "site". */
export function pageKind(pathname, mode = "full") {
  const p = normalizePath(pathname);
  return mode === "campaign" || p === "/go" || p.startsWith("/go/") ? "campaign" : "site";
}
