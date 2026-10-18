// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadForm, type LeadFormProps } from "../src/lead-form/LeadForm";
import { buildFieldsPayload, resolveFields, splitFullName, validateFields, type FormField } from "../src/lead-form/logic";
import { SITE, jsonResponse } from "./fixtures";

// Ash's beat-your-quote form, field for field.
const FIELDS: FormField[] = [
  { type: "fullName", placeholder: "Full Name *" },
  { type: "phone", placeholder: "Your Phone Number *" },
  { type: "address", placeholder: "Your Address *", label: "Address" },
  { type: "zip", placeholder: "Zip Code *" },
  { type: "select", placeholder: "Who Gave You Your Quote?", options: ["One of the big companies", "I'm not sure", "Other"] },
];

const BASE: LeadFormProps = {
  page: "beat-your-quote",
  layout: "single",
  fields: FIELDS,
  labels: "hidden",
  business: SITE.client.name,
  phoneDisplay: SITE.client.phoneDisplay,
  callE164: "+16029051450",
  callDisplay: "(602) 905-1450",
  intakeUrl: SITE.intake.url,
  intakeKey: SITE.intake.key,
  consentText: SITE.consent.text,
  consentVersion: SITE.consent.version,
  title: "SEND US YOUR QUOTE",
  subtitle: "We'll beat it in 24 hours",
  submitLabel: "GET MY BETTER PRICE →",
  reassurance: "We'll get back to you within 24 hours",
  reassuranceIcon: "⚡",
  thanks: { heading: "Quote Received!", message: "We'll review your quote and get back to you within 24 hours with a better price.", icon: "badge", callCta: "" },
};

