import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Profile.css'; 

const API_BASE = 'http://localhost:8000/api';

const Profile = ({ onClose, username }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('security');
  
  // Security Form State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Danger Zone State
  const [deletePassword, setDeletePassword] = useState('');

  // Visibility Toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDeletePassword, setShowDeletePassword] = useState(false);

  // Status Messaging
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  const EyeIcon = ({ show }) => (
    show ? (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
    ) : (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
    )
  );

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    setMessage("");
    
    if (newPassword !== confirmPassword) {
      setIsSuccess(false);
      setMessage("ERROR: New passwords do not match.");
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/user/${username}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      const data = await response.json();
      
      if (response.ok) {
        setIsSuccess(true);
        setMessage("SECURITY CLEARANCE UPDATED SUCCESSFULLY.");
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setIsSuccess(false);
        setMessage(`ERROR: ${data.detail}`);
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage("ERROR: Server connection failed.");
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setMessage("");

    try {
      const response = await fetch(`${API_BASE}/user/${username}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.removeItem('username');
        localStorage.removeItem('token');
        onClose();
        navigate('/'); // Redirect to landing page or login
      } else {
        setIsSuccess(false);
        setMessage(`ERROR: ${data.detail}`);
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage("ERROR: Server connection failed.");
    }
  };

  return (
    <div className="dossier-overlay" onClick={onClose}>
      <div className="dossier-modal" onClick={e => e.stopPropagation()}>
        
        <button className="dossier-close" onClick={onClose}>✕</button>

        {/* DOSSIER HEADER */}
        <div className="dossier-header-section">
          <div className="dossier-avatar">{username ? username.charAt(0).toUpperCase() : '?'}</div>
          <div className="dossier-identity">
            <h2>Commander Dossier</h2>
            <span className="clearance-tag">CLEARANCE ACTIVE</span>
          </div>
        </div>

        {/* TACTICAL TABS */}
        <div className="dossier-tabs">
          <button 
            className={`dossier-tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => { setActiveTab('security'); setMessage(""); }}
          >
            Security Parameters
          </button>
          <button 
            className={`dossier-tab danger ${activeTab === 'danger' ? 'active' : ''}`}
            onClick={() => { setActiveTab('danger'); setMessage(""); }}
          >
            Danger Zone
          </button>
        </div>

        {/* TAB CONTENT: SECURITY */}
        {activeTab === 'security' && (
          <form className="dossier-content fade-in" onSubmit={handleUpdatePassword}>
            <div className="tactical-input-group readonly">
              <label>COMMANDER ID (USERNAME)</label>
              <input type="text" value={username || ''} readOnly />
            </div>

            <div className="tactical-input-group">
              <label>CURRENT PASSWORD</label>
              <div className="input-with-icon">
                <input 
                  type={showCurrent ? "text" : "password"} 
                  value={currentPassword} onChange={e => setCurrentPassword(e.target.value)}
                  placeholder="••••••••" required 
                />
                <span className="eye-icon" onClick={() => setShowCurrent(!showCurrent)}>
                  <EyeIcon show={showCurrent} />
                </span>
              </div>
            </div>

            <div className="tactical-input-group">
              <label>NEW PASSWORD</label>
              <div className="input-with-icon">
                <input 
                  type={showNew ? "text" : "password"} 
                  value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="8 to 12 characters" required 
                />
                <span className="eye-icon" onClick={() => setShowNew(!showNew)}>
                  <EyeIcon show={showNew} />
                </span>
              </div>
            </div>

            <div className="tactical-input-group">
              <label>CONFIRM NEW PASSWORD</label>
              <div className="input-with-icon">
                <input 
                  type={showConfirm ? "text" : "password"} 
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="repeat your password" required 
                />
                <span className="eye-icon" onClick={() => setShowConfirm(!showConfirm)}>
                  <EyeIcon show={showConfirm} />
                </span>
              </div>
            </div>

            <button type="submit" className="dossier-submit-btn">Update Security Credentials</button>
            
            {message && (
              <div className={`dossier-status-msg ${isSuccess ? 'success' : 'error'}`}>
                {message}
              </div>
            )}
          </form>
        )}

        {/* TAB CONTENT: DANGER ZONE */}
        {activeTab === 'danger' && (
          <form className="dossier-content fade-in danger-zone-content" onSubmit={handleDeleteAccount}>
            <h3 className="danger-title">Decommission Commander</h3>
            <p className="danger-warning-text">
              This action is irreversible. All persistent credits, reputation, and voyage logs will be permanently deleted.
            </p>

            <div className="tactical-input-group danger-input">
              <label>ENTER PASSWORD TO CONFIRM</label>
              <div className="input-with-icon">
                <input 
                  type={showDeletePassword ? "text" : "password"} 
                  value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
                  placeholder="Verify identity" required 
                />
                <span className="eye-icon" onClick={() => setShowDeletePassword(!showDeletePassword)}>
                  <EyeIcon show={showDeletePassword} />
                </span>
              </div>
            </div>

            <button type="submit" className="dossier-nuke-btn">PERMANENTLY DELETE ACCOUNT</button>

            {message && (
              <div className="dossier-status-msg error">
                {message}
              </div>
            )}
          </form>
        )}

      </div>
    </div>
  );
};

export default Profile;