import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Company, CompanyInput, FinancialYear } from '../lib/types';
import { isIndia, validateCompany, type Errors } from '../lib/validators';
import { Banner, Field, Loading } from '../components/ui';

const EMPTY: CompanyInput = {
  name: '', shortname: '', address: '', city: '', state: '', country: 'India', pin: '',
  mobile: '', email: '', website: '', header_1: '', header_2: '',
};

const TEXT_FIELDS = Object.keys(EMPTY) as (keyof CompanyInput)[];

function toForm(c: Company): CompanyInput {
  const f = { ...EMPTY };
  for (const k of TEXT_FIELDS) f[k] = (c[k as keyof Company] as string | null | undefined) ?? '';
  return f;
}

interface Props {
  /** Called after a successful save with the company as stored and whether it was created. */
  onSaved?: (company: Company, created: boolean) => void;
  submitLabel?: string;
}

export default function CompanyForm({ onSaved, submitLabel = 'Save company' }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [existing, setExisting] = useState<Company | null>(null);
  const [states, setStates] = useState<string[]>([]);
  const [finStart, setFinStart] = useState('');
  const [form, setForm] = useState<CompanyInput>(EMPTY);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<Errors>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    setLoaded(false);
    try {
      const [company, stateList, current] = await Promise.all([
        api<Company>('/api/v1/company').catch((e) => {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }),
        api<string[]>('/api/v1/meta/indian-states'),
        api<FinancialYear>('/api/v1/financial-years/current').catch((e) => {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }),
      ]);
      setExisting(company);
      setStates(stateList);
      setFinStart(company?.fin_st_dt ?? current?.finyr_st_date ?? '');
      setForm(company ? toForm(company) : EMPTY);
      setLoaded(true);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clientErrors = useMemo(() => validateCompany(form, states), [form, states]);
  const visibleError = (k: keyof CompanyInput) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  function set(k: keyof CompanyInput) {
    return (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      let v = e.target.value;
      if (k === 'pin') v = v.replace(/\D/g, '').slice(0, 6);
      setForm((f) => ({ ...f, [k]: v }));
      setServerErrors((s) => ({ ...s, [k]: undefined }));
    };
  }
  const blur = (k: keyof CompanyInput) => () => setTouched((t) => new Set(t).add(k));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(new Set(TEXT_FIELDS));
    setBanner(null);
    if (Object.keys(clientErrors).length) {
      setBanner({ kind: 'err', text: 'Please correct the highlighted fields.' });
      document.getElementById(Object.keys(clientErrors)[0])?.focus();
      return;
    }

    // PUT replaces everything, so always send the whole form. sl, time_zone and rec_created_at are never sent.
    const body: CompanyInput = { ...form };
    for (const k of TEXT_FIELDS) body[k] = (body[k] ?? "").trim();
    if (existing?.fin_st_dt) body.fin_st_dt = existing.fin_st_dt;

    setSaving(true);
    try {
      const saved = await api<Company>('/api/v1/company', { method: 'PUT', body: JSON.stringify(body) });
      const created = !existing;
      setExisting(saved);
      setFinStart(saved.fin_st_dt);
      setForm(toForm(saved)); // show the cleaned values the API stored
      setTouched(new Set());
      setServerErrors({});
      setBanner({ kind: 'ok', text: created ? 'Company created.' : 'Company details updated.' });
      onSaved?.(saved, created);
    } catch (err) {
      if (err instanceof ApiError && err.fields.length) {
        setServerErrors(fieldMap(err.fields) as Errors);
        setBanner({ kind: 'err', text: err.message || 'Some fields need attention.' });
      } else {
        setBanner({ kind: 'err', text: errorMessage(err) });
      }
    } finally {
      setSaving(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!loaded) return <Loading label="Loading company details…" />;

  const india = isIndia(form.country);
  const stateOptions = form.state && !states.includes(form.state) ? [form.state, ...states] : states;

  const input = (k: keyof CompanyInput, props: Record<string, unknown> = {}) => (
    <input
      id={k}
      name={k}
      value={form[k] ?? ''}
      onChange={set(k)}
      onBlur={blur(k)}
      aria-invalid={!!visibleError(k)}
      aria-describedby={visibleError(k) ? `${k}-error` : undefined}
      {...props}
    />
  );

  return (
    <form onSubmit={onSubmit} noValidate>
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}
      {existing && !banner && <Banner kind="info">Editing the saved company details. Saving updates the same record.</Banner>}

      <section className="card">
        <h2>Company</h2>
        <div className="grid">
          <Field id="name" label="Company name" required error={visibleError('name')} className="col-8">
            {input('name', { maxLength: 300, autoComplete: 'organization' })}
          </Field>
          <Field id="shortname" label="Short name" required error={visibleError('shortname')} hint="For example ESIS" className="col-4">
            {input('shortname', { maxLength: 50 })}
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>Address</h2>
        <div className="grid">
          <Field id="address" label="Address" error={visibleError('address')} hint={`${form.address.length} / 300`} className="col-12">
            <textarea
              id="address"
              name="address"
              rows={2}
              maxLength={300}
              value={form.address}
              onChange={set('address')}
              onBlur={blur('address')}
              autoComplete="street-address"
              aria-invalid={!!visibleError('address')}
            />
          </Field>
          <Field id="city" label="City" error={visibleError('city')} className="col-3">
            {input('city', { maxLength: 200, autoComplete: 'address-level2' })}
          </Field>
          <Field id="state" label="State" error={visibleError('state')} className="col-3">
            {india ? (
              <select id="state" name="state" value={form.state} onChange={set('state')} onBlur={blur('state')} aria-invalid={!!visibleError('state')}>
                <option value="">Select state</option>
                {stateOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              input('state', { maxLength: 200, autoComplete: 'address-level1' })
            )}
          </Field>
          <Field id="country" label="Country" error={visibleError('country')} className="col-3">
            {input('country', { maxLength: 200, autoComplete: 'country-name' })}
          </Field>
          <Field id="pin" label="PIN code" error={visibleError('pin')} className="col-3">
            {input('pin', { inputMode: 'numeric', maxLength: 6, autoComplete: 'postal-code' })}
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>Contact</h2>
        <div className="grid">
          <Field id="mobile" label="Mobile" error={visibleError('mobile')} className="col-4">
            <div className="prefix-wrap">
              <span className="prefix">+91</span>
              {input('mobile', { inputMode: 'tel', maxLength: 16, autoComplete: 'tel-national', placeholder: '98765 43210' })}
            </div>
          </Field>
          <Field id="email" label="Email" error={visibleError('email')} className="col-4">
            {input('email', { type: 'email', maxLength: 200, autoComplete: 'email' })}
          </Field>
          <Field id="website" label="Website" error={visibleError('website')} className="col-4">
            {input('website', { maxLength: 150, placeholder: 'esis.in', autoComplete: 'url' })}
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>Letterhead</h2>
        <p className="section-note">Printed at the top of reports and documents.</p>
        <div className="grid">
          <Field id="header_1" label="Header line 1" error={visibleError('header_1')} hint={`${form.header_1.length} / 200`} className="col-6">
            {input('header_1', { maxLength: 200 })}
          </Field>
          <Field id="header_2" label="Header line 2" error={visibleError('header_2')} hint={`${form.header_2.length} / 200`} className="col-6">
            {input('header_2', { maxLength: 200 })}
          </Field>
        </div>
      </section>

      <section className="card">
        <h2>Financial</h2>
        <div className="grid">
          <Field id="fin_st_dt" label="Financial year starts" error={serverErrors.fin_st_dt} hint="Set from the financial year created in step 1" className="col-6">
            <input id="fin_st_dt" value={formatDate(finStart) || 'Set automatically'} readOnly className="readonly" />
          </Field>
        </div>
      </section>

      <div className="actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
