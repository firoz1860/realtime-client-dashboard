'use client'

// Auth context: bootstraps a session from the HttpOnly refresh cookie on load,
// exposes login/logout, and keeps the access token in memory (via api.ts).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiError, setUnauthenticatedHandler } from './api'
import type { AuthUser } from './types'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  updateProfile: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Restore session on first load (refresh cookie -> access token -> /me).
  useEffect(() => {
    let active = true
    setUnauthenticatedHandler(() => {
      if (active) {
        setUser(null)
        setStatus('anonymous')
      }
    })
    void api
      .bootstrap()
      .then((restored) => {
        if (!active) return
        setUser(restored)
        setStatus(restored ? 'authenticated' : 'anonymous')
      })
      .catch(() => {
        if (active) setStatus('anonymous')
      })
    return () => {
      active = false
      setUnauthenticatedHandler(null)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    try {
      const { user: loggedIn } = await api.login(email, password)
      setUser(loggedIn)
      setStatus('authenticated')
    } catch (error) {
      setStatus('anonymous')
      if (error instanceof ApiError) throw error
      throw new ApiError(0, { code: 'NETWORK', message: 'Could not reach the server.' })
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } finally {
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  const updateProfile = useCallback(async (name: string) => {
    const updated = await api.updateProfile(name)
    setUser(updated)
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ user, status, login, logout, updateProfile }), [user, status, login, logout, updateProfile])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
