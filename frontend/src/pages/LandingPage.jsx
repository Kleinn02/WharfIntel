import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Compass, 
  Route, 
  Layers, 
  Cpu, 
  Clock, 
  GraduationCap,
  Anchor,
  Ship,
  Building2,
  ShieldCheck,
  ArrowRight,
  ArrowUp,
  Activity,
  AlertCircle,
  Navigation
} from 'lucide-react';
import AuthPage from './AuthPage';
import './LandingPage.css';

const LandingPage = () => {
  const [authMode, setAuthMode] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowBackToTop(true);
      } else {
        setShowBackToTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

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

  const features = [
    {
      icon: Compass,
      title: 'Hybrid 2D/3D Web-GIS',
      desc: 'Real-time multi-modal vessel and terrestrial truck tracking at 60 FPS using Leaflet and a lightweight 3D helm view.'
    },
    {
      icon: Route,
      title: 'Heuristic A* Pathfinding',
      desc: 'Coastal waypoint graph traversal computing landmass-safe and hazard-aware routes around dynamic weather polygons.'
    },
    {
      icon: Layers,
      title: 'DBSCAN Congestion Clustering',
      desc: 'Unsupervised density-based spatial clustering that fuses Beaufort wind and wave telemetry to flag port bottlenecks.'
    },
    {
      icon: Cpu,
      title: 'Multi-Brain Random Forest',
      desc: 'Segmented ensemble ML regressors benchmarking non-linear ETAs across global, medium, and low-density port hubs.'
    },
    {
      icon: Clock,
      title: 'Binary Min-Heap Scheduling',
      desc: 'Python heapq priority queue dynamically ordering gate and berth discharge by cargo perishability and demurrage risk.'
    },
    {
      icon: GraduationCap,
      title: 'Integrated Maritime LMS',
      desc: 'Role-based instructor sandbox for scenario orchestration, maritime courseware uploads, and automated competency exams.'
    }
  ];

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

        {/* Centered Navigation Anchor Links */}
        <div className="nav-anchor-links">
          <a href="#hero" className="nav-anchor-item">Overview</a>
          <a href="#simulation" className="nav-anchor-item">Simulation</a>
          <a href="#features" className="nav-anchor-item">Pipelines</a>
          <a href="#research" className="nav-anchor-item">Research</a>
        </div>

        <div className="nav-links">
          <button className="nav-btn-text" onClick={() => setAuthMode('login')}>Login</button>
          <button className="nav-btn-pill" onClick={() => setAuthMode('register')}>Sign Up</button>
        </div>
      </nav>

      <main className={`main-content ${authMode ? 'blurred' : ''}`}>
        
        {/* --- HERO SECTION --- */}
        <header id="hero" className="hero">
          <motion.div 
            className="hero-content"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
          >
            <motion.h1 variants={fadeUp}>Intelligence for&nbsp;the<br/>Modern Wharf.</motion.h1>
            <motion.p variants={fadeUp}>
              A web-native geo-spatial simulation and predictive analytics environment for small-scale maritime supply chains—integrating DBSCAN spatial clustering, heuristic A* navigation, and Multi-Brain ETA forecasting across regional shipping corridors.
            </motion.p>
            <motion.div className="hero-input-group" variants={fadeUp}>
              <button className="btn-main" onClick={() => setAuthMode('register')}>Launch Simulation</button>
            </motion.div>
          </motion.div>
          
          {/* --- STRATEGIC 2D GIS CORRIDOR TERMINAL --- */}
          <div className="hero-visual">
            <motion.div 
              className="gis-terminal-card"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            >
              {/* Terminal Top Header Bar */}
              <div className="gis-terminal-header">
                <div className="gis-header-left">
                  <span className="gis-status-chip active-chip">
                    <span className="live-pulse-dot"></span>
                    LIVE BIMP-EAGA NAVMESH
                  </span>
                  <span className="gis-status-chip">60 FPS ENGINE</span>
                </div>
                <div className="gis-header-coords">
                  DVO 7.10° N, 125.64° E
                </div>
              </div>

              {/* Vector Corridor Map Viewport */}
              <div className="gis-map-viewport">
                
                {/* Top-Left Telemetry Badge */}
                <motion.div 
                  className="telemetry-badge badge-top-left"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.5 }}
                >
                  <div className="telemetry-badge-title">
                    <Activity size={14} className="telemetry-icon-emerald" />
                    <span>AVOCADO REEFER (TRK-82)</span>
                  </div>
                  <div className="telemetry-badge-row">
                    <span>TEMP: <strong className="text-emerald">-4.3°C [ACTIVE]</strong></span>
                  </div>
                  <div className="telemetry-badge-row">
                    <AlertCircle size={12} className="telemetry-icon-accent" />
                    <span>VGM: <strong>4,500 KG</strong></span>
                  </div>
                </motion.div>

                {/* SVG Sea Corridor & Navmesh Canvas */}
                <svg 
                  viewBox="0 0 600 380" 
                  className="gis-corridor-svg"
                  preserveAspectRatio="xMidYMid slice"
                >
                  {/* Subtle Lat/Long Graticule Reference Lines */}
                  <g className="gis-graticules">
                    <line x1="0" y1="95" x2="600" y2="95" />
                    <line x1="0" y1="190" x2="600" y2="190" />
                    <line x1="0" y1="285" x2="600" y2="285" />
                    <line x1="150" y1="0" x2="150" y2="380" />
                    <line x1="300" y1="0" x2="300" y2="380" />
                    <line x1="450" y1="0" x2="450" y2="380" />
                  </g>

                  {/* Stylized Regional Landmass Polygons (SE Asia / BIMP-EAGA) */}
                  <g className="gis-landmasses">
                    {/* Malay Peninsula / Singapore Tip */}
                    <path d="M 20,70 L 85,95 L 105,145 L 88,165 L 40,145 L 15,100 Z" />
                    {/* Borneo / Kalimantan Mass */}
                    <path d="M 195,120 L 295,105 L 330,155 L 310,235 L 235,250 L 185,200 Z" />
                    {/* Mindanao / Davao Gulf Sector */}
                    <path d="M 455,35 L 545,30 L 570,95 L 520,130 L 495,95 L 470,120 L 445,80 Z" />
                    {/* Sulawesi / Celebes Sector */}
                    <path d="M 380,215 L 455,195 L 480,240 L 440,315 L 385,295 L 365,255 Z" />
                  </g>

                  {/* Background Secondary Mesh Edges */}
                  <g className="gis-mesh-edges">
                    <line x1="485" y1="92" x2="355" y2="115" />
                    <line x1="355" y1="115" x2="195" y2="120" />
                    <line x1="320" y1="225" x2="380" y2="215" />
                    <line x1="215" y1="285" x2="105" y2="250" />
                  </g>

                  {/* Beaufort Scale Weather Hazard Polygon (Sulu / Celebes Corridor) */}
                  <g className="gis-hazard-group">
                    <polygon 
                      points="315,75 415,65 435,140 355,165 300,125" 
                      className="hazard-polygon"
                    />
                    <text x="368" y="112" className="hazard-label-title">BEAUFORT FORCE 8</text>
                    <text x="368" y="126" className="hazard-label-sub">SULU-CELEBES HAZARD ZONE</text>
                  </g>

                  {/* Baseline Faint Route Guide */}
                  <path 
                    d="M 485 92 L 445 175 L 320 225 L 215 285 L 92 162" 
                    className="astar-route-base"
                  />

                  {/* Dynamic A* Trajectory Path (Animated Dash Offset) */}
                  <motion.path 
                    d="M 485 92 L 445 175 L 320 225 L 215 285 L 92 162"
                    className="astar-route-active"
                    strokeDasharray="10 8"
                    animate={{ strokeDashoffset: [180, 0] }}
                    transition={{ duration: 4.5, repeat: Infinity, ease: "linear" }}
                  />

                  {/* Corridor Sea Labels */}
                  <text x="495" y="162" className="sea-corridor-label">DAVAO GULF</text>
                  <text x="415" y="192" className="sea-corridor-label">CELEBES SEA</text>
                  <text x="330" y="252" className="sea-corridor-label">MAKASSAR STRAIT</text>

                  {/* Waypoint Node 3: Singapore Hub */}
                  <g className="waypoint-group" transform="translate(92, 162)">
                    <circle r="7" className="waypoint-outer-ring" />
                    <circle r="3.5" className="waypoint-core" />
                    <text x="-12" y="20" className="waypoint-label">SINGAPORE (SGSIN)</text>
                  </g>

                  {/* Waypoint Node 2: Balikpapan Hub */}
                  <g className="waypoint-group" transform="translate(320, 225)">
                    <circle r="7" className="waypoint-outer-ring" />
                    <circle r="3.5" className="waypoint-core" />
                    <text x="-45" y="-12" className="waypoint-label">BALIKPAPAN (IDBPN)</text>
                  </g>

                  {/* Waypoint Node 1: Active Vessel Origin at Davao / Panabo (DICT) with Radar Pulse */}
                  <g className="waypoint-group" transform="translate(485, 92)">
                    <motion.circle 
                      r="10"
                      className="radar-beacon-pulse"
                      initial={{ scale: 1, opacity: 0.85 }}
                      animate={{ scale: 2.2, opacity: 0 }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                    />
                    <circle r="8" className="waypoint-outer-ring active-node-ring" />
                    <circle r="4.5" className="waypoint-core active-node-core" />
                    <text x="-95" y="-14" className="waypoint-label active-waypoint-label">
                      PANABO / DICT (PHDVO)
                    </text>
                  </g>
                </svg>

                {/* Bottom-Right Telemetry Badge */}
                <motion.div 
                  className="telemetry-badge badge-bottom-right"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, delay: 0.7 }}
                >
                  <div className="telemetry-badge-title">
                    <Navigation size={14} className="telemetry-icon-accent" />
                    <span>A* ROUTE HEURISTIC</span>
                  </div>
                  <div className="telemetry-badge-row">
                    <span>ETA ACCURACY: <strong className="text-accent">94.8%</strong></span>
                  </div>
                  <div className="telemetry-badge-row">
                    <Clock size={12} className="telemetry-icon-emerald" />
                    <span>MIN-HEAP: <strong>PRIORITY 1</strong></span>
                  </div>
                </motion.div>

              </div>
            </motion.div>
          </div>
        </header>

        {/* --- TRUST SIGNALS / INSTITUTIONAL ALIGNMENT --- */}
        <motion.section 
          className="trust-section"
          initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
        >
          <div className="trust-logos">
            <span className="trust-item">
              <Building2 size={20} className="trust-icon" />
              DNSC Institute of Computing
            </span>
            <span className="trust-item">
              <Anchor size={20} className="trust-icon" />
              Davao International Container Terminal (DICT)
            </span>
            <span className="trust-item">
              <Ship size={20} className="trust-icon" />
              BIMP-EAGA Shipping Corridors
            </span>
            <span className="trust-item">
              <ShieldCheck size={20} className="trust-icon" />
              DOST-HNRDA Logistics Subsector
            </span>
          </div>
        </motion.section>

        {/* --- FEATURE 1: THE BIG VISUAL (VIDEO SHOWCASE) --- */}
        <section id="simulation" className="feature-showcase">
          <motion.div 
            className="showcase-header"
            initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp}
          >
            <h2>Empirical simulation engineered for regional maritime logistics.</h2>
            <p>Replacing static paper ledgers and manual queues with a real-time 2D Web-GIS and lightweight 3D helm simulation sandbox running at 60 FPS.</p>
          </motion.div>

          <motion.div 
            className="big-visual-card"
            initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}
          >
            <video 
              src="/simulation-preview.mp4" 
              className="showcase-video"
              autoPlay 
              loop 
              muted 
              playsInline
            />
          </motion.div>
        </section>

        {/* --- FEATURE 2: THE 6-GRID --- */}
        <section id="features" className="feature-grid-section">
          <h2 className="grid-heading">Core Computational &amp; Pedagogical Pipelines.</h2>
          
          <motion.div 
            className="feature-grid"
            variants={staggerContainer} initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }}
          >
            {features.map((feat, index) => {
              const IconComponent = feat.icon;
              return (
                <motion.div className="grid-card" key={index} variants={fadeUp}>
                  <div className="icon-wrapper">
                    <IconComponent size={28} className="feature-lucide-icon" />
                  </div>
                  <h3>{feat.title}</h3>
                  <p>{feat.desc}</p>
                  <a href="#simulation" onClick={(e) => { e.preventDefault(); setAuthMode('register'); }} className="learn-more">
                    Explore architecture <ArrowRight size={16} className="learn-more-icon" />
                  </a>
                </motion.div>
              );
            })}
          </motion.div>
        </section>

      </main>

      {/* --- FOOTER --- */}
      <footer id="research" className="wharf-footer">
        <div className="footer-top">
          <div className="footer-brand">
             <div className="logo">Wharf<span>Intel</span></div>
             <p>An open-source geo-spatial simulation and predictive analytics platform advancing SDG 9 and DNSC ICT4D research.</p>
          </div>
          <div className="footer-links">
            <div className="link-column">
              <h4>Systems</h4>
              <a href="#web-gis">Web-GIS Simulation</a>
              <a href="#navmesh">A* Navmesh Router</a>
              <a href="#scheduler">Priority Heap Scheduler</a>
              <a href="#predictor">Multi-Brain Predictor</a>
            </div>
            <div className="link-column">
              <h4>Research</h4>
              <a href="#dnsc">DNSC Institute of Computing</a>
              <a href="#dict-study">DICT Panabo Study</a>
              <a href="#methodology">Methodology</a>
              <a href="#docs">Documentation</a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} WharfIntel — Davao del Norte State College (Institute of Computing). All Rights Reserved.</p>
        </div>
      </footer>

      {/* --- FLOATING BACK-TO-TOP BUTTON --- */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            className="back-to-top-btn"
            onClick={scrollToTop}
            aria-label="Scroll to top"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <ArrowUp size={20} />
          </motion.button>
        )}
      </AnimatePresence>

      {authMode && (
        <div className="modal-overlay">
          <AuthPage initialMode={authMode} onClose={() => setAuthMode(null)} />
        </div>
      )}
    </div>
  );
};

export default LandingPage;