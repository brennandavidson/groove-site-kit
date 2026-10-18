import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import {
  buildFieldsPayload,
  buildLeadPayload,
  contactConsentAnswer,
  fill,
  formatPhoneInput,
  marketingConsentPayload,
  newLeadEventId,
  resolveFields,
  splitFullName,
  validateContact,
  validateConsent,
  validateFields,
  type CallTiming,
  type ContactConsent,
  type ContactField,
  type ContactValues,
  type FormField,
  type IntakeResponse,
  type LeadPayload,
  type MarketingConsent,
  type QuizStep,
  type ResolvedField,
} from "./logic";

/**
 * Two layouts:
 * - "quiz" (default): multi-step quiz, then a contact step with the consent checkbox.
 * - "single": every field on one card (configurable fields, native selects), consent row, button.
 * The consent box is unchecked (optional unless consentRequired), with the portal's consent text.
 * With marketingConsent, a separate marketing texts box follows it: optional, unchecked, never required.
 * POSTs to intakeUrl with x-intake-key and a leadEventId generated here, then fires the
 * pixel Lead with the same id so Meta dedupes it against the portal's CAPI event.
 * Thank-you copy follows the call timing the portal returns (or a fixed message).
 *
 * Use it through LeadForm.astro, which fills the site data props at build time.
 */

export type ThankYouCopy = {
  /** Vars: {first} {business}. Default "Got it, {first}." */
  heading?: string;
  /** Call happens now. Vars: {first} {business} {phone}. */
  now?: string;
  /** Closed, call later. Vars: {first} {business} {phone} {when}. */
  later?: string;
  /** No call planned. Vars: {first} {business}. */
  none?: string;
  /** Fixed message that replaces the call-timing copy above. Vars: {first} {business} {phone}. */
  message?: string;
  /** Call button under the message. Vars: {number}. "" hides the button. */
  callCta?: string;
  /** "circle" (default): outline check. "badge": white check on a filled circle. */
  icon?: "circle" | "badge";
};

export type LeadFormProps = {
  /** Page slug sent with the lead and the form events. */
  page: string;
  /** "quiz" (default) or "single" (one card, every field visible). */
  layout?: "quiz" | "single";
  /** Quiz layout: the questions before the contact step. */
  steps?: QuizStep[];
  /** Single layout: fields in order. Default full name, phone, zip, email (optional). */
  fields?: FormField[];
  /** Single layout: "visible" (default) or "hidden" (screen readers only, for a placeholder-only look). */
  labels?: "visible" | "hidden";
  business: string;
  /** Main line we call them from. */
  phoneDisplay?: string | null;
  /** This page's number for "call instead" (tracking line or main). */
  callE164?: string | null;
  callDisplay?: string | null;
  intakeUrl: string;
  /** Null = preview mode: walk through the form, send nothing. */
  intakeKey?: string | null;
  consentText: string;
  consentVersion?: string;
  /**
   * Default false: the SMS consent box is optional. True: it must be checked to submit (inline
   * error otherwise). Either way the portal's consent text and version are sent.
   */
  consentRequired?: boolean;
  /** Optional second box (contact by phone and email about the request), shown before the SMS box. */
  contactConsent?: ContactConsent;
  /**
   * Separate marketing texts box (offers, seasonal reminders), shown below the SMS box with this exact
   * wording. Always optional and unchecked; submitting never needs it. Sent as marketingConsent
   * { checked, text, version }. Unset or null = no marketing box.
   */
  marketingConsent?: MarketingConsent | null;
  privacyUrl?: string;
  termsUrl?: string;
  /** Anchor id for "#estimate" links. */
  id?: string;
  /** Extra class on the form root, for site styling hooks. */
  className?: string;
  title?: string;
  subtitle?: string;
  /** Quiz layout: short proof strip under the subtitle ("Owner calls you back"). */
  proof?: string;
  submitLabel?: string;
  /** Button text while sending. Default "Sending...". */
  sendingLabel?: string;
  /** Line under the submit button. Single layout: shown only when set. */
  reassurance?: string;
  /** Single layout: short decorative icon before the reassurance line, e.g. a lightning emoji. */
  reassuranceIcon?: string;
  /** Single layout: small print under the button (Astro: slot="footnote"). */
  footnote?: ReactNode;
  thanks?: ThankYouCopy;
};

