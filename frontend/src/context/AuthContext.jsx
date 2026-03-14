import React, { createContext, useContext, useState, useEffect } from 'react'
import { login as apiLogin, signup as apiSignup } from '../api/shipmentApi'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]   = useState(null)
  const [token, setToken] = useState(null)

  useEffect(() => {
    // Restore from localStorage on reload
    const savedToken = localStorage.getItem('shipguard_token')
    const savedUser  = localStorage.getItem('shipguard_user')
    if (savedToken && savedUser) {
      setToken(savedToken)
      setUser(JSON.parse(savedUser))
    }
  }, [])

  const doLogin = async (email, password) => {
    const res = await apiLogin({ email, password })
    const { token: t, user: u } = res.data
    localStorage.setItem('shipguard_token', t)
    localStorage.setItem('shipguard_user', JSON.stringify(u))
    setToken(t)
    setUser(u)
    return u
  }

  const doSignup = async (username, email, password, role) => {
    const res = await apiSignup({ username, email, password, role })
    const { token: t, user: u } = res.data
    localStorage.setItem('shipguard_token', t)
    localStorage.setItem('shipguard_user', JSON.stringify(u))
    setToken(t)
    setUser(u)
    return u
  }

  const doLogout = () => {
    localStorage.removeItem('shipguard_token')
    localStorage.removeItem('shipguard_user')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, doLogin, doSignup, doLogout,
      isAdmin: user?.role === 'admin', isUser: user?.role === 'user', isGuest: !user }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
