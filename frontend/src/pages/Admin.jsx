import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import './AuthStyle.css'; // Reusing your Auth styles for the modal!

const Admin = () => {
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  
  // Form State
  const [editId, setEditId] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); // Only used for create
  const [money, setMoney] = useState(200000);
  const [reputation, setReputation] = useState(50);
  const [message, setMessage] = useState('');

  // 1. READ: Fetch all users on mount
  const fetchUsers = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/admin/users');
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error("Failed to fetch commanders");
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleLogout = () => {
    localStorage.removeItem('username'); // Or admin token if you use one
    navigate('/');
  };

  // Open modal for Creating
  const openCreateModal = () => {
    setModalMode('create');
    setUsername('');
    setPassword('');
    setMoney(200000);
    setReputation(50);
    setMessage('');
    setIsModalOpen(true);
  };

  // Open modal for Editing
  const openEditModal = (user) => {
    setModalMode('edit');
    setEditId(user.id);
    setUsername(user.username);
    setMoney(user.money);
    setReputation(user.reputation);
    setMessage('');
    setIsModalOpen(true);
  };

  // 2 & 3. CREATE / UPDATE Logic
  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');
    
    try {
      if (modalMode === 'create') {
        const res = await fetch('http://127.0.0.1:8000/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, money: parseFloat(money), reputation: parseInt(reputation) })
        });
        if (!res.ok) throw new Error("Failed to provision");
      } else {
        const res = await fetch(`http://127.0.0.1:8000/api/admin/users/${editId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ money: parseFloat(money), reputation: parseInt(reputation) })
        });
        if (!res.ok) throw new Error("Failed to update");
      }
      
      setIsModalOpen(false);
      fetchUsers(); // Refresh the table
    } catch (err) {
      setMessage(err.message);
    }
  };

  // 4. DELETE Logic
  const handleDelete = async (id, name) => {
    if (!window.confirm(`WARNING: Are you sure you want to completely purge Commander ${name}?`)) return;
    
    try {
      await fetch(`http://127.0.0.1:8000/api/admin/users/${id}`, { method: 'DELETE' });
      fetchUsers(); // Refresh the table
    } catch (err) {
      alert("Failed to delete user.");
    }
  };

  return (
    <div className="dashboard-wrapper dark-mode" style={{ backgroundColor: '#050505' }}>
      
      {/* Admin Sidebar */}
      <aside className="sidebar expanded" style={{ borderRightColor: '#1e2330' }}>
        <div className="sidebar-header">
          <div className="brand-text">
            <h2>Wharf<span style={{ color: '#f59e0b' }}>Admin</span></h2>
            <p style={{ letterSpacing: '2px' }}>SYSTEM OVERWATCH</p>
          </div>
        </div>
        <div className="sidebar-content">
          <nav className="side-nav">
            <button className="active" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', borderLeft: '3px solid #f59e0b' }}>
               Personnel (CRUD)
            </button>
            <button>Active Voyages</button>
            <button>System Logs</button>
          </nav>
          <div className="nav-group bottom-group">
            <button className="logout-btn" onClick={handleLogout} style={{ color: '#ef4444' }}>
               Disconnect System
            </button>
          </div>
        </div>
      </aside>

      {/* Main Admin Content */}
      <main className="map-view" style={{ padding: '32px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h2 style={{ color: '#fff', margin: '0 0 8px 0', fontSize: '24px' }}>Commander Database</h2>
            <span style={{ color: '#94a3b8', fontSize: '13px' }}>Manage all persistent user data and economy balances.</span>
          </div>
          <button 
            onClick={openCreateModal}
            style={{ backgroundColor: '#f59e0b', color: '#000', padding: '12px 20px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: '0.2s', boxShadow: '0 4px 14px rgba(245, 158, 11, 0.3)' }}
          >
            + Provision New Commander
          </button>
        </div>

        {/* The CRUD Table */}
        <div style={{ backgroundColor: '#0b0f19', borderRadius: '12px', border: '1px solid #1e2330', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#e8eaf0' }}>
            <thead style={{ backgroundColor: '#11141b', fontSize: '11px', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '1px' }}>
              <tr>
                <th style={{ padding: '20px 24px', borderBottom: '1px solid #1e2330' }}>ID</th>
                <th style={{ padding: '20px 24px', borderBottom: '1px solid #1e2330' }}>Username</th>
                <th style={{ padding: '20px 24px', borderBottom: '1px solid #1e2330' }}>Credits</th>
                <th style={{ padding: '20px 24px', borderBottom: '1px solid #1e2330' }}>Reputation</th>
                <th style={{ padding: '20px 24px', borderBottom: '1px solid #1e2330', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id} style={{ transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: '16px 24px', fontFamily: 'monospace', color: '#94a3b8', borderBottom: '1px solid #1e2330' }}>#{user.id}</td>
                  <td style={{ padding: '16px 24px', fontWeight: 'bold', borderBottom: '1px solid #1e2330' }}>{user.username}</td>
                  <td style={{ padding: '16px 24px', color: '#10b981', fontFamily: 'monospace', borderBottom: '1px solid #1e2330' }}>${user.money.toLocaleString()}</td>
                  <td style={{ padding: '16px 24px', borderBottom: '1px solid #1e2330' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '60px', height: '6px', background: '#1e2330', borderRadius: '3px', overflow: 'hidden' }}>
                        <div style={{ width: `${user.reputation}%`, height: '100%', background: user.reputation > 40 ? '#f59e0b' : '#ef4444' }}></div>
                      </div>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{user.reputation}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', borderBottom: '1px solid #1e2330', textAlign: 'right' }}>
                    <button onClick={() => openEditModal(user)} style={{ background: 'rgba(130, 160, 255, 0.1)', border: '1px solid rgba(130, 160, 255, 0.3)', color: '#82a0ff', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', marginRight: '8px' }}>Edit</button>
                    <button onClick={() => handleDelete(user.id, user.username)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}>Purge</button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#6b7280' }}>No commanders found in database.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* --- CREATE / EDIT MODAL --- */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="card auth-modal-card" onClick={e => e.stopPropagation()} style={{ minHeight: 'auto', paddingBottom: '30px' }}>
            <button className="exit-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            
            <div className="screen-title" style={{ color: '#f59e0b', marginBottom: '24px' }}>
              {modalMode === 'create' ? 'Provision Commander' : 'Modify Parameters'}
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div className="form-group" style={{ margin: 0 }}>
                <label>Username</label>
                <div className="input-wrap">
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} disabled={modalMode === 'edit'} style={{ opacity: modalMode === 'edit' ? 0.5 : 1 }} required />
                </div>
              </div>

              {modalMode === 'create' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Initial Password</label>
                  <div className="input-wrap">
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Credits ($)</label>
                  <div className="input-wrap">
                    <input type="number" value={money} onChange={e => setMoney(e.target.value)} min="0" step="0.01" required />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Reputation (0-100)</label>
                  <div className="input-wrap">
                    <input type="number" value={reputation} onChange={e => setReputation(e.target.value)} min="0" max="100" required />
                  </div>
                </div>
              </div>

              <button type="submit" className="btn-primary" style={{ backgroundColor: '#f59e0b', color: '#000', marginTop: '10px' }}>
                {modalMode === 'create' ? 'Execute Provision' : 'Commit Changes'}
              </button>

              {message && <div style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center' }}>{message}</div>}
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export default Admin;