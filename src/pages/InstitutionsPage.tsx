import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { CodeEntry, InstitutionPage, Trust } from '../lib/types';
import { Banner, Loading, PageHead } from '../components/ui';

const PAGE_SIZE = 50;

interface Lookups {
  trusts: Trust[];
  branches: CodeEntry[];
  places: CodeEntry[];
}

/** Institutions (Form 5): filter by trust, branch and place, search by name or code, 50 a page. */
export default function InstitutionsPage() {
  // Filters live in the URL so the back button and a reload keep them.
  const [params, setParams] = useSearchParams();
  const trust = params.get('trust_code') ?? '';
  const branch = params.get('branch_code') ?? '';
  const place = params.get('place_code') ?? '';
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [data, setData] = useState<InstitutionPage | null>(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(q);

  // Dropdown lists load once.
  useEffect(() => {
    Promise.all([api<Trust[]>('/api/v1/trusts'), api<CodeEntry[]>('/api/v1/branches'), api<CodeEntry[]>('/api/v1/places')])
      .then(([trusts, branches, places]) => setLookups({ trusts, branches, places }))
      .catch((e) => setError(errorMessage(e)));
  }, []);

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      const query = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (trust) query.set('trust_code', trust);
      if (branch) query.set('branch_code', branch);
      if (place) query.set('place_code', place);
      if (q) query.set('q', q);
      setData(await api<InstitutionPage>(`/api/v1/institutions?${query}`));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [trust, branch, place, q, page]);

  useEffect(() => {
    load();
  }, [load]);

  /** Change filters; any change other than the page goes back to page 1. */
  const update = useCallback((changes: Record<string, string>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!('page' in changes)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);

  // Search 300 ms after the last keystroke.
  useEffect(() => {
    if (search.trim() === q) return;
    const t = setTimeout(() => update({ q: search.trim() }), 300);
    return () => clearTimeout(t);
  }, [search, q, update]);

  const filtered = !!(trust || branch || place || q);
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <>
      <PageHead title="Institutions" subtitle="Institutions under each trust, with their head, accountant and liaison officer." />
      {error && <Banner kind="err" onRetry={load}>{error}</Banner>}

      <section className="card">
        <div className="card-head">
          <h2>
            All institutions {data && <span className="muted small">({data.total})</span>}
          </h2>
          <Link to="/institutions/new" className="btn btn-primary btn-sm">
            New institution
          </Link>
        </div>

        <div className="filters">
          <input
            className="search"
            type="search"
            placeholder="Search by name or code"
            aria-label="Search institutions"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select aria-label="Trust" value={trust} onChange={(e) => update({ trust_code: e.target.value })}>
            <option value="">All trusts</option>
            {lookups?.trusts.map((t) => (
              <option key={t.trust_code} value={t.trust_code}>{t.trust_code} · {t.trust_desc}</option>
            ))}
          </select>
          <select aria-label="Branch" value={branch} onChange={(e) => update({ branch_code: e.target.value })}>
            <option value="">All branches</option>
            {lookups?.branches.map((b) => (
              <option key={b.code} value={b.code}>{b.name}</option>
            ))}
          </select>
          <select aria-label="Place" value={place} onChange={(e) => update({ place_code: e.target.value })}>
            <option value="">All places</option>
            {lookups?.places.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
          {filtered && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>
              Clear
            </button>
          )}
        </div>

        {!data ? (
          !error && <Loading label="Loading institutions…" />
        ) : data.items.length === 0 ? (
          <p className="muted section-note">
            {filtered ? 'No institution matches these filters.' : 'No institutions yet. Add places, branches and regions first, then the institutions.'}
          </p>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Code</th><th>Name</th><th className="hide-sm">Trust</th><th className="hide-sm">Branch</th><th className="hide-sm">Place</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.inst_code}>
                      <td className="nowrap">
                        <Link to={`/institutions/${encodeURIComponent(i.inst_code)}`}><strong>{i.inst_full_code}</strong></Link>
                      </td>
                      <td>{i.inst_name}</td>
                      <td className="hide-sm">{i.trust_code}</td>
                      <td className="hide-sm">{i.branch_name}</td>
                      <td className="hide-sm">{i.place_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="pager">
                <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>
                  Previous
                </button>
                <span className="muted small">Page {page} of {pages}</span>
                <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
