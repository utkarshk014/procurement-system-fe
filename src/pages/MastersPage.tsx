import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import { formatDate } from '../lib/format';
import type { CodeEntry, CodeEntryInput } from '../lib/types';
import { validateCodeEntry, type CodeEntryErrors } from '../lib/validators';
import { Banner, Field, Loading, PageHead } from '../components/ui';

/** The three Form 5 code lists. They share one API shape, so one page serves them all. */
const LISTS = [
  { key: 'places', label: 'Place', plural: 'Places', example: 'MYS, Mysore' },
  { key: 'branches', label: 'Branch', plural: 'Branches', example: 'MYB, Mysore Branch' },
  { key: 'regions', label: 'Region', plural: 'Regions', example: 'MYS, Mysore Region' },
] as const;
type ListKey = (typeof LISTS)[number]['key'];

const EMPTY: CodeEntryInput = { code: '', name: '' };

/** Places, branches and regions (Form 5): one tab each, a searchable list and an add form. No edit yet. */
export default function MastersPage() {
  const [params, setParams] = useSearchParams();
  const list = LISTS.find((l) => l.key === params.get('tab')) ?? LISTS[0];

  return (
    <>
      <PageHead title="Places, branches and regions" subtitle="The lists an institution is filed under." />
      <div className="tabs" role="tablist" aria-label="Lists">
        {LISTS.map((l) => (
          <button
            key={l.key}
            type="button"
            role="tab"
            aria-selected={l.key === list.key}
            className={`tab ${l.key === list.key ? 'active' : ''}`}
            onClick={() => setParams({ tab: l.key }, { replace: true })}
          >
            {l.plural}
          </button>
        ))}
      </div>
      {/* key: a fresh list (and form) per tab */}
      <CodeList key={list.key} listKey={list.key} label={list.label} plural={list.plural} example={list.example} />
    </>
  );
}

function CodeList({ listKey, label, plural, example }: { listKey: ListKey; label: string; plural: string; example: string }) {
  const [rows, setRows] = useState<CodeEntry[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CodeEntryInput>(EMPTY);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<CodeEntryErrors>({});
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRows(await api<CodeEntry[]>(`/api/v1/${listKey}`));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [listKey]);

  useEffect(() => {
    load();
  }, [load]);

  const clientErrors = useMemo(() => validateCodeEntry(form, label), [form, label]);
  const visibleError = (k: keyof CodeEntryInput) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows || !q) return rows ?? [];
    return rows.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [rows, search]);

  function open() {
    setForm(EMPTY);
    setTouched(new Set());
    setServerErrors({});
    setBanner(null);
    setAdding(true);
  }

  function set(k: keyof CodeEntryInput, v: string) {
    setForm((f) => ({ ...f, [k]: k === 'code' ? v.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) : v }));
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  }
  const blur = (k: keyof CodeEntryInput) => () => setTouched((t) => new Set(t).add(k));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(new Set(Object.keys(form)));
    setBanner(null);
    if (Object.keys(clientErrors).length) {
      document.getElementById(`${listKey}-${Object.keys(clientErrors)[0]}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const saved = await api<CodeEntry>(`/api/v1/${listKey}`, {
        method: 'POST',
        body: JSON.stringify({ code: form.code, name: form.name.trim() }),
      });
      setBanner({ kind: 'ok', text: `${label} ${saved.code} added.` });
      setAdding(false);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.fields.some((f) => f.field)) {
        setServerErrors(fieldMap(err.fields) as CodeEntryErrors);
      } else {
        setBanner({ kind: 'err', text: errorMessage(err) });
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!rows) return <Loading label={`Loading ${plural.toLowerCase()}…`} />;

  return (
    <>
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}

      {adding && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <h2>Add a {label.toLowerCase()}</h2>
          <div className="grid">
            <Field id={`${listKey}-code`} label="Code" required error={visibleError('code')} hint="3 letters" className="col-3">
              <input
                id={`${listKey}-code`}
                value={form.code}
                onChange={(e) => set('code', e.target.value)}
                onBlur={blur('code')}
                autoComplete="off"
                autoFocus
                aria-invalid={!!visibleError('code')}
              />
            </Field>
            <Field id={`${listKey}-name`} label="Name" required error={visibleError('name')} hint={`e.g. ${example}`} className="col-9">
              <input
                id={`${listKey}-name`}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                onBlur={blur('name')}
                maxLength={250}
                aria-invalid={!!visibleError('name')}
              />
            </Field>
          </div>
          <div className="actions">
            <button type="button" className="btn btn-secondary" onClick={() => setAdding(false)} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : `Add ${label.toLowerCase()}`}
            </button>
          </div>
        </form>
      )}

      <section className="card">
        <div className="card-head">
          <h2>
            {plural} <span className="muted small">({rows.length})</span>
          </h2>
          {!adding && (
            <button type="button" className="btn btn-primary btn-sm" onClick={open}>
              Add {label.toLowerCase()}
            </button>
          )}
        </div>
        {rows.length > 0 && (
          <input
            className="search"
            type="search"
            placeholder={`Search ${plural.toLowerCase()} by code or name`}
            aria-label={`Search ${plural.toLowerCase()}`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
        {rows.length === 0 ? (
          <p className="muted section-note">No {plural.toLowerCase()} yet.</p>
        ) : shown.length === 0 ? (
          <p className="muted section-note">Nothing matches "{search}".</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Code</th><th>Name</th><th className="hide-sm">Added</th></tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.code}>
                    <td><strong>{r.code}</strong></td>
                    <td>{r.name}</td>
                    <td className="nowrap hide-sm">{formatDate(r.rec_created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">Editing is not available yet: the database has no procedure to change a {label.toLowerCase()}.</p>
      </section>
    </>
  );
}
