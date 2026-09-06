export interface ApiError {
  code: string;
  message: string;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, body: { error?: ApiError }) {
    super(body.error?.message ?? 'Request failed');
    this.status = status;
    this.code = body.error?.code ?? 'INTERNAL';
  }
}

let onUnauthenticated: (() => void) | null = null;
export function setUnauthenticatedHandler(fn: () => void): void {
  onUnauthenticated = fn;
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = { method: options.method ?? 'GET', credentials: 'same-origin' };
  if (options.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(`/api${path}`, init);

  if (res.status === 401 && !path.startsWith('/auth/')) {
    onUnauthenticated?.();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiRequestError(res.status, json);
  return json as T;
}
