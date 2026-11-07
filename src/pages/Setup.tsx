import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import type { SetupStatus } from '../lib/types';
import { Banner, Loading, Stepper } from '../components/ui';
import FinancialYearStep from './FinancialYearStep';
import CompanyForm from './CompanyForm';

/** Setup wizard: asks the API for next_step and shows that screen. */
export default function Setup() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    setStatus(null);
    try {
      setStatus(await api<SetupStatus>('/api/v1/setup/status'));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <Banner kind="err" onRetry={load}>{error}</Banner>;
  if (!status) return <Loading label="Checking setup…" />;
  if (status.next_step === 'done') return <Navigate to="/" replace />;

  const step = status.next_step === 'financial_year' ? 1 : 2;
  return (
    <>
      <div className="page-head">
        <h1>Set up your organisation</h1>
        <p className="muted">Two short steps: the financial year first, then your company details.</p>
      </div>
      <Stepper step={step} />
      {step === 1 ? (
        <FinancialYearStep onSaved={load} />
      ) : (
        <>
          {status.current_financial_year && (
            <p className="muted small step-note">Financial year {status.current_financial_year} is set up.</p>
          )}
          <CompanyForm submitLabel="Save and finish" onSaved={() => navigate('/', { replace: true, state: { justFinished: true } })} />
        </>
      )}
    </>
  );
}
