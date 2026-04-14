// src/pages/AuthPage.jsx
import React, { useState } from 'react';
import './AuthStyle.css'; // Make sure this file exists in the same folder!

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const handleAuth = async (e) => {
    e.preventDefault();
    const path = isLogin ? "login" : "register";
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      
      const data = await response.json();
      if (response.ok) {
        setMessage(`✅ ${data.message}`);
      } else {
        setMessage(`⚠️ ${data.detail}`);
      }
    } catch (err) {
      setMessage("⚠️ Connection to backend failed.");
    }
  };

  return (
    <div id="app">
      <div className="card">
        <div className="tab-nav">
          <button className={`tab-btn ${isLogin ? 'active' : ''}`} onClick={() => setIsLogin(true)}>Login</button>
          <button className={`tab-btn ${!isLogin ? 'active' : ''}`} onClick={() => setIsLogin(false)}>Register</button>
        </div>

        <form onSubmit={handleAuth} className="screen active">
          <div className="screen-title">{isLogin ? "Welcome back" : "Create account"}</div>
          <div className="screen-subtitle">Secure access for WharfIntel Port Management.</div>

          <div className="form-group">
            <label>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>

          <div className="form-group">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>

          <button type="submit" className="btn-primary">
            {isLogin ? "Sign In" : "Create Account"}
          </button>
          
          {message && <div className="strength-label" style={{marginTop: '10px'}}>{message}</div>}
        </form>
      </div>
    </div>
  );
};

export default AuthPage;