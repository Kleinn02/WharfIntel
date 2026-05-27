import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthStyle.css'; 
import './Dashboard.css'; 

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
      <svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
    ) : (
      <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    )
  );

  const handlePasswordUpdate = async (e) => {
    e.preventDefault();
    setMessage("");

    // Frontend Validation
    if (newPassword.length < 8) {
      setIsSuccess(false);
      setMessage("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setIsSuccess(false);
      setMessage("New passwords do not match.");
      return;
    }

    // Backend Request
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/user/${username}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          current_password: currentPassword, 
          new_password: newPassword 
        }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        setIsSuccess(true);
        setMessage("Security credentials updated.");
        // Clear forms on success
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setIsSuccess(false);
        setMessage(data.detail || "Failed to update password.");
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage("Connection to Command Center failed.");
    }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    setMessage("");

    if (!deletePassword) {
      setIsSuccess(false);
      setMessage("Password is required to decommission account.");
      return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/user/${username}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        // Clear local storage and boot them to the login screen
        localStorage.removeItem('username');
        onClose(); 
        navigate('/'); 
      } else {
        setIsSuccess(false);
        setMessage(data.detail || "Authentication failed. Deletion aborted.");
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage("Connection to Command Center failed.");
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card auth-modal-card profile-modal-card" onClick={e => e.stopPropagation()}>
        <button className="exit-btn" onClick={onClose}>&times;</button>

        {/* --- DOSSIER HEADER --- */}
        <div className="dossier-header">
          <div className="commander-avatar-large">
            {username ? username.charAt(0).toUpperCase() : 'G'}
          </div>
          <div className="dossier-titles">
            <h3 className="screen-title">Commander Dossier</h3>
            <span className="badge docked clearance-badge">Clearance Active</span>
          </div>
        </div>

        {/* --- TABS --- */}
        <div className="tab-nav">
          <button className={`tab-btn ${activeTab === 'security' ? 'active' : ''}`} onClick={() => {setActiveTab('security'); setMessage("");}}>
            Security Parameters
          </button>
          <button className={`tab-btn ${activeTab === 'danger' ? 'active danger-tab' : ''}`} onClick={() => {setActiveTab('danger'); setMessage("");}}>
            Danger Zone
          </button>
        </div>

        {/* --- SECURITY TAB --- */}
        <form onSubmit={handlePasswordUpdate} className={`screen ${activeTab === 'security' ? 'active' : ''}`}>
          <div className="form-group">
            <label>Commander ID (Username)</label>
            <div className="input-wrap">
              <input type="text" value={username || 'Unknown'} readOnly className="readonly-input" />
            </div>
          </div>
          
          <div className="form-group">
            <label>Current Password</label>
            <div className="input-wrap">
              <input type={showCurrent ? "text" : "password"} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
              <button type="button" className="eye-btn" onClick={() => setShowCurrent(!showCurrent)}><EyeIcon show={showCurrent} /></button>
            </div>
          </div>

          <div className="form-group">
            <label>New Password</label>
            <div className="input-wrap">
              <input type={showNew ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={8} placeholder="8 to 12 characters" required />
              <button type="button" className="eye-btn" onClick={() => setShowNew(!showNew)}><EyeIcon show={showNew} /></button>
            </div>
          </div>

          <div className="form-group">
            <label>Confirm New Password</label>
            <div className="input-wrap">
              <input type={showConfirm ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={8} placeholder="repeat your password" required />
              <button type="button" className="eye-btn" onClick={() => setShowConfirm(!showConfirm)}><EyeIcon show={showConfirm} /></button>
            </div>
          </div>

          <div className="form-footer" style={{ marginTop: 'auto' }}>
            <button type="submit" className="btn-primary">Update Security Credentials</button>
            {message && activeTab === 'security' && (
              <div className={`alert ${isSuccess ? 'alert-success show' : 'alert-error show'}`}>
                <span className="alert-icon">{isSuccess ? '✅' : '⚠️'}</span>
                <span>{message}</span>
              </div>
            )}
          </div>
        </form>

        {/* --- DANGER ZONE TAB --- */}
        <form onSubmit={handleDeleteAccount} className={`screen ${activeTab === 'danger' ? 'active' : ''}`}>
          <div className="danger-warning">
            <h4>Decommission Commander</h4>
            <p>This action is irreversible. All persistent credits, reputation, and voyage logs will be permanently deleted.</p>
          </div>
          
          <div className="form-group">
            <label style={{ color: '#ff4f6a' }}>Enter Password to Confirm</label>
            <div className="input-wrap">
              <input 
                type={showDeletePassword ? "text" : "password"} 
                value={deletePassword} 
                onChange={(e) => setDeletePassword(e.target.value)} 
                placeholder="Verify identity" 
                required 
              />
              <button type="button" className="eye-btn" onClick={() => setShowDeletePassword(!showDeletePassword)}>
                <EyeIcon show={showDeletePassword} />
              </button>
            </div>
          </div>

          <div className="form-footer" style={{ marginTop: 'auto' }}>
            <button type="submit" className="btn-primary btn-danger">PERMANENTLY DELETE ACCOUNT</button>
            {message && activeTab === 'danger' && (
              <div className={`alert alert-error show`}>
                <span className="alert-icon">⚠️</span><span>{message}</span>
              </div>
            )}
          </div>
        </form>

      </div>
    </div>
  );
};

export default Profile;