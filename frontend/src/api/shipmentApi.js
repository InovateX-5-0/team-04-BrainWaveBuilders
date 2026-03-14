import axios from 'axios'

const API = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
})

// Attach JWT token to every request
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('shipguard_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const signup = (payload) => API.post('/auth/signup', payload)
export const login  = (payload) => API.post('/auth/login', payload)

// ─── Predict (shared) ─────────────────────────────────────────────────────────
export const predictDelay   = (payload) => API.post('/shipments', payload)
export const predictStandalone = (payload) => API.post('/predict', payload)

// ─── History / analytics (shared) ────────────────────────────────────────────
export const getHistory     = ()        => API.get('/shipments/history')
export const getAnalytics   = ()        => API.get('/admin/analytics')

// ─── Admin ────────────────────────────────────────────────────────────────────
export const adminGetUsers      = ()        => API.get('/admin/users')
export const adminDeleteUser    = (id)      => API.delete(`/admin/users/${id}`)
export const adminGetShipments  = ()        => API.get('/admin/shipments')
export const adminDeleteShipment = (id)     => API.delete(`/admin/shipments/${id}`)
export const adminAnalytics     = ()        => API.get('/admin/analytics')
export const carrierPerformance = ()        => API.get('/admin/carrier-performance')

// ─── User ─────────────────────────────────────────────────────────────────────
export const getMyShipments   = ()        => API.get('/shipments/my')
export const getMyAlerts      = ()        => API.get('/shipments/alerts')
export const updateShipment   = (id, d)   => API.put(`/shipments/${id}`, d)

// ─── Guest ────────────────────────────────────────────────────────────────────
export const trackShipment = (id) => API.get(`/track/${id}`)

// ─── Auto-Fill (Real-time) ────────────────────────────────────────────────────
export const getRouteInfo = (origin, destination, mode) => API.get('/route-info', { params: { origin, destination, mode } })
export const getWeatherCondition = (city) => API.get('/weather-condition', { params: { city } })

export default API
