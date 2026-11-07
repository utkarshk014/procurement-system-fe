import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, errorMessage, fieldMap } from '../lib/api';
import { useAuth } from '../lib/auth';
import { isEmail } from '../lib/validators';
import { Banner, Field, useSlow } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const slow = useSlow(busy);

  if (user) return <Navigate to="/" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!email.trim()) errs.email = 'Email is required';
    else if (!isEmail(email)) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    setMessage('');
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      await login(email.trim(), password);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMessage('Email or password is incorrect.');
      else if (err instanceof ApiError && err.status === 403) setMessage(err.message || 'This account or organisation is disabled.');
      else if (err instanceof ApiError && err.status === 422 && err.fields.length) setErrors(fieldMap(err.fields));
      else setMessage(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="logo logo-lg">PMS</span>
          <div>
            <h1>Sign in</h1>
            <p className="muted">Procurement Management System</p>
          </div>
        </div>

        {message && <Banner kind="err">{message}</Banner>}

        <form onSubmit={onSubmit} noValidate>
          <Field id="email" label="Email" error={errors.email}>
            <input
              id="email"
              type="email"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
            />
          </Field>
          <Field id="password" label="Password" error={errors.password}>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
            />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          {slow && <p className="muted small center">Waking up the server. The first sign-in of the day can take up to a minute.</p>}
        </form>
      </div>
    </div>
  );
}
