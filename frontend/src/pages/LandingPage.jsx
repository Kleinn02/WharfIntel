import React, { useState } from 'react';
import { motion } from 'framer-motion';
import AuthPage from './AuthPage';
import './LandingPage.css';

const LandingPage = () => {
  const [authMode, setAuthMode] = useState(null);

  // Smooth fade-up animation config
  const fadeUp = {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } }
  };

  const staggerContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.15 }
    }
  };

  return (
    <div className="landing-wrapper dark-theme">
      {/* --- NAVIGATION --- */}
      <nav className="wharf-nav fixed">
        <div className="logo">
          {/* The Stylized Sailboat SVG */}
          <svg 
            width="32" height="32" viewBox="0 0 24 24" fill="none" 
            xmlns="http://www.w3.org/2000/svg" className="logo-icon"
          >
            {/* Left Sail */}
            <path d="M10 4L10 13L3 13L10 4Z" stroke="var(--primary-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            
            {/* Right Sail */}
            <path d="M13 6L13 13L19 13L13 6Z" stroke="var(--primary-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            
            {/* Boat Hull */}
            <path d="M2 15L22 15C22 15 19 18 12 18C5 18 2 15 2 15Z" stroke="var(--primary-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            
            {/* Water Waves */}
            <path d="M2 21.5 Q 4.5 19.5 7 21.5 T 12 21.5 T 17 21.5 T 22 21.5" stroke="var(--primary-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Wharf<span>Intel</span>
        </div>
        <div className="nav-links">
          <button className="nav-btn-text" onClick={() => setAuthMode('login')}>Login</button>
          <button className="nav-btn-pill" onClick={() => setAuthMode('register')}>Sign Up</button>
        </div>
      </nav>

      <main className={`main-content ${authMode ? 'blurred' : ''}`}>
        
        {/* --- HERO SECTION --- */}
        <header className="hero">
          <motion.div 
            className="hero-content"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.h1 variants={fadeUp}>Intelligence for&nbsp;the<br/>Modern Wharf.</motion.h1>
            <motion.p variants={fadeUp}>
              Streamline supply chain logistics and asset management with AI-driven predictive insights and real-time operations.
            </motion.p>
            <motion.div className="hero-input-group" variants={fadeUp}>
              <input type="email" placeholder="@John Doe" className="hero-input" />
              <button className="btn-main" onClick={() => setAuthMode('register')}>Get Started</button>
            </motion.div>
          </motion.div>
          
          <div className="hero-visual mockup-container">
             {/* Floating Cards with Glassmorphism */}
             <motion.div 
                className="mockup-card primary-card"
                initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }}
             >
                <div className="card-header">
                  <div>
                    <h2>$4.2M</h2>
                    <span className="card-label">Operational Savings</span>
                  </div>
                </div>
             </motion.div>

             <motion.div 
                className="mockup-card chart-card"
                initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
             >
                {/* A pure CSS glowing line to simulate the chart in your image */}
                <svg viewBox="0 0 200 60" className="neon-chart">
                  <path d="M0 40 L30 30 L60 10 L90 20 L130 50 L160 45 L200 15" fill="none" stroke="var(--primary-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
             </motion.div>

             <motion.div 
                className="mockup-card secondary-card"
                initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.6 }}
             >
                <span className="success-text">↑ 12.4%</span>
             </motion.div>
          </div>
        </header>

        {/* --- TRUST SIGNALS --- */}
        <motion.section 
          className="trust-section"
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
        >
          <div className="trust-logos">
            <span>⛴️ Port of Rotterdam</span>
            <span>⚓ Maersk Analytics</span>
            <span>🌊 SG Maritime</span>
            <span>🚢 LA Terminals</span>
          </div>
        </motion.section>

        {/* --- FEATURE 1: THE BIG VISUAL --- */}
        <section className="feature-showcase">
          <motion.div 
            className="showcase-header"
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          >
            <h2>Experience logistics that scale with your port.</h2>
            <p>Design a navigational operating system that works for your harbor and streamlines cargo flow management.</p>
          </motion.div>

          <motion.div 
            className="big-visual-card"
            initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          >
            <div className="simulated-dashboard">
               <div className="dash-sidebar"></div>
               <div className="dash-main">
                 <div className="dash-widget large"></div>
                 <div className="dash-widget-row">
                   <div className="dash-widget small"></div>
                   <div className="dash-widget small"></div>
                 </div>
               </div>
            </div>
          </motion.div>
        </section>

        {/* --- FEATURE 2: THE 6-GRID --- */}
        <section className="feature-grid-section">
          <h2 className="grid-heading">Everything you need to manage the waterfront.</h2>
          
          <motion.div 
            className="feature-grid"
            variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}
          >
            {[
              { icon: '🗺️', title: 'Live GIS Mapping', desc: 'Interactive spatial visualization of every dock, wharf, and approaching vessel.' },
              { icon: '🤖', title: 'AI Turnaround Forecasting', desc: 'Predicting vessel turnaround times using advanced ARIMA & LSTM models.' },
              { icon: '📊', title: 'Congestion Analytics', desc: 'Identify bottlenecks before they happen with real-time heatmaps.' },
              { icon: '📡', title: 'Live AIS Integration', desc: 'Stream live satellite and terrestrial AIS data directly to your dashboard.' },
              { icon: '☁️', title: 'Weather Routing', desc: 'Integrate live meteorological data to predict safe docking windows.' },
              { icon: '🔒', title: 'Unmatched Security', desc: 'Enterprise-grade encryption for all your sensitive maritime manifests.' }
            ].map((feat, index) => (
              <motion.div className="grid-card" key={index} variants={fadeUp}>
                <div className="icon-wrapper">{feat.icon}</div>
                <h3>{feat.title}</h3>
                <p>{feat.desc}</p>
                <a href="#" className="learn-more">Learn more →</a>
              </motion.div>
            ))}
          </motion.div>
        </section>

      </main>

      {/* --- FOOTER --- */}
      <footer className="wharf-footer">
        <div className="footer-top">
          <div className="footer-brand">
             <div className="logo">Wharf<span>Intel</span></div>
             <p>Supports maritime operations with simple analytics, powerful integrations, and vessel flow management tools.</p>
          </div>
          <div className="footer-links">
            <div className="link-column">
              <h4>Solutions</h4>
              <a href="#">Small Ports</a>
              <a href="#">Mega Terminals</a>
            </div>
            <div className="link-column">
              <h4>Company</h4>
              <a href="#">About Us</a>
              <a href="#">Contact</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} WharfIntel. All Rights Reserved.</p>
        </div>
      </footer>

      {authMode && (
        <div className="modal-overlay">
          <AuthPage initialMode={authMode} onClose={() => setAuthMode(null)} />
        </div>
      )}
    </div>
  );
};

export default LandingPage;