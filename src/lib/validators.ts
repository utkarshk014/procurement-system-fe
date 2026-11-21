// Mirrors the API's rules (docs/API.md and src/packages/validation in the backend) for instant feedback.
// The API checks everything again; its answer always wins.
import { UQCS } from './uqc';
import type { CodeEntryInput, CompanyInput, FinancialYear, GstState, InstitutionInput, TaxDetailsInput, TrustCreate, ItemForm, UomInput, VendorForm, FinancialForm } from './types';

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

// ---------- Places, branches, regions (Form 5) ----------

export const isListCode = (v: string) => /^[A-Z]{3}$/.test(v.trim().toUpperCase());

export type CodeEntryErrors = Partial<Record<keyof CodeEntryInput, string>>;

export function validateCodeEntry(e: CodeEntryInput, label: string): CodeEntryErrors {
  const out: CodeEntryErrors = {};
  if (!e.code.trim()) out.code = `${label} code is required`;
  else if (!isListCode(e.code)) out.code = 'Must be exactly 3 letters, e.g. MYS';
  if (!e.name.trim()) out.name = `${label} name is required`;
  else if (e.name.trim().length > 250) out.name = 'Must be 250 characters or fewer';
  return out;
}

// ---------- Institutions (Form 5) ----------

/** ACM code: trust code, a dash, 3 digits (SAT-001). */
export const isInstCode = (v: string) => /^[A-Z]{3}-\d{3}$/.test(v.trim().toUpperCase());
/** Reg code: region code, a dash, 2 digits (MYS-01). */
export const isRegCode = (v: string) => /^[A-Z]{3}-\d{2}$/.test(v.trim().toUpperCase());

export type InstitutionErrors = Partial<Record<keyof InstitutionInput, string>>;

const INST_MAX: Partial<Record<keyof InstitutionInput, number>> = {
  inst_name: 250, inst_add: 250, inst_place: 250, inst_tel: 100,
  inst_head_name: 100, inst_head_desig: 100, inst_acnt_name: 100, inst_liason_name: 100, inst_liason_desig: 100,
  inst_email: 150, inst_head_email: 150, inst_acnt_email: 150, inst_liason_email: 150,
};

/** Every problem at once; `regions` are the region codes, used to check the reg code's prefix. */
export function validateInstitution(i: InstitutionInput, regions: string[], today: string): InstitutionErrors {
  const e: InstitutionErrors = {};
  const code = i.inst_code.trim().toUpperCase();
  const reg = i.inst_reg_code.trim().toUpperCase();
  if (!i.trust_code) e.trust_code = 'Choose the trust';
  if (!code) e.inst_code = 'ACM code is required';
  else if (!isInstCode(code)) e.inst_code = 'Trust code, a dash and 3 digits, e.g. SAT-001';
  else if (i.trust_code && !code.startsWith(i.trust_code + '-')) e.inst_code = `Must start with ${i.trust_code}-`;
  if (!reg) e.inst_reg_code = 'Reg code is required';
  else if (!isRegCode(reg)) e.inst_reg_code = 'Region code, a dash and 2 digits, e.g. MYS-01';
  else if (regions.length && !regions.includes(reg.slice(0, 3))) e.inst_reg_code = `${reg.slice(0, 3)} is not a region code`;
  if (!i.inst_name.trim()) e.inst_name = 'Institution name is required';
  if (!i.place_code) e.place_code = 'Choose the place';
  if (!i.branch_code) e.branch_code = 'Choose the branch';
  if (!i.from_fin_yr) e.from_fin_yr = 'Choose the start year';
  if (i.reg_date && i.reg_date > today) e.reg_date = 'Cannot be in the future';
  for (const k of ['inst_email', 'inst_head_email', 'inst_acnt_email', 'inst_liason_email'] as const) {
    if (i[k].trim() && !isEmail(i[k])) e[k] = 'Enter a valid email address';
  }
  for (const k of ['inst_head_mobile', 'inst_acnt_mobile', 'inst_liason_mobile'] as const) {
    if (i[k].trim() && !isMobile(i[k])) e[k] = 'Enter a 10-digit mobile number';
  }
  for (const [k, max] of Object.entries(INST_MAX) as [keyof InstitutionInput, number][]) {
    if (!e[k] && String(i[k]).trim().length > max) e[k] = `Must be ${max} characters or fewer`;
  }
  return e;
}

