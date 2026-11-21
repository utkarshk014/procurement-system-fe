import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { StockEntry, Vendor } from '../lib/types';
import { Banner, Loading, PageHead } from '../components/ui';
import { ExportButton } from '../components/ExcelImport';

/** The vendor master: a searchable list with a group filter. Adding and editing happen on the vendor page. */
export default function VendorsPage() {
  const location = useLocation();
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [groups, setGroups] = useState<StockEntry[]>([]);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  // A message passed from the vendor page, e.g. after a delete.
  const flash = (location.state as { flash?: string } | null)?.flash;

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const [list, g] = await Promise.all([api<Vendor[]>('/api/v1/vendors'), api<StockEntry[]>('/api/v1/stock/groups')]);
      setVendors(list);
      setGroups(g);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (vendors ?? []).filter(
      (v) =>
        (!q ||
          v.name.toLowerCase().includes(q) ||
          v.city.toLowerCase().includes(q) ||
          v.gstin.toLowerCase().includes(q) ||
          v.pan.toLowerCase().includes(q) ||
          v.mobile.includes(q)) &&
        (!groupFilter || v.item_groups.some((g) => String(g.grp_cd) === groupFilter)),
    );
  }, [vendors, search, groupFilter]);

  if (loadError) return <Banner kind="err" onRetry={load}>{loadError}</Banner>;
  if (!vendors) return <Loading label="Loading vendors…" />;

  return (
    <>
      <PageHead title="Vendors" subtitle="Suppliers, the item groups they supply, their financials and certificates." />
      {flash && <Banner kind="ok">{flash}</Banner>}

      <section className="card">
        <div className="card-head">
          <h2>
            Vendors <span className="muted small">({vendors.length})</span>
          </h2>
          <div className="row-actions">
            <ExportButton path="/api/v1/vendors/export" filename="vendors.xlsx" disabled={vendors.length === 0} />
            <Link to="/vendors/import" className="btn btn-secondary btn-sm">Import from Excel</Link>
            <Link to="/vendors/new" className="btn btn-primary btn-sm">
              Add vendor
            </Link>
          </div>
        </div>
        {vendors.length > 0 && (
          <div className="filters vendor-filters">
            <input className="search" type="search" placeholder="Search by name, city, GSTIN, PAN or mobile" aria-label="Search vendors"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <select aria-label="Filter by item group" value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">All item groups</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
        {vendors.length === 0 ? (
          <p className="muted section-note">No vendors yet.</p>
        ) : shown.length === 0 ? (
          <p className="muted section-note">No vendor matches these filters.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Vendor</th><th>Supplies</th><th className="hide-sm">GSTIN</th><th className="hide-sm">Contact</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((v) => (
                  <tr key={v.id}>
                    <td>
                      <Link to={`/vendors/${v.id}`}><strong>{v.name}</strong></Link>
                      <div className="muted small">{[v.city, v.vendor_type, v.supply_type].filter(Boolean).join(' · ') || '—'}</div>
                    </td>
                    <td>{v.item_groups.map((g) => g.item_group).join(', ') || <span className="muted">—</span>}</td>
                    <td className="hide-sm nowrap">
                      {v.gstin || <span className="muted">—</span>}
                      {v.gstin_state && <div className="muted small">{v.gstin_state}</div>}
                    </td>
                    <td className="hide-sm">
                      {v.contacts[0]?.person || v.mobile || v.email ? (
                        <>
                          {v.contacts[0]?.person || v.email}
                          <div className="muted small">{v.contacts[0]?.mobile || v.mobile}</div>
                        </>
                      ) : (
                        <span className="muted">—</span>
                      )}
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
