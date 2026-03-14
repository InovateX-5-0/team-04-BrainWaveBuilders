import React, { useState } from 'react'
import { trackShipment } from '../api/shipmentApi'
import { Link } from 'react-router-dom'

const TRANSPORT_ICONS = { air: '✈️', water: '🚢', road: '🚛' }
const STATUS_COLORS = {
  pending:    '#f59e0b', in_transit: '#3b82f6',
  delivered:  '#10b981', delayed:    '#ef4444', cancelled:  '#64748b'
}

export default function TrackShipment() {
  const [shipmentId, setShipmentId] = useState('')
  const [result,     setResult]     = useState(null)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)

  const handleTrack = async (e) => {
    e.preventDefault()
    if (!shipmentId.trim()) return
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await trackShipment(parseInt(shipmentId, 10))
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Shipment not found. Please check the ID.')
    } finally { setLoading(false) }
  }

  const prob = result?.delay_probability ?? 0

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: 520 }}>
        <div className="auth-logo">
          <div className="logo-icon-lg">🔍</div>
          <h1>ShipGuard AI</h1>
          <span>Public Shipment Tracker</span>
        </div>

        <h2 className="auth-title">Track Your Shipment</h2>
        <p className="auth-subtitle">Enter your shipment ID to get real-time status</p>

        <form onSubmit={handleTrack} className="auth-form">
          <div className="form-group">
            <label className="form-label">Shipment ID</label>
            <input
              className="form-input"
              type="number"
              placeholder="e.g. 42"
              value={shipmentId}
              onChange={(e) => setShipmentId(e.target.value)}
              min="1"
              required
            />
          </div>
          {error && <div className="auth-error">{error}</div>}
          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? <><span className="spinner" />&#160;Searching…</> : '🔍 Track Shipment'}
          </button>
        </form>

        {result && (
          <div className="track-result">
            <div className="track-header">
              <span className="track-id">Shipment #{result.id}</span>
              <span className="track-status-badge"
                style={{ background: STATUS_COLORS[result.status] + '22',
                         color: STATUS_COLORS[result.status],
                         border: `1px solid ${STATUS_COLORS[result.status]}44` }}>
                {result.status?.replace('_', ' ').toUpperCase()}
              </span>
            </div>
            <div className="track-grid">
              <div className="track-item">
                <div className="track-label">ROUTE</div>
                <div className="track-value">{result.origin_city} → {result.destination_city}</div>
              </div>
              <div className="track-item">
                <div className="track-label">TRANSPORT</div>
                <div className="track-value">
                  {TRANSPORT_ICONS[result.transport_type] || '🚛'} {result.transport_type?.toUpperCase() || 'ROAD'}
                </div>
              </div>
              <div className="track-item">
                <div className="track-label">CARRIER</div>
                <div className="track-value">{result.carrier_name || '—'}</div>
              </div>
              <div className="track-item">
                <div className="track-label">SHIPPING MODE</div>
                <div className="track-value">{result.shipping_mode}</div>
              </div>
              <div className="track-item">
                <div className="track-label">RISK LEVEL</div>
                <div className="track-value">
                  <span className={`badge badge-${result.risk_level?.toLowerCase()}`}>
                    {result.risk_level || '—'}
                  </span>
                </div>
              </div>
              <div className="track-item">
                <div className="track-label">DELAY PROBABILITY</div>
                <div className="track-value" style={{
                  color: prob >= 0.70 ? '#ef4444' : prob >= 0.45 ? '#f59e0b' : '#10b981',
                  fontWeight: 700
                }}>
                  {(prob * 100).toFixed(1)}%
                </div>
              </div>
            </div>
            <div className="track-date">
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Created: {result.created_at?.replace('T', ' ')?.slice(0, 19)}
              </span>
            </div>
          </div>
        )}

        <div className="auth-links" style={{ marginTop: 20 }}>
          <Link to="/login" className="auth-link">🔐 Sign in for full access →</Link>
        </div>
        <div className="auth-links" style={{ marginTop: 8 }}>
          <Link to="/signup" className="auth-link">📝 Create an account →</Link>
        </div>
      </div>
    </div>
  )
}