let groove: { visitorId: string; sessionId: string; attribution: () => Record<string, unknown>; track: ReturnType<typeof vi.fn>; pixel: ReturnType<typeof vi.fn>; flush: ReturnType<typeof vi.fn> };
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  groove = {
    visitorId: "vid_123",
    sessionId: "sid_456",
    attribution: () => ({ utm_source: "facebook", landing_url: "https://go.ashcooling.com/beat-your-quote" }),
    track: vi.fn(),
    pixel: vi.fn(),
    flush: vi.fn(),
  };
  (window as unknown as { groove: typeof groove }).groove = groove;
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => jsonResponse({ ok: true, leadEventId: JSON.parse(String(init.body)).leadEventId, call: { when: "now" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  delete (window as { groove?: unknown }).groove;
});

async function fill(user: ReturnType<typeof userEvent.setup>, opts: { consent?: boolean; select?: string } = {}) {
  await user.type(screen.getByPlaceholderText("Full Name *"), "Mary Ann Lopez");
  await user.type(screen.getByPlaceholderText("Your Phone Number *"), "480-555-0142");
  await user.type(screen.getByPlaceholderText("Your Address *"), "123 E Main St, Mesa");
  await user.type(screen.getByPlaceholderText("Zip Code *"), "85201");
  if (opts.select) await user.selectOptions(screen.getByRole("combobox"), opts.select);
  if (opts.consent) await user.click(screen.getByRole("checkbox"));
}

const submitButton = () => screen.getByRole("button", { name: "GET MY BETTER PRICE →" });
const sentBody = (i = 0) => JSON.parse(String((fetchMock.mock.calls[i] as [string, RequestInit])[1].body));

describe("LeadForm layout=single", () => {
  it("renders every field on one card in order, with exact placeholders and no steps", () => {
    const { container } = render(<LeadForm {...BASE} />);
    const root = container.querySelector("section")!;
    expect(root.getAttribute("data-layout")).toBe("single");
    expect(container.querySelector(".gsk-progress")).toBeNull();
    const placeholders = [...container.querySelectorAll<HTMLInputElement>(".gsk-single-input")].map((i) => i.placeholder);
    expect(placeholders).toEqual(["Full Name *", "Your Phone Number *", "Your Address *", "Zip Code *"]);
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toEqual(["Who Gave You Your Quote?", "One of the big companies", "I'm not sure", "Other"]);
    expect(select.value).toBe("");
    expect(select.options[0]!.disabled).toBe(true);
    expect(select.hasAttribute("data-empty")).toBe(true);
    const order = [...container.querySelectorAll(".gsk-single-field, .gsk-single-consent, .gsk-single-submit, .gsk-single-note")].map((el) => el.className.split(" ").pop());
    expect(order).toEqual(["gsk-single-field-fullName", "gsk-single-field-phone", "gsk-single-field-address", "gsk-single-field-zip", "gsk-single-field-select", "gsk-single-consent", "gsk-single-submit", "gsk-single-note"]);
    expect(screen.getByRole("heading", { level: 2, name: "SEND US YOUR QUOTE" })).toBeTruthy();
    expect(screen.getByText("We'll get back to you within 24 hours").textContent).toContain("⚡");
  });

  it("keeps labels for screen readers when labels are hidden", () => {
    render(<LeadForm {...BASE} />);
    expect(screen.getByLabelText("Full name").getAttribute("placeholder")).toBe("Full Name *");
    expect(screen.getByLabelText("Address")).toBeTruthy();
    expect(screen.getByLabelText("Who Gave You Your Quote?").tagName).toBe("SELECT");
    expect(screen.getByText("Full name").className).toContain("gsk-visually-hidden");
  });

  it("posts first/last from the full name, address and dropdown answers keyed by label, consent and ids", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} />);
    await fill(user, { consent: true, select: "I'm not sure" });
    expect(screen.getByRole("combobox").hasAttribute("data-empty")).toBe(false);
    await user.click(submitButton());
    await screen.findByText("Quote Received!");

    const body = sentBody();
    expect(body).toEqual({
      first: "Mary",
      last: "Ann Lopez",
      phone: "+14805550142",
      zip: "85201",
      answers: { Address: "123 E Main St, Mesa", "Who Gave You Your Quote?": "I'm not sure" },
      consent: { checked: true, text: SITE.consent.text, version: SITE.consent.version },
      page: "beat-your-quote",
      visitorId: "vid_123",
      attribution: groove.attribution(),
      leadEventId: expect.stringMatching(/^[A-Za-z0-9_-]{8,64}$/),
    });
    expect(groove.pixel).toHaveBeenCalledWith("Lead", { content_name: "beat-your-quote" }, body.leadEventId);
    expect(groove.track.mock.calls.map((c) => c[0])).toEqual(["form_start", "form_submit"]);
    expect(JSON.stringify(groove.track.mock.calls)).not.toMatch(/Mary|4805550142|Main St/);
  });

  it("consent is optional and unchecked: submits with checked false", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...BASE} />);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByRole("checkbox").hasAttribute("required")).toBe(false);
    await fill(user);
    await user.click(submitButton());
    await screen.findByText("Quote Received!");
    const body = sentBody();
    expect(body.consent).toEqual({ checked: false, text: SITE.consent.text, version: SITE.consent.version });
    // An unanswered optional dropdown is left out of answers.
    expect(body.answers).toEqual({ Address: "123 E Main St, Mesa" });
  });

  it("validates required fields, focuses the first invalid one and sends nothing", async () => {
    const user = userEvent.setup();
    const select = FIELDS[4] as Extract<FormField, { type: "select" }>;
    render(<LeadForm {...BASE} fields={[...FIELDS.slice(0, 4), { ...select, required: true, error: "Pick one." }]} />);
    await user.click(submitButton());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Full Name *"));
    expect(screen.getByText("Please enter your name.")).toBeTruthy();
    expect(screen.getByText("We need a number to call you back on.")).toBeTruthy();
    expect(screen.getByText("Please enter your address.")).toBeTruthy();
    expect(screen.getByText("Please enter your zip code.")).toBeTruthy();
    expect(screen.getByText("Pick one.")).toBeTruthy();
    expect(screen.getByPlaceholderText("Full Name *").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows the consumer's success copy with the badge icon and no call button", async () => {
    const user = userEvent.setup();
    const { container } = render(<LeadForm {...BASE} />);
    await fill(user);
    await user.click(submitButton());
    await screen.findByText("Quote Received!");
    expect(screen.getByText("We'll review your quote and get back to you within 24 hours with a better price.")).toBeTruthy();
    expect(container.querySelector(".gsk-thanks-badge")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Call/ })).toBeNull();
    // The card heading stays; the form is replaced.
    expect(screen.getByRole("heading", { level: 2, name: "SEND US YOUR QUOTE" })).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();
  });

  it("uses the sending label while posting", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(
      (_u: string, init: RequestInit) =>
        new Promise((r) => {
          release = () => r(jsonResponse({ ok: true, leadEventId: JSON.parse(String(init.body)).leadEventId }));
        }),
    );
    const user = userEvent.setup();
    render(<LeadForm {...BASE} sendingLabel="Submitting..." />);
    await fill(user);
    await user.click(submitButton());
    expect(await screen.findByRole("button", { name: "Submitting..." })).toBeTruthy();
    release();
    await screen.findByText("Quote Received!");
  });

  it("honeypot and preview mode send nothing", async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<LeadForm {...BASE} />);
    await fill(user);
    container.querySelector<HTMLInputElement>('input[name="website"]')!.value = "spam";
    await user.click(submitButton());
    await screen.findByText("Quote Received!");
    unmount();

    render(<LeadForm {...BASE} intakeKey={null} />);
    await fill(user);
    await user.click(submitButton());
    await screen.findByText("Preview only. No lead was created.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders the footnote and the consumer class, and links consent to the legal pages", () => {
    const { container } = render(
      <LeadForm
        {...BASE}
        className="ash-form"
        footnote={
          <p>
            *Price-beat guarantee applies. <a href="#footer-terms">See terms.</a>
          </p>
        }
      />,
    );
    expect(container.querySelector("section")!.className).toBe("gsk-form ash-form");
    expect(container.querySelector(".gsk-single-footnote")!.textContent).toBe("*Price-beat guarantee applies. See terms.");
    expect(screen.getByRole("link", { name: "SMS terms" }).getAttribute("href")).toBe("/terms");
    expect(screen.getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
    expect(container.querySelector(".gsk-single-consent-text")!.textContent).toContain(SITE.consent.text);
  });

  it("works without zip or address (Ash's sale pages)", async () => {
    const user = userEvent.setup();
    render(
      <LeadForm
        {...BASE}
        fields={[
          { type: "fullName", placeholder: "Full Name *" },
          { type: "phone", placeholder: "Phone Number *" },
          { type: "select", placeholder: "Best time to call?", options: ["Morning", "Evening"] },
        ]}
      />,
    );
    await user.type(screen.getByPlaceholderText("Full Name *"), "Cher");
    await user.type(screen.getByPlaceholderText("Phone Number *"), "4805550142");
    await user.selectOptions(screen.getByRole("combobox"), "Evening");
    await user.click(submitButton());
    await screen.findByText("Quote Received!");
    const body = sentBody();
    expect(body.first).toBe("Cher");
    expect(body).not.toHaveProperty("last");
    expect(body).not.toHaveProperty("zip");
    expect(body.answers).toEqual({ "Best time to call?": "Evening" });
  });

  it("the quiz layout is unchanged by default", () => {
    const { container } = render(<LeadForm {...BASE} layout={undefined} steps={[{ id: "age", question: "How old?", options: ["New"] }]} />);
    expect(container.querySelector("section")!.hasAttribute("data-layout")).toBe(false);
    expect(container.querySelector(".gsk-progress")).toBeTruthy();
    expect(screen.getByRole("button", { name: "New" })).toBeTruthy();
  });
});

