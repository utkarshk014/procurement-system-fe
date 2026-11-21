import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import { formatDate } from '../lib/format';
import type {
  FinancialForm, StockEntry, UploadedFile, VendorCertificates, VendorContact, VendorDetail, VendorFinancial, VendorForm, VendorOptions,
} from '../lib/types';
import { finYearOf, validateFinancial, validateVendor, vendorPhone, type VendorErrors } from '../lib/validators';
import { Banner, Field, Loading } from '../components/ui';

/** Today as YYYY-MM-DD in the browser's zone. */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const NO_CONTACT: VendorContact = { person: '', designation: '', mobile: '', email: '' };

const EMPTY: VendorForm = {
  name: '', address: '', city: '', state: '', country: '', pin: '', vendor_type: '', mobile: '', email: '', website: '',
  reg_date: '', pan: '', gstin: '', tan: '', refered_by: '', correspond_email: '', correspond_mobile: '', supply_type: '',
  is_contruction_comp: false, is_manufacturer: false, company_since: '',
  contacts: [NO_CONTACT, NO_CONTACT, NO_CONTACT], grp_cds: [],
};

function toForm(v: VendorDetail): VendorForm {
  const contacts = [0, 1, 2].map((i) => ({ ...NO_CONTACT, ...v.contacts[i] }));
  return {
    name: v.name, address: v.address, city: v.city, state: v.state, country: v.country, pin: v.pin,
    vendor_type: v.vendor_type, mobile: v.mobile, email: v.email, website: v.website, reg_date: v.reg_date ?? '',
    pan: v.pan, gstin: v.gstin, tan: v.tan, refered_by: v.refered_by, correspond_email: v.correspond_email,
    correspond_mobile: v.correspond_mobile, supply_type: v.supply_type, is_contruction_comp: v.is_contruction_comp,
    is_manufacturer: v.is_manufacturer, company_since: v.company_since, contacts, grp_cds: v.item_groups.map((g) => g.grp_cd),
  };
}

/** Indian grouping, paise only when there are any, a loss as −₹: 12500000.5 → "₹ 1,25,00,000.50". */
const money = (n: number | null) => {
  if (n === null) return '—';
  const decimals = Number.isInteger(n) ? 0 : 2;
  const text = Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: 2 });
  return `${n < 0 ? '−' : ''}₹ ${text}`;
};

/** Opens one of the vendor's files through a short-lived link. The tab is opened first so the browser does not block it. */
async function openFile(vendorId: number, key: string) {
  const w = window.open('', '_blank');
  try {
    const { url } = await api<{ url: string }>(`/api/v1/vendors/${vendorId}/files/url?key=${encodeURIComponent(key)}`);
    if (w) w.location.href = url;
    else window.location.href = url;
  } catch (e) {
    w?.close();
    window.alert(errorMessage(e));
  }
}

async function uploadFile(vendorId: number, file: File): Promise<UploadedFile> {
  if (file.size > 10 * 1024 * 1024) throw new Error(`"${file.name}" is too large (10 MB at most).`);
  const body = new FormData();
  body.append('file', file);
  try {
    return await api<UploadedFile>(`/api/v1/vendors/${vendorId}/files`, { method: 'POST', body });
  } catch (e) {
    // "Some fields need attention" says nothing here: name the file and the reason.
    if (e instanceof ApiError && e.fields[0]?.message) throw new Error(`"${file.name}" ${e.fields[0].message}.`);
    throw e;
  }
}

/** The readable part of a stored key: "esis/vendors/3/9f…-GST-certificate.pdf" → "GST-certificate.pdf". */
const fileLabel = (key: string) => key.split('/').pop()?.replace(/^[0-9a-f]{16}-/, '') ?? key;

