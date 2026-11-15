import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, errorMessage, fieldMap } from '../lib/api';
import type { Item, ItemForm, ItemType, StockEntry, Uom } from '../lib/types';
import { validateItem, type ItemErrors } from '../lib/validators';
import { Banner, Field, Loading, PageHead } from '../components/ui';

interface Lookups {
  groups: StockEntry[];
  categories: StockEntry[];
  manufacturers: StockEntry[];
  uoms: Uom[];
}

const EMPTY: ItemForm = {
  item_desc: '', item_code: '', grp_cd: '', cat_cd: '', manf_cd: '', uom_cd: '',
  goods_service_item: 'Goods', item_consumable: false, item_is_spare: false, track_serial: false,
  gst_applicable: true, gst_hsn_code: '', gst_percentage: '', sgst_percentage: '', cgst_percentage: '',
};

/** Half of a GST rate, as SGST and CGST are usually split (18 → 9). */
function half(v: string): string {
  const n = Number(v);
  if (!v.trim() || !Number.isFinite(n)) return '';
  return String(Math.round((n / 2) * 100) / 100);
}

const percent = (v: number | null) => (v === null ? '—' : `${v}%`);

/** The item master: a searchable list with filters, an add form and delete. No edit yet. */
export default function ItemsPage() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | ItemType>('');
  const [adding, setAdding] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [list, groups, categories, manufacturers, uoms] = await Promise.all([
        api<Item[]>('/api/v1/stock/items'),
        api<StockEntry[]>('/api/v1/stock/groups'),
        api<StockEntry[]>('/api/v1/stock/categories'),
        api<StockEntry[]>('/api/v1/stock/manufacturers'),
        api<Uom[]>('/api/v1/stock/uoms'),
      ]);
      setItems(list);
      setLookups({ groups, categories, manufacturers, uoms });
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (items ?? []).filter(
      (it) =>
        (!q || it.item_desc.toLowerCase().includes(q) || it.item_code.toLowerCase().includes(q) || it.gst_hsn_code.includes(q)) &&
        (!groupFilter || String(it.grp_cd) === groupFilter) &&
        (!typeFilter || it.goods_service_item === typeFilter),
    );
  }, [items, search, groupFilter, typeFilter]);

  async function remove(it: Item) {
    if (!window.confirm(`Delete item "${it.item_desc}"? This cannot be undone.`)) return;
    setBusy(true);
    setBanner(null);
    try {
      await api<void>(`/api/v1/stock/items/${it.id}`, { method: 'DELETE' });
      setBanner({ kind: 'ok', text: `Item "${it.item_desc}" deleted.` });
      await load();
    } catch (err) {
      setBanner({ kind: 'err', text: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!items || !lookups) return <Loading label="Loading items…" />;

  const missing = [
    !lookups.groups.length && 'an item group',
    !lookups.uoms.length && 'a unit of measurement',
  ].filter(Boolean);

  return (
    <>
      <PageHead title="Items" subtitle="Goods and services the organisation buys." />
      {banner && <Banner kind={banner.kind}>{banner.text}</Banner>}

      {adding ? (
        <ItemFormCard
          lookups={lookups}
          items={items}
          onCancel={() => setAdding(false)}
          onSaved={async (saved) => {
            setAdding(false);
            setBanner({ kind: 'ok', text: `Item "${saved.item_desc}" added.` });
            await load();
          }}
        />
      ) : (
        missing.length > 0 && (
          <Banner kind="info">
            Every item needs {missing.join(' and ')}. Add {missing.length > 1 ? 'them' : 'one'} on the{' '}
            <Link to={`/stock?tab=${!lookups.groups.length ? 'groups' : 'uoms'}`}>Stock lists</Link> page first.
          </Banner>
        )
      )}

      <section className="card">
        <div className="card-head">
          <h2>
            Items <span className="muted small">({items.length})</span>
          </h2>
          <div className="row-actions">
            <Link to="/stock" className="btn btn-secondary btn-sm">Stock lists</Link>
            {!adding && (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => { setBanner(null); setAdding(true); }}
                disabled={missing.length > 0}>
                Add item
              </button>
            )}
          </div>
        </div>
        {items.length > 0 && (
          <div className="filters stock-filters">
            <input className="search" type="search" placeholder="Search by description, code or HSN" aria-label="Search items"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Filter by group" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">All groups</option>
              {lookups.groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
            <select aria-label="Filter by type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as '' | ItemType)}>
              <option value="">Goods and services</option>
              <option value="Goods">Goods</option>
              <option value="Service">Services</option>
            </select>
          </div>
        )}
        {items.length === 0 ? (
          <p className="muted section-note">No items yet.</p>
        ) : shown.length === 0 ? (
          <p className="muted section-note">No item matches these filters.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th><th>Group</th><th>Unit</th><th>Type</th>
                  <th className="hide-sm">HSN</th><th className="hide-sm">GST</th><th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <strong>{it.item_desc}</strong>
                      <div className="muted small">
                        {[it.item_code, it.category, it.manufacturer].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>{it.item_group || '—'}</td>
                    <td>{it.uom || '—'}</td>
                    <td>
                      {it.goods_service_item}
                      <div className="muted small">
                        {[it.item_consumable && 'Consumable', it.item_is_spare && 'Spare', it.track_serial && 'Serial no.'].filter(Boolean).join(' · ')}
                      </div>
                    </td>
                    <td className="hide-sm">{it.gst_hsn_code || '—'}</td>
                    <td className="nowrap hide-sm">
                      {it.gst_applicable ? (
                        <>
                          {percent(it.gst_percentage)}
                          <div className="muted small">{percent(it.sgst_percentage)} + {percent(it.cgst_percentage)}</div>
                        </>
                      ) : (
                        <span className="muted">No GST</span>
                      )}
                    </td>
                    <td className="right">
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(it)} disabled={busy}
                        aria-label={`Delete item ${it.item_desc}`}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted small">
          An item can be deleted until it has stock or a purchase. Editing is not available yet: the database has no procedure to
          change one.
        </p>
      </section>
    </>
  );
}

function ItemFormCard({ lookups, items, onCancel, onSaved }: {
  lookups: Lookups;
  items: Item[];
  onCancel: () => void;
  onSaved: (saved: Item) => void | Promise<void>;
}) {
  const [form, setForm] = useState<ItemForm>(EMPTY);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [serverErrors, setServerErrors] = useState<ItemErrors>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  // SGST and CGST follow GST (half each) until the user types one of them.
  const [splitByHand, setSplitByHand] = useState(false);

  const clientErrors = useMemo(() => {
    const e = validateItem(form);
    const desc = form.item_desc.trim().replace(/\s+/g, ' ').toLowerCase();
    const code = form.item_code.trim().toUpperCase();
    const sameDesc = desc && items.find((it) => it.item_desc.toLowerCase() === desc);
    const sameCode = code && items.find((it) => it.item_code.toUpperCase() === code);
    if (sameDesc && !e.item_desc) e.item_desc = 'is already an item';
    if (sameCode && !e.item_code) e.item_code = `is already used by "${sameCode.item_desc}"`;
    return e;
  }, [form, items]);
  const visibleError = (k: keyof ItemForm) => serverErrors[k] ?? (touched.has(k) ? clientErrors[k] : undefined);

  function set<K extends keyof ItemForm>(k: K, v: ItemForm[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'goods_service_item' && v === 'Service') {
        next.item_consumable = next.item_is_spare = next.track_serial = false; // goods only
      }
      if (k === 'gst_percentage' && !splitByHand) {
        next.sgst_percentage = next.cgst_percentage = half(String(v));
      }
      if (k === 'gst_applicable' && !v) {
        next.gst_percentage = next.sgst_percentage = next.cgst_percentage = '';
      }
      return next;
    });
    if (k === 'sgst_percentage' || k === 'cgst_percentage') setSplitByHand(true);
    setServerErrors((s) => ({ ...s, [k]: undefined }));
  }
  const blur = (k: keyof ItemForm) => () => setTouched((t) => new Set(t).add(k));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(new Set(Object.keys(form)));
    setError('');
    const first = Object.keys(clientErrors)[0];
    if (first) {
      document.getElementById(`item-${first}`)?.focus();
      return;
    }
    const id = (v: string) => (v ? Number(v) : undefined);
    const num = (v: string) => (v.trim() ? Number(v) : undefined);
    const goods = form.goods_service_item === 'Goods';
    setSaving(true);
    try {
      const saved = await api<Item>('/api/v1/stock/items', {
        method: 'POST',
        body: JSON.stringify({
          item_desc: form.item_desc.trim(),
          item_code: form.item_code.trim(),
          grp_cd: id(form.grp_cd),
          cat_cd: id(form.cat_cd),
          manf_cd: id(form.manf_cd),
          uom_cd: id(form.uom_cd),
          goods_service_item: form.goods_service_item,
          item_consumable: goods && form.item_consumable,
          item_is_spare: goods && form.item_is_spare,
          track_serial: goods && form.track_serial,
          gst_applicable: form.gst_applicable,
          gst_hsn_code: form.gst_hsn_code.trim(),
          ...(form.gst_applicable
            ? { gst_percentage: num(form.gst_percentage), sgst_percentage: num(form.sgst_percentage), cgst_percentage: num(form.cgst_percentage) }
            : {}),
        }),
      });
      await onSaved(saved);
    } catch (err) {
      const fields = err instanceof ApiError ? fieldMap(err.fields) : {};
      if (Object.keys(fields).some((k) => k)) {
        setServerErrors(fields as ItemErrors);
        setTouched(new Set(Object.keys(form)));
      }
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const text = (k: keyof ItemForm, label: string, opts: { required?: boolean; max?: number; hint?: ReactNode; className: string; numeric?: boolean }) => (
    <Field id={`item-${k}`} label={label} required={opts.required} error={visibleError(k)} hint={opts.hint} className={opts.className}>
      <input
        id={`item-${k}`}
        value={form[k] as string}
        maxLength={opts.max}
        inputMode={opts.numeric ? 'decimal' : undefined}
        onChange={(e) => set(k, e.target.value as never)}
        onBlur={blur(k)}
        autoComplete="off"
        aria-invalid={!!visibleError(k)}
      />
    </Field>
  );

  const select = (k: 'grp_cd' | 'cat_cd' | 'manf_cd' | 'uom_cd', label: string, options: { value: number; label: string }[], required: boolean) => (
    <Field id={`item-${k}`} label={label} required={required} error={visibleError(k)} className="col-3">
      <select id={`item-${k}`} value={form[k]} onChange={(e) => set(k, e.target.value)} onBlur={blur(k)} aria-invalid={!!visibleError(k)}>
        <option value="">{required ? 'Select' : 'None'}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );

  const goods = form.goods_service_item === 'Goods';
  const check = (k: 'item_consumable' | 'item_is_spare' | 'track_serial' | 'gst_applicable', label: string, className = 'col-3') => (
    <div className={`field ${className} check-field`}>
      <label className="check">
        <input type="checkbox" checked={form[k]} onChange={(e) => set(k, e.target.checked)} />
        {label}
      </label>
    </div>
  );

  return (
    <form className="card" onSubmit={onSubmit} noValidate>
      <h2>Add an item</h2>
      {error && <Banner kind="err">{error}</Banner>}

      <h3>Item</h3>
      <div className="grid">
        {text('item_desc', 'Description', { required: true, max: 250, className: 'col-8', hint: 'e.g. A4 paper 75 GSM (500 sheets)' })}
        {text('item_code', 'Item code', { max: 20, className: 'col-4', hint: 'Optional, e.g. PAP-A4-75' })}
        {select('grp_cd', 'Group', lookups.groups.map((g) => ({ value: g.id, label: g.name })), true)}
        {select('uom_cd', 'Unit', lookups.uoms.map((u) => ({ value: u.id, label: `${u.uom} · ${u.uom_as_standard}` })), true)}
        {select('cat_cd', 'Category', lookups.categories.map((c) => ({ value: c.id, label: c.name })), false)}
        {select('manf_cd', 'Manufacturer', lookups.manufacturers.map((m) => ({ value: m.id, label: m.name })), false)}
      </div>

      <h3>Type</h3>
      <div className="grid">
        <div className="col-3 radio-row" role="radiogroup" aria-label="Goods or service">
          {(['Goods', 'Service'] as const).map((t) => (
            <label key={t} className="check">
              <input type="radio" name="item-type" checked={form.goods_service_item === t} onChange={() => set('goods_service_item', t)} />
              {t}
            </label>
          ))}
        </div>
        {goods ? (
          <>
            {check('item_consumable', 'Consumable')}
            {check('item_is_spare', 'Spare part')}
            {check('track_serial', 'Track serial numbers')}
          </>
        ) : (
          <p className="muted small col-9">Consumable, spare and serial tracking apply to goods only.</p>
        )}
      </div>

      <h3>GST</h3>
      <div className="grid">
        {check('gst_applicable', 'GST applies')}
        {text('gst_hsn_code', goods ? 'HSN code' : 'SAC code', { max: 8, className: 'col-3', numeric: true, hint: '4, 6 or 8 digits' })}
        {form.gst_applicable && (
          <>
            {text('gst_percentage', 'GST %', { required: true, max: 6, className: 'col-2', numeric: true, hint: 'e.g. 18' })}
            {text('sgst_percentage', 'SGST %', { required: true, max: 6, className: 'col-2', numeric: true })}
            {text('cgst_percentage', 'CGST %', { required: true, max: 6, className: 'col-2', numeric: true })}
          </>
        )}
      </div>

      <div className="actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Add item'}
        </button>
      </div>
    </form>
  );
}