describe("single layout logic", () => {
  it("splits full names", () => {
    expect(splitFullName("  Mary   Ann Lopez ")).toEqual({ first: "Mary", last: "Ann Lopez" });
    expect(splitFullName("Cher")).toEqual({ first: "Cher", last: "" });
    expect(splitFullName("")).toEqual({ first: "", last: "" });
  });

  it("resolves defaults: labels, required flags, select keys", () => {
    const f = resolveFields([
      { type: "fullName" },
      { type: "phone", required: false },
      { type: "email" },
      { type: "select", placeholder: "How Old Is Your AC? *", options: ["New"], required: true },
      { type: "select", placeholder: "Best time?", options: ["AM"] },
    ]);
    expect(f.map((x) => [x.key, x.label, x.required])).toEqual([
      ["fullName", "Full name", true],
      ["phone", "Phone number", true], // phone is always required
      ["email", "Email", false],
      ["select-1", "How Old Is Your AC?", true],
      ["select-2", "Best time?", false],
    ]);
  });

  it("validates phone, zip and email formats", () => {
    const fields = resolveFields([{ type: "phone" }, { type: "zip" }, { type: "email" }]);
    expect(validateFields(fields, { phone: "480555", zip: "852", email: "nope" })).toEqual({
      phone: "Enter all 10 digits, area code first.",
      zip: "Zip codes are 5 digits.",
      email: "That email looks off.",
    });
    expect(validateFields(fields, { phone: "(480) 555-0142", zip: "85201", email: "" })).toEqual({});
  });

  it("builds the payload with email lowercased and address in answers", () => {
    const fields = resolveFields([{ type: "fullName" }, { type: "phone" }, { type: "address" }, { type: "email" }]);
    const p = buildFieldsPayload({ fields, values: { fullName: "Jo Ray", phone: "4805550142", address: "1 A St", email: " Jo@X.com " }, consentChecked: false, consentText: "c", page: "p", leadEventId: "evt_12345678" });
    expect(p).toEqual({ first: "Jo", last: "Ray", phone: "+14805550142", email: "jo@x.com", answers: { Address: "1 A St" }, consent: { checked: false, text: "c" }, page: "p", attribution: {}, leadEventId: "evt_12345678" });
  });
});
