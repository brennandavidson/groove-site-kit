import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import {
  buildLeadPayload,
  fill,
  formatPhoneInput,
  newLeadEventId,
  validateContact,
  type CallTiming,
  type ContactField,
  type ContactValues,
  type IntakeResponse,
  type QuizStep,
} from "./logic";

/**
 * Multi-step quiz, then a contact step with the consent checkbox (unchecked, optional).
 * POSTs to intakeUrl with x-intake-key and a leadEventId generated here, then fires the
 * pixel Lead with the same id so Meta dedupes it against the portal's CAPI event.
 * Thank-you copy follows the call timing the portal returns.
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
  /** Call button under the message. Vars: {number}. */
  callCta?: string;
};

export type LeadFormProps = {
  /** Page slug sent with the lead and the form events. */
  page: string;
  steps?: QuizStep[];
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
  privacyUrl?: string;
  termsUrl?: string;
  /** Anchor id for "#estimate" links. */
  id?: string;
  title?: string;
  subtitle?: string;
  /** Short proof strip under the subtitle ("Owner calls you back"). */
  proof?: string;
  submitLabel?: string;
  /** Line under the submit button. */
  reassurance?: string;
  thanks?: ThankYouCopy;
};

type Status = "idle" | "sending" | "done" | "error";

function readCookie(name: string): string | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]!) : null;
}

export function LeadForm(props: LeadFormProps) {
  const steps = props.steps ?? [];
  const total = steps.length + 1;
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const fid = (name: string) => `gsk-${uid}-${name}`;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [values, setValues] = useState<ContactValues>({ first: "", phone: "", zip: "", email: "" });
  const [touched, setTouched] = useState<Partial<Record<ContactField, boolean>>>({});
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [call, setCall] = useState<CallTiming>({ when: "now" });

  const started = useRef(false);
  const moved = useRef(false);
  const eventId = useRef<string | null>(null);
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
    if (firstBad) {
      document.getElementById(fid(firstBad))?.focus();
      return;
    }

    // Honeypot: people never see this field. A bot that fills it gets a fake success and nothing is sent.
    const honeypot = (e.currentTarget.elements.namedItem("website") as HTMLInputElement | null)?.value;
    if (honeypot) {
      moved.current = true;
      setStatus("done");
      return;
    }

    // One id per lead. A retry after an error reuses it so the portal dedupes.
    eventId.current ??= newLeadEventId();
    const payload = buildLeadPayload({
      values,
      answers,
      consentChecked: consent,
      consentText: props.consentText,
      consentVersion: props.consentVersion,
      page: props.page,
      visitorId: window.groove?.visitorId ?? readCookie("gp_vid"),
      attribution: (window.groove?.attribution() as Record<string, unknown> | undefined) ?? {},
      leadEventId: eventId.current,
    });

    if (!props.intakeKey) {
      moved.current = true;
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
      window.groove?.track("form_submit", { form: props.page, steps: total });
      window.groove?.pixel("Lead", { content_name: props.page }, data.leadEventId ?? payload.leadEventId);
      window.groove?.flush();
      if (data.call) setCall(data.call);
      moved.current = true;
      setStatus("done");
    } catch {
      setStatus("error");
    }
  }

  const progress = status === "done" ? 100 : Math.round(((step + 1) / (total + 1)) * 100);
  const titleId = fid("title");

  return (
    <section id={props.id ?? "estimate"} aria-labelledby={titleId} className="gsk-form">
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

            <div aria-hidden="true" className="gsk-hp">
              <label htmlFor={fid("website")}>Website</label>
              <input id={fid("website")} name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
            </div>

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

            <div className="gsk-consent">
              <label htmlFor={fid("consent")} className="gsk-consent-label">
                <input id={fid("consent")} name="consent" type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="gsk-checkbox" />
                <span className="gsk-consent-text">{props.consentText}</span>
              </label>
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

            {status === "error" ? (
              <p role="alert" className="gsk-error-box">
                That did not go through on our end. Try again
                {callHref ? (
                  <>
                    , or call <a href={callHref}>{props.callDisplay}</a> and we will get you on the schedule.
                  </>
                ) : (
                  "."
                )}
              </p>
            ) : null}

            <button type="submit" data-track="form_submit_click" disabled={status === "sending"} className="gsk-btn gsk-btn-brand gsk-submit">
              {status === "sending" ? "Sending..." : (props.submitLabel ?? "Get my free estimate")}
            </button>
            <p className="gsk-reassurance">{props.reassurance ?? "Free and no obligation. We never sell your info."}</p>
          </form>
        )}
      </div>
    </section>
  );
}

function ThankYou(props: LeadFormProps & { first: string; call: CallTiming; callHref: string | null; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const t = props.thanks ?? {};
  const phone = props.phoneDisplay ?? "";
  const vars = { first: props.first, business: props.business, phone, when: props.call.when === "later" ? props.call.display : "", number: props.callDisplay ?? "" };
  const from = phone ? " from {phone}. Save that number so you know it is us." : ".";
  const message =
    props.call.when === "none"
      ? (t.none ?? "The team at {business} has your request.")
      : props.call.when === "later"
        ? (t.later ?? `We're closed right now, so we'll call you {when}${from}`)
        : (t.now ?? `We'll call you in a few minutes${from}`);
  return (
    <div role="status" className="gsk-thanks">
      <svg className="gsk-thanks-icon" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      <h3 ref={props.headingRef} tabIndex={-1} className="gsk-thanks-heading">
        {fill(t.heading ?? (props.first ? "Got it, {first}." : "Got it."), vars)}
      </h3>
      <p className="gsk-thanks-text">{fill(message, vars)}</p>
      {!props.intakeKey ? <p className="gsk-preview-note">Preview only. No lead was created.</p> : null}
      {props.callHref ? (
        <a href={props.callHref} data-track="thanks_call" className="gsk-btn gsk-btn-ghost">
          {fill(t.callCta ?? "Rather talk now? Call {number}", vars)}
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
