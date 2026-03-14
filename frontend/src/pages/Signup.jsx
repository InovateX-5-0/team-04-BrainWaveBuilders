import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link } from 'react-router-dom'

export default function Signup() {
  const { doSignup } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' })
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.'); return
    }
    setLoading(true); setError(null)
    try {
      const u = await doSignup(form.username, form.email, form.password, form.role)
      navigate(u.role === 'admin' ? '/' : '/my-shipments')
    } catch (err) {
      setError(err.response?.data?.detail || 'Signup failed. Email or username may already be taken.')
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

        <h2 className="auth-title">Create Account</h2>
        <p className="auth-subtitle">Join ShipGuard to manage your shipments</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Username</label>
            <input className="form-input" type="text" placeholder="john_doe"
              value={form.username} onChange={set('username')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input className="form-input" type="email" placeholder="you@example.com"
              value={form.email} onChange={set('email')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Password</label>
            <input className="form-input" type="password" placeholder="Min 6 characters"
              value={form.password} onChange={set('password')} required />
          </div>
          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <><span className="spinner" />&#160;Creating account…</> : '🚀 Create Account'}
          </button>
        </form>

        <div className="auth-links">
          <span>Already have an account? </span>
          <Link to="/login" className="auth-link">Sign in →</Link>
        </div>
      </div>
    </div>
  )
}
