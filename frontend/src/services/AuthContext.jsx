import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from './api.js'
import { cacheAccountProfile, clearAccountProfile, registerLearnerProfile, registerTeacherProfile } from './profile.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!api.getAuthToken()) {
      setLoading(false)
      return
    }
    api.getCurrentUser()
      .then((account) => {
        setUser(account)
        cacheAccountProfile(account)
      })
      .catch((requestError) => {
        if (requestError.status === 401) {
          api.clearAuthToken()
        } else {
          setError(requestError.message)
        }
      })
      .finally(() => setLoading(false))
  }, [])

  const acceptSession = (session) => {
    api.setAuthToken(session.access_token)
    setUser(session.user)
    cacheAccountProfile(session.user)
    setError('')
    return session.user
  }

  const signIn = async (email, password) => acceptSession(await api.login({ email, password }))

  const createLearnerAccount = async (profile) =>
    acceptSession(await registerLearnerProfile(profile))

  const createTeacherAccount = async (profile) =>
    acceptSession(await registerTeacherProfile(profile))

  const signOut = async () => {
    const role = user?.role
    try {
      if (api.getAuthToken()) await api.logout()
    } finally {
      api.clearAuthToken()
      if (role) clearAccountProfile(role)
      // Lessons kept for offline use belong to this account only.
      if ('caches' in window) caches.delete('mothusi-api').catch(() => {})
      setUser(null)
    }
  }

  const value = useMemo(() => ({
    user, loading, error, signIn, signOut, createLearnerAccount, createTeacherAccount, startSession: acceptSession,
  }), [user, loading, error])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// The one way to log out from either portal: end the session, then go to the home page.
export function useSignOut() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  return async () => {
    try {
      await signOut()
      navigate('/', { replace: true })
    } catch (error) {
      navigate('/login', { replace: true, state: { message: error.message } })
    }
  }
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider.')
  return context
}
