import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import grooveSiteKit from "../src/integration.js";
import { collectPages, registerPages, titleFromHtml } from "../src/register.js";
import { clearSiteDataCache } from "../src/site-data.js";
import { PORTAL, jsonResponse, sitesFetch } from "./fixtures";

let dir: string;

async function page(path: string, title: string) {
  const file = path === "/" ? join(dir, "index.html") : join(dir, path, "index.html");
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, `<!doctype html><html><head><title>${title}</title></head><body></body></html>`);
}

const BUILT = ["", "go/independent/", "services/ac-repair/", "privacy/", "terms/", "sms-opt-in/", "404/", "api/ping", "robots.txt"];

beforeEach(async () => {
  clearSiteDataCache();
  dir = await mkdtemp(join(tmpdir(), "gsk-"));
  await page("/", "Ash Cooling &amp; Heating | Mesa AC");
  await page("/go/independent", "Independent HVAC");
  await page("/services/ac-repair", "AC Repair");
  for (const p of ["/privacy", "/terms", "/sms-opt-in", "/404"]) await page(p, "legal");
  await writeFile(join(dir, "robots.txt"), "User-agent: *");
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
  clearSiteDataCache();
});

describe("collectPages", () => {
  it("registers built pages and skips legal, opt-in, 404, api and files", async () => {
    const pages = await collectPages({ pages: BUILT.map((pathname) => ({ pathname })), dir: pathToFileURL(dir + "/") });
    expect(pages).toEqual([
      { slug: "home", title: "Ash Cooling & Heating | Mesa AC", path: "/", kind: "site" },
      { slug: "independent", title: "Independent HVAC", path: "/go/independent", kind: "campaign" },
      { slug: "ac-repair", title: "AC Repair", path: "/services/ac-repair", kind: "site" },
    ]);
  });

  it("marks every page campaign in campaign mode", async () => {
    const pages = await collectPages({ pages: [{ pathname: "" }, { pathname: "services/ac-repair/" }], dir, mode: "campaign" });
    expect(pages.map((p) => p.kind)).toEqual(["campaign", "campaign"]);
  });

  it("warns on slug collisions and keeps the first", async () => {
    await page("/areas/ac-repair", "Dup");
    const warn = vi.fn();
    const pages = await collectPages({ pages: [{ pathname: "services/ac-repair/" }, { pathname: "areas/ac-repair/" }], dir, warn });
    expect(pages).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/share the slug "ac-repair"/));
  });

  it("decodes entities in titles", () => {
    expect(titleFromHtml("<title>A &amp; B &#39;C&#39; caf&#xe9;</title>")).toBe("A & B 'C' caf" + String.fromCharCode(0xe9));
  });
});