// ---- Stock (the same rules as the API, so most mistakes show before saving)

export type UomErrors = Partial<Record<keyof UomInput, string>>;

export function validateUom(u: UomInput): UomErrors {
  const e: UomErrors = {};
  const uom = u.uom.trim();
  if (!uom) e.uom = 'is required';
  else if (uom.length > 5) e.uom = 'must be at most 5 characters';
  else if (/\s/.test(uom)) e.uom = 'must not contain spaces';
  const std = u.uom_as_standard.trim();
  if (!std) e.uom_as_standard = 'is required';
  else if (!(UQCS as readonly string[]).includes(std)) e.uom_as_standard = 'pick a GST unit code from the list';
  if (u.enable_decimal) {
    if (!u.number_decimal.trim()) e.number_decimal = 'is required when decimals are on';
    else if (!/^[1-9]$/.test(u.number_decimal.trim())) e.number_decimal = 'must be from 1 to 9';
  }
  return e;
}

export type ItemErrors = Partial<Record<keyof ItemForm, string>>;

const isPercent = (v: string) => /^\d{1,3}(\.\d{1,2})?$/.test(v.trim()) && Number(v) <= 100;
const cents = (v: string) => Math.round(Number(v) * 100);

export function validateItem(f: ItemForm): ItemErrors {
  const e: ItemErrors = {};
  if (!f.item_desc.trim()) e.item_desc = 'is required';
  else if (f.item_desc.trim().length > 250) e.item_desc = 'must be at most 250 characters';
  const code = f.item_code.trim();
  if (!code) e.item_code = 'is required';
  else if (code.length > 20) e.item_code = 'must be at most 20 characters';
  else if (code && !/^[A-Za-z0-9][A-Za-z0-9./-]*$/.test(code)) e.item_code = 'may contain only letters, digits and - / .';
  if (!f.grp_cd) e.grp_cd = 'is required';
  if (!f.uom_cd) e.uom_cd = 'is required';
  const hsn = f.gst_hsn_code.trim();
  if (hsn && !/^(\d{4}|\d{6}|\d{8})$/.test(hsn)) e.gst_hsn_code = 'must be 4, 6 or 8 digits';
  if (f.gst_applicable) {
    let ok = true;
    for (const k of ['gst_percentage', 'sgst_percentage', 'cgst_percentage'] as const) {
      if (!f[k].trim()) { e[k] = 'is required when GST applies'; ok = false; }
      else if (!isPercent(f[k])) { e[k] = 'must be from 0 to 100, at most 2 decimals'; ok = false; }
    }
    if (ok && cents(f.gst_percentage) !== cents(f.sgst_percentage) + cents(f.cgst_percentage)) {
      e.gst_percentage = 'must equal SGST plus CGST';
    }
  }
  return e;
}

// ---------- Vendors ----------

export type VendorErrors = Record<string, string | undefined>;

/** The vendor's own number: an optional + and 7 to 14 digits (a landline or a foreign number fits). */
export const vendorPhone = (v: string) => {
  const s = v.trim();
  const plus = s.startsWith('+') ? '+' : '';
  const digits = s.replace(/\D/g, '');
  return digits ? plus + digits : s;
};

