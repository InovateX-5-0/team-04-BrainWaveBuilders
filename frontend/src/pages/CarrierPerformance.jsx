import React, { useEffect, useState } from 'react'
import { carrierPerformance } from '../api/shipmentApi'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend } from 'recharts'

const COLORS = ['#3b82f6','#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#ec4899']

export default function CarrierPerformance() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    carrierPerformance()
      .then(r => setData(r.data))
      .catch(() => setError('Failed to load carrier data.'))
      .finally(() => setLoading(false))
  }, [])

  const chartData = data.map(c => ({
    name:      c.carrier_name || 'Unknown',
    avgDelay:  +(c.avg_delay * 100).toFixed(1),
    total:     c.total,
    highRisk:  c.high_risk_count,
    delayed:   c.delayed_count,
  }))

  return (
    <div>
      <div className="page-title">🚚 Carrier Performance</div>
      <div className="page-subtitle">Delay statistics by carrier — sorted by avg delay probability</div>

      {loading && <div className="loading-center"><span className="spinner" style={{ margin: '0 auto' }} /></div>}
      {error   && <div className="error-msg">{error}</div>}

      {!loading && !error && data.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          No carrier data yet. Make some shipment predictions first.
        </div>
      )}

      {!loading && chartData.length > 0 && (
        <>
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <div className="card-title">📊 Avg Delay Probability by Carrier</div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} barSize={36}>
                <XAxis dataKey="name" stroke="#94a3b8" tick={{ fontSize: 12 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} unit="%" />
                <Tooltip
                  contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.08)',
                                  borderRadius: 8, color: '#f1f5f9' }}
                  cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  formatter={(v) => [`${v}%`, 'Avg Delay']}
                />
                <Bar dataKey="avgDelay" radius={[6,6,0,0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">📋 Carrier Summary Table</div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Carrier</th>
                    <th>Total Shipments</th>
                    <th>Avg Delay%</th>
                    <th>High Risk</th>
                    <th>Delayed</th>
                    <th>On-time Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c, i) => {
                    const onTime = c.total > 0 ? ((c.total - c.delayed_count) / c.total * 100).toFixed(1) : '—'
                    return (
                      <tr key={i}>
                        <td><b>{c.carrier_name || 'Unknown'}</b></td>
                        <td>{c.total}</td>
                        <td style={{ fontWeight: 700,
                          color: c.avg_delay >= 0.7 ? '#ef4444' : c.avg_delay >= 0.45 ? '#f59e0b' : '#10b981' }}>
                          {(c.avg_delay * 100).toFixed(1)}%
                        </td>
                        <td>
                          <span className="badge badge-high">{c.high_risk_count}</span>
                        </td>
                        <td style={{ color: '#ef4444' }}>{c.delayed_count}</td>
                        <td style={{ color: '#10b981', fontWeight: 600 }}>{onTime}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
