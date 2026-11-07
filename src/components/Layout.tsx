import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="logo">PMS</span>
          <span className="brand-text">Procurement Management System</span>
        </Link>
        {user && (
          <div className="user">
            <div className="user-meta">
              <span className="user-name">{user.full_name}</span>
              {user.tenant && <span className="user-org">{user.tenant.name}</span>}
            </div>
            <button type="button" className="btn btn-ghost" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