/** Add a vendor (/vendors/new) or view and edit one (/vendors/:id) with its financials and certificates. */
export default function VendorPage() {
  const { id: idParam } = useParams();
  const isNew = idParam === 'new';
  const vendorId = isNew ? 0 : Number(idParam);
  const navigate = useNavigate();
  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [groups, setGroups] = useState<StockEntry[] | null>(null);
  const [options, setOptions] = useState<VendorOptions | null>(null);
  const [loadError, setLoadError] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [g, o, v] = await Promise.all([
        api<StockEntry[]>('/api/v1/stock/groups'),
        api<VendorOptions>('/api/v1/vendors/options'),
        isNew ? Promise.resolve(null) : api<VendorDetail>(`/api/v1/vendors/${vendorId}`),
      ]);
      setGroups(g);
      setOptions(o);
      setVendor(v);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [isNew, vendorId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!isNew && !(vendorId > 0)) return <Banner kind="err">Vendor not found.</Banner>;
  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!groups || !options || (!isNew && !vendor)) return <Loading label="Loading vendor…" />;

  async function remove() {
    if (!vendor) return;
    if (!window.confirm(`Delete vendor "${vendor.name}" with its financials and certificates? This cannot be undone.`)) return;
    try {
      await api<void>(`/api/v1/vendors/${vendor.id}`, { method: 'DELETE' });
      navigate('/vendors', { state: { flash: `Vendor "${vendor.name}" deleted.` } });
    } catch (e) {
      setBanner({ kind: 'err', text: errorMessage(e) });
    }
  }

  return (
    <>
      <div className="page-head row">
        <div>
          <h1>{vendor ? vendor.name : 'Add a vendor'}</h1>
          <p className="muted">{vendor ? [vendor.city, vendor.gstin].filter(Boolean).join(' · ') || 'Vendor' : 'Details first; financials and certificates once it is saved.'}</p>
        </div>
        <div className="row-actions">
          {vendor && (
            <button type="button" className="btn btn-danger" onClick={remove}>
              Delete vendor
            </button>
          )}
          <Link to="/vendors" className="btn btn-secondary">
            All vendors
          </Link>
        </div>
      </div>
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}

      <VendorFormCard
        key={vendor?.id ?? 'new'}
        vendor={vendor}
        groups={groups}
        options={options}
        onSaved={(saved) => {
          if (isNew) {
            navigate(`/vendors/${saved.id}`, { replace: true });
            return;
          }
          setVendor(saved);
          setBanner({ kind: 'ok', text: 'Vendor details saved.' });
        }}
      />

      {vendor && (
        <>
          <FinancialsCard vendor={vendor} onChange={(financials) => setVendor({ ...vendor, financials })} />
          <CertificatesCard vendor={vendor} options={options} onSaved={(certificates) => setVendor({ ...vendor, certificates })} />
        </>
      )}
    </>
  );
}

// ---------- Details

