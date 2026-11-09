import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Spinner that explains the Render cold start if loading takes more than a few seconds. */
export function Loading({ label = 'Loading…' }: { label?: string }) {
  const slow = useSlow(true);
  return (
    <div className="loading" role="status">
      <span className="spinner" aria-hidden />
      <div>
        <div>{label}</div>
        {slow && <div className="muted small">Waking up the server. The first request of the day can take up to a minute.</div>}
      </div>
    </div>
  );
}

/** True once `active` has been true for `ms` milliseconds. */
export function useSlow(active: boolean, ms = 4000) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!active) {
      setSlow(false);
      return;
    }
    const t = setTimeout(() => setSlow(true), ms);
    return () => clearTimeout(t);
  }, [active, ms]);
  return slow;
}

export function Banner({ kind, children, onRetry }: { kind: 'ok' | 'err' | 'info'; children: ReactNode; onRetry?: () => void }) {
  return (
    <div className={`banner ${kind}`} role={kind === 'err' ? 'alert' : 'status'}>
      <span>{children}</span>
      {onRetry && (
        <button type="button" className="btn btn-link" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

interface FieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function Field({ id, label, required, error, hint, className = '', children }: FieldProps) {
  return (
    <div className={`field ${className} ${error ? 'invalid' : ''}`}>
      <label htmlFor={id}>
        {label} {required && <span className="req">*</span>}
      </label>
      {children}
      {error ? (
        <small className="error" id={`${id}-error`}>
          {error}
        </small>
      ) : (
        hint && <small className="hint">{hint}</small>
      )}
    </div>
  );
}

export function Stepper({ step }: { step: 1 | 2 }) {
  const steps = ['Financial year', 'Company details'];
  return (
    <ol className="stepper" aria-label="Setup progress">
      {steps.map((s, i) => {
        const n = i + 1;
        const state = n < step ? 'done' : n === step ? 'active' : '';
        return (
          <li key={s} className={state} aria-current={n === step ? 'step' : undefined}>
            <span className="dot">{n < step ? '✓' : n}</span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

/** Page title with an optional subtitle and a link back to home. */
export function PageHead({ title, subtitle, back = true }: { title: string; subtitle?: string; back?: boolean }) {
  return (
    <div className="page-head row">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {back && (
        <Link to="/" className="btn btn-secondary">
          Back to home
        </Link>
      )}
    </div>
  );
}
