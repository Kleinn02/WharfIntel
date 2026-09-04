import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Dashboard.css'; 
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import LiveWeatherWidget from './LiveWeatherWidget'; // Update path if needed
import Profile from './Profile';

// --- MATH HELPER: HAVERSINE DISTANCE ---
const calculateDistanceNM = (lat1, lon1, lat2, lon2) => {
  const R = 3440.065; // Radius of the Earth in Nautical Miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return (R * c).toFixed(1);
};

const createVesselIcon = (status, heading, isAnimated = true) => {
  let strokeColor = '#6b7280';
  let fillColor = 'rgba(107, 114, 128, 0.2)';
  
  if (status === 'Docked') { strokeColor = '#4fffb0'; fillColor = 'rgba(79, 255, 176, 0.2)'; }
  if (status === 'Inbound') { strokeColor = '#f5a623'; fillColor = 'rgba(245, 166, 35, 0.2)'; }
  if (status === 'Outbound') { strokeColor = '#00d2ff'; fillColor = 'rgba(0, 210, 255, 0.2)'; }

  const opacityClass = isAnimated ? '' : 'radar-paused';

  return L.divIcon({
    className: 'live-radar-icon-container',
    html: `
      <div class="radar-vessel-wrapper ${opacityClass}" style="transform: rotate(${heading}deg);">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L4 20L12 17L20 20L12 2Z" fill="${fillColor}" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round"/>
        </svg>
      </div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10], 
  });
};

// 🔥 Passed isLightMode and setIsLightMode as props
const CustomMapControls = ({ isLightMode, setIsLightMode }) => {
  const map = useMap();
  return (
    <div className="custom-map-controls">
      <button className="control-btn" title="Zoom In" onClick={() => map.zoomIn(2)}>+</button>
      <button className="control-btn" title="Zoom Out" onClick={() => map.zoomOut(3)}>−</button>
      {/* 🔥 The relocated Dark/Light mode toggle */}
      <button className="control-btn theme-map-btn" title="Toggle Theme" onClick={() => setIsLightMode(!isLightMode)}>
        {isLightMode ? <MoonIcon /> : <SunIcon />}
      </button>
    </div>
  );
};

const FlyToVessel = ({ focusedVessel }) => {
  const map = useMap();
  useEffect(() => {
    if (focusedVessel) {
      map.flyTo([focusedVessel.lat, focusedVessel.lng], 16, { animate: true, duration: 0.9 });
    }
  }, [focusedVessel, map]);
  return null;
};

// --- ICON COMPONENTS ---
const UserIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const MapIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 20L3 17V4L9 7M9 20L15 17M9 20V7M15 17L21 20V7L15 4M15 17V4" />
    <circle cx="15" cy="9" r="2" fill="currentColor" />
  </svg>
);

const ShipIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 17L2 12L12 2L22 12L20 17" />
    <path d="M7 10h10M9 6h6" />
    <path d="M2 20c2 0 4-1 6-1s4 1 6 1 4-1 6-1 4 1 6 1" />
    <path d="M12 2v8" />
  </svg>
);

const PieChartIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
    <path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);

const LogoutIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const SimIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="2" ry="2"/>
    <circle cx="16" cy="14" r="1"/>
    <circle cx="18" cy="12" r="1"/>
    <path d="M6 12h4M8 10v4"/>
  </svg>
);

const SunIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: 0 }}>
    <circle cx="12" cy="12" r="5" />
    <line x1="12" y1="1" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="23" />
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
    <line x1="1" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="23" y2="12" />
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
  </svg>
);

const MoonIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ margin: 0 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const Dashboard = () => {
  const navigate = useNavigate(); 
  
  // --- MAP CONSTRAINTS ---
  const SEA_BOUNDS = [[-15.0, 90.0], [30.0, 150.0]];
  const SEA_CENTER = [5.0, 120.0];
  
  // 🔥 THE FIX: Uncommented this line! The popup math needs this to calculate Distance to Port!
  const portPosition = [7.284, 125.681]; 
  
  const [vessels, setVessels] = useState([]);
  const [forecastData, setForecastData] = useState([]);
  const [congestionZones, setCongestionZones] = useState([]); 
  const [riskTrend, setRiskTrend] = useState('CALCULATING...'); 
  const [activeMenu, setActiveMenu] = useState('live_map'); 
  const [searchTerm, setSearchTerm] = useState(''); 
  const [filterStatus, setFilterStatus] = useState('ALL'); 
  const [showLogout, setShowLogout] = useState(false); 
  const [isLightMode, setIsLightMode] = useState(false); 
  const [focusedVessel, setFocusedVessel] = useState(null); 
  const [logModalVessel, setLogModalVessel] = useState(null); 
  const [showProfile, setShowProfile] = useState(false);
  const currentUsername = localStorage.getItem('username') || 'Commander';

  // ... (The rest of your code stays exactly the same!)

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const vesselRes = await fetch('http://127.0.0.1:8000/api/vessels/active');
        if (vesselRes.ok) setVessels(await vesselRes.json());

        const forecastRes = await fetch('http://127.0.0.1:8000/api/analytics/forecast');
        if (forecastRes.ok) {
          const data = await forecastRes.json();
          setForecastData(data.forecast);
          setRiskTrend(data.risk_trend);
        }

        // 🔥 Fetch the DBSCAN calculated zones
        const zonesRes = await fetch('http://127.0.0.1:8000/api/analytics/congestion_zones');
        if (zonesRes.ok) setCongestionZones(await zonesRes.json());

      } catch (error) {
        console.error("Command Center Data Sync Failed:", error);
      }
    };
    fetchAllData(); 
    const interval = setInterval(fetchAllData, 10000); 
    return () => clearInterval(interval);
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem('username'); 
    setShowLogout(false);
    navigate('/');
  };

  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // Make it start closed
  const sidebarTimer = useRef(null); // Holds our 2-second countdown

  const handleSidebarEnter = () => {
    if (sidebarTimer.current) clearTimeout(sidebarTimer.current); // Stop the closing timer
    setIsSidebarOpen(true); // Open instantly
  };

  const handleSidebarLeave = () => {
    // Start a 2-second (2000ms) countdown to close
    sidebarTimer.current = setTimeout(() => {
      setIsSidebarOpen(false);
    }, 2000); 
  };
  
  const filteredVessels = vessels.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || v.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || v.status.toUpperCase() === filterStatus;
    return matchesSearch && matchesStatus;
  });

  // 🔥 NEW: Custom Sleek Tooltip for the Recharts Graph
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ 
        background: '#0f172a', 
        border: '1px solid #334155', 
        borderRadius: '8px', 
        padding: '12px 16px', 
        boxShadow: '0 10px 25px rgba(0,0,0,0.5)' 
      }}>
        <p style={{ margin: '0 0 8px 0', fontSize: '13px', fontWeight: 'bold', color: '#94a3b8' }}>
          {label}
        </p>
        {payload.map((entry, index) => (
          <p key={index} style={{ margin: 0, fontSize: '15px', color: entry.color, fontWeight: 'bold' }}>
            {entry.name} : {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

  return (
    <div className={`dashboard-wrapper ${isLightMode ? 'light-mode' : 'dark-mode'}`}>
      
      {/* VOYAGE LOG MODAL (Under Construction / Mock) */}
      {logModalVessel && (
        <div className="logout-overlay" onClick={() => setLogModalVessel(null)}>
          <div className="logout-modal log-modal" onClick={e => e.stopPropagation()}>
            <div className="log-header">
              <h3>Voyage History: {logModalVessel.name}</h3>
              <span className="mmsi-badge">MMSI: {logModalVessel.id}</span>
            </div>
            <div className="log-timeline">
              <div className="log-entry">
                <span className="log-time">Now</span>
                <span className="log-event">Current Position (Live)</span>
                <span className="log-loc">{logModalVessel.lat.toFixed(2)}, {logModalVessel.lng.toFixed(2)}</span>
              </div>
              <div className="log-entry historical">
                <span className="log-time">-4 hrs</span>
                <span className="log-event">Entered Coastal Waters</span>
                <span className="log-loc">Database Cache</span>
              </div>
              <div className="log-entry historical">
                <span className="log-time">-24 hrs</span>
                <span className="log-event">Origin Port Departure</span>
                <span className="log-loc">Database Cache</span>
              </div>
            </div>
            {/* <p className="log-disclaimer">*Historical tracks require the WharfIntel Postgres module to be actively saving AIS streams.</p> */}
            <button className="notif-ack-btn mt-4" onClick={() => setLogModalVessel(null)}>CLOSE LOG</button>
          </div>
        </div>
      )}

      {/* --- RENDER PROFILE MODAL --- */}
      {showProfile && (
        <Profile 
          onClose={() => setShowProfile(false)} 
          username={currentUsername} 
        />
      )}

      {showLogout && (
        <div className="logout-overlay" onClick={() => setShowLogout(false)}>
          <div className="logout-modal command-center-logout" onClick={e => e.stopPropagation()}>
            <h3>Disconnect Session?</h3>
            <p>Are you sure you want to sign out of the Command Center?</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowLogout(false)}>CANCEL</button>
              <button className="btn-confirm-red" onClick={handleSignOut}>CONFIRM</button>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW MODERN SIDEBAR --- */}
      {/* Added hover events here */}
      <aside 
        className={`sidebar ${isSidebarOpen ? 'expanded' : 'collapsed'}`}
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
      >
        
        {/* WE DELETED THE SIDEBAR-TOGGLE BUTTON ENTIRELY */}

        <div className="sidebar-header">
          {/* ... Keep your logo and brand-text exactly the same ... */}
          <div className="brand-logo">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M10 4L10 13L3 13L10 4Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M13 6L13 13L19 13L13 6Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 15L22 15C22 15 19 18 12 18C5 18 2 15 2 15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 21.5 Q 4.5 19.5 7 21.5 T 12 21.5 T 17 21.5 T 22 21.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div className="brand-text">
            <h2>Wharf<span>Intel</span></h2>
            <p>COMMAND CENTER</p>
          </div>
        </div>
        
        <div className="sidebar-content">
          <div className="nav-group">
            <p className="nav-title">MAIN MENU</p>
            <nav className="side-nav">
              {/* 🔥 The New Streamlined Profile Button */}
              <button onClick={() => setShowProfile(true)}>
                <UserIcon /> 
                <span className="nav-text" style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                  Profile
                  {/* Subtle online indicator */}
                  <span style={{ width: '6px', height: '6px', background: '#10b981', borderRadius: '50%', boxShadow: '0 0 6px #10b981' }}></span>
                </span>
              </button>
              <button className={activeMenu === 'live_map' ? 'active' : ''} onClick={() => setActiveMenu('live_map')}>
                <MapIcon /> <span className="nav-text">Live Map</span>
              </button>
              <button className={activeMenu === 'traffic' ? 'active' : ''} onClick={() => setActiveMenu('traffic')}>
                <ShipIcon /> <span className="nav-text">Vessel Traffic</span>
              </button>
              <button className={activeMenu === 'analytics' ? 'active' : ''} onClick={() => setActiveMenu('analytics')}>
                <PieChartIcon /> <span className="nav-text">Analytics</span>
              </button>
            </nav>
          </div>

          <div className="nav-group bottom-group">
            <nav className="side-nav">
              <button className="sim-btn" onClick={() => navigate('/simulation')}>
                <SimIcon /> <span className="nav-text">Enter Simulation</span>
              </button>

              {/* Logout moved to the very bottom */}
              <button className="logout-btn" onClick={() => setShowLogout(true)}>
                <LogoutIcon /> <span className="nav-text">Sign Out</span>
              </button>
            </nav>
          </div>
        </div>
      </aside>
      
      <main className={`map-view ${isSidebarOpen ? 'sidebar-expanded' : ''}`}>
        <div className="radar-grid-overlay"></div>
        {/* 🔥 NEW: Live Real-World Weather Widget */}
        <LiveWeatherWidget />
        {/* 🔥 UPDATED MAP CONTAINER: Default SEA Center, Bounds, and Zoom */}
        <MapContainer 
          center={SEA_CENTER} 
          zoom={5} 
          minZoom={4} 
          maxZoom={18} 
          maxBounds={SEA_BOUNDS} 
          maxBoundsViscosity={1.0} 
          className="leaflet-container" 
          zoomControl={false} 
          zoomSnap={0.5} 
          zoomDelta={0.5}
        >
          <TileLayer 
            url={isLightMode 
              ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}" 
              : "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"} 
            attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ' 
          />
          
          {/* 🔥 Pass props to the map controls */}
          <CustomMapControls isLightMode={isLightMode} setIsLightMode={setIsLightMode} />
          <FlyToVessel focusedVessel={focusedVessel} />

          <MarkerClusterGroup chunkedLoading maxClusterRadius={40} showCoverageOnHover={false}>
            {vessels.map((vessel) => (
              <Marker 
                key={vessel.id} 
                position={[vessel.lat, vessel.lng]}
                icon={createVesselIcon(vessel.status, vessel.heading, true)}
                ref={(ref) => { if (ref && focusedVessel?.id === vessel.id) setTimeout(() => ref.openPopup(), 1000); }}
              >
                <Popup className={`mt-style-popup ${isLightMode ? 'light-popup' : 'dark-popup'}`}>
                  <div className="mt-header">
                    <div className="mt-title">
                      <span className="mt-icon">🚢</span>
                      <div><strong>{vessel.name}</strong><span className="mt-type">{vessel.type}</span></div>
                    </div>
                    <span className={`badge ${vessel.status.toLowerCase()}`}>{vessel.status}</span>
                  </div>
                  <div className="mt-data-grid">
                    <div className="mt-data-item"><label>DIST TO PORT</label><span>{calculateDistanceNM(vessel.lat, vessel.lng, portPosition[0], portPosition[1])} NM</span></div>
                    <div className="mt-data-item"><label>HEADING</label><span>{vessel.heading}°</span></div>
                    <div className="mt-data-item"><label>LATITUDE</label><span>{vessel.lat.toFixed(4)}</span></div>
                    <div className="mt-data-item"><label>LONGITUDE</label><span>{vessel.lng.toFixed(4)}</span></div>
                  </div>
                  <div className="mt-actions">
                    <button className="mt-btn primary" onClick={() => setFocusedVessel(vessel)}>📍 Track</button>
                    <button className="mt-btn secondary" onClick={() => setLogModalVessel(vessel)}>View Log</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>

          {/* 🔥 STRIKE 3: Render AI-Detected Congestion Zones */}
          {congestionZones.map(zone => (
            <Circle 
              key={`zone-${zone.id}`}
              center={zone.center}
              radius={zone.radius_meters}
              pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.25, weight: 2, dashArray: '5, 5' }}
            >
              <Popup className={`mt-style-popup ${isLightMode ? 'light-popup' : 'dark-popup'}`}>
                <div style={{ padding: '15px', textAlign: 'center' }}>
                  <strong style={{ color: '#ef4444', display: 'block', marginBottom: '8px', fontSize: '14px', letterSpacing: '1px' }}>
                    ⚠️ HIGH CONGESTION ZONE
                  </strong>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>
                    DBSCAN algorithm detected <strong style={{color: 'var(--text-primary)'}}>{zone.vessel_count} vessels</strong> bottlenecked in this sector.
                  </p>
                </div>
              </Popup>
            </Circle>
          ))}
          
        </MapContainer>

        {activeMenu === 'traffic' && (
          <div className="floating-panel">
            <div className="panel-header">
              <h3>Active Traffic</h3>
              <span className="vessel-count">{filteredVessels.length} Vessels</span>
            </div>
            <input type="text" className="traffic-search" placeholder="Search by name or type..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            <div className="status-filters">
              <button className={`filter-pill ${filterStatus === 'ALL' ? 'active' : ''}`} onClick={() => setFilterStatus('ALL')}>ALL</button>
              <button className={`filter-pill ${filterStatus === 'INBOUND' ? 'active' : ''}`} onClick={() => setFilterStatus('INBOUND')}>INBOUND</button>
              <button className={`filter-pill ${filterStatus === 'DOCKED' ? 'active' : ''}`} onClick={() => setFilterStatus('DOCKED')}>DOCKED</button>
            </div>
            <div className="traffic-list">
              {filteredVessels.length > 0 ? (
                filteredVessels.map(v => (
                  <div className="traffic-card" key={v.id} onClick={() => setFocusedVessel(v)}>
                    <div className="tc-top"><h4>{v.name}</h4><span className={`badge ${v.status.toLowerCase()}`}>{v.status}</span></div>
                    <div className="tc-bottom"><span>{v.type}</span><span>HDG: {v.heading}°</span></div>
                  </div>
                ))
              ) : (<div className="no-results">No vessels found.</div>)}
            </div>
          </div>
        )}

        {activeMenu === 'analytics' && (
          <div className="floating-panel" style={{ width: '400px' }}>
            <div className="panel-header">
              <h3>Predictive Analytics</h3>
              <span className="badge outbound" style={{ background: '#82a0ff', color: '#fff' }}>RF Active</span>
            </div>
            
            <div className="stats-grid" style={{ marginBottom: '16px' }}>
              <div className="stat-box"><span className="stat-label">Live Traffic</span><span className="stat-value">{vessels.length}</span></div>
              <div className="stat-box">
                <span className="stat-label">72h Risk Trend</span>
                <span className="stat-value" style={{ 
                  color: riskTrend === 'CRITICAL' ? '#ef4444' : riskTrend === 'ELEVATED' ? '#f59e0b' : '#10b981' 
                }}>
                  {riskTrend}
                </span>
              </div>
            </div>
            
            <h4 className="section-title">Congestion Forecast (Time-Series)</h4>
            <div style={{ width: '100%', height: '180px' }}> {/* Slightly reduced height */}
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={11} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                  
                  {/* 🔥 UPDATED: Using our new CustomTooltip */}
                  <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
                  
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '5px' }}/>
                  <Line type="monotone" name="Actual Traffic" dataKey="historical" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} />
                  <Line type="monotone" name="AI Forecast" dataKey="predicted" stroke="#f59e0b" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 🔥 UPDATED: Explainable AI Threat Matrix Legend */}
            <div className="threat-matrix-legend">
              <div className="tm-item">
                <div className="tm-color-bar" style={{ background: '#10b981' }}></div>
                <div className="tm-info">
                  <strong>NOMINAL</strong>
                  <p>Standard traffic flow. Minimal bottleneck probability.</p>
                </div>
              </div>
              <div className="tm-item">
                <div className="tm-color-bar" style={{ background: '#f59e0b' }}></div>
                <div className="tm-info">
                  <strong>ELEVATED</strong>
                  <p>Developing bottleneck. Route deviations recommended.</p>
                </div>
              </div>
              <div className="tm-item">
                <div className="tm-color-bar" style={{ background: '#ef4444' }}></div>
                <div className="tm-info">
                  <strong>CRITICAL</strong>
                  <p>Severe gridlock detected. Imminent logistics delays.</p>
                </div>
              </div>
            </div>
            
            {/* 🗑️ DELETED the disclaimer text here! */}
            
          </div>
        )}

        {/* 🔥 FIX: Moved the Radar Grid here so it renders OVER the map! */}
        <div className="radar-grid-overlay"></div>
        
      </main>
    </div>
  );
};

export default Dashboard;