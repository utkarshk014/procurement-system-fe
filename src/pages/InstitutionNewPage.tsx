import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import type { CodeEntry, FinancialYear, Institution, InstitutionInput, NextCodes, Trust } from '../lib/types';
import { normaliseMobile, todayInIndia, validateInstitution, type InstitutionErrors } from '../lib/validators';
import { Banner, Field, Loading, PageHead } from '../components/ui';

interface Lookups {
  trusts: Trust[];
  places: CodeEntry[];
  branches: CodeEntry[];
  regions: CodeEntry[];
  years: FinancialYear[];
}

const EMPTY: InstitutionInput = {
  trust_code: '', inst_code: '', inst_reg_code: '', inst_name: '', inst_add: '', inst_place: '',
  place_code: '', branch_code: '', reg_date: '', from_fin_yr: '',
  inst_email: '', inst_tel: '',
  inst_head_name: '', inst_head_desig: '', inst_head_mobile: '', inst_head_email: '',
  inst_acnt_name: '', inst_acnt_mobile: '', inst_acnt_email: '',
  inst_liason_name: '', inst_liason_desig: '', inst_liason_mobile: '', inst_liason_email: '',
};

type Key = keyof InstitutionInput;
const MOBILES: Key[] = ['inst_head_mobile', 'inst_acnt_mobile', 'inst_liason_mobile'];

