// src/pages/AuthPage.jsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // <-- Add this
import './AuthStyle.css';

const AuthPage = ({ initialMode, onClose }) => {
  const navigate = useNavigate(); // <-- Initialize hook
  const [isLogin, setIsLogin] = useState(initialMode === 'login');
  
  // Form State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  // UI State
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);

  // --- NEW: Password Strength Calculator ---
  const getPasswordStrength = (pw) => {
    if (!pw) return { score: 0, label: "Enter a password", colorClass: "" };
    
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    const cap = Math.min(score, 4);
    const labels = ["Enter a password", "Weak", "Moderate", "Strong", "Very Strong"];
    const cls = ["", "weak", "medium", "strong", "strong"]; // Maps score to CSS class
    
    return { score: cap, label: labels[cap], colorClass: cls[cap] };
  };

  const strength = getPasswordStrength(password);
  // -----------------------------------------

  const handleAuth = async (e) => {
    e.preventDefault();
    setMessage(""); 
    
    if (!isLogin && password !== confirmPassword) {
      setIsSuccess(false);
      setMessage("Passwords do not match.");
      return;
    }

    const path = isLogin ? "login" : "register";
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      if (response.ok) {
        setIsSuccess(true);
        setMessage(isLogin ? "Login Successful! Redirecting..." : "Account created successfully! You can now log in.");
        
        if (isLogin) {
          // Give them a half-second to actually see the success message
          setTimeout(() => {
            navigate('/dashboard'); 
          }, 600);
        } else {
          setUsername("");
          setPassword("");
          setConfirmPassword("");
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
    setMessage("");
    setPassword("");
    setConfirmPassword("");
  };

  return (
    <div className="card auth-modal-card">
      <button className="exit-btn" onClick={onClose} aria-label="Close">&times;</button>

      <div className="tab-nav">
        <button className={`tab-btn ${isLogin ? 'active' : ''}`} onClick={() => handleTabSwitch(true)}>Login</button>
        <button className={`tab-btn ${!isLogin ? 'active' : ''}`} onClick={() => handleTabSwitch(false)}>Register</button>
      </div>

      <form onSubmit={handleAuth} className="screen active">
        <div className="screen-title">{isLogin ? "Welcome back" : "Create account"}</div>
        <div className="screen-subtitle">
          {isLogin 
            ? "Secure access for WharfIntel Port Management." 
            : "Passwords are hashed with a unique salt & pepper."}
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
              placeholder={isLogin ? "••••••••" : "min. 8 characters"} 
              value={password} 
              onChange={(e) => setPassword(e.target.value)} 
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
          
          {/* --- NEW: Dynamic Strength Meter UI --- */}
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
          {/* -------------------------------------- */}
        </div>

        {!isLogin && (
          <div className="form-group">
            <label class="con-firm">Confirm Password</label>
            <div className="input-wrap">
              <input 
                type={showConfirm ? "text" : "password"} 
                placeholder="repeat your password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)} 
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

        <button type="submit" className="btn-primary">
          {isLogin ? "Sign In" : "Create Account"}
        </button>
        
        {message && (
          <div className={`alert ${isSuccess ? 'alert-success show' : 'alert-error show'}`}>
            <span className="alert-icon">{isSuccess ? '✅' : '⚠️'}</span>
            <span>{message}</span>
          </div>
        )}
      </form>
    </div>
  );
};

export default AuthPage;