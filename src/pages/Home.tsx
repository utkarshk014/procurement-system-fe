import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Company, FinancialYear, SetupStatus } from '../lib/types';
import { Banner, Loading } from '../components/ui';

interface HomeData {
  status: SetupStatus;
  company: Company | null;
  years: FinancialYear[];
}

export default function Home() {
  const location = useLocation();
  const navigate = useNavigate();
  // Show "Setup complete" once, then drop it from history so a reload doesn't show it again.
  const [justFinished] = useState(() => !!(location.state as { justFinished?: boolean } | null)?.justFinished);
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);
  const [data, setData] = useState<HomeData | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setData(null);
    try {
      const status = await api<SetupStatus>('/api/v1/setup/status');
      if (status.next_step !== 'done') {
        setData({ status, company: null, years: [] });
        return;
      }
      const [company, years] = await Promise.all([
        api<Company>('/api/v1/company').catch((e) => (e instanceof ApiError && e.status === 404 ? null : Promise.reject(e))),
        api<FinancialYear[]>('/api/v1/financial-years'),
      ]);
      setData({ status, company, years });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Banner kind="err" onRetry={load}>{error}</Banner>;
  if (!data) return <Loading />;
  if (data.status.next_step !== 'done') return <Navigate to="/setup" replace />;

  const c = data.company;
  const address = c ? [c.address, c.city, c.state, c.pin, c.country].filter(Boolean).join(', ') : '';

  return (
    <>
      {justFinished && (
        <Banner kind="ok">Setup complete. Your organisation is ready.</Banner>
      )}
      <div className="page-head row">
        <div>
          <h1>{c?.name ?? 'Home'}</h1>
          {c?.shortname && <p className="muted">{c.shortname}</p>}
        </div>
        <Link to="/company" className="btn btn-secondary">
          Edit company
        </Link>
      </div>

      {c && (
        <section className="card">
          <h2>Company</h2>
          <dl className="details">
            <div><dt>Address</dt><dd>{address || '—'}</dd></div>
            <div><dt>Mobile</dt><dd>{c.mobile ? `+91 ${c.mobile}` : '—'}</dd></div>
            <div><dt>Email</dt><dd>{c.email || '—'}</dd></div>
            <div><dt>Website</dt><dd>{c.website || '—'}</dd></div>
            <div><dt>Letterhead</dt><dd>{[c.header_1, c.header_2].filter(Boolean).join(' · ') || '—'}</dd></div>
            <div><dt>Financial year starts</dt><dd>{formatDate(c.fin_st_dt)}</dd></div>
          </dl>
        </section>
      )}

      <section className="card">
        <h2>Financial years</h2>
        <table className="table">
          <thead>
            <tr><th>Year</th><th>Starts</th><th>Ends</th><th>Status</th></tr>
          </thead>
          <tbody>
            {data.years.map((y) => (
              <tr key={y.finyr}>
                <td>{y.finyr}</td>
                <td>{formatDate(y.finyr_st_date)}</td>
                <td>{formatDate(y.finyr_end_date)}</td>
                <td>{y.finyr_is_current ? <span className="tag current">Current</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="muted small">Trusts, institutions, items and vendors will appear here as they are added.</p>
    </>
  );
}
