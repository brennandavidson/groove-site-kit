// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadForm, type LeadFormProps } from "../src/lead-form/LeadForm";
import { CONSENT_REQUIRED_ERROR, CONTACT_CONSENT_ERROR, marketingConsentPayload, validateConsent, type ContactConsent } from "../src/lead-form/logic";
import { MARKETING, SITE, jsonResponse } from "./fixtures";

const CONTACT: ContactConsent = { text: "I agree to be contacted about my request by phone and email." };

const COMMON = {
  page: "independent",
  business: SITE.client.name,
  phoneDisplay: SITE.client.phoneDisplay,
  intakeUrl: SITE.intake.url,
  intakeKey: SITE.intake.key,
  consentText: SITE.consent.text,
  consentVersion: SITE.consent.version,
  submitLabel: "Send",
} satisfies Partial<LeadFormProps>;

const SINGLE: LeadFormProps = { ...COMMON, layout: "single", fields: [{ type: "fullName" }, { type: "phone" }] };
const QUIZ: LeadFormProps = { ...COMMON, steps: [] };

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init: RequestInit) => jsonResponse({ ok: true, leadEventId: JSON.parse(String(init.body)).leadEventId, call: { when: "now" } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => cleanup());

const sent = () => JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
const smsBox = () => screen.getByRole("checkbox", { name: /By checking this box/ });
const contactBox = () => screen.getByRole("checkbox", { name: /I agree to be contacted/ });
const marketingBox = () => screen.getByRole("checkbox", { name: /occasional offers and seasonal reminders/ });
const queryMarketingBox = () => screen.queryByRole("checkbox", { name: /occasional offers and seasonal reminders/ });

async function fillSingle(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Full name"), "Jamie Lee");
  await user.type(screen.getByLabelText("Phone number"), "4805550142");
}
async function fillQuiz(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("First name"), "Jamie");
  await user.type(screen.getByLabelText("Mobile phone"), "4805550142");
  await user.type(screen.getByLabelText("Zip code"), "85201");
}

describe.each([
  ["single", SINGLE, fillSingle],
  ["quiz", QUIZ, fillQuiz],
] as const)("consent options (%s layout)", (_name, base, fill) => {
  it("default: SMS consent is optional and unchecked, and there is no contact box", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} />);
    expect((smsBox() as HTMLInputElement).checked).toBe(false);
    expect(smsBox().hasAttribute("required")).toBe(false);
    expect(screen.queryByRole("checkbox", { name: /I agree to be contacted/ })).toBeNull();
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    expect(sent().consent).toEqual({ checked: false, text: SITE.consent.text, version: SITE.consent.version });
  });

  it("consentRequired blocks submit with an inline error until the box is checked", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} consentRequired />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(CONSENT_REQUIRED_ERROR)).toBeTruthy();
    expect(smsBox().getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(smsBox());

    await user.click(smsBox());
    expect(screen.queryByText(CONSENT_REQUIRED_ERROR)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    expect(sent().consent).toEqual({ checked: true, text: SITE.consent.text, version: SITE.consent.version });
  });

  it("contactConsent is required by default, separate from the optional SMS box, and recorded in answers", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} contactConsent={CONTACT} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(CONTACT_CONSENT_ERROR)).toBeTruthy();
    expect(document.activeElement).toBe(contactBox());

    await user.click(contactBox());
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    const body = sent();
    expect(body.answers["Contact consent"]).toBe(CONTACT.text);
    // SMS consent stayed optional and unchecked.
    expect(body.consent).toEqual({ checked: false, text: SITE.consent.text, version: SITE.consent.version });
  });

  it("an optional contact box with a custom label and error text", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} contactConsent={{ ...CONTACT, required: false, label: "Contact OK" }} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    expect(sent().answers).not.toHaveProperty("Contact OK");
  });
});

describe.each([
  ["single", SINGLE, fillSingle],
  ["quiz", QUIZ, fillQuiz],
] as const)("marketing consent box (%s layout)", (_name, base, fill) => {
  it("is absent by default and nothing marketing is sent", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} />);
    expect(queryMarketingBox()).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(1);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    expect(sent()).not.toHaveProperty("marketingConsent");
  });

  it("is absent when marketingConsent is null", () => {
    render(<LeadForm {...base} marketingConsent={null} />);
    expect(queryMarketingBox()).toBeNull();
  });

  it("when enabled: a separate box below the SMS box, unchecked and not required, with the exact text", () => {
    render(<LeadForm {...base} marketingConsent={MARKETING} />);
    const box = marketingBox() as HTMLInputElement;
    expect(box.checked).toBe(false);
    expect(box.hasAttribute("required")).toBe(false);
    expect(box.name).toBe("marketing_consent");
    expect(box).not.toBe(smsBox());
    expect(screen.getByText(MARKETING.text)).toBeTruthy();
    // Order: SMS consent box first, marketing box after it.
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.indexOf(box)).toBe(boxes.indexOf(smsBox()) + 1);
  });

  it("submits with the marketing box unchecked and records checked=false", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} marketingConsent={MARKETING} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sent().marketingConsent).toEqual({ checked: false, text: MARKETING.text, version: MARKETING.version });
  });

  it("posts checked=true when ticked, independent of the SMS box", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} marketingConsent={MARKETING} />);
    await fill(user);
    await user.click(marketingBox());
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    const body = sent();
    expect(body.marketingConsent).toEqual({ checked: true, text: MARKETING.text, version: MARKETING.version });
    expect(body.consent).toEqual({ checked: false, text: SITE.consent.text, version: SITE.consent.version });
  });

  it("never satisfies a required SMS box and never blocks submit itself", async () => {
    const user = userEvent.setup();
    render(<LeadForm {...base} consentRequired marketingConsent={MARKETING} />);
    await fill(user);
    await user.click(marketingBox());
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(CONSENT_REQUIRED_ERROR)).toBeTruthy();
    expect(marketingBox().getAttribute("aria-invalid")).toBeNull();
    await user.click(smsBox());
    await user.click(screen.getByRole("button", { name: "Send" }));
    await screen.findByText(/Got it/);
    expect(sent().marketingConsent.checked).toBe(true);
    expect(sent().consent.checked).toBe(true);
  });
});

describe("marketingConsentPayload", () => {
  it("is undefined without wording, else checked + text (+ version)", () => {
    expect(marketingConsentPayload(undefined, true)).toBeUndefined();
    expect(marketingConsentPayload(null, false)).toBeUndefined();
    expect(marketingConsentPayload({ text: "x" }, true)).toEqual({ checked: true, text: "x" });
    expect(marketingConsentPayload(MARKETING, false)).toEqual({ checked: false, ...MARKETING });
  });
});

describe("validateConsent", () => {
  it("returns errors per box", () => {
    expect(validateConsent({ state: { sms: false, contact: false } })).toEqual({});
    expect(validateConsent({ consentRequired: true, contactConsent: { text: "x", error: "Need it" }, state: { sms: false, contact: false } })).toEqual({ sms: CONSENT_REQUIRED_ERROR, contact: "Need it" });
    expect(validateConsent({ consentRequired: true, contactConsent: { text: "x" }, state: { sms: true, contact: true } })).toEqual({});
  });
});
