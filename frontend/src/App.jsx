import React from 'react'
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'

import Dashboard       from './pages/Dashboard'
import PredictForm     from './pages/PredictForm'
import History         from './pages/History'
import Login           from './pages/Login'
import Signup          from './pages/Signup'
import TrackShipment   from './pages/TrackShipment'
import ManageUsers     from './pages/ManageUsers'
import ManageShipments from './pages/ManageShipments'
import CarrierPerformance from './pages/CarrierPerformance'
import MyShipments     from './pages/MyShipments'

// ─── Protected Route Wrapper ──────────────────────────────────────────────────
function ProtectedRoute({ children, role }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (role && user.role !== role) return <Navigate to="/" replace />
  return children
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar() {
  const { user, doLogout, isAdmin } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => { doLogout(); navigate('/login') }

  return (
    <nav className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">🚢</div>
        <div>
          <h1>ShipGuard</h1>
          <span>AI Early Warning</span>
        </div>
      </div>

      {/* Role badge */}
      <div className="sidebar-user">
        <div className="sidebar-avatar">{user?.username?.[0]?.toUpperCase() || '?'}</div>
        <div>
          <div className="sidebar-username">{user?.username}</div>
          <span className={`role-badge role-${user?.role}`}>
            {user?.role === 'admin' ? '🛡️ Admin' : '👤 User'}
          </span>
        </div>
      </div>

      {/* Common */}
      <div className="nav-section-label">OVERVIEW</div>
      <NavLink to="/" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <span className="icon">📊</span> Dashboard
      </NavLink>
      <NavLink to="/predict" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <span className="icon">🔮</span> Predict Delay
      </NavLink>
      <NavLink to="/history" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <span className="icon">📋</span> History
      </NavLink>

      {/* User section */}
      <div className="nav-section-label" style={{ marginTop: 8 }}>MY SHIPMENTS</div>
      <NavLink to="/my-shipments" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <span className="icon">📦</span> My Shipments
      </NavLink>
      <NavLink to="/track" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
        <span className="icon">🔍</span> Track Shipment
      </NavLink>

      {/* Admin only */}
      {isAdmin && (
        <>
          <div className="nav-section-label" style={{ marginTop: 8 }}>ADMIN PANEL</div>
          <NavLink to="/admin/shipments" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <span className="icon">🗃️</span> All Shipments
          </NavLink>
          <NavLink to="/admin/users" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <span className="icon">👥</span> Manage Users
          </NavLink>
          <NavLink to="/admin/carriers" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            <span className="icon">🚚</span> Carrier Performance
          </NavLink>
        </>
      )}

      {/* Logout */}
      <div style={{ marginTop: 'auto', padding: '8px 0' }}>
        <button className="nav-link logout-btn" onClick={handleLogout} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <span className="icon">🚪</span> Logout
        </button>
        <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.8 }}>
          <span className="dot-live" />AI Service Online<br />Prediction Horizon: 48–72h<br />DB: SQLite
        </div>
      </div>
    </nav>
  )
}

// ─── Authenticated Layout ─────────────────────────────────────────────────────
function AppLayout({ children }) {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth()

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login"  element={user ? <Navigate to="/" /> : <Login />} />
      <Route path="/signup" element={user ? <Navigate to="/" /> : <Signup />} />
      <Route path="/track"  element={<TrackShipment />} />

      {/* Protected routes — redirect to login if not authed */}
      <Route path="/" element={
        <ProtectedRoute><AppLayout><Dashboard /></AppLayout></ProtectedRoute>
      } />
      <Route path="/predict" element={
        <ProtectedRoute><AppLayout><PredictForm /></AppLayout></ProtectedRoute>
      } />
      <Route path="/history" element={
        <ProtectedRoute><AppLayout><History /></AppLayout></ProtectedRoute>
      } />
      <Route path="/my-shipments" element={
        <ProtectedRoute><AppLayout><MyShipments /></AppLayout></ProtectedRoute>
      } />

      {/* Admin only routes */}
      <Route path="/admin/users" element={
        <ProtectedRoute role="admin"><AppLayout><ManageUsers /></AppLayout></ProtectedRoute>
      } />
      <Route path="/admin/shipments" element={
        <ProtectedRoute role="admin"><AppLayout><ManageShipments /></AppLayout></ProtectedRoute>
      } />
      <Route path="/admin/carriers" element={
        <ProtectedRoute role="admin"><AppLayout><CarrierPerformance /></AppLayout></ProtectedRoute>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={user ? "/" : "/login"} />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
