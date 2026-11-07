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
  kind: 'current' | 'previous';
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
