import React, { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { predictDelay, getRouteInfo, getWeatherCondition } from '../api/shipmentApi'
import { useAuth } from '../context/AuthContext'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

// Fix for Leaflet default icons in React
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
})
L.Marker.prototype.options.icon = DefaultIcon

const CITIES = [
  'Mumbai','Delhi','Bangalore','Chennai','Kolkata','Hyderabad',
  'Ahmedabad','Pune','Jaipur','Surat','Bhubaneswar','Visakhapatnam',
  'Nagpur','Indore','Lucknow','Patna','Rourkela','Sambalpur','Cuttack','Puri',
  'Bhopal','Vadodara','Ludhiana','Agra','Nashik','Faridabad','Meerut','Rajkot',
  'Kochi','Varanasi','Srinagar','Amritsar','Guwahati','Chandigarh',
  // Ports (waterways)
  'Mumbai Port','Chennai Port','Kolkata Port','Kochi Port','Visakha Port',
  'Paradip Port','Haldia Port','Mormugao Port','Kandla Port','Mangalore Port',
  // Airports
  'Mumbai Airport','Delhi Airport','Bangalore Airport','Chennai Airport',
  'Hyderabad Airport','Kolkata Airport','Ahmedabad Airport','Pune Airport',
  'Goa Airport','Guwahati Airport',
]

const CARRIERS_BY_MODE = {
  road:  ['FedEx','DHL','Blue Dart','DTDC','Delhivery','Ecom Express','Ekart','Rivigo','SafeExpress'],
  water: ['Shipping Corp of India','Maersk','Hapag-Lloyd','MSC','COSCO','Evergreen'],
  air:   ['Air India Cargo','IndiGo Cargo','SpiceXpress','Lufthansa Cargo','Emirates SkyCargo','Qatar Airways Cargo'],
}

const TRANSPORT_MAP = {
  'Standard Class': 'road', 'Second Class': 'road', 'First Class': 'road', 'Same Day': 'road',
  'Waterways': 'water', 'Airways': 'air',
}

const TRANSPORT_ICONS = { road: '🚛', water: '🚢', air: '✈️' }

const RISK_COLORS_BG = { High: 'rgba(239,68,68,0.12)', Medium: 'rgba(245,158,11,0.12)', Low: 'rgba(16,185,129,0.12)' }
const RISK_COLORS_FG = { High: '#f87171', Medium: '#fbbf24', Low: '#34d399' }

function probColor(p) {
  if (p >= 0.70) return '#ef4444'
  if (p >= 0.45) return '#f59e0b'
  return '#10b981'
}

