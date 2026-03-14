import React, { useEffect, useState } from 'react'
import { getMyShipments, getMyAlerts, updateShipment } from '../api/shipmentApi'

const TRANSPORT_ICONS = { air: '✈️', water: '🚢', road: '🚛' }
const STATUS_COLORS = {
  pending: '#f59e0b', in_transit: '#3b82f6',
  delivered: '#10b981', delayed: '#ef4444', cancelled: '#64748b'
}
const ALL_STATUSES = ['pending','in_transit','delivered','delayed','cancelled']

export default function MyShipments() {
  const [shipments, setShipments] = useState([])
  const [alerts,    setAlerts]    = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [tab,       setTab]       = useState('shipments')
  const [updating,  setUpdating]  = useState(null)

  const load = async () => {
    try {
      const [sRes, aRes] = await Promise.all([getMyShipments(), getMyAlerts()])
      setShipments(sRes.data)
      setAlerts(aRes.data)
    } catch { setError('Failed to load your shipments.') }
    finally  { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleStatusChange = async (id, status) => {
    setUpdating(id)
    try {
      await updateShipment(id, { status })
      setShipments(prev => prev.map(s => s.shipmentId === id ? { ...s, status } : s))
    } catch { alert('Failed to update status.') }
    finally  { setUpdating(null) }
  }

  const rows = tab === 'alerts' ? alerts : shipments

  return (
    <div>
      <div className="page-title">📦 My Shipments</div>
      <div className="page-subtitle">Manage your shipments, track status, and view delay alerts</div>

      {/* Tabs */}
      <div className="tab-row">
        <button className={`tab-btn ${tab==='shipments'?'active':''}`} onClick={() => setTab('shipments')}>
          📦 All Shipments <span className="tab-count">{shipments.length}</span>
        </button>
        <button className={`tab-btn ${tab==='alerts'?'active':''}`} onClick={() => setTab('alerts')}>
          🚨 High Risk Alerts <span className="tab-count" style={{ background: '#ef444433', color: '#f87171' }}>{alerts.length}</span>
        </button>
      </div>

      {tab === 'alerts' && alerts.length === 0 && !loading && (
        <div className="card" style={{ textAlign: 'center', padding: 32, color: '#10b981' }}>
          ✅ No high-risk alerts. All your shipments are on track!
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">{tab === 'alerts' ? '⚠️ High Risk Alerts' : 'Your Shipments'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{rows.length} records</div>
        </div>

        {loading && <div className="loading-center"><span className="spinner" style={{ margin: '0 auto' }} /></div>}
        {error   && <div className="error-msg">{error}</div>}

        {!loading && !error && rows.length === 0 && tab === 'shipments' && (
          <div style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
            No shipments yet.{' '}
            <a href="/predict" style={{ color: 'var(--accent)' }}>Create your first shipment →</a>
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Route</th>
                  <th>Transport</th>
                  <th>Carrier</th>
                  <th>Risk</th>
                  <th>Delay%</th>
                  <th>Status</th>
                  <th>Date</th>
                  {tab === 'shipments' && <th>Update Status</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map(s => (
                  <tr key={s.shipmentId}>
                    <td style={{ color: 'var(--text-muted)' }}>{s.shipmentId}</td>
                    <td><b>{s.originCity}</b> → {s.destinationCity}</td>
                    <td>{TRANSPORT_ICONS[s.transportType] || '🚛'} {s.transportType?.toUpperCase() || 'ROAD'}</td>
                    <td>{s.carrierName || '—'}</td>
                    <td>
                      <span className={`badge badge-${s.riskLevel?.toLowerCase()}`}>
                        {s.riskLevel || '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700,
                      color: s.delayProbability >= 0.70 ? '#ef4444'
                           : s.delayProbability >= 0.45 ? '#f59e0b' : '#10b981' }}>
                      {s.delayProbability != null ? (s.delayProbability * 100).toFixed(1) + '%' : '—'}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: (STATUS_COLORS[s.status] || '#64748b') + '22',
                        color: STATUS_COLORS[s.status] || '#64748b',
                        border: `1px solid ${(STATUS_COLORS[s.status] || '#64748b')}44`
                      }}>
                        {s.status?.replace('_',' ') || 'pending'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {s.timestamp?.replace('T', ' ')?.slice(0, 16)}
                    </td>
                    {tab === 'shipments' && (
                      <td>
                        <select
                          className="form-select"
                          style={{ fontSize: 12, padding: '4px 8px', minWidth: 120 }}
                          value={s.status || 'pending'}
                          disabled={updating === s.shipmentId}
                          onChange={(e) => handleStatusChange(s.shipmentId, e.target.value)}
                        >
                          {ALL_STATUSES.map(st => (
                            <option key={st} value={st}>{st.replace('_', ' ')}</option>
                          ))}
                        </select>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
