import React, { useEffect, useState } from 'react'
import { adminGetUsers, adminDeleteUser } from '../api/shipmentApi'

export default function ManageUsers() {
  const [users,   setUsers]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    try {
      const res = await adminGetUsers()
      setUsers(res.data)
    } catch { setError('Failed to load users.') }
    finally  { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this user? Their shipments will remain.')) return
    setDeleting(id)
    try { await adminDeleteUser(id); setUsers(u => u.filter(x => x.id !== id)) }
    catch { alert('Failed to delete user.') }
    finally { setDeleting(null) }
  }

  return (
    <div>
      <div className="page-title">👥 Manage Users</div>
      <div className="page-subtitle">View and manage all registered users</div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">All Users</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{users.length} total</div>
        </div>

        {loading && <div className="loading-center"><span className="spinner" style={{ margin: '0 auto' }} /></div>}
        {error   && <div className="error-msg">{error}</div>}

        {!loading && !error && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Username</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ color: 'var(--text-muted)' }}>{u.id}</td>
                    <td><b>{u.username}</b></td>
                    <td style={{ color: 'var(--text-muted)' }}>{u.email}</td>
                    <td>
                      <span className={`role-badge role-${u.role}`}>
                        {u.role === 'admin' ? '🛡️ Admin' : '👤 User'}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {u.created_at?.slice(0, 10)}
                    </td>
                    <td>
                      <button
                        className="btn-danger-sm"
                        onClick={() => handleDelete(u.id)}
                        disabled={deleting === u.id}
                      >
                        {deleting === u.id ? '…' : '🗑️ Delete'}
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