function VendorFormCard({ vendor, groups, options, onSaved }: {
  vendor: VendorDetail | null;
  groups: StockEntry[];
  options: VendorOptions;
  onSaved: (v: VendorDetail) => void;
}) {
  const today = useMemo(todayISO, []);
  const [form, setForm] = useState<VendorForm>(() => (vendor ? toForm(vendor) : EMPTY));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<VendorErrors>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [groupSearch, setGroupSearch] = useState('');

  const clientErrors = useMemo(() => validateVendor(form, today), [form, today]);
  const err = (k: string) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  function set<K extends keyof VendorForm>(k: K, v: VendorForm[K]) {
    setForm((f) => ({ ...f, [k]: v }));
    setServerErrors((s) => ({ ...s, [k]: undefined }));
    setDirty(true);
  }
  function setContact(i: number, k: keyof VendorContact, v: string) {
    setForm((f) => ({ ...f, contacts: f.contacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }));
    setServerErrors((s) => ({ ...s, [`contacts.${i}.${k}`]: undefined }));
    setDirty(true);
  }
  const blur = (k: string) => () => setTouched((t) => new Set(t).add(k));

  function toggleGroup(id: number) {
    set('grp_cds', form.grp_cds.includes(id) ? form.grp_cds.filter((g) => g !== id) : [...form.grp_cds, id]);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const all = new Set<string>(Object.keys(form));
    form.contacts.forEach((_, i) => ['person', 'designation', 'mobile', 'email'].forEach((k) => all.add(`contacts.${i}.${k}`)));
    setTouched(all);
    setError('');
    const first = Object.keys(clientErrors).find((k) => clientErrors[k]);
    if (first) {
      document.getElementById(`vendor-${first.replace(/\./g, '-')}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const t = (s: string) => s.trim();
      const saved = await api<VendorDetail>(vendor ? `/api/v1/vendors/${vendor.id}` : '/api/v1/vendors', {
        method: vendor ? 'PUT' : 'POST',
        body: JSON.stringify({
          ...form,
          name: t(form.name), address: t(form.address), city: t(form.city), state: t(form.state), country: t(form.country),
          pin: t(form.pin), mobile: vendorPhone(form.mobile), email: t(form.email), website: t(form.website),
          pan: t(form.pan).toUpperCase(), gstin: t(form.gstin).toUpperCase(), tan: t(form.tan).toUpperCase(),
          refered_by: t(form.refered_by), correspond_email: t(form.correspond_email), correspond_mobile: t(form.correspond_mobile),
          company_since: t(form.company_since),
          contacts: form.contacts.map((c) => ({ person: t(c.person), designation: t(c.designation), mobile: t(c.mobile), email: t(c.email) })),
        }),
      });
      setForm(toForm(saved)); // show what was stored: tidied mobiles, upper-case PAN, lower-case emails
      setTouched(new Set());
      setDirty(false);
      onSaved(saved);
    } catch (e2) {
      const fields = e2 instanceof ApiError ? fieldMap(e2.fields) : {};
      if (Object.keys(fields).length) {
        setServerErrors(fields);
        setTouched((tt) => new Set([...tt, ...Object.keys(fields)]));
      }
      setError(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  const text = (k: keyof VendorForm, label: string, className: string, opts: { required?: boolean; max?: number; hint?: ReactNode; type?: string; upper?: boolean; inputMode?: 'numeric' | 'tel' | 'email' } = {}) => (
    <Field id={`vendor-${k}`} label={label} required={opts.required} error={err(k)} hint={opts.hint} className={className}>
      <input
        id={`vendor-${k}`}
        type={opts.type ?? 'text'}
        value={form[k] as string}
        maxLength={opts.max}
        inputMode={opts.inputMode}
        max={opts.type === 'date' ? today : undefined}
        onChange={(e) => set(k, (opts.upper ? e.target.value.toUpperCase() : e.target.value) as never)}
        onBlur={blur(k)}
        autoComplete="off"
        aria-invalid={!!err(k)}
      />
    </Field>
  );

  const choice = (k: 'vendor_type' | 'supply_type', label: string, list: string[]) => (
    <Field id={`vendor-${k}`} label={label} error={err(k)} className="col-3">
      <select id={`vendor-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} onBlur={blur(k)} aria-invalid={!!err(k)}>
        <option value="">Not set</option>
        {list.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );

  const shownGroups = groups.filter((g) => !groupSearch.trim() || g.name.toLowerCase().includes(groupSearch.trim().toLowerCase()));
  const gstinState = vendor && form.gstin.trim().toUpperCase() === vendor.gstin ? vendor.gstin_state : '';

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <h2>{vendor ? 'Details' : 'New vendor'}</h2>
      {error && <Banner kind="err">{error}</Banner>}

      <h3>Vendor</h3>
      <div className="grid">
        {text('name', 'Name', 'col-6', { required: true, max: 250, hint: 'e.g. ABC Computers' })}
        {choice('vendor_type', 'Vendor type', options.vendor_types)}
        {choice('supply_type', 'Supplies', options.supply_types)}
        {text('address', 'Address', 'col-6', { max: 250 })}
        {text('city', 'City', 'col-3', { max: 250 })}
        {text('state', 'State', 'col-3', { max: 250 })}
        {text('country', 'Country', 'col-3', { max: 250, hint: 'Empty means India' })}
        {text('pin', 'PIN code', 'col-3', { max: 10, inputMode: 'numeric' })}
        {text('mobile', 'Phone', 'col-3', { max: 20, inputMode: 'tel', hint: 'Mobile or landline' })}
        {text('email', 'Email', 'col-3', { max: 150, inputMode: 'email' })}
        {text('website', 'Website', 'col-4', { max: 100, hint: 'e.g. abc.in' })}
        {text('reg_date', 'Registered on', 'col-3', { type: 'date' })}
        {text('company_since', 'In business since', 'col-2', { max: 4, inputMode: 'numeric', hint: 'Year' })}
        {text('refered_by', 'Referred by', 'col-3', { max: 250 })}
        <div className="field col-3 check-field">
          <label className="check">
            <input type="checkbox" checked={form.is_manufacturer} onChange={(e) => set('is_manufacturer', e.target.checked)} />
            Manufacturer
          </label>
        </div>
        <div className="field col-3 check-field">
          <label className="check">
            <input type="checkbox" checked={form.is_contruction_comp} onChange={(e) => set('is_contruction_comp', e.target.checked)} />
            Construction company
          </label>
        </div>
      </div>

      <h3>Tax</h3>
      <div className="grid">
        {text('pan', 'PAN', 'col-3', { max: 10, upper: true, hint: 'e.g. ABCDE1234F' })}
        {text('gstin', 'GSTIN', 'col-4', { max: 15, upper: true, hint: gstinState ? `State: ${gstinState}` : 'Its state is filled in from the code' })}
        {text('tan', 'TAN', 'col-3', { max: 10, upper: true, hint: 'e.g. BLRA12345B' })}
      </div>

      <h3>Correspondence</h3>
      <div className="grid">
        {text('correspond_email', 'Email', 'col-6', { max: 150, inputMode: 'email' })}
        {text('correspond_mobile', 'Mobile', 'col-3', { max: 20, inputMode: 'tel', hint: '10 digits' })}
      </div>

      <h3>Contacts</h3>
      {form.contacts.map((c, i) => (
        <div className="grid" key={i}>
          {(['person', 'designation', 'mobile', 'email'] as const).map((k) => {
            const key = `contacts.${i}.${k}`;
            const id = `vendor-contacts-${i}-${k}`;
            const label = { person: `Contact ${i + 1}`, designation: 'Designation', mobile: 'Mobile', email: 'Email' }[k];
            return (
              <Field key={k} id={id} label={label} error={err(key)} className="col-3">
                <input id={id} value={c[k]} maxLength={k === 'mobile' ? 20 : 150} inputMode={k === 'mobile' ? 'tel' : k === 'email' ? 'email' : undefined}
                  onChange={(e) => setContact(i, k, e.target.value)} onBlur={blur(key)} autoComplete="off" aria-invalid={!!err(key)} />
              </Field>
            );
          })}
        </div>
      ))}

      <h3>Item groups supplied</h3>
      {err('grp_cds') && <p className="error small">{err('grp_cds')}</p>}
      {groups.length === 0 ? (
        <p className="muted small">
          No item groups yet. Add them on the <Link to="/stock?tab=groups">Stock lists</Link> page.
        </p>
      ) : (
        <>
          {groups.length > 12 && (
            <input className="search" type="search" placeholder="Find an item group" aria-label="Find an item group"
              value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} />
          )}
          <div className="check-grid" role="group" aria-label="Item groups supplied">
            {shownGroups.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={form.grp_cds.includes(g.id)} onChange={() => toggleGroup(g.id)} />
                {g.name}
              </label>
            ))}
          </div>
          <p className="muted small">{form.grp_cds.length} selected</p>
        </>
      )}

      <div className="actions">
        {vendor && dirty && (
          <button type="button" className="btn btn-secondary" disabled={saving}
            onClick={() => { setForm(toForm(vendor)); setServerErrors({}); setTouched(new Set()); setDirty(false); setError(''); }}>
            Undo changes
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={saving || (!!vendor && !dirty)}>
          {saving ? 'Saving…' : vendor ? 'Save details' : 'Add vendor'}
        </button>
      </div>
    </form>
  );
}

