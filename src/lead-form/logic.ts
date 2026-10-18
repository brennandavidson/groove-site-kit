/** One quiz question. Answers are sent as answers[id] = option. */
export type QuizStep = { id: string; question: string; options: string[] };

/** When the speed-to-lead call happens (POST intake response). */
export type CallTiming = { when: "now" } | { when: "later"; at: string; display: string } | { when: "none" };

/** Body for POST {intake.url}. */
export type LeadPayload = {
  first: string;
  /** Single-card form with a full name field: everything after the first word. */
  last?: string;
  /** E.164 */
  phone: string;
  /** 5 digits. Left out when the form has no zip field. */
  zip?: string;
  email?: string;
  answers: Record<string, string>;
  consent: { checked: boolean; text: string; version?: string };
  page: string;
  visitorId?: string;
  attribution: Record<string, unknown>;
  leadEventId: string;
};

export type IntakeResponse = { ok?: boolean; leadEventId?: string; call?: CallTiming; error?: string };

export type ContactField = "first" | "phone" | "zip" | "email";
export type ContactValues = Record<ContactField, string>;
export type ContactErrors = Partial<Record<ContactField, string>>;

/** US phone to E.164, or null when it can't be a real NANP number. */
export function toE164(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  if (/^[01]/.test(national) || /^[01]/.test(national.slice(3))) return null;
  return `+1${national}`;
}

export function formatPhoneInput(v: string): string {
  const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (d.length !== 10) return v;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

export function validateContact(f: ContactValues): ContactErrors {
  const e: ContactErrors = {};
  if (!f.first.trim()) e.first = "What should we call you?";
  const digits = f.phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (!digits) e.phone = "We need a number to call you back on.";
  else if (digits.length !== 10) e.phone = "Enter all 10 digits, area code first.";
  else if (!toE164(digits)) e.phone = "That number does not look right. Check the area code.";
  if (!/^\d{5}(-\d{4})?$/.test(f.zip.trim())) e.zip = "Zip codes are 5 digits.";
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "That email looks off. You can also leave it blank.";
  return e;
}

/** Random id for Meta dedupe. Matches the portal's /^[A-Za-z0-9_-]{8,64}$/. */
export function newLeadEventId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  c?.getRandomValues ? c.getRandomValues(b) : b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256)));
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function buildLeadPayload(input: {
  values: ContactValues;
  answers: Record<string, string>;
  consentChecked: boolean;
  consentText: string;
  /** Which consent wording was shown (portal site data); the portal keeps it with the text. */
  consentVersion?: string;
  page: string;
  visitorId?: string | null;
  attribution?: Record<string, unknown> | null;
  leadEventId: string;
}): LeadPayload {
  const email = input.values.email.trim().toLowerCase();
  return {
    first: input.values.first.trim(),
    phone: toE164(input.values.phone) ?? "",
    zip: input.values.zip.trim().slice(0, 5),
    ...(email ? { email } : {}),
    answers: input.answers,
    consent: { checked: input.consentChecked, text: input.consentText, ...(input.consentVersion ? { version: input.consentVersion } : {}) },
    page: input.page,
    ...(input.visitorId ? { visitorId: input.visitorId } : {}),
    attribution: input.attribution ?? {},
    leadEventId: input.leadEventId,
  };
}

