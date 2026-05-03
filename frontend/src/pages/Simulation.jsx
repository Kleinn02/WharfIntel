import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Simulation.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import TopHUD from './TopHUD';
import { INFRASTRUCTURE } from './InfrastructureData';

const PORT_DATABASE = {
  Local: ["Panabo Wharf", "Davao City Port"],
  National: ["Manila, Philippines", "Cebu Port", "Batangas Terminal"],
  Global: ["Tokyo, Japan", "Busan, South Korea", "Taipei, Taiwan", "Singapore"]
};

// 💰 DYNAMIC PRICING DATABASE
const DESTINATION_PRICING = {
  "Panabo Wharf": 500,
  "Davao City Port": 800,
  "Manila, Philippines": 5000,
  "Cebu Port": 3500,
  "Batangas Terminal": 4200,
  "Tokyo, Japan": 25000,
  "Busan, South Korea": 22000,
  "Taipei, Taiwan": 18000,
  "Singapore": 20000
};

// 🌪️ ENVIRONMENTAL DATA (Chaos Factor)
const STORM_ZONES = [
  { id: 'STORM_DELTA', lat: 13.5, lng: 127.5, radius: 250000, severity: "High" },
  { id: 'STORM_ECHO', lat: 4.5, lng: 110.5, radius: 200000, severity: "Medium" }
];

const createSimIcon = (status) => {
  let colorClass = 'status-default';
  if (status === 'Arrived') colorClass = 'status-docked';
  if (status === 'Outbound') colorClass = 'status-outbound';
  if (status === 'Sheltered') colorClass = 'status-sheltered'; 

  const animationClass = status === 'Sheltered' ? 'paused' : '';

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

const CameraController = ({ activeExports }) => {
  const map = useMap();
  useEffect(() => {
    if (activeExports.length > 0) {
      const latestExport = activeExports[activeExports.length - 1];
      const waypoints = latestExport.waypoints;
      if (waypoints && waypoints.length >= 2) {
        const startNode = waypoints[0];
        const endNode = waypoints[waypoints.length - 1];
        const bounds = L.latLngBounds([startNode[0], startNode[1]], [endNode[0], endNode[1]]);
        map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 1.5 });
      }
    }
  }, [activeExports, map]);
  return null; 
};

