// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadForm, type LeadFormProps } from "../src/lead-form/LeadForm";
import { SITE, jsonResponse } from "./fixtures";

const STEPS = [
  { id: "system_age", question: "How old is your system?", options: ["Under 10 years", "10 to 15 years", "15+ years"] },
  { id: "timeline", question: "When do you need it?", options: ["ASAP", "This month"] },
];

const BASE: LeadFormProps = {
  page: "independent",
  steps: STEPS,
  business: SITE.client.name,
  phoneDisplay: SITE.client.phoneDisplay,
  callE164: "+16233433189",
  callDisplay: "(623) 343-3189",
  intakeUrl: SITE.intake.url,
  intakeKey: SITE.intake.key,
  consentText: SITE.consent.text,
  consentVersion: SITE.consent.version,
};

let groove: { visitorId: string; sessionId: string; attribution: () => Record<string, unknown>; track: ReturnType<typeof vi.fn>; pixel: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  groove = {
    visitorId: "vid_123",
    sessionId: "sid_456",
    attribution: () => ({ utm_source: "facebook", fbclid: "abc", landing_url: "https://go.ashcooling.com/independent", referrer: "", session_id: "sid_456" }),
    track: vi.fn(),
    pixel: vi.fn(),
    flush: vi.fn(),
  };
  (window as unknown as { groove: typeof groove }).groove = groove;
  // The portal echoes the browser's leadEventId.
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    return jsonResponse({ ok: true, leadEventId: body.leadEventId, call: { when: "later", at: "2026-10-18T15:00:00Z", display: "tomorrow at 8 AM" } });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  delete (window as { groove?: unknown }).groove;
});

async function walkToContact(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /15\+ years/ }));
  await user.click(screen.getByRole("button", { name: /ASAP/ }));
}

async function fillContact(user: ReturnType<typeof userEvent.setup>, opts: { consent?: boolean; email?: string } = {}) {
  await user.type(screen.getByLabelText("First name"), "Jamie");
  await user.type(screen.getByLabelText("Mobile phone"), "480-555-0142");
  await user.type(screen.getByLabelText("Zip code"), "85201");
  if (opts.email) await user.type(screen.getByLabelText(/Email/), opts.email);
  if (opts.consent) await user.click(screen.getByRole("checkbox", { name: /By checking this box/ }));
}

describe("LeadForm", () => {
  it("posts the intake payload with consent, attribution, visitor id and a leadEventId", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} />);
    await walkToContact(user);
    await fillContact(user, { consent: true, email: "Jamie@Example.com " });
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));

    await screen.findByText("Got it, Jamie.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(SITE.intake.url);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json", "x-intake-key": SITE.intake.key });
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      first: "Jamie",
      phone: "+14805550142",
      zip: "85201",
      email: "jamie@example.com",
      answers: { system_age: "15+ years", timeline: "ASAP" },
      consent: { checked: true, text: SITE.consent.text, version: SITE.consent.version },
      page: "independent",
      visitorId: "vid_123",
      attribution: groove.attribution(),
      leadEventId: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
    });
    expect(body).not.toHaveProperty("website");
  });

  it("fires the pixel Lead with eventID equal to the leadEventId sent to the portal", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} />);
    await walkToContact(user);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    await screen.findByText("Got it, Jamie.");

    const sent = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(groove.pixel).toHaveBeenCalledWith("Lead", { content_name: "independent" }, sent.leadEventId);
  });

  it("sends the consent text with checked false when the box is left unchecked", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} />);
    await walkToContact(user);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    await screen.findByText("Got it, Jamie.");
    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.consent).toEqual({ checked: false, text: SITE.consent.text, version: SITE.consent.version });
  });

  it("tracks form_start, form_step and form_submit with no PII", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} />);
    await walkToContact(user);
    await fillContact(user, { email: "jamie@example.com" });
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    await screen.findByText("Got it, Jamie.");

    const names = groove.track.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["form_start", "form_step", "form_step", "form_submit"]);
    const props = JSON.stringify(groove.track.mock.calls);
    expect(props).not.toMatch(/Jamie|jamie@|4805550142|85201/);
    expect(groove.flush).toHaveBeenCalled();
  });

  it("shows call timing from the portal on the thank-you screen", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} />);
    await walkToContact(user);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    expect(await screen.findByText(/We're closed right now, so we'll call you tomorrow at 8 AM from \(602\) 806-9897/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Call \(623\) 343-3189/ }).getAttribute("href")).toBe("tel:+16233433189");
  });

  it("honeypot: a filled hidden field fakes success and sends nothing", async () => {
    const user = userEvent.setup();
    const { container } = render(<LeadForm {...BASE} steps={[]} />);
    await fillContact(user);
    const hp = container.querySelector<HTMLInputElement>('input[name="website"]')!;
    expect(hp.closest("[aria-hidden='true']")).toBeTruthy();
    expect(hp.tabIndex).toBe(-1);
    hp.value = "http://spam.example";
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    await screen.findByText("Got it, Jamie.");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(groove.pixel).not.toHaveBeenCalled();
  });

  it("blocks submit and focuses the first invalid field", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} steps={[]} />);
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByLabelText("First name"));
    expect(screen.getByText("What should we call you?")).toBeTruthy();
    expect(screen.getByLabelText("First name").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows an error with the call number and reuses the leadEventId on retry", async () => {
    fetchMock.mockImplementationOnce(async () => jsonResponse({ ok: false, error: "slow down" }, 429));
    const user = userEvent.setup();
    render(<LeadForm {...BASE} steps={[]} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/\(623\) 343-3189/);
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    await screen.findByText("Got it, Jamie.");
    const ids = fetchMock.mock.calls.map((c) => JSON.parse(String((c as [string, RequestInit])[1].body)).leadEventId);
    expect(ids[0]).toBe(ids[1]);
  });

  it("preview mode (no intake key) walks through without posting", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} intakeKey={null} steps={[]} />);
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Get my free estimate" }));
    await screen.findByText("Preview only. No lead was created.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("applies copy overrides", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementationOnce(async (_u: string, init: RequestInit) => jsonResponse({ ok: true, leadEventId: JSON.parse(String(init.body)).leadEventId, call: { when: "now" } }));
    render(<LeadForm {...BASE} steps={[]} title="Beat my quote" submitLabel="Send it" thanks={{ heading: "Thanks {first}!", now: "{business} is calling you now." }} />);
    expect(screen.getByText("Beat my quote")).toBeTruthy();
    await fillContact(user);
    await user.click(screen.getByRole("button", { name: "Send it" }));
    await screen.findByText("Thanks Jamie!");
    expect(screen.getByText("Ash Cooling & Heating is calling you now.")).toBeTruthy();
  });

  it("links consent to the SMS terms and privacy pages", async () => {
    render(<LeadForm {...BASE} steps={[]} />);
    await waitFor(() => screen.getByText(SITE.consent.text));
    expect(screen.getByRole("link", { name: "SMS terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});

describe("LeadForm headings", () => {
  it("titles the form with an h2 so heading levels don't skip", () => {
    render(<LeadForm {...BASE} />);
    expect(screen.getByRole("heading", { level: 2, name: BASE.title ?? "Get your free estimate" })).toBeTruthy();
  });
});
