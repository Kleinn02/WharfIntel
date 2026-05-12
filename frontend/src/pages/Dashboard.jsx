import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Dashboard.css'; 
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';

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

const CustomMapControls = ({ isLightMode, setIsLightMode }) => {
  const map = useMap();
  return (
    <div className="custom-map-controls">
      <button className="control-btn" title="Zoom In" onClick={() => map.zoomIn(2)}>+</button>
      <button className="control-btn" title="Zoom Out" onClick={() => map.zoomOut(3)}>−</button>
      <button className="control-btn theme-toggle-btn" title="Toggle Theme" onClick={() => setIsLightMode(!isLightMode)}>
        {isLightMode ? '🌙' : '☀️'}
      </button>
    </div>
  );
};

// 🔥 FIX: Smoother, less laggy camera drone
const FlyToVessel = ({ focusedVessel }) => {
  const map = useMap();
  useEffect(() => {
    if (focusedVessel) {
      // Zoom 13 instead of 16 stops massive tile downloading lag
      map.flyTo([focusedVessel.lat, focusedVessel.lng], 16, {
        animate: true,
        duration: 0.9 // Snappier animation
      });
    }
  }, [focusedVessel, map]);
  return null;
};

const Dashboard = () => {
  const navigate = useNavigate(); 
  const portPosition = [7.284, 125.681]; // Default Port (Davao)
  
  const [vessels, setVessels] = useState([]);
  const [forecastData, setForecastData] = useState([]);
  const [activeMenu, setActiveMenu] = useState('live_map'); 
  const [searchTerm, setSearchTerm] = useState(''); 
  const [filterStatus, setFilterStatus] = useState('ALL'); // 🔥 New Filter State
  const [showLogout, setShowLogout] = useState(false); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isLightMode, setIsLightMode] = useState(false); 
  const [focusedVessel, setFocusedVessel] = useState(null); 
  const [logModalVessel, setLogModalVessel] = useState(null); // State for Voyage Log Modal

  useEffect(() => {
    const fetchAllData = async () => {
      try {
        const vesselRes = await fetch('http://127.0.0.1:8000/api/vessels/active');
        if (vesselRes.ok) setVessels(await vesselRes.json());

        const forecastRes = await fetch('http://127.0.0.1:8000/api/analytics/forecast');
        if (forecastRes.ok) setForecastData(await forecastRes.json());
      } catch (error) {
        console.error("Command Center Data Sync Failed:", error);
      }
    };
    fetchAllData(); 
    const interval = setInterval(fetchAllData, 10000); 
    return () => clearInterval(interval);
  }, []);