describe("registerPages", () => {
  it("posts the contract payload with the bearer token", async () => {
    const f = vi.fn(async (..._args: unknown[]) => jsonResponse({ ok: true, registered: 1 }));
    const pages = [{ slug: "independent", title: "Independent", path: "/independent", kind: "campaign" as const }];
    const out = await registerPages({ portalUrl: PORTAL, clientSlug: "ash-cooling", token: "tok_secret", siteUrl: "https://go.ashcooling.com", pages, fetch: f as unknown as typeof fetch });
    expect(out).toEqual({ registered: 1 });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${PORTAL}/api/sites/ash-cooling/pages`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", authorization: "Bearer tok_secret" });
    expect(JSON.parse(String(init.body))).toEqual({ siteUrl: "https://go.ashcooling.com", pages });
  });

  it("throws on a non-ok response without leaking the token", async () => {
    const f = vi.fn(async () => jsonResponse({ ok: false, error: "bad token" }, 401));
    const err = await registerPages({ portalUrl: PORTAL, clientSlug: "ash-cooling", token: "tok_secret", siteUrl: "https://x.test", pages: [], fetch: f as unknown as typeof fetch }).catch((e: Error) => e);
    expect(String(err)).toMatch(/HTTP 401: bad token/);
    expect(String(err)).not.toContain("tok_secret");
  });
});

describe("integration", () => {
  type Hooks = Record<string, (arg: any) => Promise<void> | void>;
  const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), fork: vi.fn() });

  async function setup(env: Record<string, string>, fetchImpl: unknown, command: "build" | "dev" = "build") {
    vi.stubEnv("PORTAL_URL", PORTAL);
    vi.stubEnv("CLIENT_SLUG", "ash-cooling");
    vi.stubEnv("SITE_TOKEN", "");
    vi.stubEnv("VERCEL_ENV", "");
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    vi.stubGlobal("fetch", fetchImpl);
    const hooks = grooveSiteKit().hooks as Hooks;
    const log = logger();
    const updateConfig = vi.fn();
    await hooks["astro:config:setup"]!({ config: { root: pathToFileURL(dir + "/") }, command, updateConfig, logger: log });
    await hooks["astro:config:done"]!({ config: { site: "https://go.ashcooling.com/" } });
    return { hooks, log, updateConfig };
  }

  const done = (hooks: Hooks, log: ReturnType<typeof logger>) =>
    hooks["astro:build:done"]!({ pages: BUILT.map((pathname) => ({ pathname })), dir: pathToFileURL(dir + "/"), assets: new Map(), logger: log });

  it("compiles the kit in the consumer (ssr.noExternal)", async () => {
    const { updateConfig } = await setup({}, sitesFetch());
    expect(updateConfig).toHaveBeenCalledWith({ vite: expect.objectContaining({ ssr: { noExternal: ["groove-site-kit"] } }) });
  });

  it("fails the build when site data cannot load", async () => {
    await expect(setup({}, async () => jsonResponse({}, 404))).rejects.toThrow(/Unknown client slug/);
  });

  it("only warns in dev when site data cannot load", async () => {
    const { log } = await setup({}, async () => jsonResponse({}, 404), "dev");
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/Unknown client slug/));
  });

  it("skips registration without SITE_TOKEN", async () => {
    const f = vi.fn(sitesFetch());
    const { hooks, log } = await setup({}, f);
    f.mockClear();
    await done(hooks, log);
    expect(f).not.toHaveBeenCalled();
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/SITE_TOKEN not set/));
  });

  it("registers pages after the build when SITE_TOKEN is set", async () => {
    const calls: [string, RequestInit][] = [];
    const f = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([String(input), init ?? {}]);
      if (String(input).endsWith("/pages")) return jsonResponse({ ok: true, registered: 3 });
      return sitesFetch()(input);
    };
    const { hooks, log } = await setup({ SITE_TOKEN: "tok_secret" }, f);
    await done(hooks, log);
    const reg = calls.find(([u]) => u.endsWith("/pages"))!;
    expect(reg[0]).toBe(`${PORTAL}/api/sites/ash-cooling/pages`);
    expect((reg[1].headers as Record<string, string>).authorization).toBe("Bearer tok_secret");
    const body = JSON.parse(String(reg[1].body));
    expect(body.siteUrl).toBe("https://go.ashcooling.com");
    expect(body.pages.map((p: { slug: string }) => p.slug)).toEqual(["home", "independent", "ac-repair"]);
    expect(log.info).toHaveBeenCalledWith(expect.stringMatching(/Registered 3 page/));
  });

  it("warns, does not fail, when registration fails", async () => {
    const f = async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/pages")) throw new TypeError("fetch failed");
      return sitesFetch()(input);
    };
    const { hooks, log } = await setup({ SITE_TOKEN: "tok_secret" }, f);
    await expect(done(hooks, log)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalledWith(expect.stringMatching(/Page registration failed \(fetch failed\)/));
    expect(JSON.stringify(log.warn.mock.calls)).not.toContain("tok_secret");
  });

  it("skips registration on Vercel preview builds", async () => {
    const f = vi.fn(sitesFetch());
    const { hooks, log } = await setup({ SITE_TOKEN: "tok_secret", VERCEL_ENV: "preview" }, f);
    f.mockClear();
    await done(hooks, log);
    expect(f).not.toHaveBeenCalled();
  });
});
