// Mirrors the API's company rules (docs/API.md) for instant feedback.
// The API checks everything again; its answer always wins.
import type { CompanyInput } from './types';

export type Errors = Partial<Record<keyof CompanyInput, string>>;

const MAX: Partial<Record<keyof CompanyInput, number>> = {
  name: 300, shortname: 50, address: 300, city: 200, state: 200, country: 200,
  email: 200, website: 150, header_1: 200, header_2: 200,
};

export function normaliseMobile(v: string): string {
  let s = v.trim().replace(/[\s-]/g, '');
  if (s.startsWith('+91')) s = s.slice(3);
  else if (s.length === 12 && s.startsWith('91')) s = s.slice(2);
  else if (s.length === 11 && s.startsWith('0')) s = s.slice(1);
  return s;
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
