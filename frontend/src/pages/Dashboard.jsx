import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // <-- Needed for Sign Out
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Dashboard.css'; 

const createVesselIcon = (status) => {
  let colorClass = 'status-default';
  if (status === 'Docked') colorClass = 'status-docked';
  if (status === 'Inbound') colorClass = 'status-inbound';
  if (status === 'Outbound') colorClass = 'status-outbound';

  return L.divIcon({
    className: 'custom-vessel-icon',
    html: `<div class="vessel-dot ${colorClass}"></div><div class="vessel-pulse ${colorClass}"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10], 
  });
};

const Dashboard = () => {
  const navigate = useNavigate(); // <-- Initialize navigation
  const portPosition = [7.284, 125.681]; 
  
  const [vessels, setVessels] = useState([]);
  const [activeMenu, setActiveMenu] = useState('live_map'); 
  const [searchTerm, setSearchTerm] = useState(''); 
  const [showLogout, setShowLogout] = useState(false); // <-- Track logout modal

  useEffect(() => {
    const fetchVessels = async () => {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/vessels/active');
        const data = await response.json();
        setVessels(data);
      } catch (error) {
        console.error("Failed to fetch vessels:", error);
      }
    };

    fetchVessels();
    const interval = setInterval(fetchVessels, 10000);
    return () => clearInterval(interval);
  }, []);

  // --- Filtering & Analytics Logic ---
  const filteredVessels = vessels.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const dockedCount = vessels.filter(v => v.status === 'Docked').length;
  const inboundCount = vessels.filter(v => v.status === 'Inbound').length;
  const outboundCount = vessels.filter(v => v.status === 'Outbound').length;
  const totalCount = vessels.length;

  // --- Handlers ---
  const handleSignOut = () => {
    // Here you would also clear any auth tokens (e.g., localStorage.removeItem('token'))
    navigate('/');
  };

  return (
    <div className="dashboard-wrapper">
      
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

      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <h2>Wharf<span>Intel</span></h2>
          <p>COMMAND CENTER</p>
        </div>
        <nav className="side-nav">
          <button 
            className={activeMenu === 'live_map' ? 'active' : ''} 
            onClick={() => setActiveMenu('live_map')}
          >
            Live Map
          </button>
          <button 
            className={activeMenu === 'traffic' ? 'active' : ''} 
            onClick={() => setActiveMenu('traffic')}
          >
            Vessel Traffic
          </button>
          <button 
            className={activeMenu === 'analytics' ? 'active' : ''} 
            onClick={() => setActiveMenu('analytics')}
          >
            Analytics
          </button>
          
          {/* Trigger Logout Modal */}
          <button className="logout" onClick={() => setShowLogout(true)}>
            Sign Out
          </button>
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
          
          {vessels.map((vessel) => (
            <Marker 
              key={vessel.id} 
              position={[vessel.lat, vessel.lng]}
              icon={createVesselIcon(vessel.status)}
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
          <div className="floating-panel">
            <div className="panel-header">
              <h3>Port Analytics</h3>
              <span className="vessel-count">Live</span>
            </div>
            
            <div className="stats-grid">
              <div className="stat-box">
                <span className="stat-label">Total Active</span>
                <span className="stat-value">{totalCount}</span>
              </div>
              <div className="stat-box">
                <span className="stat-label">Avg Turnaround</span>
                <span className="stat-value">14h</span>
              </div>
            </div>

            <h4 className="section-title">Traffic Distribution</h4>
            
            <div className="analytics-bars">
              <div className="bar-row">
                <div className="bar-label">
                  <span>Docked</span>
                  <span>{dockedCount}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill docked" style={{ width: `${(dockedCount / totalCount) * 100 || 0}%` }}></div>
                </div>
              </div>

              <div className="bar-row">
                <div className="bar-label">
                  <span>Inbound</span>
                  <span>{inboundCount}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill inbound" style={{ width: `${(inboundCount / totalCount) * 100 || 0}%` }}></div>
                </div>
              </div>

              <div className="bar-row">
                <div className="bar-label">
                  <span>Outbound</span>
                  <span>{outboundCount}</span>
                </div>
                <div className="bar-track">
                  <div className="bar-fill outbound" style={{ width: `${(outboundCount / totalCount) * 100 || 0}%` }}></div>
                </div>
              </div>
            </div>

          </div>
        )}

      </main>
    </div>
  );
};

export default Dashboard;