/** New institution (Form 5), after the old system's "New Institutional Data" box plus the contacts card. */
export default function InstitutionNewPage() {
  const navigate = useNavigate();
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState<InstitutionInput>(EMPTY);
  const [region, setRegion] = useState('');
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<InstitutionErrors>({});
  const [banner, setBanner] = useState('');
  const [saving, setSaving] = useState(false);
  const today = todayInIndia();
  // The trust and region picked last: a suggestion that arrives after the person picked
  // something else is dropped, so SAT-00x never lands under trust ACU.
  const picked = useRef({ trust: '', region: '' });

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [trusts, places, branches, regions, years] = await Promise.all([
        api<Trust[]>('/api/v1/trusts'),
        api<CodeEntry[]>('/api/v1/places'),
        api<CodeEntry[]>('/api/v1/branches'),
        api<CodeEntry[]>('/api/v1/regions'),
        api<FinancialYear[]>('/api/v1/financial-years'),
      ]);
      setLookups({ trusts, places, branches, regions, years });
      const current = years.find((y) => y.finyr_is_current);
      setForm((f) => ({ ...f, from_fin_yr: f.from_fin_yr || current?.finyr || '' }));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The start year is the current one or the one before it, as on the old screen.
  const startYears = useMemo(() => {
    if (!lookups) return [];
    const sorted = [...lookups.years].sort((a, b) => b.finyr.localeCompare(a.finyr));
    const i = sorted.findIndex((y) => y.finyr_is_current);
    return i < 0 ? sorted.slice(0, 2) : sorted.slice(i, i + 2);
  }, [lookups]);

  const regionCodes = useMemo(() => lookups?.regions.map((r) => r.code) ?? [], [lookups]);
  const clientErrors = useMemo(() => validateInstitution(form, regionCodes, today), [form, regionCodes, today]);
  const visibleError = (k: Key) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  function set(k: Key, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  }
  const blur = (k: Key) => () => setTouched((t) => new Set(t).add(k));

  /** Ask the API for the next free number for one prefix and fill it in, if it is still the one picked. */
  async function suggest(kind: 'trust' | 'region', code: string) {
    picked.current[kind] = code;
    if (!code) return;
    const param = kind === 'trust' ? 'trust_code' : 'regn_code';
    const field: Key = kind === 'trust' ? 'inst_code' : 'inst_reg_code';
    try {
      const next = await api<NextCodes>(`/api/v1/institutions/next-code?${param}=${encodeURIComponent(code)}`);
      const value = kind === 'trust' ? next.inst_code : next.inst_reg_code;
      if (!value || picked.current[kind] !== code) return;
      setForm((f) => ({ ...f, [field]: value }));
      setServerErrors((s) => ({ ...s, [field]: undefined }));
    } catch {
      // A suggestion is only a help; the person can type the code.
    }
  }

  function chooseTrust(code: string) {
    set('trust_code', code);
    suggest('trust', code);
  }

  function chooseRegion(code: string) {
    setRegion(code);
    suggest('region', code);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(new Set(Object.keys(form)));
    setBanner('');
    const first = Object.keys(clientErrors)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    const body: InstitutionInput = { ...form };
    for (const k of Object.keys(body) as Key[]) body[k] = body[k].trim();
    body.inst_code = body.inst_code.toUpperCase();
    body.inst_reg_code = body.inst_reg_code.toUpperCase();
    for (const k of MOBILES) if (body[k]) body[k] = normaliseMobile(body[k]);
    setSaving(true);
    try {
      const saved = await api<Institution>('/api/v1/institutions', { method: 'POST', body: JSON.stringify(body) });
      navigate(`/institutions/${encodeURIComponent(saved.inst_code)}`, { state: { justCreated: true } });
    } catch (err) {
      if (err instanceof ApiError && err.fields.some((f) => f.field)) {
        const fields = fieldMap(err.fields) as InstitutionErrors;
        setServerErrors(fields);
        setBanner('Please fix the highlighted fields.');
        document.getElementById(Object.keys(fields)[0])?.focus();
      } else {
        setBanner(errorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!lookups) return <Loading />;

  const missing = [
    !lookups.trusts.length && 'trusts',
    !lookups.places.length && 'places',
    !lookups.branches.length && 'branches',
    !lookups.regions.length && 'regions',
  ].filter(Boolean);
  const fullCode = form.inst_code && form.inst_reg_code ? `${form.inst_code.toUpperCase()}:${form.inst_reg_code.toUpperCase()}` : '';

  const text = (k: Key, label: string, opts: { required?: boolean; max?: number; className?: string; hint?: ReactNode; type?: string; inputMode?: 'tel' | 'email' } = {}) => (
    <Field id={k} label={label} required={opts.required} error={visibleError(k)} hint={opts.hint} className={opts.className ?? 'col-6'}>
      <input
        id={k}
        type={opts.type ?? 'text'}
        inputMode={opts.inputMode}
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        onBlur={blur(k)}
        maxLength={opts.max}
        aria-invalid={!!visibleError(k)}
      />
    </Field>
  );
  const select = (k: Key, label: string, value: string, onChange: (v: string) => void, options: { value: string; label: string }[], placeholder: string, hint?: ReactNode) => (
    <Field id={k} label={label} required error={visibleError(k)} hint={hint} className="col-6">
      <select id={k} value={value} onChange={(e) => onChange(e.target.value)} onBlur={blur(k)} aria-invalid={!!visibleError(k)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  );

  return (
    <>
      <PageHead title="New institution" subtitle="Codes, where it is, and who to contact." back={false} />
      {missing.length > 0 && (
        <Banner kind="info">
          Add {missing.join(', ')} first: <Link to={missing.includes('trusts') ? '/trusts' : `/masters?tab=${missing.find((m) => m !== 'trusts')}`}>open the list</Link>.
        </Banner>
      )}
      {banner && <Banner kind="err">{banner}</Banner>}

      <form onSubmit={onSubmit} noValidate>
        <section className="card">
          <h2>Codes</h2>
          <p className="section-note">Pick the trust and the region to get the next free numbers. You can change them.</p>
          <div className="grid">
            {select('trust_code', 'Trust', form.trust_code, chooseTrust,
              lookups.trusts.map((t) => ({ value: t.trust_code, label: `${t.trust_code} · ${t.trust_desc}` })), 'Select trust')}
            <Field id="region" label="Region" hint="Used for the reg code" className="col-6">
              <select id="region" value={region} onChange={(e) => chooseRegion(e.target.value)}>
                <option value="">Select region</option>
                {lookups.regions.map((r) => (
                  <option key={r.code} value={r.code}>{r.code} · {r.name}</option>
                ))}
              </select>
            </Field>
            {text('inst_code', 'ACM code', { required: true, max: 7, className: 'col-4', hint: 'e.g. SAT-001' })}
            {text('inst_reg_code', 'Reg code', { required: true, max: 6, className: 'col-4', hint: 'e.g. MYS-01' })}
            <Field id="full_code" label="Full code" hint="Made from the two codes" className="col-4">
              <input id="full_code" value={fullCode} readOnly className="readonly" tabIndex={-1} />
            </Field>
          </div>
        </section>

        <section className="card">
          <h2>Institution</h2>
          <div className="grid">
            {text('inst_name', 'Institution name', { required: true, max: 250, className: 'col-12' })}
            {select('place_code', 'Place', form.place_code, (v) => set('place_code', v),
              lookups.places.map((p) => ({ value: p.code, label: p.name })), 'Select place')}
            {select('branch_code', 'Branch', form.branch_code, (v) => set('branch_code', v),
              lookups.branches.map((b) => ({ value: b.code, label: b.name })), 'Select branch')}
            <Field id="from_fin_yr" label="Start year" required error={visibleError('from_fin_yr')} className="col-6">
              <div className="radio-row" role="radiogroup" aria-label="Start year">
                {startYears.map((y) => (
                  <label key={y.finyr} className="check">
                    <input
                      type="radio"
                      name="from_fin_yr"
                      id={y === startYears[0] ? 'from_fin_yr' : undefined}
                      value={y.finyr}
                      checked={form.from_fin_yr === y.finyr}
                      onChange={() => set('from_fin_yr', y.finyr)}
                    />
                    {y.finyr}
                  </label>
                ))}
              </div>
            </Field>
            <Field id="reg_date" label="Registered on" error={visibleError('reg_date')} hint="Today if left empty" className="col-6">
              <input id="reg_date" type="date" value={form.reg_date} max={today} onChange={(e) => set('reg_date', e.target.value)}
                onBlur={blur('reg_date')} aria-invalid={!!visibleError('reg_date')} />
            </Field>
            {text('inst_add', 'Address', { max: 250, className: 'col-12' })}
            {text('inst_place', 'Locality', { max: 250, hint: 'e.g. Kuvempunagar' })}
            {text('inst_tel', 'Telephone', { max: 100, inputMode: 'tel' })}
            {text('inst_email', 'Email', { max: 150, type: 'email', inputMode: 'email', className: 'col-12' })}
          </div>
        </section>

        <section className="card">
          <h2>Head of institution</h2>
          <div className="grid">
            {text('inst_head_name', 'Name', { max: 100 })}
            {text('inst_head_desig', 'Designation', { max: 100, hint: 'e.g. Principal' })}
            {text('inst_head_mobile', 'Mobile', { inputMode: 'tel' })}
            {text('inst_head_email', 'Email', { max: 150, type: 'email', inputMode: 'email' })}
          </div>
        </section>

        <section className="card">
          <h2>Accountant</h2>
          <div className="grid">
            {text('inst_acnt_name', 'Name', { max: 100, className: 'col-12' })}
            {text('inst_acnt_mobile', 'Mobile', { inputMode: 'tel' })}
            {text('inst_acnt_email', 'Email', { max: 150, type: 'email', inputMode: 'email' })}
          </div>
        </section>

        <section className="card">
          <h2>Liaison officer</h2>
          <div className="grid">
            {text('inst_liason_name', 'Name', { max: 100 })}
            {text('inst_liason_desig', 'Designation', { max: 100 })}
            {text('inst_liason_mobile', 'Mobile', { inputMode: 'tel' })}
            {text('inst_liason_email', 'Email', { max: 150, type: 'email', inputMode: 'email' })}
          </div>
        </section>

        <div className="actions">
          <Link to="/institutions" className="btn btn-secondary">
            Cancel
          </Link>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save institution'}
          </button>
        </div>
      </form>
    </>
  );
}