const Simulation = () => {
  const navigate = useNavigate();
  const portPosition = [7.284, 125.681];
  
  const [userId, setUserId] = useState(() => {
    const saved = localStorage.getItem('username');
    if (saved) return saved;
    const prompted = prompt("Terminal Locked: Enter your Commander ID (Username) to sync simulation:");
    if (prompted) {
       localStorage.setItem('username', prompted);
       return prompted;
    }
    return 'GUEST_COMMANDER_ALPHA';
  });

  // --- Core Persistent State ---
  const [resources, setResources] = useState(null); 
  const [activeExports, setActiveExports] = useState([]);
  const [ownedBuildings, setOwnedBuildings] = useState([]);
  
  // --- UI & Interaction State ---
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [simSpeed, setSimSpeed] = useState(1);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [activePanel, setActivePanel] = useState(''); 
  const [chaosEvent, setChaosEvent] = useState(null); 
  const [chaosTimer, setChaosTimer] = useState(15); 
  const [ticketForm, setTicketForm] = useState({ cargo: '', weight: '', destination: '', scale: 'Global' });

  // --- MEMORY: TIME OFFSET ---
  const [simTimeOffset, setSimTimeOffset] = useState(() => {
    return Number(localStorage.getItem(`wharfsim_time_offset_${userId}`)) || 0;
  });
  const [simTime, setSimTime] = useState(Date.now() + simTimeOffset);

  // --- 1. PERSISTENCE LAYER: Fetch State on Mount ---
  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const profileRes = await fetch(`http://127.0.0.1:8000/api/user/${userId}/profile`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          setResources({ money: profileData.money, reputation: profileData.reputation, passiveRate: profileData.passive_rate });
          setOwnedBuildings(profileData.owned_buildings);
        }
      } catch (err) { console.error("Profile fetch fail:", err); }
    };

    const fetchExportsData = async () => {
      try {
        const exportRes = await fetch(`http://127.0.0.1:8000/api/ticketing/active?username=${userId}`);
        if (exportRes.ok) {
          const dbExports = await exportRes.json();
          const recovered = dbExports.map(dbExp => {
            const safeWaypoints = dbExp.route_waypoints && dbExp.route_waypoints.length > 0 
              ? dbExp.route_waypoints : [[7.284, 125.681], [14.599, 120.984]];
            return {
              id: `EXP-DB-${dbExp.id}`,
              cargo: dbExp.cargo_name,
              weight: dbExp.weight_kg,
              destination: dbExp.destination_country,
              waypoints: safeWaypoints,
              startTime: new Date(dbExp.departure_time).getTime(),
              duration: 432000000, 
              status: dbExp.status === 'Preparing' ? 'Outbound' : dbExp.status,
              eventHandled: dbExp.storm_event_handled || false, 
              originalDepartureTime: dbExp.departure_time 
            };
          });
          setActiveExports(recovered);
        }
      } catch (err) { console.error("Exports fetch fail:", err); }
    };

    fetchProfileData();
    fetchExportsData();

    const pollInterval = setInterval(fetchProfileData, 10000); 
    return () => clearInterval(pollInterval);
  }, [userId]);

  // --- 2. Simulation Engine (WITH MEMORY) ---
  useEffect(() => {
    const tickRateMs = 1000;
    const interval = setInterval(() => {
      const addedTime = tickRateMs * simSpeed;
      
      setSimTime(prev => prev + addedTime);

      // If warping, save the "bonus" time to localStorage so it survives a reload
      if (simSpeed > 1) {
        setSimTimeOffset(prev => {
          const newOffset = prev + (addedTime - tickRateMs);
          localStorage.setItem(`wharfsim_time_offset_${userId}`, newOffset);
          return newOffset;
        });
      }
    }, tickRateMs);
    return () => clearInterval(interval);
  }, [simSpeed, userId]);

  // --- 3. Live Position Calculation Helper ---
  const calculateCurrentPos = (ship) => {
    const elapsed = simTime - ship.startTime;
    let progress = Math.min(elapsed / ship.duration, 1);
    const waypoints = ship.waypoints;
    const totalSegments = waypoints.length - 1;
    
    if (progress >= 1 || totalSegments < 1) {
      return waypoints[waypoints.length - 1];
    }
    
    const segmentProgress = progress * totalSegments;
    const idx = Math.floor(segmentProgress);
    const nextIdx = idx + 1;
    const lerp = segmentProgress - idx;
    const start = waypoints[idx];
    const end = waypoints[nextIdx];
    
    return [
      start[0] + (end[0] - start[0]) * lerp, 
      start[1] + (end[1] - start[1]) * lerp
    ];
  };

  // --- 4. Storm Detection Engine ---
  useEffect(() => {
    if (!resources) return; 

    activeExports.forEach(ship => {
      if (ship.status === 'Arrived' || ship.status === 'Sheltered' || ship.eventHandled) return;

      const currentPos = calculateCurrentPos(ship);
      
      STORM_ZONES.forEach(storm => {
        const dist = L.latLng(currentPos).distanceTo(L.latLng(storm.lat, storm.lng));
        if (dist < storm.radius && !chaosEvent) {
          setSimSpeed(0); 
          setChaosEvent(ship); 
        }
      });
    });
  }, [simTime, activeExports, chaosEvent, resources]);

  // --- 5. Storm Timer Logic ---
  useEffect(() => {
    let timerInterval = null;
    if (chaosEvent) {
      timerInterval = setInterval(() => {
        setChaosTimer(prev => prev - 1);
      }, 1000);
    }

    if (chaosTimer <= 0 && chaosEvent) {
      clearInterval(timerInterval);
      handleChaosChoice('SHELTER'); 
    }

    return () => clearInterval(timerInterval);
  }, [chaosEvent, chaosTimer]);

  // --- Handlers ---
  const handleExitSimulation = () => {
    setShowExitModal(false);
    navigate('/dashboard'); 
  };

  const buyInfrastructure = async (item) => {
    if (resources.money < item.cost) {
      alert("⚠️ Insufficient Credits! Fund port upgrades via persistent exports.");
      return;
    }

    try {
      const response = await fetch(`http://127.0.0.1:8000/api/user/${userId}/buy_infrastructure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id })
      });
      if (response.ok) {
        const newResources = await response.json();
        setResources(prev => ({
          ...prev, 
          money: newResources.money,
          passiveRate: newResources.passive_rate
        }));
        setOwnedBuildings([...ownedBuildings, item.id]);
        alert(`🎊 ${item.name} constructed persistently! Passive income increased.`);
      }
    } catch (err) { console.error(" buy_infrastructure fail:", err); }
  };

  const handleLaunchRoute = async (e) => {
    e.preventDefault();
    const cost = DESTINATION_PRICING[ticketForm.destination] || 0;
    
    if (resources.money < cost) {
      alert("❌ Insufficient persistent credits! Try a local route or save up.");
      return;
    }

    try {
      const response = await fetch('http://127.0.0.1:8000/api/ticketing/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cargo_name: ticketForm.cargo,
          weight_kg: Number(ticketForm.weight),
          destination_country: ticketForm.destination,
          scale: ticketForm.scale,
          username: userId 
        })
      });
      if (response.ok) {
        const newResources = await response.json();
        setResources(prev => ({ ...prev, money: newResources.user_money }));
        setActivePanel(''); 
        setTicketForm({ cargo: '', weight: '', destination: '', scale: 'Global' });
      }
    } catch (err) { console.error("Ship creation failure:", err); }
  };

  const handleChaosChoice = async (choice) => {
    const ship = chaosEvent;
    if (!ship) return;
    
    let moneyChange = 0;
    let repChange = 0;
    let message = "";
    
    if (choice === 'PUSH') {
      const success = Math.random() < 0.2; 
      if (success) {
        moneyChange = 15000;
        repChange = 10;
        message = "SUCCESS! Your crew persistently navigated the storm. Hazard Bonus awarded!";
      } else {
        moneyChange = -30000;
        repChange = -15;
        message = "DISASTER! Hull breach detected. Persistently deducted repair costs.";
      }
    } else {
      moneyChange = -5000;
      message = "SAFE PLAY. RETREATING TO ORIGIN PORT. Emergency fuel penalty applied.";
      setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, needsRelaunch: true, status: 'Sheltered' } : s));
    }

    setResources(prev => ({ 
      ...prev, 
      money: prev.money + moneyChange, 
      reputation: Math.max(0, Math.min(100, prev.reputation + repChange)) 
    }));
    
    setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, eventHandled: true } : s));
    
    alert(message);
    setChaosEvent(null);
    setChaosTimer(15);
    setSimSpeed(1); 
  };

  const handleRelaunchRoute = async (shipId, destination) => {
    const relaunchCost = (DESTINATION_PRICING[destination] || 0) / 2;
    if (resources.money < relaunchCost) {
      alert("❌ Insufficient credits to relaunch persistently!");
      return;
    }
    
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/ticketing/${shipId.split('-')[2]}/relaunch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userId, cost: relaunchCost })
      });
      if (response.ok) {
        const result = await response.json();
        setResources(prev => ({ ...prev, money: result.user_money }));
        // Ensure to adjust the startTime so the local simTimeOffset doesn't instantly push it forward again
        const newStartTime = new Date(result.departure_time).getTime() + simTimeOffset;
        setActiveExports(prev => prev.map(s => s.id === shipId ? { ...s, needsRelaunch: false, status: 'Outbound', startTime: newStartTime } : s));
      }
    } catch (err) { console.error("relaunch failure:", err); }
  };

  const togglePanel = (panelName) => {
    setActivePanel(prev => prev === panelName ? '' : panelName);
    setShowTimeMenu(false); 
  };

  const getOptions = () => {
    if (ticketForm.scale === 'Local') return PORT_DATABASE.Local;
    if (ticketForm.scale === 'National') return PORT_DATABASE.National;
    return [...PORT_DATABASE.Local, ...PORT_DATABASE.National, ...PORT_DATABASE.Global];
  };

  if (!resources) {
    return (
      <div className="sim-loading-view" style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#0a0c10', color: '#fff', fontFamily: 'monospace' }}>
        <h2>Wharf<span style={{color: '#2ecc71'}}>Sim</span></h2>
        <p>Loading authoritative commander data for {userId}...</p>
      </div>
    );
  }

  const currentRouteCost = DESTINATION_PRICING[ticketForm.destination] || 0;

  return (
    <div className="sim-wrapper">
      
      {/* TOP-LEFT EXIT HAMBURGER */}
      <button className="sim-exit-btn" onClick={() => setShowExitModal(true)}>
        <span className="hamburger-icon">☰</span>
      </button>

      <TopHUD resources={resources} />

      {/* EXIT CONFIRMATION MODAL */}
      {showExitModal && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <h3>Exit Simulation?</h3>
            <p>Your port progress is persistently saved.</p>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowExitModal(false)}>Cancel</button>
              <button className="btn-confirm-exit" onClick={handleExitSimulation}>Confirm Exit</button>
            </div>
          </div>
        </div>
      )}

      {/* CHAOS EVENT MODAL (THE STORM DETECTED) */}
      {chaosEvent && (
        <div className="modal-overlay">
          <div className="chaos-modal">
            <div className="modal-shake-chaos">
              <h1 className="warning-title" style={{color: '#f1c40f', marginBottom: '10px'}}>⚠️ MAYDAY: STORM DETECTED</h1>
              <p style={{color: '#fff', marginBottom: '20px'}}>Persistent Export <strong>{chaosEvent.id}</strong> has entered a high-risk storm zone.</p>
              
              <div className="storm-odds-bar" style={{display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#94a3b8', marginBottom: '30px'}}>
                <span className="label-fail">80% RISK</span>
                <span className="label-success">20% SUCCESS</span>
              </div>
              
              <div className="chaos-actions">
                <button className="btn-push" onClick={() => handleChaosChoice('PUSH')}>
                  PUSH THROUGH (Risk 80% Failure)
                  <span style={{fontSize: '12px', fontWeight: 'normal', marginTop: '5px', display: 'block'}}>Hazard Bonus or Heavy Repairs ($30k)</span>
                </button>
                <button className="btn-shelter" onClick={() => handleChaosChoice('SHELTER')}>
                  SEEK SHELTER (Safe Retreat)
                  <span style={{fontSize: '12px', fontWeight: 'normal', marginTop: '5px', display: 'block'}}>Costs $5k, Resets Progress persistently</span>
                </button>
              </div>
              
              <div className="timer-display-chaos" style={{marginTop: '25px', color: '#f1c40f', fontWeight: 'bold', fontSize: '18px'}}>
                DEFAULT: SEEK SHELTER in <span className="timer-count">{chaosTimer}s</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RIGHT-SIDE PANEL: PORT UPGRADES */}
      {activePanel === 'upgrades' && (
        <div className="floating-side-panel">
          <div className="panel-header">
            <h3>Infrastructure Hub</h3>
            <span className="vessel-count">{ownedBuildings.length} Built</span>
          </div>
          <div className="traffic-list">
            {INFRASTRUCTURE.map(item => {
              const isOwned = ownedBuildings.includes(item.id);
              return (
                <div className={`upgrade-card ${isOwned ? 'owned' : ''}`} key={item.id}>
                  <div className="tc-top">
                    <h4>{item.name}</h4>
                    <span className={`badge ${isOwned ? 'docked' : 'outbound'}`}>
                      {isOwned ? 'BUILT' : `$${item.cost.toLocaleString()}`}
                    </span>
                  </div>
                  <p className="upgrade-desc">{item.description}</p>
                  <div className="upgrade-actions">
                    <span className="income-tag">+{item.income}/tick</span>
                    {!isOwned && (
                      <button className="buy-btn-mini" disabled={resources.money < item.cost} onClick={() => buyInfrastructure(item)}>
                        Buy Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* RIGHT-SIDE PANEL: INITIATE EXPORT */}
      {activePanel === 'export' && (
        <div className="floating-side-panel">
          <div className="panel-header">
            <h3>Deploy Cargo</h3>
          </div>
          <form onSubmit={handleLaunchRoute} className="sim-export-form">
            <div className="form-group">
              <label>Cargo Type</label>
              <input type="text" required placeholder="e.g., Cavendish Bananas" value={ticketForm.cargo} onChange={e => setTicketForm({...ticketForm, cargo: e.target.value})} className="modern-input" />
            </div>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Weight (kg)</label>
                <input type="number" required placeholder="5000" value={ticketForm.weight} onChange={e => setTicketForm({...ticketForm, weight: e.target.value})} className="modern-input" />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Scale</label>
                <select value={ticketForm.scale} onChange={e => setTicketForm({...ticketForm, scale: e.target.value, destination: ''})} className="modern-select">
                  <option value="Local">Local</option>
                  <option value="National">National</option>
                  <option value="Global">Global</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>Destination Port</label>
              <input list="filtered-destinations" type="text" required placeholder="Select destination..." value={ticketForm.destination} onChange={e => setTicketForm({...ticketForm, destination: e.target.value})} className="modern-input" />
              <datalist id="filtered-destinations">{getOptions().map(port => <option key={port} value={port} />)}</datalist>
            </div>
            
            <div className="cost-tag" style={{ marginTop: '15px' }}>
              Route Cost: ${currentRouteCost > 0 ? currentRouteCost.toLocaleString() : "0"}
            </div>

            <button type="submit" className="btn-launch-sim" disabled={resources.money < currentRouteCost || currentRouteCost === 0}>
              Launch Route
            </button>
          </form>
        </div>
      )}

      {/* BOTTOM ACTION BAR */}
      <div className="sim-bottom-bar">
        
        <button 
          className={`action-btn ${activePanel === 'upgrades' ? 'active-green' : ''}`} 
          onClick={() => togglePanel('upgrades')}
        >
          🏗️ Port Upgrades
        </button>

        <button 
          className={`action-btn ${activePanel === 'export' ? 'active-green' : ''}`} 
          onClick={() => togglePanel('export')}
        >
          📦 Initiate Export
        </button>

        {/* UPDATED TIME POPOVER CONTROLS */}
        <div className="time-popover-wrapper">
          {showTimeMenu && (
            <div className="time-menu-dropdown">
              <button className={`time-opt-btn ${simSpeed === 1 ? 'selected' : ''}`} onClick={() => { setSimSpeed(1); setShowTimeMenu(false); }}>▶ Normal</button>
              <button className={`time-opt-btn ${simSpeed === 3600 ? 'selected' : ''}`} onClick={() => { setSimSpeed(3600); setShowTimeMenu(false); }}>⏩ Fast (3600x)</button>
              <button className={`time-opt-btn ${simSpeed === 21600 ? 'selected' : ''}`} onClick={() => { setSimSpeed(21600); setShowTimeMenu(false); }}>⏭ Warp (21600x)</button>
            </div>
          )}
          <button className={`action-btn time-toggle ${showTimeMenu ? 'active-green' : ''}`} onClick={() => { setShowTimeMenu(!showTimeMenu); setActivePanel(''); }}>
            ⏱️ Time: {simSpeed}x {showTimeMenu ? '▼' : '▲'}
          </button>
        </div>

        <button className="action-btn disabled">
          ☁️ Environment
        </button>
        
      </div>

      {/* FULLSCREEN MAP */}
      <main className="sim-map-fullscreen">
        <MapContainer center={portPosition} zoom={14} className="leaflet-container" zoomControl={false}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
          <CameraController activeExports={activeExports} />
          
          {STORM_ZONES.map(storm => (
            <Circle 
              key={storm.id}
              center={[storm.lat, storm.lng]}
              radius={storm.radius}
              pathOptions={{ color: '#f1c40f', fillColor: '#f1c40f', fillOpacity: 0.15, dashArray: '10, 10' }}
            />
          ))}

          {activeExports.map((exp) => {
            const elapsed = simTime - exp.startTime;
            let progress = elapsed / exp.duration;
            if (progress > 1) progress = 1; 
            
            const currentStatus = exp.needsRelaunch ? 'Sheltered' : (progress >= 1 ? 'Arrived' : 'Outbound');
            const currentPos = exp.needsRelaunch ? exp.waypoints[0] : calculateCurrentPos(exp);

            return (
              <Marker key={exp.id} position={currentPos} icon={createSimIcon(currentStatus)}>
                <Popup className="custom-popup">
                  <div className="popup-header">
                    <strong>{exp.id}</strong>
                    <span className={`badge ${currentStatus.toLowerCase()}`}>{currentStatus}</span>
                  </div>
                  <div className="popup-body">
                    <p>Cargo: {exp.weight}kg</p>
                    <p>Dest: {exp.destination}</p>
                    {currentStatus === 'Sheltered' ? (
                      <div className="relaunch-container">
                        <p style={{ color: '#f1c40f', fontSize: '11px', fontWeight: 'bold' }}>PROGRESS RESET DUE TO STORM</p>
                        <button 
                          className="btn-launch-sim" 
                          style={{ margin: '10px 0', fontSize: '12px', padding: '8px' }}
                          onClick={() => handleRelaunchRoute(exp.id, exp.destination)}
                          disabled={resources.money < (DESTINATION_PRICING[exp.destination] / 2)}
                        >
                          Relaunch (${(DESTINATION_PRICING[exp.destination] / 2).toLocaleString()})
                        </button>
                      </div>
                    ) : (
                      <p>Progress: {(progress * 100).toFixed(1)}%</p>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
          
          {activeExports.map((exp) => (
             <Polyline key={`route-${exp.id}`} positions={exp.waypoints} pathOptions={{ color: '#2ecc71', dashArray: '5, 10', weight: 2, opacity: 0.5 }} />
          ))}
        </MapContainer>
      </main>
    </div>
  );
};

export default Simulation;