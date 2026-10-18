/** One quiz question. Answers are sent as answers[id] = option. */
export type QuizStep = { id: string; question: string; options: string[] };

/** When the speed-to-lead call happens (POST intake response). */
export type CallTiming = { when: "now" } | { when: "later"; at: string; display: string } | { when: "none" };

/** Body for POST {intake.url}. */
export type LeadPayload = {
  first: string;
  /** E.164 */
  phone: string;
  /** 5 digits */
  zip: string;
  email?: string;
  answers: Record<string, string>;
  consent: { checked: boolean; text: string };
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
    consent: { checked: input.consentChecked, text: input.consentText },
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
