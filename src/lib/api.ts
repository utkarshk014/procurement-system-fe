// Fetch helper from the Frontend Handoff: adds the token, refreshes once on a 401
// (one refresh at a time, shared by all waiting calls), unwraps `data`, and throws ApiError.

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';
const REFRESH_KEY = 'refresh_token';
const NO_REFRESH = new Set(['/api/v1/auth/login', '/api/v1/auth/refresh', '/api/v1/auth/logout']);

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

// Called when the session is dead (refresh returned 401) so the app can go to the login screen.
let sessionExpiredHandler: (() => void) | null = null;
export function onSessionExpired(fn: (() => void) | null) {
  sessionExpiredHandler = fn;
}

export type FieldError = { field?: string; message: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: FieldError[] = [],
    public requestId?: string,
  ) {
    super(message);
  }
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  localStorage.setItem(REFRESH_KEY, refresh);
}

export function clearTokens() {
  accessToken = null;
  localStorage.removeItem(REFRESH_KEY);
}

export function hasStoredSession() {
  return !!localStorage.getItem(REFRESH_KEY);
}

async function refreshTokens(): Promise<boolean> {
  const refresh_token = localStorage.getItem(REFRESH_KEY);
  if (!refresh_token) return false;
  try {
    const res = await fetch(`${API}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token }),
    });
    if (!res.ok) {
      // 401 means the token is dead; other failures (503, network) keep it for a retry.
      if (res.status === 401) {
        clearTokens();
        sessionExpiredHandler?.();
      }
      return false;
    }
    const { data } = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export async function api<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);

  let res: Response;
  try {
    res = await fetch(`${API}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection and try again.');
  }

  // Login, refresh and logout must not trigger a refresh; /auth/me must (it restores the session after a reload).
  if (res.status === 401 && !retried && !NO_REFRESH.has(path)) {
    refreshing ??= refreshTokens().finally(() => {
      refreshing = null;
    });
    if (await refreshing) return api<T>(path, init, true);
  }
  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'unknown', e.message ?? res.statusText, e.fields ?? [], e.request_id);
  }
  return body.data as T;
}

/** Message to show for an error; adds the request id for 5xx so it can be reported. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 503 || e.status === 504) return `${e.message || 'The server is busy'}. Please try again in a few seconds.`;
    if (e.status >= 500) return `Something went wrong. Please report request ID ${e.requestId ?? 'unknown'}.`;
    if (e.status === 429) return 'Too many attempts. Please wait a minute and try again.';
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** Turn the API's field list into { field: message }. */
export function fieldMap(fields: FieldError[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) if (f.field && !out[f.field]) out[f.field] = f.message;
  return out;
}
