import React, { useEffect, useState, useCallback } from 'react'
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from 'react-leaflet'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from 'recharts'
import { getAnalytics } from '../api/shipmentApi'

// City coordinates for Leaflet
const CITY_COORDS = {
  'Mumbai': [19.0760, 72.8777], 'Delhi': [28.7041, 77.1025],
  'Bangalore': [12.9716, 77.5946], 'Chennai': [13.0827, 80.2707],
  'Kolkata': [22.5726, 88.3639], 'Hyderabad': [17.3850, 78.4867],
  'Ahmedabad': [23.0225, 72.5714], 'Pune': [18.5204, 73.8567],
  'Bhubaneswar': [20.2961, 85.8245], 'Visakhapatnam': [17.6868, 83.2185],
}

const RISK_COLORS = { High: '#ef4444', Medium: '#f59e0b', Low: '#10b981' }

export default function Dashboard() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await getAnalytics()
      setAnalytics(res.data)
    } catch {
      // Show placeholder analytics when backend isn't running
      setAnalytics({
        total_shipments: 0,
        avg_delay_probability: 0,
        high_risk_count: 0,
        risk_distribution: { High: 0, Medium: 0, Low: 0 },
        recent_shipments: [],
      })
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  const riskChartData = analytics
    ? Object.entries(analytics.risk_distribution || {}).map(([k, v]) => ({ name: k, count: v }))
    : []

  const recentShipments = analytics?.recent_shipments?.slice(0, 5) || []
  const highRiskShipments = recentShipments.filter(s => s.riskLevel === 'High')

  return (
    <div>
      <div className="page-title">🛡️ Command Dashboard</div>
      <div className="page-subtitle">
        <span className="dot-live"/>Real-time AI monitoring • Updates every 30s
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon" style={{background:'rgba(59,130,246,0.15)'}}>📦</div>
          <div>
            <div className="stat-value">{analytics?.total_shipments ?? '—'}</div>
            <div className="stat-label">Total Predictions</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'rgba(239,68,68,0.15)'}}>🚨</div>
          <div>
            <div className="stat-value" style={{color:'#ef4444'}}>{analytics?.high_risk_count ?? '—'}</div>
            <div className="stat-label">High Risk Shipments</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'rgba(245,158,11,0.15)'}}>📈</div>
          <div>
            <div className="stat-value" style={{color:'#f59e0b'}}>
              {analytics ? (analytics.avg_delay_probability * 100).toFixed(1) + '%' : '—'}
            </div>
            <div className="stat-label">Avg Delay Probability</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon" style={{background:'rgba(16,185,129,0.15)'}}>⚡</div>
          <div>
            <div className="stat-value" style={{color:'#10b981'}}>48–72h</div>
            <div className="stat-label">Prediction Horizon</div>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        {/* Map */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">🗺️ Shipment Risk Heatmap</div>
              <div className="card-subtitle">Live route monitoring</div>
            </div>
          </div>
          <div className="map-container">
            <MapContainer center={[20.5937, 78.9629]} zoom={5}
              style={{height:'100%',width:'100%'}}
              attributionControl={false}>
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              />
              {recentShipments.map((s, i) => {
                const oCoords = CITY_COORDS[s.originCity]
                const dCoords = CITY_COORDS[s.destinationCity]
                const color = RISK_COLORS[s.riskLevel] || '#3b82f6'
                return oCoords && dCoords ? (
                  <React.Fragment key={i}>
                    <CircleMarker center={oCoords} radius={8} color={color} fillColor={color} fillOpacity={0.7}>
                      <Popup><b>{s.originCity}</b><br/>Risk: {s.riskLevel}</Popup>
                    </CircleMarker>
                    <CircleMarker center={dCoords} radius={8} color={color} fillColor={color} fillOpacity={0.7}>
                      <Popup><b>{s.destinationCity}</b><br/>Risk: {s.riskLevel}</Popup>
                    </CircleMarker>
                    <Polyline positions={[oCoords, dCoords]} color={color} dashArray="6" weight={2} opacity={0.6}/>
                  </React.Fragment>
                ) : null
              })}
              {/* Static markers for city reference */}
              {Object.entries(CITY_COORDS).map(([city, coords]) => (
                <CircleMarker key={city} center={coords} radius={4}
                  color="#3b82f6" fillColor="#3b82f6" fillOpacity={0.4}>
                  <Popup>{city}</Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div className="card-header" style={{ width: '100%' }}>
            <div>
              <div className="card-title">📊 Risk Concentration</div>
              <div className="card-subtitle">Overall network delay probability</div>
            </div>
          </div>
          <div style={{ position: 'relative', width: '100%', height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'Risk', value: Math.min((analytics?.avg_delay_probability || 0) * 100, 100) },
                    { name: 'Remaining', value: 100 - Math.min((analytics?.avg_delay_probability || 0) * 100, 100) }
                  ]}
                  innerRadius={80}
                  outerRadius={110}
                  startAngle={180}
                  endAngle={0}
                  paddingAngle={0}
                  dataKey="value"
                  stroke="none"
                >
                  <Cell fill="url(#gaugeGradient)" />
                  <Cell fill="#f1f5f9" />
                </Pie>
                <defs>
                  <linearGradient id="gaugeGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="50%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#ef4444" />
                  </linearGradient>
                </defs>
              </PieChart>
            </ResponsiveContainer>
            <div style={{
              position: 'absolute', top: '65%', left: '50%', transform: 'translate(-50%, -50%)',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '32px', fontWeight: '800', color: 'var(--text-primary)' }}>
                {(analytics?.avg_delay_probability * 100 || 0).toFixed(1)}%
              </div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                System Risk
              </div>
            </div>
          </div>
        </div>

        {/* High Risk Panel */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">🔴 High Risk Shipments</div>
          </div>
          {highRiskShipments.length === 0 ? (
            <div style={{textAlign:'center',padding:'24px',color:'var(--text-muted)'}}>
              ✅ No high risk shipments
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr><th>Route</th><th>Mode</th><th>Probability</th></tr>
                </thead>
                <tbody>
                  {highRiskShipments.map((s, i) => (
                    <tr key={i}>
                      <td>{s.originCity} → {s.destinationCity}</td>
                      <td>{s.shippingMode}</td>
                      <td style={{color:'#ef4444',fontWeight:600}}>
                        {(s.delayProbability * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Alerts */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">⚡ Recent Alerts</div>
          </div>
          {recentShipments.length === 0 ? (
            <div style={{textAlign:'center',padding:'24px',color:'var(--text-muted)'}}>
              No predictions yet – <a href="/predict" style={{color:'var(--accent)'}}>run a prediction</a>
            </div>
          ) : (
            recentShipments.map((s, i) => (
              <div key={i} className="news-item">
                <div className="news-title">
                  {s.originCity} → {s.destinationCity} &nbsp;
                  <span className={`badge badge-${s.riskLevel?.toLowerCase()}`}>{s.riskLevel}</span>
                </div>
                <div className="news-meta">
                  {s.shippingMode} · {(s.delayProbability * 100).toFixed(1)}% delay risk
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