// ─── Sub-Component: Map View ──────────────────────────────────────────────────
function RecenterMap({ origin, destination }) {
  const map = useMap()
  useEffect(() => {
    if (origin && destination) {
      const bounds = L.latLngBounds([
        [origin[1], origin[0]],
        [destination[1], destination[0]]
      ])
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [origin, destination, map])
  return null
}

function MapView({ routingInfo }) {
  if (!routingInfo || !routingInfo.origin_coords) return null

  const origin = [routingInfo.origin_coords[1], routingInfo.origin_coords[0]]
  const dest   = [routingInfo.dest_coords[1], routingInfo.dest_coords[0]]
  const routes = routingInfo.routes || []

  return (
    <div className="map-container">
      <MapContainer center={origin} zoom={5} scrollWheelZoom={true}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <RecenterMap origin={routingInfo.origin_coords} destination={routingInfo.dest_coords} />
        
        {/* Render Alternative Routes first (below primary) */}
        {routes.map((route, i) => (
          !route.is_primary && (
            <Polyline
              key={`alt-${i}`}
              positions={route.geometry.map(c => [c[1], c[0]])}
              color="#6b7280"
              weight={3}
              opacity={0.8}
              dashArray="5, 8"
            />
          )
        ))}

        {/* Render Primary Route */}
        {routes.map((route, i) => (
          route.is_primary && (
            <Polyline
              key={`primary-${i}`}
              positions={route.geometry.map(c => [c[1], c[0]])}
              color="#2563eb"
              weight={5}
              opacity={0.9}
            />
          )
        ))}

        <Marker position={origin}>
          <Popup>📦 Origin: <b>{routingInfo.origin_city}</b></Popup>
        </Marker>
        <Marker position={dest}>
          <Popup>🏁 Destination: <b>{routingInfo.dest_city || 'Target'}</b></Popup>
        </Marker>
      </MapContainer>

      <div className="map-overlay-info">
        <b>Live Network Insight</b>
        <div className="route-legend">
          <div className="legend-item"><span className="dot" style={{ background: '#2563eb' }} /> Shortest</div>
          <div className="legend-item"><span className="dot" style={{ background: '#6b7280' }} /> Alternates</div>
        </div>
      </div>
    </div>
  )
}

function PredictionGauge({ probability }) {
  const probPct = (probability * 100).toFixed(1)
  const data = [
    { name: 'Risk', value: Math.min(probability * 100, 100) },
    { name: 'Safe', value: 100 - Math.min(probability * 100, 100) }
  ]

  const getColor = (p) => {
    if (p >= 0.70) return '#ef4444'
    if (p >= 0.45) return '#f59e0b'
    return '#10b981'
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: 220, marginTop: 10 }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="85%"
            innerRadius={70}
            outerRadius={95}
            startAngle={180}
            endAngle={0}
            dataKey="value"
            stroke="none"
          >
            <Cell fill="url(#predictGaugeGradient)" />
            <Cell fill="rgba(0,0,0,0.05)" />
          </Pie>
          <defs>
            <linearGradient id="predictGaugeGradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="50%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#ef4444" />
            </linearGradient>
          </defs>
        </PieChart>
      </ResponsiveContainer>
      <div style={{
        position: 'absolute', bottom: '15%', left: '50%', transform: 'translateX(-50%)',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: getColor(probability) }}>{probPct}%</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Delay Risk
        </div>
      </div>
    </div>
  )
}

export default function PredictForm() {
  const { user } = useAuth()
  const [form, setForm] = useState({
    originCity: 'Mumbai', destinationCity: 'Delhi',
    shippingMode: 'Standard Class', carrierName: 'FedEx',
    shipmentDate: new Date().toISOString().slice(0, 10),
    slaDeliveryDays: 5,
  })
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(null)
  const [error,   setError]   = useState(null)
  const [autoLoading, setAutoLoading] = useState(false)

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const transportType = TRANSPORT_MAP[form.shippingMode] || 'road'
  const filteredCarriers = CARRIERS_BY_MODE[transportType] || []

  // ─── Auto-Fill Logic ──────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchTelemetry = async () => {
      if (form.originCity === form.destinationCity) return
      setAutoLoading(true)
      try {
        const res = await getRouteInfo(form.originCity, form.destinationCity, form.shippingMode)
        if (res.data) {
          setForm(f => ({
            ...f,
            slaDeliveryDays: res.data.suggested_sla_days || f.slaDeliveryDays
          }))
        }
      } catch (err) {
        console.warn('Auto-fill telemetry failed', err)
      } finally {
        setAutoLoading(false)
      }
    }
    const timer = setTimeout(fetchTelemetry, 600) // Debounce
    return () => clearTimeout(timer)
  }, [form.originCity, form.destinationCity, form.shippingMode])

  // Ensure carrier is valid for mode when mode changes
  useEffect(() => {
    if (!filteredCarriers.includes(form.carrierName)) {
      setForm(f => ({ ...f, carrierName: filteredCarriers[0] || '' }))
    }
  }, [transportType, filteredCarriers])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true); setError(null); setResult(null)
    try {
      const res = await predictDelay({
        origin_city:       form.originCity,
        destination_city:  form.destinationCity,
        shipping_mode:     form.shippingMode,
        transport_type:    transportType,
        carrier_name:      form.carrierName,
        shipment_date:     form.shipmentDate,
        sla_delivery_days: parseInt(form.slaDeliveryDays, 10),
      })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || err.response?.data?.error || 'Failed to connect to AI service.')
    } finally { setLoading(false) }
  }

  const prob    = result?.delay_probability ?? 0
  const probPct = (prob * 100).toFixed(1)

  return (
    <div>
      <div className="page-title">🔮 Predict Shipment Delay</div>
      <div className="page-subtitle">
        AI-powered delay prediction — results auto-saved to your shipment history
      </div>

      {result?.early_warning && (
        <div className="alert-banner">
          <span className="alert-icon">🚨</span>
          <div>
            <div className="alert-title">High probability of shipment delay detected.</div>
            <div className="alert-msg">{result.recommended_action}</div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">Shipment Details</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            {TRANSPORT_ICONS[transportType]}
            <span style={{ color: 'var(--text-muted)' }}>
              {transportType === 'air' ? 'Airways' : transportType === 'water' ? 'Waterways' : 'Road'}
            </span>
          </div>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="form-group">
              <label className="form-label">Origin City / Port / Airport</label>
              <select className="form-select" value={form.originCity} onChange={set('originCity')}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Destination City / Port / Airport</label>
              <select className="form-select" value={form.destinationCity} onChange={set('destinationCity')}>
                {CITIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Shipping Mode</label>
              <select className="form-select" value={form.shippingMode} onChange={set('shippingMode')}>
                <optgroup label="🚛 Road">
                  <option>Standard Class</option>
                  <option>Second Class</option>
                  <option>First Class</option>
                  <option>Same Day</option>
                </optgroup>
                <optgroup label="🚢 Waterways">
                  <option>Waterways</option>
                </optgroup>
                <optgroup label="✈️ Airways">
                  <option>Airways</option>
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Carrier / Airline / Shipping Line</label>
              <select className="form-select" value={form.carrierName} onChange={set('carrierName')}>
                {filteredCarriers.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Shipment Date</label>
              <input className="form-input" type="date" value={form.shipmentDate} onChange={set('shipmentDate')} />
            </div>
            <div className="form-group">
              <label className="form-label">SLA Delivery Days</label>
              <input className="form-input" type="number" min="1" max="90"
                value={form.slaDeliveryDays} onChange={set('slaDeliveryDays')} />
            </div>
          </div>

          <div style={{ marginTop: 20, display: 'flex', gap: 12, alignItems: 'center' }}>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <><span className="spinner" />&#160;Analyzing…</> : '🚀 Predict Delay Risk'}
            </button>
            {error && <span style={{ color: '#f87171', fontSize: 13 }}>{error}</span>}
          </div>
        </form>
      </div>

      {result && (
        <div className="card" style={{ marginTop: 24, padding: 0, overflow: 'hidden' }}>
          <div className="card-header" style={{ padding: '24px 30px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 22 }}>📋</span>
              <div>
                <div className="card-title">Prediction Result</div>
                <div className="card-subtitle">AI analysis of {form.carrierName} performance on this route</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
               <div className={`status-badge ${prob > 0.4 ? 'status-warning' : 'status-success'}`} style={{ padding: '6px 16px' }}>
                 {prob > 0.6 ? 'High Risk' : prob > 0.3 ? 'Medium Risk' : 'Low Risk'}
               </div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', minHeight: 600 }}>
            {/* Left Column: Map */}
            <div style={{ borderRight: '1px solid var(--border)', position: 'relative', background: '#f8fafc' }}>
              <MapView routingInfo={result.routing_info} />
            </div>

            {/* Right Column: Visualization & Stats */}
            <div style={{ padding: '30px', display: 'flex', flexDirection: 'column', gap: 24, background: 'var(--bg-card)' }}>
              <div>
                <label className="form-label" style={{ marginBottom: 15, display: 'block' }}>Risk Visualization</label>
                <PredictionGauge probability={prob} />
              </div>

              <div style={{ marginTop: 'auto' }}>
                <label className="form-label" style={{ marginBottom: 15, display: 'block' }}>Route Metrics</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div className="stat-card" style={{ padding: '16px', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>DISTANCE</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{result.routing_info.distance_km} <small style={{ fontSize: 10 }}>KM</small></span>
                  </div>
                  <div className="stat-card" style={{ padding: '16px', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>TRAVEL TIME</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{(result.routing_info.travel_time_minutes / 60).toFixed(1)} <small style={{ fontSize: 10 }}>HRS</small></span>
                  </div>
                  <div className="stat-card" style={{ padding: '16px', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>WEATHER</span>
                    <span style={{ fontSize: 14, fontWeight: 600, textTransform: 'capitalize' }}>{result.weather?.description || 'Clear'}</span>
                  </div>
                  <div className="stat-card" style={{ padding: '16px', flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>SLA BUFFER</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: (result.sla_hours_buffer || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                      {result.sla_hours_buffer !== undefined ? (result.sla_hours_buffer > 0 ? `+${result.sla_hours_buffer}h` : `${result.sla_hours_buffer}h`) : '--'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