type Status = "idle" | "sending" | "done" | "error";

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

type PayloadContext = { leadEventId: string; visitorId: string | null; attribution: Record<string, unknown> };

/**
 * Honeypot, preview mode, posting, form_submit, the pixel Lead and leadEventId reuse on retry.
 * Shared by both layouts; each layout builds its own payload from the context.
 */
function useLeadSubmit(props: LeadFormProps, steps: number) {
  const [status, setStatus] = useState<Status>("idle");
  const [call, setCall] = useState<CallTiming>({ when: "now" });
  const eventId = useRef<string | null>(null);

  async function submit(form: HTMLFormElement, payloadFor: (ctx: PayloadContext) => LeadPayload, onMoved: () => void) {
    // Honeypot: people never see this field. A bot that fills it gets a fake success and nothing is sent.
    const honeypot = (form.elements.namedItem("website") as HTMLInputElement | null)?.value;
    if (honeypot) {
      onMoved();
      setStatus("done");
      return;
    }

    // One id per lead. A retry after an error reuses it so the portal dedupes.
    eventId.current ??= newLeadEventId();
    const payload = payloadFor({
      leadEventId: eventId.current,
      visitorId: window.groove?.visitorId ?? readCookie("gp_vid"),
      attribution: (window.groove?.attribution() as Record<string, unknown> | undefined) ?? {},
    });

    if (!props.intakeKey) {
      onMoved();
      setStatus("done");
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch(props.intakeUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "x-intake-key": props.intakeKey },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as IntakeResponse | null;
      if (!res.ok || !data?.ok) throw new Error(`intake ${res.status}`);
      window.groove?.track("form_submit", { form: props.page, steps });
      window.groove?.pixel("Lead", { content_name: props.page }, data.leadEventId ?? payload.leadEventId);
      window.groove?.flush();
      if (data.call) setCall(data.call);
      onMoved();
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  return { status, call, submit };
}

export function LeadForm(props: LeadFormProps) {
  return props.layout === "single" ? <SingleLeadForm {...props} /> : <QuizLeadForm {...props} />;
}

function rootClass(props: LeadFormProps) {
  return props.className ? `gsk-form ${props.className}` : "gsk-form";
}

function QuizLeadForm(props: LeadFormProps) {
  const steps = props.steps ?? [];
  const total = steps.length + 1;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fid = (name: string) => `gsk-${uid}-${name}`;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [values, setValues] = useState<ContactValues>({ first: "", phone: "", zip: "", email: "" });
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const consent = useConsent(props);
  const { status, call, submit } = useLeadSubmit(props, total);

  const started = useRef(false);
  const moved = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const errors = validateContact(values);
  const shownError = (f: ContactField) => (touched[f] ? errors[f] : undefined);
  const callHref = props.callE164 ? `tel:${props.callE164}` : null;

  // Move focus to the new heading after the visitor advances, not on first paint.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [step, status]);

  function markStart() {
    if (started.current) return;
    started.current = true;
    window.groove?.track("form_start", { form: props.page });
  }

  function choose(s: QuizStep, option: string) {
    markStart();
    setAnswers((a) => ({ ...a, [s.id]: option }));
    moved.current = true;
    window.groove?.track("form_step", { form: props.page, step: step + 1, of: total, id: s.id });
    setStep((n) => Math.min(n + 1, steps.length));
  }

  function back() {
    moved.current = true;
    setStep((n) => Math.max(0, n - 1));
  }

  function setField(f: ContactField, v: string) {
    markStart();
    setValues((prev) => ({ ...prev, [f]: v }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setTouched({ first: true, phone: true, zip: true, email: true });
    const firstBad = (Object.keys(validateContact(values)) as ContactField[])[0];
    const badBox = consent.check();
    if (firstBad || badBox) {
      document.getElementById(fid(firstBad ?? (badBox === "contact" ? "contact-consent" : "consent")))?.focus();
      return;
    }
    await submit(
      e.currentTarget,
      (ctx) =>
        buildLeadPayload({
          values,
          answers: { ...answers, ...consent.answers() },
          consentChecked: consent.sms,
          consentText: props.consentText,
          consentVersion: props.consentVersion,
          marketingConsent: consent.marketingPayload(),
          page: props.page,
          ...ctx,
        }),
      () => (moved.current = true),
    );
  }

  const progress = status === "done" ? 100 : Math.round(((step + 1) / (total + 1)) * 100);
  const titleId = fid("title");

  return (
    <section id={props.id ?? "estimate"} aria-labelledby={titleId} className={rootClass(props)}>
      <div className="gsk-form-head">
        <h2 id={titleId} className="gsk-form-title">
          {props.title ?? "Get your free estimate"}
        </h2>
        {props.subtitle ? <p className="gsk-form-subtitle">{props.subtitle}</p> : null}
        {props.proof ? <p className="gsk-form-proof">{props.proof}</p> : null}
        {total > 1 ? (
          <div className="gsk-progress">
            <span className="gsk-progress-label">{status === "done" ? "Done" : `Step ${Math.min(step + 1, total)} of ${total}`}</span>
            <div className="gsk-progress-track" role="progressbar" aria-label="Form progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
              <div className="gsk-progress-bar" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}
      </div>

      <div className="gsk-form-body">
        {status === "done" ? (
          <ThankYou {...props} first={values.first.trim()} call={call} callHref={callHref} headingRef={headingRef} />
        ) : step < steps.length ? (
          <QuizView key={steps[step]!.id} step={steps[step]!} index={step} selected={answers[steps[step]!.id]} onChoose={choose} onBack={back} headingRef={headingRef} idPrefix={fid("q")} />
        ) : (
          <form noValidate onSubmit={onSubmit} aria-labelledby={titleId} data-consent-version={props.consentVersion}>
            {steps.length > 0 ? (
              <button type="button" onClick={back} className="gsk-back">
                <span aria-hidden="true">&larr;</span> Back
              </button>
            ) : null}
            <h3 ref={headingRef} tabIndex={-1} className="gsk-step-heading">
              {steps.length > 0 ? "Last step. Where should we reach you?" : "Where should we reach you?"}
            </h3>

            <Honeypot id={fid("website")} />

            <div className="gsk-fields">
              <TextField id={fid("first")} name="first" label="First name" autoComplete="given-name" value={values.first} error={shownError("first")} onChange={(v) => setField("first", v)} onBlur={() => setTouched((t) => ({ ...t, first: true }))} />
              <TextField
                id={fid("phone")}
                name="phone"
                label="Mobile phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                value={values.phone}
                error={shownError("phone")}
                onChange={(v) => setField("phone", v)}
                onBlur={() => {
                  setValues((p) => ({ ...p, phone: formatPhoneInput(p.phone) }));
                  setTouched((t) => ({ ...t, phone: true }));
                }}
              />
              <TextField id={fid("zip")} name="zip" label="Zip code" inputMode="numeric" autoComplete="postal-code" maxLength={10} value={values.zip} error={shownError("zip")} onChange={(v) => setField("zip", v)} onBlur={() => setTouched((t) => ({ ...t, zip: true }))} />
              <TextField id={fid("email")} name="email" label="Email" optional type="email" inputMode="email" autoComplete="email" value={values.email} error={shownError("email")} onChange={(v) => setField("email", v)} onBlur={() => setTouched((t) => ({ ...t, email: true }))} />
            </div>

            {props.contactConsent ? (
              <div className="gsk-consent gsk-contact-consent">
                <label htmlFor={fid("contact-consent")} className="gsk-consent-label">
                  <input
                    id={fid("contact-consent")}
                    name="contact_consent"
                    type="checkbox"
                    checked={consent.contact}
                    onChange={(e) => consent.setContact(e.target.checked)}
                    required={props.contactConsent.required ?? true}
                    aria-invalid={consent.errors.contact ? true : undefined}
                    aria-describedby={consent.errors.contact ? fid("contact-consent-error") : undefined}
                    className="gsk-checkbox"
                  />
                  <span className="gsk-consent-text">{props.contactConsent.text}</span>
                </label>
                <ConsentError id={fid("contact-consent-error")} message={consent.errors.contact} className="gsk-field-error" />
              </div>
            ) : null}

            <div className="gsk-consent">
              <label htmlFor={fid("consent")} className="gsk-consent-label">
                <input
                  id={fid("consent")}
                  name="consent"
                  type="checkbox"
                  checked={consent.sms}
                  onChange={(e) => consent.setSms(e.target.checked)}
                  required={props.consentRequired || undefined}
                  aria-invalid={consent.errors.sms ? true : undefined}
                  aria-describedby={consent.errors.sms ? fid("consent-error") : undefined}
                  className="gsk-checkbox"
                />
                <span className="gsk-consent-text">{props.consentText}</span>
              </label>
              <ConsentError id={fid("consent-error")} message={consent.errors.sms} className="gsk-field-error" />
              <p className="gsk-consent-links">
                <a href={props.termsUrl ?? "/terms"} target="_blank" rel="noopener">
                  SMS terms
                </a>{" "}
                and{" "}
                <a href={props.privacyUrl ?? "/privacy"} target="_blank" rel="noopener">
                  Privacy policy
                </a>
              </p>
            </div>

            {props.marketingConsent ? (
              <div className="gsk-consent gsk-marketing-consent">
                <label htmlFor={fid("marketing-consent")} className="gsk-consent-label">
                  <input
                    id={fid("marketing-consent")}
                    name="marketing_consent"
                    type="checkbox"
                    checked={consent.marketing}
                    onChange={(e) => consent.setMarketing(e.target.checked)}
                    className="gsk-checkbox"
                  />
                  <span className="gsk-consent-text">{props.marketingConsent.text}</span>
                </label>
              </div>
            ) : null}

            {status === "error" ? <SubmitError {...props} callHref={callHref} className="gsk-error-box" /> : null}

            <button type="submit" data-track="form_submit_click" disabled={status === "sending"} className="gsk-btn gsk-btn-brand gsk-submit">
              {status === "sending" ? (props.sendingLabel ?? "Sending...") : (props.submitLabel ?? "Get my free estimate")}
            </button>
            <p className="gsk-reassurance">{props.reassurance ?? "Free and no obligation. We never sell your info."}</p>
          </form>
        )}
      </div>
    </section>
  );
}

/** Every field on one card, in the order given. Native selects, consent row, button, note, footnote. */
function SingleLeadForm(props: LeadFormProps) {
  const fields = resolveFields(props.fields);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fid = (name: string) => `gsk-${uid}-${name}`;

  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, ""])));
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const consent = useConsent(props);
  const { status, call, submit } = useLeadSubmit(props, 1);

  const started = useRef(false);
  const moved = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const errors = validateFields(fields, values);
  const shownError = (key: string) => (touched[key] ? errors[key] : undefined);
  const callHref = props.callE164 ? `tel:${props.callE164}` : null;

  useEffect(() => {
    if (moved.current) headingRef.current?.focus();
  }, [status]);

  function setField(key: string, v: string) {
    if (!started.current) {
      started.current = true;
      window.groove?.track("form_start", { form: props.page });
    }
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status === "sending") return;
    setTouched(Object.fromEntries(fields.map((f) => [f.key, true])));
    const bad = validateFields(fields, values);
    const firstBad = fields.find((f) => bad[f.key]);
    const badBox = consent.check();
    if (firstBad || badBox) {
      document.getElementById(fid(firstBad ? firstBad.key : badBox === "contact" ? "contact-consent" : "consent"))?.focus();
      return;
    }
    await submit(
      e.currentTarget,
      (ctx) =>
        buildFieldsPayload({
          fields,
          values,
          extraAnswers: consent.answers(),
          consentChecked: consent.sms,
          consentText: props.consentText,
          consentVersion: props.consentVersion,
          marketingConsent: consent.marketingPayload(),
          page: props.page,
          ...ctx,
        }),
      () => (moved.current = true),
    );
  }

  const titleId = fid("title");
  const fullName = fields.find((f) => f.type === "fullName");
  const first = fullName ? splitFullName(values[fullName.key] ?? "").first : "";

  return (
    <section
      id={props.id ?? "estimate"}
      data-layout="single"
      aria-labelledby={props.title ? titleId : undefined}
      aria-label={props.title ? undefined : "Request form"}
      className={rootClass(props)}
    >
      {props.title || props.subtitle ? (
        <div className="gsk-form-head">
          {props.title ? (
            <h2 id={titleId} className="gsk-form-title">
              {props.title}
            </h2>
          ) : null}
          {props.subtitle ? <p className="gsk-form-subtitle">{props.subtitle}</p> : null}
        </div>
      ) : null}

      <div className="gsk-form-body">
        {status === "done" ? (
          <ThankYou {...props} first={first} call={call} callHref={callHref} headingRef={headingRef} />
        ) : (
          <form noValidate onSubmit={onSubmit} aria-labelledby={props.title ? titleId : undefined} className="gsk-single-form" data-consent-version={props.consentVersion}>
            <Honeypot id={fid("website")} />

            {fields.map((f) => (
              <SingleField
                key={f.key}
                id={fid(f.key)}
                field={f}
                hideLabel={props.labels === "hidden"}
                value={values[f.key] ?? ""}
                error={shownError(f.key)}
                onChange={(v) => setField(f.key, v)}
                onBlur={() => {
                  if (f.type === "phone") setValues((p) => ({ ...p, [f.key]: formatPhoneInput(p[f.key] ?? "") }));
                  setTouched((t) => ({ ...t, [f.key]: true }));
                }}
              />
            ))}

            {props.contactConsent ? (
              <div className="gsk-single-consent-wrap">
                <div className="gsk-single-consent gsk-single-contact-consent">
                  <input
                    id={fid("contact-consent")}
                    name="contact_consent"
                    type="checkbox"
                    checked={consent.contact}
                    onChange={(e) => consent.setContact(e.target.checked)}
                    required={props.contactConsent.required ?? true}
                    aria-invalid={consent.errors.contact ? true : undefined}
                    aria-describedby={consent.errors.contact ? fid("contact-consent-error") : undefined}
                    className="gsk-single-checkbox"
                  />
                  <label htmlFor={fid("contact-consent")} className="gsk-single-consent-text">
                    {props.contactConsent.text}
                  </label>
                </div>
                <ConsentError id={fid("contact-consent-error")} message={consent.errors.contact} className="gsk-single-error" />
              </div>
            ) : null}

            <div className="gsk-single-consent-wrap">
            <div className="gsk-single-consent">
              <input
                id={fid("consent")}
                name="consent"
                type="checkbox"
                checked={consent.sms}
                onChange={(e) => consent.setSms(e.target.checked)}
                required={props.consentRequired || undefined}
                aria-invalid={consent.errors.sms ? true : undefined}
                aria-describedby={consent.errors.sms ? fid("consent-error") : undefined}
                className="gsk-single-checkbox"
              />
              <label htmlFor={fid("consent")} className="gsk-single-consent-text">
                {props.consentText}{" "}
                <span className="gsk-single-consent-links">
                  <a href={props.termsUrl ?? "/terms"} target="_blank" rel="noopener">
                    SMS terms
                  </a>{" "}
                  and{" "}
                  <a href={props.privacyUrl ?? "/privacy"} target="_blank" rel="noopener">
                    Privacy policy
                  </a>
                </span>
              </label>
            </div>
            <ConsentError id={fid("consent-error")} message={consent.errors.sms} className="gsk-single-error" />
            </div>

            {props.marketingConsent ? (
              <div className="gsk-single-consent-wrap">
                <div className="gsk-single-consent gsk-single-marketing-consent">
                  <input
                    id={fid("marketing-consent")}
                    name="marketing_consent"
                    type="checkbox"
                    checked={consent.marketing}
                    onChange={(e) => consent.setMarketing(e.target.checked)}
                    className="gsk-single-checkbox"
                  />
                  <label htmlFor={fid("marketing-consent")} className="gsk-single-consent-text">
                    {props.marketingConsent.text}
                  </label>
                </div>
              </div>
            ) : null}

            {status === "error" ? <SubmitError {...props} callHref={callHref} className="gsk-single-alert" /> : null}

            <button type="submit" data-track="form_submit_click" disabled={status === "sending"} className="gsk-single-submit">
              {status === "sending" ? (props.sendingLabel ?? "Sending...") : (props.submitLabel ?? "Get my free estimate")}
            </button>
            {props.reassurance ? (
              <p className="gsk-single-note">
                {props.reassuranceIcon ? (
                  <span className="gsk-single-note-icon" aria-hidden="true">
                    {props.reassuranceIcon}
                  </span>
                ) : null}
                {props.reassurance}
              </p>
            ) : null}
            {props.footnote ? <div className="gsk-single-footnote">{props.footnote}</div> : null}
          </form>
        )}
      </div>
    </section>
  );
}

