import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearSiteDataCache, getSiteData, parseSiteData } from "../src/site-data.js";
import { PORTAL, SITE, jsonResponse, sitesFetch } from "./fixtures";

beforeEach(() => {
  clearSiteDataCache();
  vi.stubEnv("PORTAL_URL", PORTAL + "/");
  vi.stubEnv("CLIENT_SLUG", "ash-cooling");
});
afterEach(() => clearSiteDataCache());

describe("getSiteData", () => {
  it("loads and types site data from PORTAL_URL + CLIENT_SLUG", async () => {
    const f = vi.fn(sitesFetch());
    const data = await getSiteData({ fetch: f as typeof fetch });
    expect(f).toHaveBeenCalledWith(`${PORTAL}/api/sites/ash-cooling`, expect.objectContaining({ headers: { accept: "application/json" } }));
    expect(data).toEqual(SITE);
  });

  it("caches per process", async () => {
    const f = vi.fn(sitesFetch());
    await getSiteData({ fetch: f as typeof fetch });
    await getSiteData({ fetch: f as typeof fetch });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("throws a clear error on an unknown slug (404)", async () => {
    const f = vi.fn(async () => jsonResponse({ error: "not found" }, 404));
    await expect(getSiteData({ fetch: f as typeof fetch })).rejects.toThrow(/Unknown client slug "ash-cooling".*404/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("throws when the portal is unreachable, after one retry", async () => {
    const f = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(getSiteData({ fetch: f as typeof fetch })).rejects.toThrow(/Could not load site data.*fetch failed.*stale or missing legal text/);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does not cache failures", async () => {
    const f = vi.fn().mockRejectedValueOnce(new TypeError("down")).mockRejectedValueOnce(new TypeError("down")).mockImplementation(sitesFetch());
    await expect(getSiteData({ fetch: f as typeof fetch })).rejects.toThrow();
    await expect(getSiteData({ fetch: f as typeof fetch })).resolves.toEqual(SITE);
  });

  it("throws when env is missing", async () => {
    vi.stubEnv("PORTAL_URL", "");
    await expect(async () => getSiteData()).rejects.toThrow(/PORTAL_URL is not set/);
  });

  it("rejects a payload from an unsupported contract version", () => {
    expect(() => parseSiteData({ ...SITE, v: 2 })).toThrow(/contract version/);
  });

  it("rejects a payload without consent text", () => {
    expect(() => parseSiteData({ ...SITE, consent: { version: "x", text: "" } })).toThrow(/consent/);
  });

  it("accepts the documented nulls", () => {
    const d = parseSiteData({
      ...SITE,
      client: { ...SITE.client, legalName: null, city: null, state: null, phoneDisplay: null, phoneE164: null },
      intake: { url: SITE.intake.url, key: null },
      pixelId: null,
      reviews: null,
      numbers: {},
    });
    expect(d.client.legalName).toBeNull();
    expect(d.reviews).toBeNull();
  });
});
