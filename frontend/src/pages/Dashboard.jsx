import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Dashboard.css'; 
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';

// Generate vessel icon with optional pausing for the radar toggle
const createVesselIcon = (status, isAnimated = true) => {
  let colorClass = 'status-default';
  if (status === 'Docked') colorClass = 'status-docked';
  if (status === 'Inbound') colorClass = 'status-inbound';
  if (status === 'Outbound') colorClass = 'status-outbound';

  const animationClass = isAnimated ? '' : 'paused';

  return L.divIcon({
    className: 'custom-vessel-icon',
    html: `
      <div class="vessel-dot ${colorClass}"></div>
      <div class="vessel-pulse ${colorClass} ${animationClass}"></div>
    `,
    iconSize: [20, 20],
    iconAnchor: [10, 10], 
  });
};

const Dashboard = () => {
  const navigate = useNavigate(); 
  const portPosition = [7.284, 125.681]; 
  
  // --- UI & Layout State ---
  const [vessels, setVessels] = useState([]);
  const [forecastData, setForecastData] = useState([]);
  const [activeMenu, setActiveMenu] = useState('live_map'); 
  const [searchTerm, setSearchTerm] = useState(''); 
  const [showLogout, setShowLogout] = useState(false); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showAISTraffic, setShowAISTraffic] = useState(true); 

  // --- Live Data Polling Engine (Vessels + Analytics) ---
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // 1. Fetch Live Ships (AISStream)
        const vesselRes = await fetch('http://127.0.0.1:8000/api/vessels/active');
        if (vesselRes.ok) setVessels(await vesselRes.json());

        // 2. Fetch ML Forecast
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

  const handleSignOut = () => navigate('/');

  // --- Analytics Logic ---
  const filteredVessels = vessels.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.type.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalCount = vessels.length;

  return (
    <div className={`dashboard-wrapper ${!isSidebarOpen ? 'sidebar-closed' : ''}`}>
      
      {/* FLOATING OPEN BUTTON (Only visible when sidebar is closed) */}
      {!isSidebarOpen && (
        <button className="floating-hamburger" onClick={() => setIsSidebarOpen(true)}>
          ☰
        </button>
      )}
      
      {/* LOGOUT CONFIRMATION MODAL */}
      {showLogout && (
        <div className="logout-overlay">
          <div className="logout-modal">
            <h3>Disconnect Session?</h3>
            <p>Are you sure you want to sign out of the Command Center?</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowLogout(false)}>Cancel</button>
              <button className="btn-confirm" onClick={handleSignOut}>Confirm Disconnect</button>
            </div>
          </div>
        </div>
      )}

      {/* COLLAPSIBLE SIDEBAR */}
      <aside className={`sidebar ${!isSidebarOpen ? 'hidden' : ''}`}>
        <div className="sidebar-header">
          <button className="sidebar-toggle-inner" onClick={() => setIsSidebarOpen(false)}>✕</button>
          <div className="brand">
            <h2>Wharf<span>Intel</span></h2>
            <p>COMMAND CENTER</p>
          </div>
        </div>
        
        <nav className="side-nav">
          <button className={activeMenu === 'live_map' ? 'active' : ''} onClick={() => setActiveMenu('live_map')}>
            Live Map
          </button>
          <button className={activeMenu === 'traffic' ? 'active' : ''} onClick={() => setActiveMenu('traffic')}>
            Vessel Traffic
          </button>
          <button className={activeMenu === 'analytics' ? 'active' : ''} onClick={() => setActiveMenu('analytics')}>
            Analytics
          </button>

          {/* MINIMALIST RADAR SWITCH */}
          <div className="radar-switch-container">
            <span className="radar-text">LIVE AIS RADAR</span>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={showAISTraffic} 
                onChange={() => setShowAISTraffic(!showAISTraffic)} 
              />
              <span className="slider round"></span>
            </label>
          </div>

          {/* SIMULATION LINK ROUTE */}
          <button 
            className="btn-link-sim" 
            onClick={() => navigate('/simulation')} 
          >
            🎮 Enter Simulation
          </button>

          <button className="logout" onClick={() => setShowLogout(true)}>Sign Out</button>
        </nav>
      </aside>

      {/* MAIN MAP AREA */}
      <main className="map-view">
        <MapContainer 
          center={portPosition} 
          zoom={14} 
          className="leaflet-container"
          zoomControl={false}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; OpenStreetMap &copy; CARTO'
          />
          
          {/* LIVE AIS VESSELS */}
          {vessels.map((vessel) => (
            <Marker 
              key={vessel.id} 
              position={[vessel.lat, vessel.lng]}
              icon={createVesselIcon(vessel.status, showAISTraffic)} 
            >
              <Popup className="custom-popup">
                <div className="popup-header">
                  <strong>{vessel.name}</strong>
                  <span className={`badge ${vessel.status.toLowerCase()}`}>{vessel.status}</span>
                </div>
                <div className="popup-body">
                  <p>Type: {vessel.type}</p>
                  <p>Heading: {vessel.heading}°</p>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* FLOATING TRAFFIC PANEL */}
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
            <div className="traffic-list">
              {filteredVessels.length > 0 ? (
                filteredVessels.map(v => (
                  <div className="traffic-card" key={v.id}>
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
                <div className="no-results">No vessels found.</div>
              )}
            </div>
          </div>
        )}

        {/* FLOATING ANALYTICS PANEL */}
        {activeMenu === 'analytics' && (
          <div className="floating-panel" style={{ width: '400px' }}>
            <div className="panel-header">
              <h3>Predictive Analytics</h3>
              <span className="badge outbound" style={{ background: '#8b5cf6', color: '#fff' }}>LSTM Active</span>
            </div>
            
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-label">Live Traffic</span>
                <span className="stat-value">{totalCount}</span>
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
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#f8fafc' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}/>
                  
                  <Line 
                    type="monotone" 
                    name="Actual Traffic"
                    dataKey="historical" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} 
                  />
                  
                  <Line 
                    type="monotone" 
                    name="AI Forecast"
                    dataKey="predicted" 
                    stroke="#f59e0b" 
                    strokeWidth={3} 
                    strokeDasharray="5 5" 
                    dot={{ r: 4, fill: '#f59e0b', strokeWidth: 0 }} 
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '15px', textAlign: 'center' }}>
              *Model trained on regional transit data to forecast bottleneck probabilities.
            </p>

          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;