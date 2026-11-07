import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import { Banner, Loading } from './components/ui';
import Login from './pages/Login';
import Setup from './pages/Setup';
import Home from './pages/Home';
import CompanyPage from './pages/CompanyPage';

/** Logged-in tenant admins only. The platform admin cannot open company screens. */
function RequireTenantAdmin({ children }: { children: ReactNode }) {
  const { user, restoring } = useAuth();
  if (restoring) return <Loading label="Signing you in…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'tenant_admin') {
    return <Banner kind="info">This app is for organisation admins. Platform admin screens are not part of this frontend yet.</Banner>;
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<RequireTenantAdmin><Home /></RequireTenantAdmin>} />
        <Route path="/setup" element={<RequireTenantAdmin><Setup /></RequireTenantAdmin>} />
        <Route path="/company" element={<RequireTenantAdmin><CompanyPage /></RequireTenantAdmin>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
