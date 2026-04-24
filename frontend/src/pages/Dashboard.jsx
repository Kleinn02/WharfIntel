import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Dashboard.css'; 
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';

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

// This invisible component controls the map's camera
const CameraController = ({ activeExports }) => {
  const map = useMap();

  useEffect(() => {
    if (activeExports.length > 0) {
      // Get the most recently added export
      const latestExport = activeExports[activeExports.length - 1];
      
      // Create a bounding box that includes both the origin and the destination
      const bounds = L.latLngBounds(
        [latestExport.startLat, latestExport.startLng],
        [latestExport.endLat, latestExport.endLng]
      );
      
      // Tell the map to fly to that box with a smooth animation and a little padding
      map.fitBounds(bounds, { 
        padding: [50, 50], 
        animate: true, 
        duration: 1.5 // 1.5 seconds of cinematic panning
      });
    }
  }, [activeExports, map]);

  return null; // It renders nothing visually
};

const Dashboard = () => {
  const navigate = useNavigate(); 
  const portPosition = [7.284, 125.681]; 
  
  // --- Standard UI State ---
  const [vessels, setVessels] = useState([]);
  const [activeMenu, setActiveMenu] = useState('live_map'); 
  const [searchTerm, setSearchTerm] = useState(''); 
  const [showLogout, setShowLogout] = useState(false); 

  // --- Simulation Time Engine ---
  const [simSpeed, setSimSpeed] = useState(1); 
  const [simTime, setSimTime] = useState(Date.now());

  useEffect(() => {
    const tickRateMs = 1000; 
    const interval = setInterval(() => {
      setSimTime(prev => prev + (tickRateMs * simSpeed));
    }, tickRateMs);
    return () => clearInterval(interval);
  }, [simSpeed]);

  // --- Live Vessel Fetching ---
  // Right under your vessels state, add this:
  const [forecastData, setForecastData] = useState([]);

  // --- Live Data Polling Engine (Vessels + Analytics) ---
  useEffect(() => {
    const fetchAllData = async () => {
      try {
        // 1. Fetch the Live Ships
        const vesselRes = await fetch('http://127.0.0.1:8000/api/vessels/active');
        if (vesselRes.ok) {
          const vesselData = await vesselRes.json();
          setVessels(vesselData);
        }

        // 2. Fetch the ML Forecast
        const forecastRes = await fetch('http://127.0.0.1:8000/api/analytics/forecast');
        if (forecastRes.ok) {
          const forecastData = await forecastRes.json();
          setForecastData(forecastData);
        }
      } catch (error) {
        console.error("Command Center Data Sync Failed:", error);
      }
    };

    // Run it immediately on load
    fetchAllData(); 
    
    // Then run it every 10 seconds to keep the map alive
    const interval = setInterval(fetchAllData, 10000); 
    return () => clearInterval(interval);
  }, []);

  // --- Ticketing & Export State ---
  const [showTicketModal, setShowTicketModal] = useState(false);
  const [activeExports, setActiveExports] = useState([]);
  const [ticketForm, setTicketForm] = useState({
    cargo: '',
    weight: '',
    destination: '',
    scale: 'Global'
  });

  // --- Updated Submit Handler (Now with Postgres Integration!) ---
  const handleTicketSubmit = async (e) => {
    e.preventDefault();
    
    // Panabo Wharf starting coordinates
    const startLat = 7.284;
    const startLng = 125.681;
    
    const routes = {
      'japan': { lat: 35.676, lng: 139.650, ms: 518400000 },      
      'korea': { lat: 35.101, lng: 129.035, ms: 432000000 },      
      'taiwan': { lat: 25.033, lng: 121.565, ms: 259200000 },     
      'singapore': { lat: 1.290, lng: 103.850, ms: 345600000 },   
      'default': { lat: 14.599, lng: 120.984, ms: 172800000 }     
    };

    const destInput = ticketForm.destination.toLowerCase();
    
    let matchedRoute = routes['default'];
    for (const key in routes) {
      if (destInput.includes(key)) {
        matchedRoute = routes[key];
        break;
      }
    }

    const newShipment = {
      id: `EXP-${Date.now()}`,
      ...ticketForm,
      startLat, startLng,
      endLat: matchedRoute.lat, 
      endLng: matchedRoute.lng,
      startTime: simTime, 
      duration: matchedRoute.ms,
      status: 'Outbound'
    };

    // 1. Immediately drop the ship on the map for that instant UI feedback
    setActiveExports(prev => [...prev, newShipment]);
    setShowTicketModal(false);
    
    // 2. Send the actual data payload to your FastAPI backend
    try {
      const response = await fetch('http://127.0.0.1:8000/api/ticketing/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cargo_name: ticketForm.cargo,
          weight_kg: Number(ticketForm.weight),
          destination_country: ticketForm.destination,
          scale: ticketForm.scale
        })
      });

      if (response.ok) {
        console.log("🔥 Shipment safely locked into PostgreSQL!");
      } else {
        console.error("Failed to save shipment to the database.");
      }
    } catch (error) {
      console.error("Backend connection error:", error);
    }

    // 3. Reset the form
    setTicketForm({ cargo: '', weight: '', destination: '', scale: 'Global' }); 
  };

  const handleSignOut = () => navigate('/');

  // --- Analytics Logic ---
  const filteredVessels = vessels.filter(v => 
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.type.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const dockedCount = vessels.filter(v => v.status === 'Docked').length;
  const inboundCount = vessels.filter(v => v.status === 'Inbound').length;
  const outboundCount = vessels.filter(v => v.status === 'Outbound').length;
  const totalCount = vessels.length;

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

      {/* TICKETING / EXPORT MODAL */}
      {showTicketModal && (
        <div className="export-overlay">
          <div className="export-modal">
            <div className="export-modal-header">
              <h3>Initiate Export Logistics</h3>
            </div>
            
            <form onSubmit={handleTicketSubmit} className="export-form">
              <div className="form-group">
                <label class="cargo">Cargo Type</label>
                <input 
                  type="text" required placeholder="e.g., Cavendish Bananas"
                  value={ticketForm.cargo} onChange={e => setTicketForm({...ticketForm, cargo: e.target.value})}
                  className="modern-input"
                />
              </div>
              
              <div className="form-row">
                <div className="form-group" style={{ flex: 1 }}>
                  <label class="weight">Weight (kg)</label>
                  <input 
                    type="number" required placeholder="5000"
                    value={ticketForm.weight} onChange={e => setTicketForm({...ticketForm, weight: e.target.value})}
                    className="modern-input"
                  />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label>Scale</label>
                  <select 
                    value={ticketForm.scale} onChange={e => setTicketForm({...ticketForm, scale: e.target.value})}
                    className="modern-select"
                  >
                    <option>Local</option>
                    <option>National</option>
                    <option>Global</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label>Destination Port / Country</label>
                <input 
                  list="destination-options"
                  type="text" required placeholder="Type or select a destination..."
                  value={ticketForm.destination} onChange={e => setTicketForm({...ticketForm, destination: e.target.value})}
                  className="modern-input"
                />
                {/* The Datalist acts as the Combobox dropdown */}
                <datalist id="destination-options">
                  <option value="Tokyo, Japan" />
                  <option value="Busan, South Korea" />
                  <option value="Taipei, Taiwan" />
                  <option value="Singapore" />
                  <option value="Manila, Philippines" />
                </datalist>
              </div>

              <div className="export-modal-actions">
                <button type="button" className="btn-cancel-modern" onClick={() => setShowTicketModal(false)}>Cancel</button>
                <button type="submit" className="btn-confirm-modern">Confirm Route</button>
              </div>
            </form>
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
          
          <button 
            className="btn-export" 
            onClick={() => setShowTicketModal(true)}
            style={{ backgroundColor: '#2ecc71', color: '#000', fontWeight: 'bold', marginTop: '20px' }}
          >
            + New Export
          </button>

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

          {/* THE SMART CAMERA */}
          <CameraController activeExports={activeExports} />
          
          {/* STATIC/MOCK VESSELS */}
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

          {/* SIMULATED EXPORT SHIPS */}
          {activeExports.map((exp) => {
            const elapsed = simTime - exp.startTime;
            let progress = elapsed / exp.duration;
            if (progress > 1) progress = 1; 
            
            const currentLat = exp.startLat + (exp.endLat - exp.startLat) * progress;
            const currentLng = exp.startLng + (exp.endLng - exp.startLng) * progress;
            const currentStatus = progress >= 1 ? 'Arrived' : 'Outbound';

            return (
              <Marker 
                key={exp.id} 
                position={[currentLat, currentLng]}
                icon={createVesselIcon(progress >= 1 ? 'Docked' : 'Outbound')}
              >
                <Popup className="custom-popup">
                  <div className="popup-header">
                    <strong>{exp.id}</strong>
                    <span className={`badge ${currentStatus.toLowerCase()}`}>{currentStatus}</span>
                  </div>
                  <div className="popup-body">
                    <p><strong>Cargo:</strong> {exp.weight}kg {exp.cargo}</p>
                    <p><strong>Dest:</strong> {exp.destination}</p>
                    <p><strong>Progress:</strong> {(progress * 100).toFixed(1)}%</p>
                  </div>
                </Popup>
              </Marker>
            );
          })}
          
          {/* EXPORT ROUTES (POLYLINES) */}
          {activeExports.map((exp) => (
             <Polyline 
               key={`route-${exp.id}`} 
               positions={[[exp.startLat, exp.startLng], [exp.endLat, exp.endLng]]} 
               pathOptions={{ color: '#2ecc71', dashArray: '5, 10', weight: 2, opacity: 0.5 }} 
             />
          ))}
        </MapContainer>

        {/* TIME WARP CONTROLS */}
        <div className="time-warp-container">
          <button 
            className={`time-btn ${simSpeed === 1 ? 'active-live' : ''}`}
            onClick={() => setSimSpeed(1)}>
            ▶ Live
          </button>
          <button 
            className={`time-btn ${simSpeed === 60 ? 'active-fast' : ''}`}
            onClick={() => setSimSpeed(60)}>
            ⏩ Fast
          </button>
          <button 
            className={`time-btn ${simSpeed === 3600 ? 'active-warp' : ''}`}
            onClick={() => setSimSpeed(3600)}>
            ⏭ Warp
          </button>
        </div>

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
                  
                  {/* Historical Data Line */}
                  <Line 
                    type="monotone" 
                    name="Actual Traffic"
                    dataKey="historical" 
                    stroke="#3b82f6" 
                    strokeWidth={3} 
                    dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }} 
                  />
                  
                  {/* ML Predicted Data Line */}
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