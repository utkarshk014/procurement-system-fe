import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import type { GstState, TaxDetails, TaxDetailsInput } from '../lib/types';
import { isGstin, todayInIndia, validateTaxDetails, type TaxErrors } from '../lib/validators';
import { Banner, Field, Loading, PageHead } from '../components/ui';

/** The form keeps dates as '' for "none"; the API wants null. */
interface Form {
  pan_enabled: boolean;
  pan_enabled_dt: string;
  pan: string;
  gstin_enabled: boolean;
  gstin_enabled_dt: string;
  gstin: string;
  gstin_state: string;
  comm_mail_id: string;
  comm_mobile: string;
  comm_whatsapp: string;
}

const EMPTY: Form = {
  pan_enabled: false, pan_enabled_dt: '', pan: '',
  gstin_enabled: false, gstin_enabled_dt: '', gstin: '', gstin_state: '',
  comm_mail_id: '', comm_mobile: '', comm_whatsapp: '',
};

function toForm(t: TaxDetails): Form {
  return {
    pan_enabled: t.pan_enabled, pan_enabled_dt: t.pan_enabled_dt ?? '', pan: t.pan,
    gstin_enabled: t.gstin_enabled, gstin_enabled_dt: t.gstin_enabled_dt ?? '', gstin: t.gstin, gstin_state: t.gstin_state,
    comm_mail_id: t.comm_mail_id, comm_mobile: t.comm_mobile, comm_whatsapp: t.comm_whatsapp,
  };
}

/** What happens to the stored mail password on save. */
type PasswordMode = 'keep' | 'change' | 'remove';

