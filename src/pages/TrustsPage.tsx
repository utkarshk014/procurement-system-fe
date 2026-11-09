import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import { formatDate } from '../lib/format';
import type { FinancialYear, Trust, TrustCreate, TrustUpdate } from '../lib/types';
import { validateTrust, type TrustErrors } from '../lib/validators';
import { Banner, Field, Loading, PageHead } from '../components/ui';

const EMPTY: TrustCreate = { trust_code: '', trust_desc: '', wrk_st_finyr: '', wrk_st_date: '' };

/** The trusts under the company (Form 4): list, add, and edit (the code never changes). */
export default function TrustsPage() {
  const [trusts, setTrusts] = useState<Trust[] | null>(null);
  const [years, setYears] = useState<FinancialYear[]>([]);
  const [loadError, setLoadError] = useState('');
  /** null = form closed; '' = adding; a code = editing that trust. */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<TrustCreate>(EMPTY);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<TrustErrors>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [list, yearList] = await Promise.all([
        api<Trust[]>('/api/v1/trusts'),
        api<FinancialYear[]>('/api/v1/financial-years'),
      ]);
      setTrusts(list);
      setYears(yearList);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isEdit = !!editing;
  const clientErrors = useMemo(() => validateTrust(form, years, isEdit), [form, years, isEdit]);
  const visibleError = (k: keyof TrustCreate) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  function open(t: Trust | null) {
    const current = years.find((y) => y.finyr_is_current) ?? years[0];
    setForm(t ? { trust_code: t.trust_code, trust_desc: t.trust_desc, wrk_st_finyr: t.wrk_st_finyr, wrk_st_date: t.wrk_st_date }
      : { ...EMPTY, wrk_st_finyr: current?.finyr ?? '', wrk_st_date: current?.finyr_st_date ?? '' });
    setEditing(t ? t.trust_code : '');
    setTouched(new Set());
    setServerErrors({});
    setBanner(null);
  }

  function set(k: keyof TrustCreate, v: string) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'trust_code') next.trust_code = v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
      // Picking another year moves the start date to that year's 1 April.
      if (k === 'wrk_st_finyr') next.wrk_st_date = years.find((y) => y.finyr === v)?.finyr_st_date ?? f.wrk_st_date;
      return next;
    });
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  }
  const blur = (k: keyof TrustCreate) => () => setTouched((t) => new Set(t).add(k));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(new Set(Object.keys(form)));
    setBanner(null);
    if (Object.keys(clientErrors).length) {
      document.getElementById(Object.keys(clientErrors)[0])?.focus();
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        const body: TrustUpdate = { trust_desc: form.trust_desc.trim(), wrk_st_finyr: form.wrk_st_finyr, wrk_st_date: form.wrk_st_date };
        await api<Trust>(`/api/v1/trusts/${encodeURIComponent(editing!)}`, { method: 'PUT', body: JSON.stringify(body) });
        setBanner({ kind: 'ok', text: `Trust ${editing} updated.` });
      } else {
        const body: TrustCreate = { ...form, trust_desc: form.trust_desc.trim() };
        const saved = await api<Trust>('/api/v1/trusts', { method: 'POST', body: JSON.stringify(body) });
        setBanner({ kind: 'ok', text: `Trust ${saved.trust_code} added.` });
      }
      setEditing(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.fields.some((f) => f.field)) {
        setServerErrors(fieldMap(err.fields) as TrustErrors);
      } else {
        setBanner({ kind: 'err', text: errorMessage(err) });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!trusts) return <Loading label="Loading trusts…" />;

  return (
    <>
      <PageHead title="Trusts" subtitle="The trusts under your company, for trust-wise and overall reports." />
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}

      {editing !== null && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <h2>{isEdit ? `Edit trust ${editing}` : 'Add a trust'}</h2>
          <div className="grid">
            <Field id="trust_code" label="Code" required={!isEdit} error={visibleError('trust_code')}
              hint={isEdit ? 'A trust code cannot be changed' : '3 letters, e.g. SAT'} className="col-3">
              <input
                id="trust_code"
                value={form.trust_code}
                onChange={(e) => set('trust_code', e.target.value)}
                onBlur={blur('trust_code')}
                readOnly={isEdit}
                className={isEdit ? 'readonly' : undefined}
                maxLength={3}
                autoComplete="off"
                autoFocus={!isEdit}
                aria-invalid={!!visibleError('trust_code')}
              />
            </Field>
            <Field id="trust_desc" label="Trust name" required error={visibleError('trust_desc')} className="col-9">
              <input
                id="trust_desc"
                value={form.trust_desc}
                onChange={(e) => set('trust_desc', e.target.value)}
                onBlur={blur('trust_desc')}
                maxLength={100}
                autoFocus={isEdit}
                aria-invalid={!!visibleError('trust_desc')}
              />
            </Field>
            <Field id="wrk_st_finyr" label="Working from financial year" required error={visibleError('wrk_st_finyr')} className="col-6">
              <select id="wrk_st_finyr" value={form.wrk_st_finyr} onChange={(e) => set('wrk_st_finyr', e.target.value)}
                onBlur={blur('wrk_st_finyr')} aria-invalid={!!visibleError('wrk_st_finyr')}>
                <option value="">Select year</option>
                {years.map((y) => (
                  <option key={y.finyr} value={y.finyr}>
                    {y.finyr}{y.finyr_is_current ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="wrk_st_date" label="Working from date" required error={visibleError('wrk_st_date')} hint="Inside the chosen financial year" className="col-6">
              <input
                id="wrk_st_date"
                type="date"
                value={form.wrk_st_date}
                min={years.find((y) => y.finyr === form.wrk_st_finyr)?.finyr_st_date}
                max={years.find((y) => y.finyr === form.wrk_st_finyr)?.finyr_end_date}
                onChange={(e) => set('wrk_st_date', e.target.value)}
                onBlur={blur('wrk_st_date')}
                aria-invalid={!!visibleError('wrk_st_date')}
              />
            </Field>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add trust'}
            </button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="card-head">
          <h2>All trusts</h2>
          {editing === null && (
            <button type="button" className="btn btn-primary btn-sm" onClick={() => open(null)}>
              Add trust
            </button>
          )}
        </div>
        {trusts.length === 0 ? (
          <p className="muted section-note">No trusts yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Name</th><th className="hide-sm">From year</th><th className="hide-sm">From date</th><th aria-label="Actions" /></tr>
              </thead>
              <tbody>
                {trusts.map((t) => (
                  <tr key={t.trust_code}>
                    <td><strong>{t.trust_code}</strong></td>
                    <td>{t.trust_desc}</td>
                    <td className="nowrap hide-sm">{t.wrk_st_finyr}</td>
                    <td className="nowrap hide-sm">{formatDate(t.wrk_st_date)}</td>
                    <td className="right">
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => open(t)} disabled={saving}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
