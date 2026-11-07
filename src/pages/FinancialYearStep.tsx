import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, fieldMap, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import type { FinancialYear, FinYearOption } from '../lib/types';
import { Banner, Loading } from '../components/ui';

export default function FinancialYearStep({ onSaved }: { onSaved: () => void }) {
  const [options, setOptions] = useState<FinYearOption[] | null>(null);
  const [selected, setSelected] = useState('');
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    setOptions(null);
    try {
      const opts = await api<FinYearOption[]>('/api/v1/financial-years/options');
      setOptions(opts);
      const first = opts.find((o) => !o.exists && o.kind === 'current') ?? opts.find((o) => !o.exists);
      setSelected(first?.finyr ?? '');
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!selected) {
      setError('Choose a financial year.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await api<FinancialYear>('/api/v1/financial-years', { method: 'POST', body: JSON.stringify({ finyr: selected }) });
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields.length) setError(fieldMap(e.fields).finyr ?? e.fields[0].message);
      else setError(errorMessage(e));
      if (e instanceof ApiError && e.status === 409) load();
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!options) return <Loading label="Loading financial years…" />;

  return (
    <section className="card">
      <h2>Step 1 · Financial year</h2>
      <p className="section-note">
        Choose the financial year to start with. An Indian financial year runs from 1 April to 31 March.
      </p>

      {error && <Banner kind="err">{error}</Banner>}

      <div className="fy-options" role="radiogroup" aria-label="Financial year">
        {options.map((o) => (
          <label key={o.finyr} className={`fy-card ${selected === o.finyr ? 'selected' : ''} ${o.exists ? 'disabled' : ''}`}>
            <input
              type="radio"
              name="finyr"
              value={o.finyr}
              checked={selected === o.finyr}
              disabled={o.exists || saving}
              onChange={() => setSelected(o.finyr)}
            />
            <div className="fy-body">
              <div className="fy-head">
                <span className="fy-title">{o.finyr}</span>
                <span className={`tag ${o.kind}`}>{o.kind === 'current' ? 'Current year' : 'Previous year'}</span>
              </div>
              <div className="fy-dates">
                <div>
                  <span className="muted small">Starts</span>
                  <span>{formatDate(o.finyr_st_date)}</span>
                </div>
                <div>
                  <span className="muted small">Ends</span>
                  <span>{formatDate(o.finyr_end_date)}</span>
                </div>
              </div>
              {o.exists && <div className="muted small">Already created</div>}
            </div>
          </label>
        ))}
      </div>

      <div className="actions">
        <button type="button" className="btn btn-primary" onClick={save} disabled={saving || !selected}>
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
      </div>
    </section>
  );
}
