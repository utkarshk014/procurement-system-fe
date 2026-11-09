import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, errorMessage } from './lib/api';
import { useAuth } from './lib/auth';
import type { SetupStatus } from './lib/types';
import Layout from './components/Layout';
import { Banner, Loading } from './components/ui';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Home from './pages/Home';
import CompanyPage from './pages/CompanyPage';
import FinancialYearsPage from './pages/FinancialYearsPage';
import TaxDetailsPage from './pages/TaxDetailsPage';
import TrustsPage from './pages/TrustsPage';

/** Logged-in tenant admins only. The platform admin cannot open company screens. */
function RequireTenantAdmin({ children }: { children: ReactNode }) {
  const { user, restoring, restoreError, retryRestore } = useAuth();
  if (restoring) return <Loading label="Signing you in…" />;
  if (restoreError) return <Banner kind="err" onRetry={retryRestore}>{restoreError}</Banner>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'tenant_admin') {
    return <Banner kind="info">This app is for organisation admins. Platform admin screens are not part of this frontend yet.</Banner>;
  }
  return <>{children}</>;
}

/** Pages that only make sense once the setup wizard is finished; until then they send the user to /setup. */
function RequireSetupDone({ children }: { children: ReactNode }) {
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
  if (!status) return <Loading />;
  if (status.next_step !== 'done') return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

const afterSetup = (page: ReactNode) => (
  <RequireTenantAdmin>
    <RequireSetupDone>{page}</RequireSetupDone>
  </RequireTenantAdmin>
);

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<RequireTenantAdmin><Home /></RequireTenantAdmin>} />
        <Route path="/setup" element={<RequireTenantAdmin><Setup /></RequireTenantAdmin>} />
        <Route path="/company" element={afterSetup(<CompanyPage />)} />
        <Route path="/company/tax-details" element={afterSetup(<TaxDetailsPage />)} />
        <Route path="/financial-years" element={afterSetup(<FinancialYearsPage />)} />
        <Route path="/trusts" element={afterSetup(<TrustsPage />)} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
