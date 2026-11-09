import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Institution } from '../lib/types';
import { Banner, Loading } from '../components/ui';

/** One institution, laid out like the old system's "Institution Details" card. Read-only: there is no edit procedure yet. */
export default function InstitutionPage() {
  const { code = '' } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [justCreated] = useState(() => !!(location.state as { justCreated?: boolean } | null)?.justCreated);
  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const [inst, setInst] = useState<Institution | null>(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setNotFound(false);
    setInst(null);
    try {
      setInst(await api<Institution>(`/api/v1/institutions/${encodeURIComponent(code)}`));
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setNotFound(true);
      else setError(errorMessage(e));
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  if (notFound) {
    return (
      <Banner kind="err">
        No institution with code {code}. <Link to="/institutions">Back to institutions</Link>
      </Banner>
    );
  }
  if (error) return <Banner kind="err" onRetry={load}>{error}</Banner>;
  if (!inst) return <Loading />;

  const v = (s: string) => s || '—';
  const mobile = (s: string) => (s ? `+91 ${s}` : '—');

  return (
    <>
      {justCreated && <Banner kind="ok">Institution {inst.inst_full_code} added.</Banner>}
      <div className="page-head row">
        <div>
          <h1>{inst.inst_name}</h1>
          <p className="muted">{inst.inst_full_code}</p>
        </div>
        <Link to="/institutions" className="btn btn-secondary">
          Back to institutions
        </Link>
      </div>

      <section className="card">
        <h2>Institution details</h2>
        <dl className="details">
          <div><dt>ACM code</dt><dd><strong>{inst.inst_full_code}</strong></dd></div>
          <div><dt>Trust</dt><dd>{inst.trust_code} · {v(inst.trust_name)}</dd></div>
          <div><dt>Institution</dt><dd>{inst.inst_name}</dd></div>
          <div><dt>Address</dt><dd>{v(inst.inst_add)}</dd></div>
          <div><dt>Place</dt><dd>{v(inst.place_name)}{inst.inst_place ? ` (${inst.inst_place})` : ''}</dd></div>
          <div><dt>Branch</dt><dd>{v(inst.branch_name)}</dd></div>
          <div><dt>Start year</dt><dd>{v(inst.from_fin_yr)}</dd></div>
          <div><dt>Registered on</dt><dd>{formatDate(inst.reg_date) || '—'}</dd></div>
        </dl>
      </section>

      <div className="two-col">
        <section className="card">
          <h2>Institution and head</h2>
          <dl className="details single">
            <div><dt>Institution tel. no.</dt><dd>{v(inst.inst_tel)}</dd></div>
            <div><dt>Head of institution</dt><dd>{v(inst.inst_head_name)}</dd></div>
            <div><dt>Designation</dt><dd>{v(inst.inst_head_desig)}</dd></div>
            <div><dt>Mobile no.</dt><dd>{mobile(inst.inst_head_mobile)}</dd></div>
            <div><dt>Email</dt><dd>{v(inst.inst_head_email)}</dd></div>
          </dl>
        </section>
        <section className="card">
          <h2>Institution email and accountant</h2>
          <dl className="details single">
            <div><dt>Institution email</dt><dd>{v(inst.inst_email)}</dd></div>
            <div><dt>Accountant</dt><dd>{v(inst.inst_acnt_name)}</dd></div>
            <div><dt>Mobile no.</dt><dd>{mobile(inst.inst_acnt_mobile)}</dd></div>
            <div><dt>Email</dt><dd>{v(inst.inst_acnt_email)}</dd></div>
          </dl>
        </section>
      </div>

      <section className="card">
        <h2>Liaison officer</h2>
        <dl className="details">
          <div><dt>Name</dt><dd>{v(inst.inst_liason_name)}</dd></div>
          <div><dt>Designation</dt><dd>{v(inst.inst_liason_desig)}</dd></div>
          <div><dt>Mobile no.</dt><dd>{mobile(inst.inst_liason_mobile)}</dd></div>
          <div><dt>Email</dt><dd>{v(inst.inst_liason_email)}</dd></div>
        </dl>
        <p className="muted small">Editing is not available yet: the database has no procedure to change an institution.</p>
      </section>
    </>
  );
}