/** "Got it, {first}." with { first: "Jamie" } -> "Got it, Jamie." Unknown keys become "". */
export function fill(template: string, vars: Record<string, string | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

// ---------------------------------------------------------------------------------------------
// Single-card layout (layout: "single"): every field on one card, in the order the site lists them.

/** A field on the single-card form. Placeholder/label text is shown exactly as given. */
export type FormField =
  | {
      type: "fullName" | "phone" | "address" | "zip" | "email";
      /** Accessible name (visible when labels="visible"). Address answers are keyed by it. */
      label?: string;
      placeholder?: string;
      /** Defaults: fullName, phone, address, zip true; email false. Phone is always required. */
      required?: boolean;
      /** Message when the field is required and empty. */
      error?: string;
    }
  | {
      type: "select";
      /** The first, unselectable option ("Who Gave You Your Quote?"). */
      placeholder: string;
      options: string[];
      /** Accessible name and the answers key. Defaults to the placeholder without a trailing "*". */
      label?: string;
      /** Default false. */
      required?: boolean;
      error?: string;
    };

export type ResolvedField = {
  /** Stable key for values and errors: the type, or "select-<n>" for selects. */
  key: string;
  type: FormField["type"];
  label: string;
  placeholder?: string;
  required: boolean;
  error?: string;
  options?: string[];
};

export const DEFAULT_SINGLE_FIELDS: FormField[] = [{ type: "fullName" }, { type: "phone" }, { type: "zip" }, { type: "email" }];

const DEFAULT_LABELS: Record<Exclude<FormField["type"], "select">, string> = {
  fullName: "Full name",
  phone: "Phone number",
  address: "Address",
  zip: "Zip code",
  email: "Email",
};

/** Fills defaults (labels, required flags, keys) in the order given. */
export function resolveFields(fields: FormField[] = DEFAULT_SINGLE_FIELDS): ResolvedField[] {
  let selects = 0;
  return fields.map((f) => {
    if (f.type === "select") {
      selects++;
      return {
        key: `select-${selects}`,
        type: "select",
        label: (f.label ?? f.placeholder.replace(/\s*\*\s*$/, "")).trim(),
        placeholder: f.placeholder,
        required: f.required ?? false,
        error: f.error,
        options: f.options,
      };
    }
    return {
      key: f.type,
      type: f.type,
      label: f.label ?? DEFAULT_LABELS[f.type],
      placeholder: f.placeholder,
      required: f.type === "phone" ? true : (f.required ?? f.type !== "email"),
      error: f.error,
    };
  });
}

/** "Mary Ann Lopez" -> { first: "Mary", last: "Ann Lopez" }. One word -> first only. */
export function splitFullName(full: string): { first: string; last: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

/** Errors keyed by ResolvedField.key. Empty object = valid. */
export function validateFields(fields: ResolvedField[], values: Record<string, string>): Record<string, string> {
  const e: Record<string, string> = {};
  for (const f of fields) {
    const v = (values[f.key] ?? "").trim();
    if (f.type === "phone") {
      const digits = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      if (!digits) e[f.key] = f.error ?? "We need a number to call you back on.";
      else if (digits.length !== 10) e[f.key] = "Enter all 10 digits, area code first.";
      else if (!toE164(digits)) e[f.key] = "That number does not look right. Check the area code.";
      continue;
    }
    if (!v) {
      if (f.required) e[f.key] = f.error ?? (f.type === "select" ? "Please choose an option." : f.type === "fullName" ? "Please enter your name." : `Please enter your ${f.label.toLowerCase()}.`);
      continue;
    }
    if (f.type === "zip" && !/^\d{5}(-\d{4})?$/.test(v)) e[f.key] = "Zip codes are 5 digits.";
    if (f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) e[f.key] = "That email looks off.";
  }
  return e;
}

/**
 * Intake body for the single-card form. Full name is split into first/last; address and select
 * answers go in `answers` keyed by their label (the intake API has no address field).
 */
export function buildFieldsPayload(input: {
  fields: ResolvedField[];
  values: Record<string, string>;
  consentChecked: boolean;
  consentText: string;
  consentVersion?: string;
  page: string;
  visitorId?: string | null;
  attribution?: Record<string, unknown> | null;
  leadEventId: string;
  /** Merged into answers (contact consent). */
  extraAnswers?: Record<string, string>;
}): LeadPayload {
  const get = (type: FormField["type"]) => {
    const f = input.fields.find((x) => x.type === type);
    return f ? (input.values[f.key] ?? "").trim() : "";
  };
  const { first, last } = splitFullName(get("fullName"));
  const zip = get("zip").slice(0, 5);
  const email = get("email").toLowerCase();
  const answers: Record<string, string> = {};
  for (const f of input.fields) {
    const v = (input.values[f.key] ?? "").trim();
    if ((f.type === "address" || f.type === "select") && v) answers[f.label] = v;
  }
  Object.assign(answers, input.extraAnswers);
  return {
    first,
    ...(last ? { last } : {}),
    phone: toE164(get("phone")) ?? "",
    ...(zip ? { zip } : {}),
    ...(email ? { email } : {}),
    answers,
    consent: { checked: input.consentChecked, text: input.consentText, ...(input.consentVersion ? { version: input.consentVersion } : {}) },
    page: input.page,
    ...(input.visitorId ? { visitorId: input.visitorId } : {}),
    attribution: input.attribution ?? {},
    leadEventId: input.leadEventId,
  };
}

// ---------------------------------------------------------------------------------------------
// Consent checkboxes.

/**
 * Optional second checkbox, separate from the SMS consent box: agreement to be contacted about the
 * request by phone and email. Checked = answers[label] holds the exact text shown (the record).
 */
export type ContactConsent = {
  /** Exact wording shown next to the box. */
  text: string;
  /** Default true: the box must be checked to submit. */
  required?: boolean;
  /** answers key. Default "Contact consent". */
  label?: string;
  /** Inline error when required and unchecked. */
  error?: string;
};

export type ConsentState = {
  /** SMS consent box (portal text). */
  sms: boolean;
  /** Contact consent box, when the form has one. */
  contact: boolean;
};

export const CONSENT_REQUIRED_ERROR = "Please check this box so we can contact you about your request.";
export const CONTACT_CONSENT_ERROR = "Please check this box to continue.";

/** Errors for the consent boxes: { sms?, contact? }. Empty = OK to submit. */
export function validateConsent(input: { consentRequired?: boolean; contactConsent?: ContactConsent; state: ConsentState }): { sms?: string; contact?: string } {
  const e: { sms?: string; contact?: string } = {};
  if (input.contactConsent && (input.contactConsent.required ?? true) && !input.state.contact) e.contact = input.contactConsent.error ?? CONTACT_CONSENT_ERROR;
  if (input.consentRequired && !input.state.sms) e.sms = CONSENT_REQUIRED_ERROR;
  return e;
}

/** answers entry for a checked contact consent box. */
export function contactConsentAnswer(contactConsent: ContactConsent | undefined, checked: boolean): Record<string, string> {
  return contactConsent && checked ? { [contactConsent.label ?? "Contact consent"]: contactConsent.text } : {};
}
