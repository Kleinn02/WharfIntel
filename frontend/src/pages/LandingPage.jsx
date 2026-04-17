import React, { useState } from 'react';
import AuthPage from './AuthPage';
import './LandingPage.css';

const LandingPage = () => {
  const [authMode, setAuthMode] = useState(null); // 'login', 'register', or null

  return (
    <div className="landing-wrapper">
      {/* 1. Fixed Navigation */}
      <nav className="wharf-nav fixed">
        <div className="logo">WHARF<span>INTEL</span></div>
        <div className="nav-links">
          <button className="nav-btn-text" onClick={() => setAuthMode('login')}>Login</button>
          {/* Notice the change to nav-btn-pill here! */}
          <button className="nav-btn-pill" onClick={() => setAuthMode('register')}>Register</button>
        </div>
      </nav>

      {/* 2. Main Content (Blurred when Auth is open) */}
      <main className={`main-content ${authMode ? 'blurred' : ''}`}>
        <header className="hero">
          <div className="hero-content">
            <h1 className="glitch-text">Streamlining Global <span>Maritime</span> Logistics</h1>
            <p>Advanced GIS and Time-Series Analysis for real-time port optimization.</p>
            <div className="hero-btns">
              <button className="btn-main" onClick={() => setAuthMode('register')}>Deploy System</button>
            </div>
          </div>
          <div className="hero-visual">
          {/* You can put a ship SVG or an abstract grid here */}
          <div className="grid-overlay"></div>
        </div>
        </header>
        {/* Feature Section */}
        <section id="features" className="features">
            <div className="feature-card">
            <h3>GIS Mapping</h3>
            <p>Interactive spatial visualization of every dock and wharf.</p>
            </div>
            <div className="feature-card">
            <h3>AI Forecasting</h3>
            <p>Predicting turnaround times using ARIMA & LSTM models.</p>
            </div>
        </section>
      </main>

      {/* 3. Authentication Modal Overlay */}
      {authMode && (
        <div className="modal-overlay">
          <AuthPage 
            initialMode={authMode} 
            onClose={() => setAuthMode(null)} 
          />
        </div>
      )}
    </div>
  );
};

export default LandingPage;