/** Same rules as the API's PrepareVendor. Contact fields are keyed contacts.<n>.<field>. */
export function validateVendor(f: VendorForm, today: string): VendorErrors {
  const e: VendorErrors = {};
  const max = (k: keyof VendorForm, n: number) => {
    const v = String(f[k] ?? '').trim();
    if (v.length > n && !e[k]) e[k] = `must be at most ${n} characters`;
  };
  if (!f.name.trim()) e.name = 'is required';
  max('name', 250); max('address', 250); max('city', 250); max('state', 250); max('country', 250);
  max('website', 100); max('refered_by', 250); max('email', 150); max('correspond_email', 150);

  const pin = f.pin.trim();
  if (pin) {
    if (isIndia(f.country)) { if (!isPin(pin)) e.pin = 'must be a 6-digit PIN code'; }
    else if (!/^[A-Za-z0-9 -]{3,10}$/.test(pin)) e.pin = 'may contain only letters, digits, spaces and -';
  }
  if (f.mobile.trim() && !/^\+?\d{7,14}$/.test(vendorPhone(f.mobile))) e.mobile = 'must be 7 to 14 digits, optionally starting with +';
  if (f.email.trim() && !isEmail(f.email)) e.email = 'is not a valid email address';
  if (f.website.trim() && !isWebsite(f.website)) e.website = 'is not a valid website';
  if (f.reg_date && f.reg_date > today) e.reg_date = 'cannot be in the future';

  const pan = f.pan.trim().toUpperCase();
  const gstin = f.gstin.trim().toUpperCase();
  if (pan && !isPan(pan)) e.pan = 'must be a PAN like ABCDE1234F';
  if (gstin) {
    if (!isGstin(gstin)) e.gstin = 'is not a valid GSTIN';
    else if (pan && isPan(pan) && !gstinMatchesPan(gstin, pan)) e.gstin = 'PAN inside GSTIN must match the PAN';
  }
  if (f.tan.trim() && !/^[A-Z]{4}\d{5}[A-Z]$/.test(f.tan.trim().toUpperCase())) e.tan = 'must be a TAN like ABCD12345E';
  if (f.correspond_email.trim() && !isEmail(f.correspond_email)) e.correspond_email = 'is not a valid email address';
  if (f.correspond_mobile.trim() && !isMobile(f.correspond_mobile)) e.correspond_mobile = 'must be a 10-digit mobile number';
  const since = f.company_since.trim();
  if (since) {
    const year = Number(today.slice(0, 4));
    if (!/^\d{4}$/.test(since)) e.company_since = 'must be a 4-digit year';
    else if (Number(since) < 1800 || Number(since) > year) e.company_since = `must be a year from 1800 to ${year}`;
  }
  f.contacts.forEach((c, i) => {
    const k = `contacts.${i}.`;
    if (c.person.trim().length > 150) e[k + 'person'] = 'must be at most 150 characters';
    if (c.designation.trim().length > 150) e[k + 'designation'] = 'must be at most 150 characters';
    if (c.mobile.trim() && !isMobile(c.mobile)) e[k + 'mobile'] = 'must be a 10-digit mobile number';
    if (c.email.trim() && !isEmail(c.email)) e[k + 'email'] = 'is not a valid email address';
    if (!c.person.trim() && (c.designation.trim() || c.mobile.trim() || c.email.trim())) e[k + 'person'] = 'is required for a contact';
  });
  return e;
}

/** The financial year (1 April to 31 March) a YYYY-MM-DD date falls in, e.g. "2026-2027". */
export function finYearOf(date: string): string {
  const y = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${start + 1}`;
}

const isAmount = (v: string, negative: boolean) => {
  const s = v.trim().replace(/,/g, '');
  return (negative ? /^-?\d{1,13}(\.\d{1,2})?$/ : /^\d{1,13}(\.\d{1,2})?$/).test(s);
};

export function validateFinancial(f: FinancialForm, today: string): Partial<Record<keyof FinancialForm, string>> {
  const e: Partial<Record<keyof FinancialForm, string>> = {};
  const m = /^(\d{4})-(\d{4})$/.exec(f.fin_year.trim());
  if (!f.fin_year.trim()) e.fin_year = 'is required';
  else if (!m) e.fin_year = 'must be like 2025-2026';
  else if (Number(m[2]) !== Number(m[1]) + 1) e.fin_year = 'must be two consecutive years, like 2025-2026';
  else if (f.fin_year.trim() > finYearOf(today)) e.fin_year = `cannot be after the current financial year ${finYearOf(today)}`;
  if (f.fin_turnover_declared.trim() && !isAmount(f.fin_turnover_declared, false)) e.fin_turnover_declared = 'must be an amount, at most 2 decimals, not negative';
  if (f.fin_profit_declared.trim() && !isAmount(f.fin_profit_declared, true)) e.fin_profit_declared = 'must be an amount, at most 2 decimals (negative for a loss)';
  if (f.fin_itr_no.trim().length > 25) e.fin_itr_no = 'must be at most 25 characters';
  if (f.fin_itr_date && f.fin_itr_date > today) e.fin_itr_date = 'cannot be in the future';
  return e;
}