const INPUT_ATTRS: Record<Exclude<ResolvedField["type"], "select">, { type: string; inputMode?: "text" | "tel" | "numeric" | "email"; autoComplete: string; maxLength?: number }> = {
  fullName: { type: "text", autoComplete: "name" },
  phone: { type: "tel", inputMode: "tel", autoComplete: "tel-national" },
  address: { type: "text", autoComplete: "street-address" },
  zip: { type: "text", inputMode: "numeric", autoComplete: "postal-code", maxLength: 5 },
  email: { type: "email", inputMode: "email", autoComplete: "email" },
};

function SingleField(props: { id: string; field: ResolvedField; hideLabel: boolean; value: string; error?: string; onChange: (v: string) => void; onBlur: () => void }) {
  const { field: f } = props;
  const errId = `${props.id}-error`;
  const common = {
    id: props.id,
    name: f.key,
    required: f.required,
    value: props.value,
    onBlur: props.onBlur,
    "aria-invalid": props.error ? true : undefined,
    "aria-describedby": props.error ? errId : undefined,
  };
  return (
    <div className={`gsk-single-field gsk-single-field-${f.type}`}>
      <label htmlFor={props.id} className={props.hideLabel ? "gsk-single-label gsk-visually-hidden" : "gsk-single-label"}>
        {f.label}
        {!f.required && !props.hideLabel ? <span className="gsk-optional"> (optional)</span> : null}
      </label>
      {f.type === "select" ? (
        <select {...common} onChange={(e) => props.onChange(e.target.value)} data-empty={props.value ? undefined : ""} className="gsk-single-select">
          <option value="" disabled>
            {f.placeholder}
          </option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input {...common} {...INPUT_ATTRS[f.type]} placeholder={f.placeholder} onChange={(e) => props.onChange(e.target.value)} className="gsk-single-input" />
      )}
      {props.error ? (
        <p id={errId} className="gsk-single-error">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

function Honeypot(props: { id: string }) {
  return (
    <div aria-hidden="true" className="gsk-hp">
      <label htmlFor={props.id}>Website</label>
      <input id={props.id} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
    </div>
  );
}

/** State, validation and payload bits for the SMS, contact and marketing consent boxes. */
function useConsent(props: LeadFormProps) {
  const [sms, setSms] = useState(false);
  const [contact, setContact] = useState(false);
  // Marketing box: unchecked by default and never validated, so it can never block a submit.
  const [marketing, setMarketing] = useState(false);
  const [shown, setShown] = useState(false);
  const errors = validateConsent({ consentRequired: props.consentRequired, contactConsent: props.contactConsent, state: { sms, contact } });
  return {
    sms,
    contact,
    setSms,
    setContact,
    errors: shown ? errors : {},
    /** Shows errors; returns which box to focus ("contact" | "sms") or null when OK. */
    check(): "contact" | "sms" | null {
      setShown(true);
      return errors.contact ? "contact" : errors.sms ? "sms" : null;
    },
    answers: () => contactConsentAnswer(props.contactConsent, contact),
    marketing,
    setMarketing,
    marketingPayload: () => marketingConsentPayload(props.marketingConsent, marketing),
  };
}

function ConsentError(props: { id: string; message?: string; className: string }) {
  return props.message ? (
    <p id={props.id} className={props.className}>
      {props.message}
    </p>
  ) : null;
}

function SubmitError(props: { callHref: string | null; callDisplay?: string | null; className: string }) {
  return (
    <p role="alert" className={props.className}>
      That did not go through on our end. Try again
      {props.callHref ? (
        <>
          , or call <a href={props.callHref}>{props.callDisplay}</a> and we will get you on the schedule.
        </>
      ) : (
        "."
      )}
    </p>
  );
}

function ThankYou(props: LeadFormProps & { first: string; call: CallTiming; callHref: string | null; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const t = props.thanks ?? {};
  const phone = props.phoneDisplay ?? "";
  const vars = { first: props.first, business: props.business, phone, when: props.call.when === "later" ? props.call.display : "", number: props.callDisplay ?? "" };
  const from = phone ? " from {phone}. Save that number so you know it is us." : ".";
  const message =
    t.message ??
    (props.call.when === "none"
      ? (t.none ?? "The team at {business} has your request.")
      : props.call.when === "later"
        ? (t.later ?? `We're closed right now, so we'll call you {when}${from}`)
        : (t.now ?? `We'll call you in a few minutes${from}`));
  const callCta = t.callCta ?? "Rather talk now? Call {number}";
  return (
    <div role="status" className="gsk-thanks">
      {t.icon === "badge" ? (
        <span className="gsk-thanks-badge" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      ) : (
        <svg className="gsk-thanks-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      )}
      <h3 ref={props.headingRef} tabIndex={-1} className="gsk-thanks-heading">
        {fill(t.heading ?? (props.first ? "Got it, {first}." : "Got it."), vars)}
      </h3>
      <p className="gsk-thanks-text">{fill(message, vars)}</p>
      {!props.intakeKey ? <p className="gsk-preview-note">Preview only. No lead was created.</p> : null}
      {props.callHref && callCta ? (
        <a href={props.callHref} data-track="thanks_call" className="gsk-btn gsk-btn-ghost">
          {fill(callCta, vars)}
        </a>
      ) : null}
    </div>
  );
}

function QuizView(props: {
  step: QuizStep;
  index: number;
  selected?: string;
  onChoose: (s: QuizStep, option: string) => void;
  onBack: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
  idPrefix: string;
}) {
  const { step } = props;
  const headingId = `${props.idPrefix}-${step.id}`;
  return (
    <div role="group" aria-labelledby={headingId}>
      {props.index > 0 ? (
        <button type="button" onClick={props.onBack} className="gsk-back">
          <span aria-hidden="true">&larr;</span> Back
        </button>
      ) : null}
      <h3 id={headingId} ref={props.headingRef} tabIndex={-1} className="gsk-step-heading">
        {step.question}
      </h3>
      <div className="gsk-options">
        {step.options.map((opt) => (
          <button key={opt} type="button" aria-pressed={props.selected === opt} onClick={() => props.onChoose(step, opt)} className="gsk-option">
            <span>{opt}</span>
            <span aria-hidden="true" className="gsk-option-dot" />
          </button>
        ))}
      </div>
    </div>
  );
}

function TextField(props: {
  id: string;
  name: ContactField;
  label: string;
  value: string;
  error?: string;
  optional?: boolean;
  type?: string;
  inputMode?: "text" | "tel" | "numeric" | "email";
  autoComplete?: string;
  maxLength?: number;
  onChange: (v: string) => void;
  onBlur: () => void;
}) {
  const errId = `${props.id}-error`;
  return (
    <div className="gsk-field">
      <label htmlFor={props.id} className="gsk-label">
        {props.label}
        {props.optional ? <span className="gsk-optional"> (optional)</span> : null}
      </label>
      <input
        id={props.id}
        name={props.name}
        type={props.type ?? "text"}
        inputMode={props.inputMode}
        autoComplete={props.autoComplete}
        maxLength={props.maxLength}
        required={!props.optional}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onBlur={props.onBlur}
        aria-invalid={props.error ? true : undefined}
        aria-describedby={props.error ? errId : undefined}
        className="gsk-input"
      />
      {props.error ? (
        <p id={errId} className="gsk-field-error">
          {props.error}
        </p>
      ) : null}
    </div>
  );
}

export default LeadForm;
