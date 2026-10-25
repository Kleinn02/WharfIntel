// src/pages/AuthPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthStyle.css';

const AuthPage = ({ initialMode, onClose }) => {
  const navigate = useNavigate(); 
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  
  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [instructorInviteCode, setInstructorInviteCode] = useState("");
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isInstructorMode, setIsInstructorMode] = useState(false);
  
  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // --- Password Strength Calculator ---
  const getPasswordStrength = (pw) => {
    if (!pw) return { score: 0, label: "Enter a password (8-12 chars)", colorClass: "" };
    
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 10) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw) || /[^A-Za-z0-9]/.test(pw)) score++;

    const cap = Math.min(score, 4);
    const labels = ["Too short", "Weak", "Moderate", "Strong", "Very Strong"];
    const cls = ["", "weak", "medium", "strong", "strong"]; 
    
    return { score: cap, label: labels[cap], colorClass: cls[cap] };
  };

  const strength = getPasswordStrength(password);

  const handleAuth = async (e) => {
    e.preventDefault();
    setMessage(""); 
    
    if (!isLogin && password !== confirmPassword) {
      setIsSuccess(false);
      setMessage("Passwords do not match.");
      return;
    }

    const path = isLogin ? "login" : isInstructorMode ? "register/instructor" : "register";
    const payload = { username, password };
    if (!isLogin && isInstructorMode) payload.invite_code = instructorInviteCode;
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (response.ok) {
        if (isLogin) {
          const requiredRole = isAdminMode ? 'admin' : isInstructorMode ? 'instructor' : null;
          if (requiredRole && data.role !== requiredRole) {
            setIsSuccess(false);
            setMessage(isAdminMode
              ? "ACCESS DENIED: This account does not have admin access."
              : "ACCESS DENIED: This account does not have instructor access.");
            localStorage.removeItem('username');
            localStorage.removeItem('role');
            return;
          }

          setIsSuccess(true);
          setMessage("Login Successful! Redirecting...");
          
          localStorage.setItem('username', data.user || username); // Fallback to state if data.user is missing
          localStorage.setItem('role', data.role); // 🔥 Save role for Admin.jsx to check
          const destination = data.role === 'admin'
            ? '/admin'
            : data.role === 'instructor'
              ? '/lms/instructor'
              : '/dashboard';
          navigate(destination, { replace: true });

          setUsername(""); setPassword(""); setConfirmPassword("");
        } else if (isInstructorMode) {
          const loginResponse = await fetch('http://127.0.0.1:8000/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });
          const loginData = await loginResponse.json();
          if (!loginResponse.ok || loginData.role !== 'instructor') {
            setIsSuccess(false);
            setMessage("Instructor account created, but automatic sign-in failed. Please sign in again.");
            setIsLogin(true);
            return;
          }

          setIsSuccess(true);
          setMessage("Instructor account created. Opening your dashboard...");
          localStorage.setItem('username', loginData.user || username);
          localStorage.setItem('role', loginData.role);
          navigate('/lms/instructor', { replace: true });
          setUsername(""); setPassword(""); setConfirmPassword(""); setInstructorInviteCode("");
        } else {
          setIsSuccess(true);
          setMessage("Account created successfully! You can now log in.");
          setUsername(""); setPassword(""); setConfirmPassword("");
          setTimeout(() => {
            setIsLogin(true);
            setMessage(""); 
          }, 1500);
        }
      } else {
        setIsSuccess(false);
        setMessage(data.detail || "Authentication failed.");
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage("Connection to backend failed.");
    }
  };

  const handleTabSwitch = (toLogin) => {
    setIsLogin(toLogin);
    if (!toLogin) setIsAdminMode(false);
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  };

  const switchAccessMode = (mode) => {
    setIsAdminMode(mode === 'admin');
    setIsInstructorMode(mode === 'instructor');
    setMessage("");
    setPassword("");
  };

  return (
    <div className="card auth-modal-card">
      <button className="exit-btn" onClick={onClose} aria-label="Close">&times;</button>

      <div className="tab-nav">
        <button className={`tab-btn ${isLogin ? 'active' : ''}`} onClick={() => handleTabSwitch(true)}>Login</button>
        <button className={`tab-btn ${!isLogin ? 'active' : ''}`} onClick={() => handleTabSwitch(false)}>Register</button>
      </div>

      <form onSubmit={handleAuth} className="screen active">
        
        {/* 🔥 WharfIntel Logo inserted specifically for Login */}
        {isLogin && (
          <div className="auth-brand-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 4L10 13L3 13L10 4Z" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 6L13 13L19 13L13 6Z" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 15L22 15C22 15 19 18 12 18C5 18 2 15 2 15Z" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 21.5 Q 4.5 19.5 7 21.5 T 12 21.5 T 17 21.5 T 22 21.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Wharf<span>Intel</span>
          </div>
        )}

        {/* --- DYNAMIC TITLE & SUBTITLE --- */}
        <div className="screen-title">
          {isAdminMode
            ? "System Overwatch"
            : isInstructorMode
              ? (isLogin ? "Instructor Portal" : "Create instructor account")
            : (isLogin ? "Welcome back" : "Create account")}
        </div>
        
        <div className="screen-subtitle">
          {isAdminMode
            ? "Provide clearance credentials for Admin access."
            : isInstructorMode
              ? (isLogin ? "Sign in with your instructor credentials." : "Use your instructor invite code to create an account.")
            : (isLogin 
                ? "Secure access for WharfIntel Port Management." 
                : "Passwords are hashed with a unique salt & pepper.")}
        </div>

        <div className="form-group">
          <label>Username</label>
          <div className="input-wrap">
            <input 
              type="text" 
              placeholder={isLogin ? "your_username" : "choose_a_username"} 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              required 
            />
          </div>
        </div>

        <div className="form-group">
          <label>Password</label>
          <div className="input-wrap">
            <input 
              type={showPassword ? "text" : "password"} 
              placeholder={isLogin ? "••••••••" : "8 to 12 characters"} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
              minLength={8}
              maxLength={12}
              required 
            />
            <button type="button" className="eye-btn" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? (
                <svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              ) : (
                <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              )}
            </button>
          </div>
          
          {!isLogin && (
            <>
              <div className="strength-bar">
                <div className={`strength-seg ${strength.score >= 1 ? strength.colorClass : ''}`}></div>
                <div className={`strength-seg ${strength.score >= 2 ? strength.colorClass : ''}`}></div>
                <div className={`strength-seg ${strength.score >= 3 ? strength.colorClass : ''}`}></div>
                <div className={`strength-seg ${strength.score >= 4 ? strength.colorClass : ''}`}></div>
              </div>
              <div className="strength-label">{strength.label}</div>
            </>
          )}
        </div>

        {!isLogin && isInstructorMode && (
          <div className="form-group">
            <label htmlFor="instructor-invite-code">Instructor Invite Code</label>
            <div className="input-wrap">
              <input
                id="instructor-invite-code"
                type="password"
                autoComplete="off"
                placeholder="provided by your administrator"
                value={instructorInviteCode}
                onChange={(e) => setInstructorInviteCode(e.target.value)}
                required
              />
            </div>
          </div>
        )}

        {!isLogin && (
          <div className="form-group">
            <label className="con-firm">Confirm Password</label>
            <div className="input-wrap">
              <input 
                type={showConfirm ? "text" : "password"} 
                placeholder="repeat your password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
                minLength={8}
                maxLength={12}
                required 
              />
              <button type="button" className="eye-btn" onClick={() => setShowConfirm(!showConfirm)}>
                {showConfirm ? (
                  <svg viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                ) : (
                  <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="form-footer" style={{ marginTop: 'auto' }}>
          <button type="submit" className="btn-primary">
            {isLogin ? "Sign In" : "Create Account"}
          </button>

          {isLogin && (
            <div className="auth-access-switch">
              <button
                type="button" 
                className="admin-toggle-btn"
                aria-pressed={isAdminMode}
                onClick={() => switchAccessMode(isAdminMode ? 'commander' : 'admin')}
              >
                {isAdminMode ? "Commander Login" : "Admin Login"}
              </button>
              <button
                type="button"
                className="admin-toggle-btn"
                aria-pressed={isInstructorMode}
                onClick={() => switchAccessMode(isInstructorMode ? 'commander' : 'instructor')}
              >
                {isInstructorMode ? "Commander Login" : "Instructor Login"}
              </button>
            </div>
          )}
          
          {message && (
            <div className={`alert ${isSuccess ? 'alert-success show' : 'alert-error show'}`}>
              <span className="alert-icon">{isSuccess ? '✅' : '⚠️'}</span>
              <span>{message}</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default AuthPage;