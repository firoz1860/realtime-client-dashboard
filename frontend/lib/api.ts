

import type { AuthUser } from './types'

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '')

let accessToken: string | null = null
let onUnauthenticated: (() => void) | null = null

// Non-sensitive hint (NOT the token) so we only attempt a refresh on load when
// the user has logged in before — avoids a benign 401 in the console on first visit.
const SESSION_HINT = 'orbit_session'
const rememberSession = (on: boolean): void => {
  try { if (on) localStorage.setItem(SESSION_HINT, '1'); else localStorage.removeItem(SESSION_HINT) } catch { /* ignore */ }
}
const hasSessionHint = (): boolean => {
  try { return localStorage.getItem(SESSION_HINT) === '1' } catch { return false }
}

export const setAccessToken = (token: string | null): void => {
  accessToken = token
}
export const getAccessToken = (): string | null => accessToken

/** Registered by the auth provider so a failed refresh can reset app state. */
export const setUnauthenticatedHandler = (fn: (() => void) | null): void => {
  onUnauthenticated = fn
}

export interface ApiErrorShape {
  code: string
  message: string
  details?: unknown
}

export class ApiError extends Error {
  code: string
  status: number
  details?: unknown
  constructor(status: number, error: ApiErrorShape) {
    super(error.message)
    this.name = 'ApiError'
    this.status = status
    this.code = error.code
    this.details = error.details
  }
}

type Envelope<T> = { success: true; data: T } | { success: false; error: ApiErrorShape }

interface RequestOptions {
  method?: string
  body?: unknown
  auth?: boolean // attach the bearer access token (default true)
  retryOn401?: boolean // internal: retry after refresh (default true)
}

// Single-flight refresh so concurrent 401s trigger only one refresh call.
let refreshInFlight: Promise<boolean> | null = null

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    if (!res.ok) return false
    const json = (await res.json()) as Envelope<{ accessToken: string; user: AuthUser }>
    if (!json.success) return false
    accessToken = json.data.accessToken
    return true
  } catch {
    return false
  }
}

function refreshOnce(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, retryOn401 = true } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let res: Response
  try {
    res = await fetch(`${API_BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Cannot reach the server. Check that the API is running and try again.' })
  }

  // Transparent refresh + retry on an expired access token.
  if (res.status === 401 && auth && retryOn401) {
    const refreshed = await refreshOnce()
    if (refreshed) {
      return request<T>(path, { ...options, retryOn401: false })
    }
    accessToken = null
    onUnauthenticated?.()
  }

  let json: Envelope<T>
  try {
    json = (await res.json()) as Envelope<T>
  } catch {
    throw new ApiError(res.status, { code: 'NETWORK', message: `Request failed (${res.status}).` })
  }

  if (!res.ok || !json.success) {
    const error = 'error' in json ? json.error : { code: 'UNKNOWN', message: 'Unexpected error.' }
    // Surface the first field-level validation message instead of the generic one.
    if (error.code === 'VALIDATION_ERROR' && Array.isArray(error.details) && error.details.length) {
      const first = error.details[0] as { message?: string; path?: unknown[] }
      const field = Array.isArray(first.path) && first.path.length ? String(first.path[first.path.length - 1]) : ''
      if (first.message) error.message = field && !first.message.toLowerCase().includes(field.toLowerCase()) ? `${field}: ${first.message}` : first.message
    }
    throw new ApiError(res.status, error)
  }
  return json.data
}

// ---- Auth ----
export const api = {
  request,

  login: (email: string, password: string) =>
    request<{ accessToken: string; user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
      retryOn401: false,
    }).then((data) => {
      accessToken = data.accessToken
      rememberSession(true)
      return data
    }),

  register: (input: { name: string; email: string; password: string; companyName: string }) =>
    request<{ accessToken: string; user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
      retryOn401: false,
    }).then((data) => {
      accessToken = data.accessToken
      rememberSession(true)
      return data
    }),

  authConfig: () => request<{ signupEnabled: boolean }>('/auth/config', { auth: false, retryOn401: false }),

  /** Restore a session on page load using the HttpOnly refresh cookie. */
  bootstrap: async (): Promise<AuthUser | null> => {
    if (!hasSessionHint()) return null
    const ok = await refreshOnce()
    if (!ok) { rememberSession(false); return null }
    try {
      return await request<AuthUser>('/auth/me')
    } catch {
      return null
    }
  },

  me: () => request<AuthUser>('/auth/me'),

  updateProfile: (name: string) => request<AuthUser>('/auth/me', { method: 'PATCH', body: { name } }),

  logout: async (): Promise<void> => {
    try {
      await request<{ loggedOut: boolean }>('/auth/logout', { method: 'POST', auth: false, retryOn401: false })
    } finally {
      accessToken = null
      rememberSession(false)
    }
  },
}
