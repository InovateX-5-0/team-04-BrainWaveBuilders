import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function Login() {
  const { doLogin } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null)
    try {
      const u = await doLogin(form.email, form.password)
      navigate(u.role === 'admin' ? '/' : '/my-shipments')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <div className="logo-icon-lg">🚢</div>
          <h1>ShipGuard AI</h1>
          <span>Early Warning System</span>
        </div>

        <h2 className="auth-title">Welcome Back</h2>
        <p className="auth-subtitle">Sign in to access your shipment dashboard</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              className="form-input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={set('email')}
              required
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="Your password"
              value={form.password}
              onChange={set('password')}
              required
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <><span className="spinner" />&#160;Signing in…</> : '🔐 Sign In'}
          </button>
        </form>

        <div className="auth-links">
          <span>Don't have an account? </span>
          <Link to="/signup" className="auth-link">Create one →</Link>
        </div>
        <div className="auth-links" style={{ marginTop: 8 }}>
          <Link to="/track" className="auth-link">🔍 Track a shipment as guest</Link>
        </div>
      </div>
    </div>
  )
}
