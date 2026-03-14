import React, { useEffect, useState } from 'react'
import { getHistory } from '../api/shipmentApi'

const RISK_BADGE = { High: 'badge-high', Medium: 'badge-medium', Low: 'badge-low' }

export default function History() {
  const [data,    setData]    = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    getHistory()
      .then(r => setData(r.data))
      .catch(() => setError('Could not load history. Ensure the backend is running.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="page-title">📋 Shipment History</div>
      <div className="page-subtitle">Last 20 AI predictions stored in database</div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">Prediction Log</div>
          <div style={{fontSize:12,color:'var(--text-muted)'}}>{data.length} records</div>
        </div>

        {loading && <div style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
          <div className="spinner" style={{margin:'0 auto 12px'}}/>Loading…
        </div>}

        {error && <div style={{textAlign:'center',padding:32,color:'#f87171'}}>{error}</div>}

        {!loading && !error && data.length === 0 && (
          <div style={{textAlign:'center',padding:32,color:'var(--text-muted)'}}>
            No predictions yet. <a href="/predict" style={{color:'var(--accent)'}}>Make your first prediction →</a>
          </div>
        )}

        {!loading && data.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Route</th>
                  <th>Mode</th>
                  <th>Carrier</th>
                  <th>SLA Days</th>
                  <th>Probability</th>
                  <th>Risk Level</th>
                  <th>Recommended Action</th>
                  <th>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {data.map((s, i) => (
                  <tr key={s.shipmentId || i}>
                    <td style={{color:'var(--text-muted)'}}>{s.shipmentId}</td>
                    <td><b>{s.originCity}</b> → {s.destinationCity}</td>
                    <td>{s.shippingMode}</td>
                    <td>{s.carrierName}</td>
                    <td>{s.slaDays}</td>
                    <td>
                      <span style={{
                        fontWeight:700,
                        color: s.delayProbability >= 0.70 ? '#ef4444'
                             : s.delayProbability >= 0.45 ? '#f59e0b' : '#10b981'
                      }}>
                        {(s.delayProbability * 100).toFixed(1)}%
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${RISK_BADGE[s.riskLevel] || 'badge-low'}`}>
                        {s.riskLevel}
                      </span>
                    </td>
                    <td style={{maxWidth:260,fontSize:12,color:'var(--text-muted)'}}>
                      {s.recommendedAction}
                    </td>
                    <td style={{fontSize:12,color:'var(--text-muted)',whiteSpace:'nowrap'}}>
                      {s.timestamp?.replace('T',' ')?.slice(0,19)}
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
