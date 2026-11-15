import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import { formatDate } from '../lib/format';
import { UQCS, uqcCode } from '../lib/uqc';
import type { StockEntry, Uom, UomInput } from '../lib/types';
import { validateUom, type UomErrors } from '../lib/validators';
import { Banner, Field, Loading, PageHead } from '../components/ui';

/** The stock lists. Groups, categories and manufacturers are a name only; units have their own form. */
const TABS = [
  { key: 'groups', label: 'Item group', plural: 'Item groups', example: 'Stationery' },
  { key: 'categories', label: 'Category', plural: 'Categories', example: 'Detergent' },
  { key: 'manufacturers', label: 'Manufacturer', plural: 'Manufacturers', example: 'Samsung' },
  { key: 'uoms', label: 'Unit', plural: 'Units of measurement', example: '' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

const IN_USE_NOTE = 'A row that any item uses cannot be deleted.';

type BannerState = { kind: 'ok' | 'err'; text: string } | null;

/** Item groups, categories, manufacturers and units of measurement: one tab each, a searchable list, add, edit and delete. */
export default function StockListsPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((t) => t.key === params.get('tab')) ?? TABS[0];
  const select = (key: TabKey) => setParams({ tab: key }, { replace: true });

  // Tabs pattern: only the selected tab is in the Tab order; arrows, Home and End move between tabs.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const i = TABS.findIndex((t) => t.key === tab.key);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = TABS[(next + TABS.length) % TABS.length];
    select(target.key);
    document.getElementById(`tab-${target.key}`)?.focus();
  }

  return (
    <>
      <PageHead title="Stock lists" subtitle="The lists every item is filed under." />
      <p className="muted">
        Items themselves are on the <Link to="/stock/items">Items</Link> page.
      </p>
      <div className="tabs" role="tablist" aria-label="Stock lists" onKeyDown={onKeyDown}>
        {TABS.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={t.key === tab.key}
            aria-controls={`panel-${t.key}`}
            tabIndex={t.key === tab.key ? 0 : -1}
            className={`tab ${t.key === tab.key ? 'active' : ''}`}
            onClick={() => select(t.key)}
          >
            {t.plural}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab.key}`} aria-labelledby={`tab-${tab.key}`}>
        {/* key: a fresh list (and form) per tab */}
        {tab.key === 'uoms' ? (
          <UomList key="uoms" />
        ) : (
          <NameList key={tab.key} listKey={tab.key} label={tab.label} plural={tab.plural} example={tab.example} />
        )}
      </div>
    </>
  );
}

/** Loads one list. */
function useList<T>(path: string) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const load = useCallback(async () => {
    setLoadError('');
    try {
      setRows(await api<T[]>(path));
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { rows, loadError, load };
}

/** Deletes one row after confirming; the server's refusal (row still used) becomes the banner. */
async function confirmDelete(path: string, what: string, setBanner: (b: BannerState) => void, reload: () => Promise<void>) {
  if (!window.confirm(`Delete ${what}? This cannot be undone.`)) return;
  setBanner(null);
  try {
    await api<void>(path, { method: 'DELETE' });
    setBanner({ kind: 'ok', text: `${what[0].toUpperCase()}${what.slice(1)} deleted.` });
    await reload();
  } catch (err) {
    setBanner({ kind: 'err', text: errorMessage(err) });
  }
}

/** Edit and Delete buttons for one row; off while a form is open, so typing is never lost and the
 * row being edited can't be deleted under it. */
function RowActions({ name, onEdit, onDelete, disabled }: { name: string; onEdit: () => void; onDelete: () => void; disabled: boolean }) {
  return (
    <td className="right">
      <div className="row-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={onEdit} disabled={disabled} aria-label={`Edit ${name}`}>
          Edit
        </button>
        <button type="button" className="btn btn-danger btn-sm" onClick={onDelete} disabled={disabled} aria-label={`Delete ${name}`}>
          Delete
        </button>
      </div>
    </td>
  );
}

/** The list card: title with count, Add button, search box, table or empty note. */
function ListCard<T>(props: {
  plural: string;
  label: string;
  rows: T[];
  shown: T[];
  search: string;
  onSearch: (v: string) => void;
  searchHint: string;
  formOpen: boolean;
  onAdd: () => void;
  head: ReactNode;
  row: (r: T) => ReactNode;
}) {
  const { plural, label, rows, shown, search } = props;
  return (
    <section className="card">
      <div className="card-head">
        <h2>
          {plural} <span className="muted small">({rows.length})</span>
        </h2>
        {!props.formOpen && (
          <button type="button" className="btn btn-primary btn-sm" onClick={props.onAdd}>
            Add {label.toLowerCase()}
          </button>
        )}
      </div>
      {rows.length > 0 && (
        <input
          className="search"
          type="search"
          placeholder={props.searchHint}
          aria-label={`Search ${plural.toLowerCase()}`}
          value={search}
          onChange={(e) => props.onSearch(e.target.value)}
        />
      )}
      {rows.length === 0 ? (
        <p className="muted section-note">No {plural.toLowerCase()} yet.</p>
      ) : shown.length === 0 ? (
        <p className="muted section-note">Nothing matches "{search}".</p>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>{props.head}</thead>
            <tbody>{shown.map(props.row)}</tbody>
          </table>
        </div>
      )}
      <p className="muted small">{IN_USE_NOTE}</p>
    </section>
  );
}

/** The add / edit form's buttons. */
function FormActions({ editing, label, saving, onCancel }: { editing: boolean; label: string; saving: boolean; onCancel: () => void }) {
  return (
    <div className="actions">
      <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
        Cancel
      </button>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : editing ? 'Save changes' : `Add ${label.toLowerCase()}`}
      </button>
    </div>
  );
}

/** Item groups, categories or manufacturers: a name, unique ignoring case. */
function NameList({ listKey, label, plural, example }: { listKey: TabKey; label: string; plural: string; example: string }) {
  const path = `/api/v1/stock/${listKey}`;
  const { rows, loadError, load } = useList<StockEntry>(path);
  const [search, setSearch] = useState('');
  // null: no form; 'new': adding; a row: editing it.
  const [form, setForm] = useState<'new' | StockEntry | null>(null);
  const [name, setName] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState('');
  const [banner, setBanner] = useState<BannerState>(null);
  const [saving, setSaving] = useState(false);
  const editing = form !== null && form !== 'new' ? form : null;

  const clientError = !name.trim() ? 'is required' : name.trim().length > 250 ? 'must be at most 250 characters' : '';
  // A name another row already has is caught before saving; the server checks again.
  const duplicate = useMemo(() => {
    const n = name.trim().replace(/\s+/g, ' ').toLowerCase();
    return n ? rows?.find((r) => r.id !== editing?.id && r.name.toLowerCase() === n) : undefined;
  }, [name, rows, editing]);
  const error = serverError || (touched ? clientError || (duplicate ? `is already in the list (#${duplicate.id})` : '') : '');

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return !rows || !q ? rows ?? [] : rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  function open(row: 'new' | StockEntry) {
    setName(row === 'new' ? '' : row.name);
    setTouched(false);
    setServerError('');
    setBanner(null);
    setForm(row);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setBanner(null);
    if (clientError || duplicate) {
      document.getElementById(`${listKey}-name`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({ name: name.trim() });
      const saved = editing
        ? await api<StockEntry>(`${path}/${editing.id}`, { method: 'PUT', body })
        : await api<StockEntry>(path, { method: 'POST', body });
      setBanner({ kind: 'ok', text: `${label} "${saved.name}" ${editing ? 'saved' : 'added'}.` });
      setForm(null);
      await load();
    } catch (err) {
      const fields = err instanceof ApiError ? fieldMap(err.fields) : {};
      if (fields.name) setServerError(fields.name);
      else setBanner({ kind: 'err', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!rows) return <Loading label={`Loading ${plural.toLowerCase()}…`} />;

  return (
    <>
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}
      {form && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <h2>{editing ? `Edit ${label.toLowerCase()} #${editing.id}` : `Add ${label.toLowerCase()}`}</h2>
          <div className="grid">
            <Field id={`${listKey}-name`} label="Name" required error={error} hint={`e.g. ${example}`} className="col-12">
              <input
                id={`${listKey}-name`}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setServerError('');
                }}
                onBlur={() => setTouched(true)}
                maxLength={250}
                autoComplete="off"
                autoFocus
                aria-invalid={!!error}
              />
            </Field>
          </div>
          <FormActions editing={!!editing} label={label} saving={saving} onCancel={() => setForm(null)} />
        </form>
      )}
      <ListCard
        plural={plural}
        label={label}
        rows={rows}
        shown={shown}
        search={search}
        onSearch={setSearch}
        searchHint={`Search ${plural.toLowerCase()}`}
        formOpen={!!form}
        onAdd={() => open('new')}
        head={<tr><th className="nowrap">#</th><th>Name</th><th className="hide-sm">Added</th><th aria-label="Actions" /></tr>}
        row={(r) => (
          <tr key={r.id}>
            <td className="muted">{r.id}</td>
            <td>{r.name}</td>
            <td className="nowrap hide-sm">{formatDate(r.rec_created_at)}</td>
            <RowActions
              name={`${label.toLowerCase()} ${r.name}`}
              disabled={saving || !!form}
              onEdit={() => open(r)}
              onDelete={() => confirmDelete(`${path}/${r.id}`, `${label.toLowerCase()} "${r.name}"`, setBanner, load)}
            />
          </tr>
        )}
      />
    </>
  );
}

const EMPTY_UOM: UomInput = { uom: '', uom_as_standard: '', enable_decimal: false, number_decimal: '' };

/** Units of measurement: a short unit (NOS), its GST unit code (NOS-NUMBERS) and how many decimals a quantity may have. */
function UomList() {
  const path = '/api/v1/stock/uoms';
  const { rows, loadError, load } = useList<Uom>(path);
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'new' | Uom | null>(null);
  const [form, setForm] = useState<UomInput>(EMPTY_UOM);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<UomErrors>({});
  const [banner, setBanner] = useState<BannerState>(null);
  const [saving, setSaving] = useState(false);
  const editing = mode !== null && mode !== 'new' ? mode : null;

  const clientErrors = useMemo(() => {
    const e = validateUom(form);
    const taken = (k: 'uom' | 'uom_as_standard') => {
      const v = form[k].trim().replace(/\s+/g, ' ').toLowerCase();
      const hit = v ? rows?.find((r) => r.id !== editing?.id && r[k].toLowerCase() === v) : undefined;
      if (hit && !e[k]) e[k] = `is already used by ${hit.uom}`;
    };
    taken('uom');
    taken('uom_as_standard');
    return e;
  }, [form, rows, editing]);
  const visibleError = (k: keyof UomInput) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!rows || !q) return rows ?? [];
    return rows.filter((r) => r.uom.toLowerCase().includes(q) || r.uom_as_standard.toLowerCase().includes(q));
  }, [rows, search]);

  function open(row: 'new' | Uom) {
    setForm(
      row === 'new'
        ? EMPTY_UOM
        : { uom: row.uom, uom_as_standard: row.uom_as_standard, enable_decimal: row.enable_decimal, number_decimal: row.enable_decimal ? String(row.number_decimal) : '' },
    );
    setTouched(new Set());
    setServerErrors({});
    setBanner(null);
    setMode(row);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function set<K extends keyof UomInput>(k: K, v: UomInput[K]) {
    setForm((f) => {
      const next = { ...f, [k]: k === 'uom' ? String(v).toUpperCase().replace(/\s/g, '').slice(0, 5) : v };
      // Picking a code fills an empty unit with it (KGS-KILOGRAMS gives KGS).
      if (k === 'uom_as_standard' && !f.uom.trim() && v) next.uom = uqcCode(String(v));
      if (k === 'enable_decimal' && !v) next.number_decimal = '';
      return next;
    });
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  }
  const blur = (k: keyof UomInput) => () => setTouched((t) => new Set(t).add(k));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(new Set(Object.keys(form)));
    setBanner(null);
    const first = Object.keys(clientErrors)[0];
    if (first) {
      document.getElementById(`uom-${first}`)?.focus();
      return;
    }
    setSaving(true);
    try {
      const body = JSON.stringify({
        uom: form.uom.trim(),
        uom_as_standard: form.uom_as_standard.trim(),
        enable_decimal: form.enable_decimal,
        ...(form.enable_decimal ? { number_decimal: Number(form.number_decimal) } : {}),
      });
      const saved = editing
        ? await api<Uom>(`${path}/${editing.id}`, { method: 'PUT', body })
        : await api<Uom>(path, { method: 'POST', body });
      setBanner({ kind: 'ok', text: `Unit ${saved.uom} (${saved.uom_as_standard}) ${editing ? 'saved' : 'added'}.` });
      setMode(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError && err.fields.some((f) => f.field)) setServerErrors(fieldMap(err.fields) as UomErrors);
      else setBanner({ kind: 'err', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!rows) return <Loading label="Loading units of measurement…" />;

  return (
    <>
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}
      {mode && (
        <form className="card" onSubmit={onSubmit} noValidate>
          <h2>{editing ? `Edit unit ${editing.uom}` : 'Add a unit of measurement'}</h2>
          <div className="grid">
            <Field id="uom-uom" label="Unit" required error={visibleError('uom')} hint="Up to 5 characters, e.g. NOS, KG" className="col-3">
              <input id="uom-uom" value={form.uom} onChange={(e) => set('uom', e.target.value)} onBlur={blur('uom')}
                autoComplete="off" autoFocus aria-invalid={!!visibleError('uom')} />
            </Field>
            <Field id="uom-uom_as_standard" label="GST unit code" required error={visibleError('uom_as_standard')}
              hint="The standard GST unit (UQC), as in Tally" className="col-5">
              <select id="uom-uom_as_standard" value={form.uom_as_standard}
                onChange={(e) => set('uom_as_standard', e.target.value)} onBlur={blur('uom_as_standard')}
                aria-invalid={!!visibleError('uom_as_standard')}>
                <option value="">Select a unit code</option>
                {/* A unit saved before the list existed keeps its old name as an option. */}
                {editing && !(UQCS as readonly string[]).includes(editing.uom_as_standard) && (
                  <option value={editing.uom_as_standard}>{editing.uom_as_standard} (old, pick one from the list)</option>
                )}
                {UQCS.map((u) => {
                  const user = rows.find((r) => r.id !== editing?.id && r.uom_as_standard === u);
                  return (
                    <option key={u} value={u} disabled={!!user}>
                      {u}{user ? ` (used by ${user.uom})` : ''}
                    </option>
                  );
                })}
              </select>
            </Field>
            <div className="field col-2 check-field">
              <label className="check">
                <input type="checkbox" checked={form.enable_decimal} onChange={(e) => set('enable_decimal', e.target.checked)} />
                Decimals
              </label>
            </div>
            {form.enable_decimal && (
              <Field id="uom-number_decimal" label="Decimal places" required error={visibleError('number_decimal')} hint="1 to 9" className="col-2">
                <input id="uom-number_decimal" inputMode="numeric" maxLength={1} value={form.number_decimal}
                  onChange={(e) => set('number_decimal', e.target.value.replace(/\D/g, ''))} onBlur={blur('number_decimal')}
                  aria-invalid={!!visibleError('number_decimal')} />
              </Field>
            )}
          </div>
          <FormActions editing={!!editing} label="unit" saving={saving} onCancel={() => setMode(null)} />
        </form>
      )}
      <ListCard
        plural="Units of measurement"
        label="Unit"
        rows={rows}
        shown={shown}
        search={search}
        onSearch={setSearch}
        searchHint="Search units by unit or name"
        formOpen={!!mode}
        onAdd={() => open('new')}
        head={<tr><th>Unit</th><th>GST unit code</th><th>Decimals</th><th className="hide-sm">Added</th><th aria-label="Actions" /></tr>}
        row={(r) => (
          <tr key={r.id}>
            <td><strong>{r.uom}</strong></td>
            <td>{r.uom_as_standard}</td>
            <td>{r.enable_decimal ? `${r.number_decimal} places` : <span className="muted">Whole numbers</span>}</td>
            <td className="nowrap hide-sm">{formatDate(r.rec_created_at)}</td>
            <RowActions
              name={`unit ${r.uom}`}
              disabled={saving || !!mode}
              onEdit={() => open(r)}
              onDelete={() => confirmDelete(`${path}/${r.id}`, `unit ${r.uom}`, setBanner, load)}
            />
          </tr>
        )}
      />
    </>
  );
}
