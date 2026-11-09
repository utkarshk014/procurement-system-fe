// Mirrors the API's rules (docs/API.md and src/packages/validation in the backend) for instant feedback.
// The API checks everything again; its answer always wins.
import type { CompanyInput, FinancialYear, GstState, TaxDetailsInput, TrustCreate } from './types';

export type Errors = Partial<Record<keyof CompanyInput, string>>;

const MAX: Partial<Record<keyof CompanyInput, number>> = {
  name: 300, shortname: 50, address: 300, city: 200, state: 200, country: 200,
  email: 200, website: 150, header_1: 200, header_2: 200,
};

/** Same as the API's NormalizeIndianMobile: keep the digits, drop a +91 / 91 / 0 prefix.
 *  Input with no digits at all stays as typed, so "abc" fails the check instead of becoming empty. */
export function normaliseMobile(v: string): string {
  const digits = v.replace(/\D/g, '');
  if (!digits) return v.trim();
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export const isMobile = (v: string) => /^[6-9]\d{9}$/.test(normaliseMobile(v));
export const isPin = (v: string) => /^[1-9]\d{5}$/.test(v.trim());
export const isEmail = (v: string) =>
  /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(v.trim());

export function isWebsite(v: string): boolean {
  const s = v.trim();
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    return /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(u.hostname);
  } catch {
    return false;
  }
}

export function isIndia(country: string) {
  return !country.trim() || /^india$/i.test(country.trim());
}

export function validateCompany(c: CompanyInput, states: string[]): Errors {
  const e: Errors = {};
  if (!c.name.trim()) e.name = 'Company name is required';
  if (!c.shortname.trim()) e.shortname = 'Short name is required';

  if (c.state.trim() && isIndia(c.country) && states.length &&
      !states.some((s) => s.toLowerCase() === c.state.trim().toLowerCase())) {
    e.state = 'Choose a state from the list';
  }
  if (c.pin.trim() && !isPin(c.pin)) e.pin = 'Must be a 6-digit PIN code not starting with 0';
  if (c.mobile.trim() && !isMobile(c.mobile)) e.mobile = 'Must be a 10-digit Indian mobile number starting with 6–9';
  if (c.email.trim() && !isEmail(c.email)) e.email = 'Enter a valid email address';
  if (c.website.trim() && !isWebsite(c.website)) e.website = 'Enter a domain like esis.in, or a full https:// address';

  for (const [k, max] of Object.entries(MAX) as [keyof CompanyInput, number][]) {
    const v = (c[k] ?? '').trim();
    if (v.length > max && !e[k]) e[k] = `Must be ${max} characters or fewer`;
  }
  return e;
}

// ---------- PAN, GSTIN (Form 3) ----------

export const isPan = (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.trim().toUpperCase());

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** GSTN mod-36 check digit over the first 14 characters (same as the API). */
function gstinCheckDigit(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14[i]) * (i % 2 === 1 ? 2 : 1);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function isGstin(v: string): boolean {
  const s = v.trim().toUpperCase();
  return GSTIN_RE.test(s) && gstinCheckDigit(s.slice(0, 14)) === s[14];
}

/** Characters 3–12 of a GSTIN are the PAN. */
export const gstinMatchesPan = (gstin: string, pan: string) =>
  gstin.trim().toUpperCase().slice(2, 12) === pan.trim().toUpperCase();

export type TaxErrors = Partial<Record<keyof TaxDetailsInput, string>>;

/** Every problem at once. Nothing is mandatory; anything typed must be valid. `today` is YYYY-MM-DD. */
export function validateTaxDetails(t: TaxDetailsInput, gstStates: GstState[], today: string): TaxErrors {
  const e: TaxErrors = {};
  const pan = t.pan.trim().toUpperCase();
  const gstin = t.gstin.trim().toUpperCase();

  if (pan && !isPan(pan)) e.pan = 'Must be a PAN like ABCDE1234F';

  let gstinState = '';
  if (gstin) {
    if (!isGstin(gstin)) e.gstin = 'Not a valid GSTIN (check the 15 characters)';
    else {
      gstinState = gstStates.find((s) => s.code === gstin.slice(0, 2))?.name ?? '';
      if (!gstinState) e.gstin = `Starts with an unknown GST state code ${gstin.slice(0, 2)}`;
      else if (pan && isPan(pan) && !gstinMatchesPan(gstin, pan)) e.gstin = 'The PAN inside the GSTIN must match the PAN';
    }
  }
  if (t.gstin_state && gstinState && t.gstin_state !== gstinState) {
    e.gstin_state = `Does not match GSTIN state code ${gstin.slice(0, 2)} (${gstinState})`;
  }

  for (const [flag, date] of [['pan_enabled', 'pan_enabled_dt'], ['gstin_enabled', 'gstin_enabled_dt']] as const) {
    const d = t[date];
    if (d && t[flag] && d > today) e[date] = 'Cannot be a future date';
  }

  if (t.comm_mail_id.trim() && !isEmail(t.comm_mail_id)) e.comm_mail_id = 'Enter a valid email address';
  if ((t.comm_mail_pwd ?? '').length > 150) e.comm_mail_pwd = 'Must be 150 characters or fewer';
  if (t.comm_mobile.trim() && !isMobile(t.comm_mobile)) e.comm_mobile = 'Must be a 10-digit Indian mobile number starting with 6–9';
  if (t.comm_whatsapp.trim() && !isMobile(t.comm_whatsapp)) e.comm_whatsapp = 'Must be a 10-digit Indian mobile number starting with 6–9';
  return e;
}

// ---------- Trusts (Form 4) ----------

export const isTrustCode = (v: string) => /^[A-Z]{3}$/.test(v.trim().toUpperCase());

export type TrustErrors = Partial<Record<keyof TrustCreate, string>>;

/** Every problem at once; `years` is the financial-year list, used to check the start date falls inside its year. */
export function validateTrust(t: TrustCreate, years: FinancialYear[], editing: boolean): TrustErrors {
  const e: TrustErrors = {};
  if (!editing) {
    if (!t.trust_code.trim()) e.trust_code = 'Trust code is required';
    else if (!isTrustCode(t.trust_code)) e.trust_code = 'Must be exactly 3 letters, e.g. SAT';
  }
  if (!t.trust_desc.trim()) e.trust_desc = 'Trust name is required';
  else if (t.trust_desc.trim().length > 100) e.trust_desc = 'Must be 100 characters or fewer';
  if (!t.wrk_st_finyr) e.wrk_st_finyr = 'Choose the financial year';
  if (!t.wrk_st_date) e.wrk_st_date = 'Start date is required';
  else {
    const fy = years.find((y) => y.finyr === t.wrk_st_finyr);
    if (fy && (t.wrk_st_date < fy.finyr_st_date || t.wrk_st_date > fy.finyr_end_date)) {
      e.wrk_st_date = `Must fall inside ${fy.finyr}`;
    }
  }
  return e;
}

/** Today in India as YYYY-MM-DD (the API's DEFAULT_TIMEZONE). */
export function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}
