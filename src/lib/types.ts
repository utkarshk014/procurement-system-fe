export type Role = 'tenant_admin' | 'platform_admin';

export interface User {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  tenant?: { id: number; code: string; name: string } | null;
}

export interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  refresh_expires_in: number;
  user: User;
}

export type NextStep = 'financial_year' | 'company' | 'done';

export interface SetupStatus {
  financial_year_done: boolean;
  current_financial_year?: string;
  company_done: boolean;
  next_step: NextStep;
}

export interface FinYearOption {
  finyr: string;
  finyr_st_date: string;
  finyr_end_date: string;
  kind: 'previous' | 'current' | 'future';
  exists: boolean;
}

export interface FinancialYear {
  finyr: string;
  finyr_st_date: string;
  finyr_end_date: string;
  finyr_is_current: boolean;
  rec_created_at: string;
}

/** Fields the company form sends. The API rejects sl, time_zone and rec_created_at. */
export interface CompanyInput {
  name: string;
  shortname: string;
  address: string;
  city: string;
  state: string;
  country: string;
  pin: string;
  mobile: string;
  email: string;
  website: string;
  header_1: string;
  header_2: string;
  fin_st_dt?: string;
}

export interface Company extends Omit<CompanyInput, 'fin_st_dt'> {
  sl: number;
  fin_st_dt: string;
  time_zone: string;
  rec_created_at: string;
}

export interface GstState {
  code: string;
  name: string;
}

/** Company tax and contact details (Form 3). The mail password is never returned, only whether one is stored. */
export interface TaxDetails {
  sl: number;
  pan_enabled: boolean;
  pan_enabled_dt: string | null;
  pan: string;
  gstin_enabled: boolean;
  gstin_enabled_dt: string | null;
  gstin: string;
  gstin_state: string;
  comm_mail_id: string;
  comm_mail_pwd_set: boolean;
  comm_mobile: string;
  comm_whatsapp: string;
  rec_created_at?: string;
}

/** PUT body. Leave comm_mail_pwd out to keep the stored password; "" removes it. */
export type TaxDetailsInput = Omit<TaxDetails, 'sl' | 'comm_mail_pwd_set' | 'rec_created_at'> & { comm_mail_pwd?: string };

export interface Trust {
  trust_code: string;
  trust_desc: string;
  wrk_st_finyr: string;
  wrk_st_date: string;
  rec_created_at?: string;
  last_update_at?: string;
}

export type TrustCreate = Pick<Trust, 'trust_code' | 'trust_desc' | 'wrk_st_finyr' | 'wrk_st_date'>;
export type TrustUpdate = Omit<TrustCreate, 'trust_code'>;