export default function TaxDetailsPage() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [gstStates, setGstStates] = useState<GstState[]>([]);
  const [saved, setSaved] = useState<TaxDetails | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [password, setPassword] = useState('');
  const [pwdMode, setPwdMode] = useState<PasswordMode>('keep');
  const [sameAsMobile, setSameAsMobile] = useState(false);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<TaxErrors>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string; companyFirst?: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const today = todayInIndia();

  function fill(t: TaxDetails | null) {
    const f = t ? toForm(t) : EMPTY;
    setSaved(t);
    setForm(f);
    setPassword('');
    setPwdMode(t?.comm_mail_pwd_set ? 'keep' : 'change');
    setSameAsMobile(!!f.comm_mobile && f.comm_mobile === f.comm_whatsapp);
    setTouched(new Set());
    setServerErrors({});
  }

  const loadId = useRef(0);
  const load = useCallback(async () => {
    const id = ++loadId.current;
    setLoadError('');
    setLoaded(false);
    try {
      const [details, states] = await Promise.all([
        api<TaxDetails>('/api/v1/company/tax-details').catch((e) => {
          if (e instanceof ApiError && e.status === 404) return null;
          throw e;
        }),
        api<GstState[]>('/api/v1/meta/gst-states'),
      ]);
      if (id !== loadId.current) return;
      setGstStates(states);
      fill(details);
      setLoaded(true);
    } catch (e) {
      if (id === loadId.current) setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** The body as the API wants it: null dates, a date only when enabled, the password only when changing it. */
  const body = useMemo((): TaxDetailsInput => {
    const b: TaxDetailsInput = {
      pan_enabled: form.pan_enabled,
      pan_enabled_dt: form.pan_enabled && form.pan_enabled_dt ? form.pan_enabled_dt : null,
      pan: form.pan.trim().toUpperCase(),
      gstin_enabled: form.gstin_enabled,
      gstin_enabled_dt: form.gstin_enabled && form.gstin_enabled_dt ? form.gstin_enabled_dt : null,
      gstin: form.gstin.trim().toUpperCase(),
      gstin_state: form.gstin_state,
      comm_mail_id: form.comm_mail_id.trim(),
      comm_mobile: form.comm_mobile.trim(),
      comm_whatsapp: (sameAsMobile ? form.comm_mobile : form.comm_whatsapp).trim(),
    };
    if (pwdMode === 'remove') b.comm_mail_pwd = '';
    else if (pwdMode === 'change' && password) b.comm_mail_pwd = password;
    return b;
  }, [form, password, pwdMode, sameAsMobile]);

  const clientErrors = useMemo(() => validateTaxDetails(body, gstStates, today), [body, gstStates, today]);
  const visibleError = (k: keyof TaxDetailsInput) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  function set<K extends keyof Form>(k: K, v: Form[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // A valid GSTIN picks its own state from the first two digits.
      if (k === 'gstin' && isGstin(String(v))) {
        const st = gstStates.find((s) => s.code === String(v).trim().toUpperCase().slice(0, 2));
        if (st) next.gstin_state = st.name;
      }
      // Switching a number on with no date means "enabled today".
      if (k === 'pan_enabled' && v && !f.pan_enabled_dt) next.pan_enabled_dt = today;
      if (k === 'gstin_enabled' && v && !f.gstin_enabled_dt) next.gstin_enabled_dt = today;
      return next;
    });
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  }
  const blur = (k: string) => () => setTouched((t) => new Set(t).add(k));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(new Set(Object.keys(body)));
    setBanner(null);
    if (Object.keys(clientErrors).length) {
      setBanner({ kind: 'err', text: 'Please correct the highlighted fields.' });
      document.getElementById(Object.keys(clientErrors)[0])?.focus();
      return;
    }
    setSaving(true);
    try {
      const result = await api<TaxDetails>('/api/v1/company/tax-details', { method: 'PUT', body: JSON.stringify(body) });
      const created = !saved;
      fill(result);
      setBanner({ kind: 'ok', text: created ? 'Tax and contact details saved.' : 'Tax and contact details updated.' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setBanner({ kind: 'err', text: err.message, companyFirst: true });
      } else if (err instanceof ApiError && err.fields.length) {
        setServerErrors(fieldMap(err.fields) as TaxErrors);
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
  if (!loaded) return <Loading label="Loading tax and contact details…" />;

  const text = (k: 'pan' | 'gstin' | 'comm_mail_id', props: Record<string, unknown> = {}) => (
    <input
      id={k}
      name={k}
      value={form[k]}
      onChange={(e) => set(k, k === 'comm_mail_id' ? e.target.value : e.target.value.toUpperCase())}
      onBlur={blur(k)}
      aria-invalid={!!visibleError(k)}
      aria-describedby={visibleError(k) ? `${k}-error` : undefined}
      {...props}
    />
  );

  return (
    <>
      <PageHead title="Tax and contact details" subtitle="All fields are optional. Anything you enter is checked." />
      {banner && (
        <Banner kind={banner.kind}>
          {banner.text}
          {banner.companyFirst && <> <Link to="/company">Open company details</Link></>}
        </Banner>
      )}

      <form onSubmit={onSubmit} noValidate>
        <section className="card">
          <h2>PAN</h2>
          <div className="grid">
            <div className="field col-4 check-field">
              <label className="check">
                <input type="checkbox" checked={form.pan_enabled} onChange={(e) => set('pan_enabled', e.target.checked)} />
                PAN enabled
              </label>
            </div>
            <Field id="pan" label="PAN" error={visibleError('pan')} hint="10 characters, e.g. ABCDE1234F" className="col-4">
              {text('pan', { maxLength: 10, autoComplete: 'off', spellCheck: false })}
            </Field>
            {form.pan_enabled && (
              <Field id="pan_enabled_dt" label="PAN enabled from" error={visibleError('pan_enabled_dt')} className="col-4">
                <input
                  id="pan_enabled_dt"
                  type="date"
                  max={today}
                  value={form.pan_enabled_dt}
                  onChange={(e) => set('pan_enabled_dt', e.target.value)}
                  onBlur={blur('pan_enabled_dt')}
                  aria-invalid={!!visibleError('pan_enabled_dt')}
                />
              </Field>
            )}
          </div>
        </section>

        <section className="card">
          <h2>GST</h2>
          <div className="grid">
            <div className="field col-4 check-field">
              <label className="check">
                <input type="checkbox" checked={form.gstin_enabled} onChange={(e) => set('gstin_enabled', e.target.checked)} />
                GSTIN enabled
              </label>
            </div>
            <Field id="gstin" label="GSTIN" error={visibleError('gstin')} hint="15 characters, starts with the state code" className="col-4">
              {text('gstin', { maxLength: 15, autoComplete: 'off', spellCheck: false })}
            </Field>
            {form.gstin_enabled && (
              <Field id="gstin_enabled_dt" label="GSTIN enabled from" error={visibleError('gstin_enabled_dt')} className="col-4">
                <input
                  id="gstin_enabled_dt"
                  type="date"
                  max={today}
                  value={form.gstin_enabled_dt}
                  onChange={(e) => set('gstin_enabled_dt', e.target.value)}
                  onBlur={blur('gstin_enabled_dt')}
                  aria-invalid={!!visibleError('gstin_enabled_dt')}
                />
              </Field>
            )}
            <Field id="gstin_state" label="GST state" error={visibleError('gstin_state')} hint="Filled in from the GSTIN" className="col-6">
              <select
                id="gstin_state"
                value={form.gstin_state}
                onChange={(e) => set('gstin_state', e.target.value)}
                onBlur={blur('gstin_state')}
                aria-invalid={!!visibleError('gstin_state')}
              >
                <option value="">Select state</option>
                {gstStates.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.code} · {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="card">
          <h2>Communication</h2>
          <p className="section-note">Used to send mail and messages from the system.</p>
          <div className="grid">
            <Field id="comm_mail_id" label="Email" error={visibleError('comm_mail_id')} className="col-6">
              {text('comm_mail_id', { type: 'email', maxLength: 150, autoComplete: 'off' })}
            </Field>
            <Field id="comm_mail_pwd" label="Email password" error={visibleError('comm_mail_pwd')} className="col-6"
              hint={pwdMode === 'remove' ? 'The saved password will be removed when you save.' : undefined}>
              {pwdMode === 'change' ? (
                <div className="inline-form">
                  <input
                    id="comm_mail_pwd"
                    type="password"
                    autoComplete="new-password"
                    maxLength={150}
                    value={password}
                    placeholder={saved?.comm_mail_pwd_set ? 'Type the new password' : ''}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={blur('comm_mail_pwd')}
                  />
                  {saved?.comm_mail_pwd_set && (
                    <button type="button" className="btn btn-secondary" onClick={() => { setPwdMode('keep'); setPassword(''); }}>
                      Cancel
                    </button>
                  )}
                </div>
              ) : (
                <div className="inline-form">
                  <input id="comm_mail_pwd" value={pwdMode === 'remove' ? 'Will be removed' : 'Password saved'} readOnly className="readonly" />
                  <button type="button" className="btn btn-secondary" onClick={() => setPwdMode('change')}>
                    Change
                  </button>
                  {pwdMode === 'keep' ? (
                    <button type="button" className="btn btn-secondary" onClick={() => setPwdMode('remove')}>
                      Remove
                    </button>
                  ) : (
                    <button type="button" className="btn btn-secondary" onClick={() => setPwdMode('keep')}>
                      Undo
                    </button>
                  )}
                </div>
              )}
            </Field>
            <Field id="comm_mobile" label="Mobile" error={visibleError('comm_mobile')} className="col-6">
              <div className="prefix-wrap">
                <span className="prefix">+91</span>
                <input
                  id="comm_mobile"
                  inputMode="tel"
                  maxLength={16}
                  placeholder="98765 43210"
                  value={form.comm_mobile}
                  onChange={(e) => set('comm_mobile', e.target.value)}
                  onBlur={blur('comm_mobile')}
                  aria-invalid={!!visibleError('comm_mobile')}
                />
              </div>
            </Field>
            <Field id="comm_whatsapp" label="WhatsApp" error={visibleError('comm_whatsapp')} className="col-6">
              <div className="prefix-wrap">
                <span className="prefix">+91</span>
                <input
                  id="comm_whatsapp"
                  inputMode="tel"
                  maxLength={16}
                  placeholder="98765 43210"
                  value={sameAsMobile ? form.comm_mobile : form.comm_whatsapp}
                  disabled={sameAsMobile}
                  onChange={(e) => set('comm_whatsapp', e.target.value)}
                  onBlur={blur('comm_whatsapp')}
                  aria-invalid={!!visibleError('comm_whatsapp')}
                />
              </div>
              <label className="check small-check">
                <input type="checkbox" checked={sameAsMobile} onChange={(e) => setSameAsMobile(e.target.checked)} />
                Same as mobile
              </label>
            </Field>
          </div>
        </section>

        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save details'}
          </button>
        </div>
      </form>
    </>
  );
}