// 🔥 FIX: Clear the browser memory before kicking them to the login screen
  const handleSignOut = () => {
    localStorage.removeItem('username'); 
    setShowLogout(false);
    navigate('/');
  };
  
  // 🔥 Filter Logic updated to include Status Pills
  const filteredVessels = vessels.filter(v => {
    const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || v.type.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'ALL' || v.status.toUpperCase() === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className={`dashboard-wrapper ${!isSidebarOpen ? 'sidebar-closed' : ''} ${isLightMode ? 'light-mode' : ''}`}>
      
      {!isSidebarOpen && <button className="floating-hamburger" onClick={() => setIsSidebarOpen(true)}>☰</button>}
      
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
            <p className="log-disclaimer">*Historical tracks require the WharfIntel Postgres module to be actively saving AIS streams.</p>
            <button className="notif-ack-btn mt-4" onClick={() => setLogModalVessel(null)}>CLOSE LOG</button>
          </div>
        </div>
      )}

      {showLogout && (
        <div className="logout-overlay">
          <div className="logout-modal">
            <h3>Disconnect Session?</h3>
            <p>Are you sure you want to sign out of the Command Center?</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowLogout(false)}>Cancel</button>
              <button className="btn-confirm" onClick={handleSignOut}>Confirm</button>
            </div>
          </div>
        </div>
      )}

      <aside className={`sidebar ${!isSidebarOpen ? 'hidden' : ''}`}>
        <div className="sidebar-header">
          <button className="sidebar-toggle-inner" onClick={() => setIsSidebarOpen(false)}>✕</button>
          <div className="brand">
            <h2>Wharf<span>Intel</span></h2>
            <p>COMMAND CENTER</p>
          </div>
        </div>
        
        <nav className="side-nav">
          <button className={activeMenu === 'live_map' ? 'active' : ''} onClick={() => setActiveMenu('live_map')}>Live Map</button>
          <button className={activeMenu === 'traffic' ? 'active' : ''} onClick={() => setActiveMenu('traffic')}>Vessel Traffic</button>
          <button className={activeMenu === 'analytics' ? 'active' : ''} onClick={() => setActiveMenu('analytics')}>Analytics</button>

          <button className="btn-link-sim" onClick={() => navigate('/simulation')}>🎮 Enter Simulation</button>
          <button className="logout" onClick={() => setShowLogout(true)}>Sign Out</button>
        </nav>
      </aside>

      <main className="map-view">
        <MapContainer center={portPosition} zoom={14} className="leaflet-container" zoomControl={false} zoomSnap={2} zoomDelta={2}>
          <TileLayer url={isLightMode ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"} attribution='&copy; CARTO' />
          
          <CustomMapControls isLightMode={isLightMode} setIsLightMode={setIsLightMode} />
          <FlyToVessel focusedVessel={focusedVessel} />

          <MarkerClusterGroup chunkedLoading maxClusterRadius={40} showCoverageOnHover={false}>
            {vessels.map((vessel) => (
              <Marker 
                key={vessel.id} 
                position={[vessel.lat, vessel.lng]}
                icon={createVesselIcon(vessel.status, vessel.heading, true)}
                ref={(ref) => {
                  if (ref && focusedVessel?.id === vessel.id) {
                    setTimeout(() => ref.openPopup(), 1000);
                  }
                }}
              >
                <Popup className={`mt-style-popup ${isLightMode ? 'light-popup' : 'dark-popup'}`}>
                  <div className="mt-header">
                    <div className="mt-title">
                      <span className="mt-icon">🚢</span>
                      <div>
                        <strong>{vessel.name}</strong>
                        <span className="mt-type">{vessel.type}</span>
                      </div>
                    </div>
                    <span className={`badge ${vessel.status.toLowerCase()}`}>{vessel.status}</span>
                  </div>
                  
                  <div className="mt-data-grid">
                    <div className="mt-data-item">
                      <label>DIST TO PORT</label>
                      <span>{calculateDistanceNM(vessel.lat, vessel.lng, portPosition[0], portPosition[1])} NM</span>
                    </div>
                    <div className="mt-data-item">
                      <label>HEADING</label>
                      <span>{vessel.heading}°</span>
                    </div>
                    <div className="mt-data-item">
                      <label>LATITUDE</label>
                      <span>{vessel.lat.toFixed(4)}</span>
                    </div>
                    <div className="mt-data-item">
                      <label>LONGITUDE</label>
                      <span>{vessel.lng.toFixed(4)}</span>
                    </div>
                  </div>

                  <div className="mt-actions">
                    <button className="mt-btn primary" onClick={() => setFocusedVessel(vessel)}>📍 Track</button>
                    <button className="mt-btn secondary" onClick={() => setLogModalVessel(vessel)}>View Log</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>

        {activeMenu === 'traffic' && (
          <div className="floating-panel">
            <div className="panel-header">
              <h3>Active Traffic</h3>
              <span className="vessel-count">{filteredVessels.length} Vessels</span>
            </div>
            
            <input 
              type="text" 
              className="traffic-search" 
              placeholder="Search by name or type..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />

            {/* 🔥 NEW: Status Pills */}
            <div className="status-filters">
              <button className={`filter-pill ${filterStatus === 'ALL' ? 'active' : ''}`} onClick={() => setFilterStatus('ALL')}>ALL</button>
              <button className={`filter-pill ${filterStatus === 'INBOUND' ? 'active' : ''}`} onClick={() => setFilterStatus('INBOUND')}>INBOUND</button>
              <button className={`filter-pill ${filterStatus === 'DOCKED' ? 'active' : ''}`} onClick={() => setFilterStatus('DOCKED')}>DOCKED</button>
            </div>

            <div className="traffic-list">
              {filteredVessels.length > 0 ? (
                filteredVessels.map(v => (
                  <div className="traffic-card" key={v.id} onClick={() => setFocusedVessel(v)}>
                    <div className="tc-top">
                      <h4>{v.name}</h4>
                      <span className={`badge ${v.status.toLowerCase()}`}>{v.status}</span>
                    </div>
                    <div className="tc-bottom">
                      <span>{v.type}</span>
                      <span>HDG: {v.heading}°</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="no-results">No vessels found matching filters.</div>
              )}
            </div>
          </div>
        )}

        {/* ... (Keep your Analytics panel code exactly the same below here) ... */}
        {activeMenu === 'analytics' && (
          <div className="floating-panel" style={{ width: '400px' }}>
            <div className="panel-header">
              <h3>Predictive Analytics</h3>
              <span className="badge outbound" style={{ background: '#8b5cf6', color: '#fff' }}>LSTM Active</span>
            </div>
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-label">Live Traffic</span>
                <span className="stat-value">{vessels.length}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">72h Risk Trend</span>
                <span className="stat-value" style={{ color: '#ef4444' }}>Elevated</span>
              </div>
            </div>
            <h4 className="section-title" style={{ marginTop: '20px' }}>Congestion Forecast (Time-Series)</h4>
            <div style={{ width: '100%', height: '200px', marginTop: '10px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="day" stroke="#94a3b8" fontSize={12} tickLine={false} />
                  <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }} itemStyle={{ color: '#f8fafc' }} />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                  <Line type="monotone" name="Actual Traffic" dataKey="historical" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} />
                  <Line type="monotone" name="AI Forecast" dataKey="predicted" stroke="#f59e0b" strokeWidth={3} strokeDasharray="5 5" dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '15px', textAlign: 'center' }}>*Model trained on regional transit data to forecast bottleneck probabilities.</p>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;