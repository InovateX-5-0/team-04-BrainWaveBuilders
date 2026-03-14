import React, { useEffect, useState } from 'react'
import { adminGetShipments, adminDeleteShipment } from '../api/shipmentApi'

const TRANSPORT_ICONS = { air: '✈️', water: '🚢', road: '🚛' }
const STATUS_COLORS = {
  pending: '#f59e0b', in_transit: '#3b82f6',
  delivered: '#10b981', delayed: '#ef4444', cancelled: '#64748b'
}

export default function ManageShipments() {
  const [shipments, setShipments] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState(null)
  const [deleting,  setDeleting]  = useState(null)
  const [filter,    setFilter]    = useState('all')

  const load = async () => {
    try {
      const res = await adminGetShipments()
      setShipments(res.data)
    } catch { setError('Failed to load shipments.') }
    finally  { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this shipment permanently?')) return
    setDeleting(id)
    try { await adminDeleteShipment(id); setShipments(s => s.filter(x => x.id !== id)) }
    catch { alert('Failed to delete.') }
    finally { setDeleting(null) }
  }

  const filtered = filter === 'all' ? shipments
    : shipments.filter(s => s.risk_level === filter || s.transport_type === filter || s.status === filter)

  return (
    <div>
      <div className="page-title">📦 Manage Shipments</div>
      <div className="page-subtitle">View, filter, and manage all shipments in the system</div>

      {/* Filter Row */}
      <div className="filter-row">
        {['all','High','Medium','Low','air','water','road','pending','in_transit','delivered','delayed'].map(f => (
          <button key={f} className={`filter-btn ${filter===f?'active':''}`} onClick={() => setFilter(f)}>
            {f === 'all' ? '🌐 All' : f === 'air' ? '✈️ Air' : f === 'water' ? '🚢 Water'
            : f === 'road' ? '🚛 Road' : f}
          </button>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">All Shipments</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{filtered.length} records</div>
        </div>

        {loading && <div className="loading-center"><span className="spinner" style={{ margin: '0 auto' }} /></div>}
        {error   && <div className="error-msg">{error}</div>}

        {!loading && !error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Route</th>
                  <th>Transport</th>
                  <th>Mode</th>
                  <th>Carrier</th>
                  <th>User</th>
                  <th>Risk</th>
                  <th>Probability</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{s.id}</td>
                    <td><b>{s.origin_city}</b> → {s.destination_city}</td>
                    <td title={s.transport_type}>
                      {TRANSPORT_ICONS[s.transport_type] || '🚛'} {s.transport_type?.toUpperCase()}
                    </td>
                    <td>{s.shipping_mode}</td>
                    <td>{s.carrier_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {s.username || 'Unknown'}
                    </td>
                    <td>
                      <span className={`badge badge-${s.risk_level?.toLowerCase()}`}>
                        {s.risk_level || '—'}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700,
                      color: s.delay_probability >= 0.70 ? '#ef4444'
                           : s.delay_probability >= 0.45 ? '#f59e0b' : '#10b981' }}>
                      {s.delay_probability != null ? (s.delay_probability * 100).toFixed(1) + '%' : '—'}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                        background: (STATUS_COLORS[s.status] || '#64748b') + '22',
                        color: STATUS_COLORS[s.status] || '#64748b',
                        border: `1px solid ${(STATUS_COLORS[s.status] || '#64748b')}44`
                      }}>
                        {s.status?.replace('_', ' ') || '—'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {s.created_at?.replace('T', ' ')?.slice(0, 16)}
                    </td>
                    <td>
                      <button className="btn-danger-sm" onClick={() => handleDelete(s.id)}
                        disabled={deleting === s.id}>
                        {deleting === s.id ? '…' : '🗑️ Del'}
                      </button>
                    </td>
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
