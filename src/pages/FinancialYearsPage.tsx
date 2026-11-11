import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import { formatDate } from '../lib/format';
import type { FinancialYear, FinYearOption } from '../lib/types';
import { Banner, Loading, PageHead } from '../components/ui';
import { KIND_LABEL } from './FinancialYearStep';

/** All financial years: add another one, or change which one is current. */
export default function FinancialYearsPage() {
  const [years, setYears] = useState<FinancialYear[] | null>(null);
  const [options, setOptions] = useState<FinYearOption[]>([]);
  const [loadError, setLoadError] = useState('');
  const [toAdd, setToAdd] = useState('');
  const [busy, setBusy] = useState('');
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [list, opts] = await Promise.all([
        api<FinancialYear[]>('/api/v1/financial-years'),
        api<FinYearOption[]>('/api/v1/financial-years/options'),
      ]);
      setYears(list);
      setOptions(opts);
      const free = opts.filter((o) => !o.exists);
      setToAdd((cur) => (free.some((o) => o.finyr === cur) ? cur : free[0]?.finyr ?? ''));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addYear() {
    if (!toAdd) return;
    setBusy('add');
    setBanner(null);
    try {
      await api<FinancialYear>('/api/v1/financial-years', { method: 'POST', body: JSON.stringify({ finyr: toAdd }) });
      setBanner({ kind: 'ok', text: `Financial year ${toAdd} added.` });
      await load();
    } catch (e) {
      const msg = e instanceof ApiError && e.fields.length ? fieldMap(e.fields).finyr ?? e.fields[0].message : errorMessage(e);
      setBanner({ kind: 'err', text: msg });
      if (e instanceof ApiError && e.status === 409) load();
    } finally {
      setBusy('');
    }
  }

  async function makeCurrent(finyr: string) {
    if (!window.confirm(`Make ${finyr} the current financial year? New records will default to it.`)) return;
    setBusy(finyr);
    setBanner(null);
    try {
      await api<FinancialYear>('/api/v1/financial-years/current', { method: 'PUT', body: JSON.stringify({ finyr }) });
      setBanner({ kind: 'ok', text: `${finyr} is now the current financial year.` });
      await load();
    } catch (e) {
      const msg = e instanceof ApiError && e.fields.length ? fieldMap(e.fields).finyr ?? e.fields[0].message : errorMessage(e);
      setBanner({ kind: 'err', text: msg });
    } finally {
      setBusy('');
    }
  }

  async function deleteYear(finyr: string) {
    if (!window.confirm(`Delete financial year ${finyr}? This cannot be undone.`)) return;
    setBusy(finyr);
    setBanner(null);
    try {
      await api<void>(`/api/v1/financial-years/${encodeURIComponent(finyr)}`, { method: 'DELETE' });
      setBanner({ kind: 'ok', text: `Financial year ${finyr} deleted.` });
      await load();
    } catch (e) {
      setBanner({ kind: 'err', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!years) return <Loading label="Loading financial years…" />;

  const free = options.filter((o) => !o.exists);

  return (
    <>
      <PageHead title="Financial years" subtitle="Each year runs from 1 April to 31 March. Records are kept per year." />
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}

      <section className="card">
        <h2>Years</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Year</th><th className="hide-sm">Starts</th><th className="hide-sm">Ends</th><th>Status</th><th aria-label="Actions" /></tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.finyr}>
                  <td className="nowrap">{y.finyr}</td>
                  <td className="nowrap hide-sm">{formatDate(y.finyr_st_date)}</td>
                  <td className="nowrap hide-sm">{formatDate(y.finyr_end_date)}</td>
                  <td>{y.finyr_is_current ? <span className="tag current">Current</span> : <span className="muted">—</span>}</td>
                  <td className="right">
                    {/* The current year has no actions: it cannot be deleted and is already current. */}
                    {!y.finyr_is_current && (
                      <span className="row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => makeCurrent(y.finyr)}>
                          {busy === y.finyr ? 'Saving…' : 'Make current'}
                        </button>
                        <button type="button" className="btn btn-danger btn-sm" disabled={!!busy} onClick={() => deleteYear(y.finyr)}
                          aria-label={`Delete ${y.finyr}`}>
                          Delete
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Add a year</h2>
        {free.length === 0 ? (
          <p className="muted section-note">Every year that can be created right now already exists.</p>
        ) : (
          <div className="inline-form">
            <select id="add-finyr" aria-label="Financial year to add" value={toAdd} onChange={(e) => setToAdd(e.target.value)} disabled={!!busy}>
              {free.map((o) => (
                <option key={o.finyr} value={o.finyr}>
                  {o.finyr} · {KIND_LABEL[o.kind]} · {formatDate(o.finyr_st_date)} to {formatDate(o.finyr_end_date)}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-primary" onClick={addYear} disabled={!!busy || !toAdd}>
              {busy === 'add' ? 'Adding…' : 'Add year'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}
