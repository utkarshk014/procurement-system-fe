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

/** One row of a Form 5 code list (places, branches, regions). The same shape for all three. */
export interface CodeEntry {
  code: string;
  name: string;
  rec_created_at?: string;
  last_update_at?: string | null;
}

export type CodeEntryInput = Pick<CodeEntry, 'code' | 'name'>;

/** An institution (Form 5). place_name, branch_name and trust_name are copied in by the server. */
export interface Institution {
  inst_code: string;
  inst_reg_code: string;
  inst_full_code: string;
  inst_name: string;
  inst_add: string;
  inst_place: string;
  place_code: string;
  place_name: string;
  branch_code: string;
  branch_name: string;
  trust_code: string;
  trust_name: string;
  reg_date: string;
  from_fin_yr: string;
  inst_email: string;
  inst_tel: string;
  inst_head_name: string;
  inst_head_desig: string;
  inst_head_mobile: string;
  inst_head_email: string;
  inst_acnt_name: string;
  inst_acnt_mobile: string;
  inst_acnt_email: string;
  inst_liason_name: string;
  inst_liason_desig: string;
  inst_liason_mobile: string;
  inst_liason_email: string;
  rec_created_at?: string;
  last_update_at?: string | null;
}

/** POST body. The full code, the *_name copies and the timestamps are server-owned. */
export type InstitutionInput = Omit<
  Institution,
  'inst_full_code' | 'place_name' | 'branch_name' | 'trust_name' | 'rec_created_at' | 'last_update_at'
>;

export interface InstitutionPage {
  items: Institution[];
  total: number;
  page: number;
  page_size: number;
}

export interface NextCodes {
  inst_code: string;
  inst_reg_code: string;
}

export interface ImportProblem {
  row: number;
  inst_code: string;
  inst_name: string;
  errors: { field?: string; message: string }[];
}

export interface NameCount {
  name: string;
  rows: number;
}

/** POST /institutions/import: a dry run saves nothing; otherwise the ready rows are saved together. */
export interface ImportReport {
  dry_run: boolean;
  total: number;
  ready: number;
  imported: number;
  skipped: number;
  problems: ImportProblem[];
  missing_places: NameCount[];
  missing_branches: NameCount[];
  default_from_fin_yr: string;
}

/** One row of a stock list (item groups, categories, manufacturers). The server numbers rows itself. */
export interface StockEntry {
  id: number;
  name: string;
  rec_created_at?: string;
  last_update_at?: string | null;
}

/** A unit of measurement. number_decimal is how many decimals a quantity may have (0 when off). */
export interface Uom {
  id: number;
  uom: string;
  uom_as_standard: string;
  enable_decimal: boolean;
  number_decimal: number;
  rec_created_at?: string;
  last_update_at?: string | null;
}

export type UomInput = Pick<Uom, 'uom' | 'uom_as_standard' | 'enable_decimal'> & { number_decimal: string };

export type ItemType = 'Goods' | 'Service';

/** An item. item_group, category, manufacturer and uom are the linked rows' names, filled in by the server. */
export interface Item {
  id: number;
  item_desc: string;
  item_code: string;
  grp_cd: number | null;
  item_group?: string;
  cat_cd: number | null;
  category?: string;
  manf_cd: number | null;
  manufacturer?: string;
  uom_cd: number | null;
  uom?: string;
  goods_service_item: ItemType;
  item_consumable: boolean;
  item_is_spare: boolean;
  gst_applicable: boolean;
  gst_hsn_code: string;
  gst_percentage: number | null;
  sgst_percentage: number | null;
  cgst_percentage: number | null;
  track_serial: boolean;
  rec_created_at?: string;
  last_update_at?: string | null;
}

/** The item form: ids and percentages are kept as typed text until they are sent. */
export interface ItemForm {
  item_desc: string;
  item_code: string;
  grp_cd: string;
  cat_cd: string;
  manf_cd: string;
  uom_cd: string;
  goods_service_item: ItemType;
  item_consumable: boolean;
  item_is_spare: boolean;
  track_serial: boolean;
  gst_applicable: boolean;
  gst_hsn_code: string;
  gst_percentage: string;
  sgst_percentage: string;
  cgst_percentage: string;
}