// ---------- Financials

const EMPTY_FIN: FinancialForm = {
  fin_year: '', fin_turnover_declared: '', fin_profit_declared: '', fin_itr_no: '', fin_itr_date: '', fin_itr_s3_bucket_reference: '',
};

function finToForm(f: VendorFinancial): FinancialForm {
  const n = (v: number | null) => (v === null ? '' : String(v));
  return {
    fin_year: f.fin_year, fin_turnover_declared: n(f.fin_turnover_declared), fin_profit_declared: n(f.fin_profit_declared),
    fin_itr_no: f.fin_itr_no, fin_itr_date: f.fin_itr_date ?? '', fin_itr_s3_bucket_reference: f.fin_itr_s3_bucket_reference,
  };
}

function FinancialsCard({ vendor, onChange }: { vendor: VendorDetail; onChange: (f: VendorFinancial[]) => void }) {
  const [formFor, setFormFor] = useState<'new' | VendorFinancial | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(f: VendorFinancial) {
    if (!window.confirm(`Delete the financials for ${f.fin_year}? This cannot be undone.`)) return;
    setBusy(true);
    setBanner(null);
    try {
      await api<void>(`/api/v1/vendors/${vendor.id}/financials/${f.fin_year}`, { method: 'DELETE' });
      onChange(vendor.financials.filter((x) => x.fin_year !== f.fin_year));
      setBanner({ kind: 'ok', text: `Financials for ${f.fin_year} deleted.` });
    } catch (e) {
      setBanner({ kind: 'err', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Financials</h2>
        {!formFor && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => { setBanner(null); setFormFor('new'); }}>
            Add a year
          </button>
        )}
      </div>
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}
      {formFor && (
        <FinancialFormCard
          key={formFor === 'new' ? 'new' : formFor.fin_year}
          vendorId={vendor.id}
          editing={formFor === 'new' ? null : formFor}
          taken={vendor.financials.map((f) => f.fin_year)}
          onCancel={() => setFormFor(null)}
          onSaved={(saved) => {
            const rest = vendor.financials.filter((f) => f.fin_year !== saved.fin_year);
            onChange([...rest, saved].sort((a, b) => b.fin_year.localeCompare(a.fin_year)));
            setBanner({ kind: 'ok', text: `Financials for ${saved.fin_year} saved.` });
            setFormFor(null);
          }}
        />
      )}
      {vendor.financials.length === 0 ? (
        !formFor && <p className="muted section-note">No financial years yet: declared turnover, profit and the income tax return.</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Year</th><th>Turnover</th><th>Profit</th><th className="hide-sm">ITR</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {vendor.financials.map((f) => (
                <tr key={f.fin_year}>
                  <td><strong>{f.fin_year}</strong></td>
                  <td className="nowrap">{money(f.fin_turnover_declared)}</td>
                  <td className="nowrap">{money(f.fin_profit_declared)}</td>
                  <td className="hide-sm">
                    {f.fin_itr_no || '—'}
                    <div className="muted small">
                      {f.fin_itr_date && formatDate(f.fin_itr_date)}
                      {f.fin_itr_s3_bucket_reference && (
                        <>
                          {f.fin_itr_date && ' · '}
                          <button type="button" className="btn btn-link btn-inline" onClick={() => openFile(vendor.id, f.fin_itr_s3_bucket_reference)}>
                            View ITR
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="right">
                    <div className="row-actions">
                      <button type="button" className="btn btn-secondary btn-sm" disabled={busy || !!formFor}
                        onClick={() => { setBanner(null); setFormFor(f); }} aria-label={`Edit financials for ${f.fin_year}`}>
                        Edit
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" disabled={busy || !!formFor}
                        onClick={() => remove(f)} aria-label={`Delete financials for ${f.fin_year}`}>
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FinancialFormCard({ vendorId, editing, taken, onCancel, onSaved }: {
  vendorId: number;
  editing: VendorFinancial | null;
  taken: string[];
  onCancel: () => void;
  onSaved: (f: VendorFinancial) => void;
}) {
  const today = useMemo(todayISO, []);
  const [form, setForm] = useState<FinancialForm>(() => (editing ? finToForm(editing) : { ...EMPTY_FIN, fin_year: suggestYear(today, taken) }));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const clientErrors = useMemo(() => {
    const e: Record<string, string | undefined> = validateFinancial(form, today);
    if (!editing && !e.fin_year && taken.includes(form.fin_year.trim())) e.fin_year = 'already has financials: edit that year instead';
    return e;
  }, [form, today, editing, taken]);
  const err = (k: keyof FinancialForm) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  function set(k: keyof FinancialForm, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const up = await uploadFile(vendorId, file);
      set('fin_itr_s3_bucket_reference', up.key);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setTouched(new Set(Object.keys(form)));
    setError('');
    const first = Object.keys(clientErrors).find((k) => clientErrors[k]);
    if (first) {
      document.getElementById(`fin-${first}`)?.focus();
      return;
    }
    const num = (v: string) => (v.trim() ? Number(v.trim().replace(/,/g, '')) : null);
    setSaving(true);
    try {
      const body = JSON.stringify({
        fin_year: form.fin_year.trim(),
        fin_turnover_declared: num(form.fin_turnover_declared),
        fin_profit_declared: num(form.fin_profit_declared),
        fin_itr_no: form.fin_itr_no.trim(),
        fin_itr_date: form.fin_itr_date,
        fin_itr_s3_bucket_reference: form.fin_itr_s3_bucket_reference,
      });
      const saved = editing
        ? await api<VendorFinancial>(`/api/v1/vendors/${vendorId}/financials/${editing.fin_year}`, { method: 'PUT', body })
        : await api<VendorFinancial>(`/api/v1/vendors/${vendorId}/financials`, { method: 'POST', body });
      onSaved(saved);
    } catch (e2) {
      const fields = e2 instanceof ApiError ? fieldMap(e2.fields) : {};
      if (Object.keys(fields).length) setServerErrors(fields);
      setError(errorMessage(e2));
    } finally {
      setSaving(false);
    }
  }

  const input = (k: keyof FinancialForm, label: string, className: string, opts: { hint?: ReactNode; type?: string; max?: number; decimal?: boolean; readOnly?: boolean } = {}) => (
    <Field id={`fin-${k}`} label={label} error={err(k)} hint={opts.hint} className={className} required={k === 'fin_year'}>
      <input id={`fin-${k}`} type={opts.type ?? 'text'} value={form[k]} maxLength={opts.max} readOnly={opts.readOnly}
        inputMode={opts.decimal ? 'decimal' : undefined} max={opts.type === 'date' ? today : undefined}
        onChange={(e) => set(k, e.target.value)} onBlur={() => setTouched((t) => new Set(t).add(k))} autoComplete="off" aria-invalid={!!err(k)} />
    </Field>
  );

  return (
    <form className="subcard" onSubmit={onSubmit} noValidate>
      <h3>{editing ? `Edit ${editing.fin_year}` : 'Add a financial year'}</h3>
      {error && <Banner kind="err">{error}</Banner>}
      <div className="grid">
        {input('fin_year', 'Financial year', 'col-3', { max: 9, readOnly: !!editing, hint: editing ? 'The year cannot change' : 'e.g. 2025-2026' })}
        {input('fin_turnover_declared', 'Turnover declared (₹)', 'col-3', { decimal: true })}
        {input('fin_profit_declared', 'Profit declared (₹)', 'col-3', { decimal: true, hint: 'Negative for a loss' })}
        {input('fin_itr_no', 'ITR acknowledgement no.', 'col-3', { max: 25 })}
        {input('fin_itr_date', 'ITR filed on', 'col-3', { type: 'date' })}
        <div className="field col-9">
          <label htmlFor="fin-itr-file">ITR document</label>
          <div className="file-row">
            {form.fin_itr_s3_bucket_reference ? (
              <>
                <button type="button" className="btn btn-link btn-inline" onClick={() => openFile(vendorId, form.fin_itr_s3_bucket_reference)}>
                  {fileLabel(form.fin_itr_s3_bucket_reference)}
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => set('fin_itr_s3_bucket_reference', '')} disabled={uploading}>
                  Remove
                </button>
              </>
            ) : (
              <span className="muted small">No file</span>
            )}
            <input ref={fileInput} id="fin-itr-file" type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInput.current?.click()} disabled={uploading}>
              {uploading ? 'Uploading…' : form.fin_itr_s3_bucket_reference ? 'Replace' : 'Upload'}
            </button>
          </div>
          <small className="hint">PDF, JPG or PNG, up to 10 MB</small>
        </div>
      </div>
      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving || uploading}>
          {saving ? 'Saving…' : editing ? 'Save year' : 'Add year'}
        </button>
      </div>
    </form>
  );
}

/** The latest finished financial year without financials yet, e.g. 2025-2026 during 2026-2027. */
function suggestYear(today: string, taken: string[]): string {
  let start = Number(finYearOf(today).slice(0, 4)) - 1;
  for (let i = 0; i < 10; i++, start--) {
    const y = `${start}-${start + 1}`;
    if (!taken.includes(y)) return y;
  }
  return '';
}

// ---------- Certificates

function CertificatesCard({ vendor, options, onSaved }: {
  vendor: VendorDetail;
  options: VendorOptions;
  onSaved: (c: VendorCertificates) => void;
}) {
  const [certs, setCerts] = useState<VendorCertificates>(vendor.certificates);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const dirty = options.certificate_slots.some(
    (s) => (certs[s]?.file ?? '') !== (vendor.certificates[s]?.file ?? '') || (certs[s]?.caption ?? '') !== (vendor.certificates[s]?.caption ?? ''),
  );

  function setSlot(slot: string, patch: Partial<{ file: string; caption: string }>) {
    setCerts((c) => ({ ...c, [slot]: { file: c[slot]?.file ?? '', caption: c[slot]?.caption, ...patch } }));
    setFieldErrors((f) => ({ ...f, [`${slot}.file`]: '', [`${slot}.caption`]: '' }));
  }

  async function onFile(slot: string, file: File | undefined) {
    if (!file) return;
    setUploading(slot);
    setBanner(null);
    try {
      const up = await uploadFile(vendor.id, file);
      setSlot(slot, { file: up.key });
    } catch (e) {
      setBanner({ kind: 'err', text: `${options.certificate_labels[slot]}: ${errorMessage(e)}` });
    } finally {
      setUploading(null);
      const el = inputs.current[slot];
      if (el) el.value = '';
    }
  }

  async function save() {
    const missing = options.certificate_slots.filter((s) => s.startsWith('oth_') && certs[s]?.file && !certs[s]?.caption?.trim());
    if (missing.length) {
      setFieldErrors(Object.fromEntries(missing.map((s) => [`${s}.caption`, 'say what this certificate is'])));
      document.getElementById(`cert-${missing[0]}-caption`)?.focus();
      return;
    }
    setSaving(true);
    setBanner(null);
    try {
      const body: VendorCertificates = {};
      for (const s of options.certificate_slots) {
        body[s] = { file: certs[s]?.file ?? '', ...(s.startsWith('oth_') ? { caption: certs[s]?.caption?.trim() ?? '' } : {}) };
      }
      const saved = await api<VendorCertificates>(`/api/v1/vendors/${vendor.id}/certificates`, { method: 'PUT', body: JSON.stringify(body) });
      setCerts(saved);
      onSaved(saved);
      setBanner({ kind: 'ok', text: 'Certificates saved.' });
    } catch (e) {
      if (e instanceof ApiError) setFieldErrors(fieldMap(e.fields));
      setBanner({ kind: 'err', text: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Certificates</h2>
      </div>
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Certificate</th><th>File</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {options.certificate_slots.map((slot) => {
              const c = certs[slot] ?? { file: '' };
              const other = slot.startsWith('oth_');
              const capErr = fieldErrors[`${slot}.caption`];
              const fileErr = fieldErrors[`${slot}.file`];
              return (
                <tr key={slot}>
                  <td>
                    {other ? (
                      <div className={`field ${capErr ? 'invalid' : ''}`} style={{ marginBottom: 0 }}>
                        <input id={`cert-${slot}-caption`} placeholder={options.certificate_labels[slot]} aria-label={`${options.certificate_labels[slot]} name`}
                          value={c.caption ?? ''} maxLength={100} onChange={(e) => setSlot(slot, { caption: e.target.value })} aria-invalid={!!capErr} />
                        {capErr && <small className="error">{capErr}</small>}
                      </div>
                    ) : (
                      <strong>{options.certificate_labels[slot]}</strong>
                    )}
                  </td>
                  <td>
                    {c.file ? (
                      <button type="button" className="btn btn-link btn-inline" onClick={() => openFile(vendor.id, c.file)}>
                        {fileLabel(c.file)}
                      </button>
                    ) : (
                      <span className="muted">Not uploaded</span>
                    )}
                    {fileErr && <div className="error small">{fileErr}</div>}
                  </td>
                  <td className="right">
                    <div className="row-actions">
                      <input ref={(el) => { inputs.current[slot] = el; }} type="file" className="sr-only"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" aria-label={`Upload ${options.certificate_labels[slot]}`}
                        onChange={(e) => onFile(slot, e.target.files?.[0])} />
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!!uploading || saving}
                        onClick={() => inputs.current[slot]?.click()}>
                        {uploading === slot ? 'Uploading…' : c.file ? 'Replace' : 'Upload'}
                      </button>
                      {c.file && (
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!!uploading || saving} onClick={() => setSlot(slot, { file: '' })}>
                          Remove
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">PDF, JPG or PNG, up to 10 MB each. Uploaded files are kept only once you save.</p>
      <div className="actions">
        {dirty && (
          <button type="button" className="btn btn-secondary" disabled={saving || !!uploading}
            onClick={() => { setCerts(vendor.certificates); setFieldErrors({}); }}>
            Undo changes
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || saving || !!uploading}>
          {saving ? 'Saving…' : 'Save certificates'}
        </button>
      </div>
    </section>
  );
}
