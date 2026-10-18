// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { trackerScript } from "../src/tracker";

type Beacon = { url: string; body: Record<string, any>; type: string };

let beacons: Beacon[];
let pending: Promise<void>[];

function boot(pixelId: string | null = "1787874271848321") {
  new Function(trackerScript({ endpoint: "https://portal.test/api/t", client: "ash-cooling", page: "independent", pixelId }))();
}

async function flushed(): Promise<Beacon[]> {
  window.groove!.flush();
  await Promise.all(pending);
  // Listeners from earlier boots stay on document; keep only this boot's session.
  return beacons.filter((b) => b.body.sid === window.groove!.sessionId);
}

beforeEach(() => {
  beacons = [];
  pending = [];
  delete (window as { groove?: unknown }).groove;
  delete (window as { fbq?: unknown }).fbq;
  document.cookie.split(";").forEach((c) => (document.cookie = c.split("=")[0] + "=;max-age=0;path=/"));
  sessionStorage.clear();
  // The pixel snippet inserts itself before the first script, as on a real page.
  if (!document.querySelector("script")) document.head.appendChild(document.createElement("script"));
  window.history.replaceState(null, "", "/independent?utm_source=facebook&utm_campaign=fall&fbclid=fb123&email=jamie%40example.com&phone=4805550142");
  Object.defineProperty(navigator, "sendBeacon", {
    configurable: true,
    value: (url: string, blob: Blob) => {
      pending.push(blob.text().then((t) => void beacons.push({ url, body: JSON.parse(t), type: blob.type })));
      return true;
    },
  });
});
afterEach(() => vi.useRealTimers());

describe("tracker", () => {
  it("sends the contract beacon as text/plain (no CORS preflight)", async () => {
    boot();
    const [b] = await flushed();
    expect(b!.url).toBe("https://portal.test/api/t");
    expect(b!.type).toMatch(/^text\/plain/);
    expect(b!.body).toMatchObject({ v: 1, t: "ash-cooling", pg: "independent", path: "/independent" });
    expect(b!.body.vid).toBe(window.groove!.visitorId);
    expect(b!.body.sid).toBe(window.groove!.sessionId);
    expect(b!.body.ev[0]).toMatchObject({ n: "page_view", p: { event_id: expect.stringMatching(/^pv\./) } });
  });

  it("captures ad attribution and strips everything else from the landing URL", async () => {
    boot();
    const a = window.groove!.attribution();
    expect(a).toMatchObject({ utm_source: "facebook", utm_campaign: "fall", fbclid: "fb123", session_id: window.groove!.sessionId });
    expect(a.landing_url).toBe("http://localhost:3000/independent?utm_source=facebook&utm_campaign=fall&fbclid=fb123");
    expect(document.cookie).toMatch(/_fbc=fb\.1\.\d+\.fb123/);
  });

  it("never puts PII in the beacon", async () => {
    boot();
    window.groove!.track("form_step", { form: "independent", step: 2, first: "Jamie", phone: "4805550142", email: "jamie@example.com", zip: "85201", note: "me@x.com", last_name: "Lee", address: "1 Main" });
    const sent = await flushed();
    const all = JSON.stringify(sent);
    for (const pii of ["Jamie", "4805550142", "jamie@example.com", "jamie%40example.com", "85201", "me@x.com", "Lee", "1 Main"]) expect(all).not.toContain(pii);
    const step = sent.flatMap((b) => b.body.ev).find((e: any) => e.n === "form_step");
    expect(step.p).toEqual({ form: "independent", step: 2 });
  });

  it("fires pixel Lead with the given eventID for CAPI dedupe", () => {
    boot();
    window.groove!.pixel("Lead", { content_name: "independent" }, "lead-evt-123");
    const queue = (window as unknown as { fbq: { queue: unknown[][] } }).fbq.queue.map((args) => Array.from(args));
    expect(queue).toContainEqual(["init", "1787874271848321"]);
    expect(queue).toContainEqual(["track", "Lead", { content_name: "independent" }, { eventID: "lead-evt-123" }]);
    expect(queue.find((q) => q[1] === "PageView")).toBeTruthy();
  });

  it("skips the pixel without a pixel id", () => {
    boot(null);
    expect((window as { fbq?: unknown }).fbq).toBeUndefined();
  });

  it("logs call_click for tel: links", async () => {
    boot();
    const a = document.createElement("a");
    a.href = "tel:+16233433189";
    a.setAttribute("data-track", "call");
    a.addEventListener("click", (e) => e.preventDefault());
    document.body.appendChild(a);
    a.click();
    const ev = (await flushed()).flatMap((b) => b.body.ev);
    expect(ev.find((e: any) => e.n === "call_click").p).toEqual({ id: "call" });
  });
});
