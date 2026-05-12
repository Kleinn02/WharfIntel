import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Simulation.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import TopHUD from './TopHUD';

const API_BASE = 'http://localhost:8000/api'; // 🔥 The link to your backend!

const PORT_DATABASE = {
  Local: ["Panabo Wharf", "Davao City Port"],
  National: ["Manila, Philippines", "Cebu Port", "Batangas Terminal"],
  Global: ["Tokyo, Japan", "Busan, South Korea", "Taipei, Taiwan", "Singapore"]
};

const DESTINATION_PRICING = {
  "Panabo Wharf": 500, "Davao City Port": 800,
  "Manila, Philippines": 5000, "Cebu Port": 3500,
  "Batangas Terminal": 4200, "Tokyo, Japan": 25000,
  "Busan, South Korea": 22000, "Taipei, Taiwan": 18000,
  "Singapore": 20000
};

const TACTICAL_BOOSTERS = [
  { id: 'boost_speed', name: 'Eco-Routing Algorithm', cost: 15000, desc: 'Increases final payout by 20%.' },
  { id: 'boost_bribe', name: 'Priority Customs Clearance', cost: 25000, desc: 'Bypass port fees on next arrival.' },
  { id: 'boost_radar', name: 'Advanced Sonar', cost: 50000, desc: 'Reveals exact storm locations.' }
];

const ACADEMY_QUIZ = [
  { q: "What is the primary functional difference between a wharf and a pier?", options: ["A wharf is flush with the shore, a pier extends into the water.", "A wharf is made of wood, a pier is concrete.", "Wharves are for freshwater only.", "Piers are only for recreation."], ans: 0 },
  { q: "What does TEU stand for in shipping logistics?", options: ["Transit Export Unit", "Twenty-foot Equivalent Unit", "Tonnage Estimate Usage", "Total Entry Unloading"], ans: 1 },
  { q: "Which of these is considered a 'Panamax' vessel limitation?", options: ["Must fit through the Suez Canal", "Must carry exactly 5000 TEUs", "Must fit through the Panama Canal locks", "Must be painted a specific color"], ans: 2 }
];

const getBearing = (startLat, startLng, endLat, endLng) => {
  const startLatRad = startLat * (Math.PI / 180);
  const endLatRad = endLat * (Math.PI / 180);
  const dLng = (endLng - startLng) * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(endLatRad);
  const x = Math.cos(startLatRad) * Math.sin(endLatRad) - Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(dLng);
  return ((Math.atan2(y, x) * (180 / Math.PI)) + 360) % 360;
};

const createSimIcon = (status, angle) => {
  let strokeColor = status === 'Arrived' ? '#4fffb0' : (status === 'Sheltered' ? '#f1c40f' : (status === 'Failed' ? '#ef4444' : '#2ecc71'));
  let glowClass = status === 'Sheltered' || status === 'Failed' ? '' : 'neon-glow';

  return L.divIcon({
    className: 'sim-vessel-icon',
    html: `<div class="sim-vessel-wrapper ${glowClass}" style="transform: rotate(${angle}deg);">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M4 22L12 2L20 22L12 16L4 22Z" fill="rgba(46, 204, 113, 0.2)" stroke="${strokeColor}" stroke-width="2" stroke-linejoin="round"/>
        </svg></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
  });
};

const IdleCameraController = ({ activeExports }) => {
  const map = useMap();
  const [isIdle, setIsIdle] = useState(true);
  const timeoutRef = useRef(null);

  useMapEvents({
    movestart: () => { setIsIdle(false); if (timeoutRef.current) clearTimeout(timeoutRef.current); },
    moveend: () => { timeoutRef.current = setTimeout(() => setIsIdle(true), 10000); }
  });

  useEffect(() => {
    if (isIdle && activeExports.length > 0) {
      const latest = activeExports[activeExports.length - 1];
      if (latest.waypoints && latest.waypoints.length >= 2) {
        const bounds = L.latLngBounds([latest.waypoints[0]], [latest.waypoints[latest.waypoints.length - 1]]);
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 1.5 });
      }
    }
  }, [isIdle, activeExports, map]);
  return null; 
};

const CustomSimControls = ({ isLightMode, setIsLightMode }) => {
  const map = useMap();
  return (
    <div className="sim-map-controls">
      <button className="control-btn" onClick={() => map.zoomIn(2)}>+</button>
      <button className="control-btn" onClick={() => map.zoomOut(2)}>−</button>
      <button className="control-btn theme-toggle-btn" onClick={() => setIsLightMode(!isLightMode)}>{isLightMode ? '🌙' : '☀️'}</button>
    </div>
  );
};

const Simulation = () => {
  const navigate = useNavigate();
  const portPosition = [7.284, 125.681];
  const [userId] = useState(() => localStorage.getItem('username') || 'GUEST');

  const [resources, setResources] = useState({ money: 200000, reputation: 50 }); 
  const [activeExports, setActiveExports] = useState([]);
  const [activeBoosters, setActiveBoosters] = useState([]);

  const [simSpeed, setSimSpeed] = useState(1);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showTimeMenu, setShowTimeMenu] = useState(false);
  const [activePanel, setActivePanel] = useState(''); 
  const [chaosEvent, setChaosEvent] = useState(null); 
  const [notification, setNotification] = useState(null);
  const [isLightMode, setIsLightMode] = useState(false); 

  const [showFloatingIncome, setShowFloatingIncome] = useState(false);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);

  const [ticketForm, setTicketForm] = useState({ cargo: '', weight: '', destination: '', scale: 'Global', vesselType: 'Panamax Cargo Ship' });
  const [simTime, setSimTime] = useState(Date.now() + (Number(localStorage.getItem(`wharfsim_time_offset_${userId}`)) || 0));

  // 🔥 THE AMNESIA CURE: Sync with Backend on Load
  const fetchGameState = async () => {
    if (userId === 'GUEST') return;
    try {
      const profRes = await fetch(`${API_BASE}/user/${userId}/profile`);
      if (profRes.ok) {
        const data = await profRes.json();
        setResources({ money: data.money, reputation: data.reputation });
        setActiveBoosters(data.active_boosters || []);
      }
      
      const shipRes = await fetch(`${API_BASE}/ticketing/active?username=${userId}`);
      if (shipRes.ok) {
        const ships = await shipRes.json();
        const mappedShips = ships.map(s => ({
          id: `EXP-${s.id}`,
          rawId: s.id, // Keep the DB ID for API calls
          cargo: s.cargo_name, weight: s.weight_kg, destination: s.destination_country,
          waypoints: s.route_waypoints,
          startTime: new Date(s.departure_time).getTime(),
          duration: s.total_duration_ms,
          status: s.status,
          eventHandled: s.storm_event_handled,
          shelterCount: s.shelter_count,
          stormTime: s.storm_time ? new Date(s.storm_time).getTime() : null
        }));
        setActiveExports(mappedShips);
      }
    } catch (e) {
      console.error("Backend sync failed. Is FastAPI running?", e);
    }
  };

  useEffect(() => {
    fetchGameState();
  }, [userId]);

  // Active Economy Ticker
  useEffect(() => {
    const tickRateMs = 1000;
    let tickCounter = 0; 

    const interval = setInterval(() => {
      const addedTime = tickRateMs * simSpeed;
      setSimTime(prev => prev + addedTime);
      
      const hasActiveShip = activeExports.some(exp => exp.status === 'Outbound');
      if (hasActiveShip) {
        tickCounter++;
        if (tickCounter >= 10) {
          setResources(prev => ({ ...prev, money: prev.money + 20 }));
          tickCounter = 0; 
          if (simSpeed === 1) {
            setShowFloatingIncome(true);
            setTimeout(() => setShowFloatingIncome(false), 900);
          }
        }
      }
    }, tickRateMs);
    return () => clearInterval(interval);
  }, [simSpeed, activeExports]);

  // Warp-Proof RNG Storm Detection
  useEffect(() => {
    activeExports.forEach(ship => {
      if (ship.stormTime && simTime >= ship.stormTime && !ship.eventHandled && ship.status === 'Outbound') {
        setSimSpeed(0); 
        setChaosEvent(ship); 
      }
    });
  }, [simTime, activeExports]);

  // Add this handler function
  const handleShipArrival = async (ship) => {
    // 1. Optimistically lock the ship status so it doesn't trigger multiple times
    setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, status: 'Arrived' } : s));
    
    try {
      // 2. Tell the backend we made it and ask for the payout
      const res = await fetch(`${API_BASE}/ticketing/${ship.rawId}/arrive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userId })
      });
      
      if (res.ok) {
        const data = await res.json();
        // 3. Update our bank account and rep!
        setResources(prev => ({ ...prev, money: data.user_money, reputation: data.reputation }));
        setNotification({ 
          title: 'VOYAGE COMPLETE', 
          message: `Cargo delivered! Bulk Payout: $${data.payout.toLocaleString()}`, 
          type: 'success' 
        });
      }
    } catch (e) {
      console.error("Failed to process arrival payout:", e);
    }
  };

  // 🔥 4. THE ARRIVAL WATCHER
  // This constantly checks if any outbound ship has reached its destination time
  useEffect(() => {
    activeExports.forEach(ship => {
      if (ship.status === 'Outbound') {
        const elapsed = simTime - ship.startTime;
        if (elapsed >= ship.duration) {
          handleShipArrival(ship);
        }
      }
    });
  }, [simTime, activeExports]);

  const calculateNavigation = (ship) => {
    const elapsed = simTime - ship.startTime;
    let progress = Math.min(elapsed / ship.duration, 1);
    const waypoints = ship.waypoints;
    const totalSegments = waypoints.length - 1;
    
    if (progress >= 1 || totalSegments < 1) return { pos: waypoints[waypoints.length - 1], angle: 0 };
    
    const segmentProgress = progress * totalSegments;
    const idx = Math.floor(segmentProgress);
    const nextIdx = idx + 1;
    const lerp = segmentProgress - idx;
    
    const currentPos = [waypoints[idx][0] + (waypoints[nextIdx][0] - waypoints[idx][0]) * lerp, waypoints[idx][1] + (waypoints[nextIdx][1] - waypoints[idx][1]) * lerp];
    return { pos: currentPos, angle: getBearing(currentPos[0], currentPos[1], waypoints[nextIdx][0], waypoints[nextIdx][1]) };
  };

  // 🔥 CONNECT LAUNCH TO BACKEND & FIX FORM RESET
  const handleLaunchRoute = async (e) => {
    e.preventDefault();
    const cost = DESTINATION_PRICING[ticketForm.destination] || 0;
    if (resources.money < cost) {
      return setNotification({ title: 'Launch Failed', message: "❌ Insufficient credits!", type: 'error' });
    }

    try {
      const payload = {
        cargo_name: ticketForm.cargo,
        weight_kg: Number(ticketForm.weight),
        destination_country: ticketForm.destination,
        scale: ticketForm.scale,
        username: userId,
        departure_time: new Date(simTime).toISOString()
      };

      const res = await fetch(`${API_BASE}/ticketing/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchGameState(); // Refresh the ocean map from the DB!
        
        // 🔥 THE FORM RESET YOU ASKED FOR
        setTicketForm({ cargo: '', weight: '', destination: '', scale: 'Global', vesselType: 'Panamax Cargo Ship' });
        setActivePanel(''); 
      }
    } catch (e) {
      setNotification({ title: 'System Error', message: "Failed to connect to Command Center Server.", type: 'error' });
    }
  };

  // 🔥 CONNECT CHAOS RESOLUTION TO BACKEND
  const handleChaosChoice = async (choice) => {
    const ship = chaosEvent;
    if (!ship) return;
    
    try {
      const res = await fetch(`${API_BASE}/ticketing/${ship.rawId}/resolve_event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userId, choice: choice })
      });

      if (res.ok) {
        const data = await res.json();
        await fetchGameState(); // Sync UI with the new DB states
        setChaosEvent(null); 
        setSimSpeed(1);
        
        // Show proper notification based on backend decision
        if (data.status === 'Failed') {
          setNotification({ title: "CONTRACT TERMINATED", message: "FAILED EXPORT: Clients will not tolerate a second delay.", type: "error" });
        } else if (data.status === 'Sheltered') {
          setNotification({ title: "SAFE RETREAT", message: "Emergency fuel penalty applied. Route must be relaunched.", type: "info" });
        } else {
          setNotification({ title: "STORM NAVIGATED", message: "Decision logged. Continuing voyage.", type: "success" });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 🔥 CONNECT BOOSTERS TO BACKEND
  const activateBooster = async (item) => {
    if (resources.money < item.cost) return setNotification({ title: 'Declined', message: "Insufficient Credits.", type: 'error' });
    
    try {
      const res = await fetch(`${API_BASE}/user/${userId}/activate_booster`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_id: item.id })
      });
      if (res.ok) {
        await fetchGameState();
        setNotification({ title: 'Booster Active', message: `⚡ ${item.name} activated!`, type: 'success' });
      }
    } catch (e) {}
  };

  const handleRelaunchRoute = async (shipId, destination, rawId) => {
    try {
      await fetch(`${API_BASE}/ticketing/${rawId}/relaunch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userId, departure_time: new Date(simTime).toISOString() })
      });
      await fetchGameState();
    } catch (e) {}
  };

  const answerQuiz = (selectedIndex) => {
    if (selectedIndex === ACADEMY_QUIZ[quizIndex].ans) setQuizScore(prev => prev + 1);
    if (quizIndex + 1 < ACADEMY_QUIZ.length) {
      setQuizIndex(prev => prev + 1);
    } else {
      setQuizFinished(true);
      const passed = quizScore + (selectedIndex === ACADEMY_QUIZ[quizIndex].ans ? 1 : 0) >= 2;
      if (passed) {
        // You'll want to add a backend endpoint for this later to prevent free money exploits!
        setResources(prev => ({ ...prev, money: prev.money + 50000 }));
        setNotification({ title: 'Academy Passed', message: "🎓 Excellent work Commander! +$50,000 Grant awarded.", type: 'success' });
      } else {
        setNotification({ title: 'Academy Failed', message: "Review your maritime logistics and try again tomorrow.", type: 'error' });
      }
    }
  };

  const togglePanel = (panelName) => { setActivePanel(prev => prev === panelName ? '' : panelName); setShowTimeMenu(false); };
  const currentRouteCost = DESTINATION_PRICING[ticketForm.destination] || 0;
  const isFleetDeployed = activeExports.some(exp => exp.status !== 'Arrived' && exp.status !== 'Failed');

  const getOptions = () => {
    if (ticketForm.scale === 'Local') return PORT_DATABASE.Local;
    if (ticketForm.scale === 'National') return PORT_DATABASE.National;
    return [...PORT_DATABASE.Local, ...PORT_DATABASE.National, ...PORT_DATABASE.Global];
  };

  return (
    <div className={`sim-wrapper ${isLightMode ? 'light-mode' : ''}`}>
      <button className="sim-exit-btn" onClick={() => setShowExitModal(true)}><span className="hamburger-icon">☰</span></button>

      <div style={{position: 'absolute', top: '90px', left: '45%', transform: 'translateX(-50%)', zIndex: 3001}}>
         {showFloatingIncome && <div className="floating-income-text">+$20 / 10sec</div>}
      </div>

      <TopHUD resources={resources} />

      {notification && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className={`custom-notification ${notification.type}`}>
            <div className="notif-header"><span className="notif-icon">{notification.type === 'success' ? '✅' : '⚠️'}</span><h3>{notification.title}</h3></div>
            <p className="notif-message">{notification.message}</p>
            <button className="notif-ack-btn" onClick={() => setNotification(null)}>COMMAND ACKNOWLEDGED</button>
          </div>
        </div>
      )}

      {showExitModal && (
        <div className="modal-overlay">
          <div className="confirmation-modal">
            <h3>Exit Simulation?</h3>
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setShowExitModal(false)}>Cancel</button>
              <button className="btn-confirm-exit" onClick={() => navigate('/dashboard')}>Confirm Exit</button>
            </div>
          </div>
        </div>
      )}

      {chaosEvent && (
        <div className="modal-overlay">
          <div className="chaos-modal">
            <div className="modal-shake-chaos">
              <h1 style={{color: '#ffc107'}} className="warning-title">⚠️ MAYDAY: STORM DETECTED</h1>
              <p style={{color: '#e4a11b', marginBottom: '20px'}}>Export <strong>{chaosEvent.id}</strong> hit a severe storm.</p>
              <div className="storm-odds-bar"><span className="label-fail">80% RISK</span><span className="label-success">20% SUCCESS</span></div>
              <div className="chaos-actions">
                <button className="btn-push" onClick={() => handleChaosChoice('PUSH')}>
                  PUSH THROUGH <span className="btn-subtext">Hazard Bonus or -20% Reputation</span>
                </button>
                <button className="btn-shelter" onClick={() => handleChaosChoice('SHELTER')}>
                  SEEK SHELTER <span className="btn-subtext">Costs $5k. Second shelter = Failed Export.</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activePanel === 'tasks' && (
        <div className="floating-side-panel" style={{width: '380px'}}>
          <div className="panel-header">
            <h3>Maritime Academy</h3>
            <span className="badge docked">Daily Grant: $50k</span>
          </div>
          {!quizFinished ? (
            <div className="quiz-container">
              <div className="quiz-progress">Question {quizIndex + 1} of {ACADEMY_QUIZ.length}</div>
              <h4 className="quiz-question">{ACADEMY_QUIZ[quizIndex].q}</h4>
              <div className="quiz-options">
                {ACADEMY_QUIZ[quizIndex].options.map((opt, i) => (
                  <button key={i} className="quiz-opt-btn" onClick={() => answerQuiz(i)}>{opt}</button>
                ))}
              </div>
            </div>
          ) : (
             <div className="quiz-container" style={{textAlign: 'center'}}>
                <h4>Academy Completed</h4>
                <p>Score: {quizScore} / {ACADEMY_QUIZ.length}</p>
                <button className="buy-btn-mini" onClick={() => {setQuizFinished(false); setQuizIndex(0); setQuizScore(0);}} style={{marginTop: '15px'}}>Retake Exam</button>
             </div>
          )}
        </div>
      )}

      {activePanel === 'upgrades' && (
        <div className="floating-side-panel">
          <div className="panel-header"><h3>Tactical Boosters</h3><span className="vessel-count">Operations</span></div>
          <div className="traffic-list">
            {TACTICAL_BOOSTERS.map(item => {
              const isActive = activeBoosters.some(b => b.id === item.id);
              return (
                <div className={`upgrade-card ${isActive ? 'owned' : ''}`} key={item.id}>
                  <div className="tc-top">
                    <h4>{item.name}</h4>
                    <span className={`badge ${isActive ? 'docked' : 'outbound'}`}>{isActive ? 'ACTIVE' : `$${item.cost.toLocaleString()}`}</span>
                  </div>
                  <p className="upgrade-desc">{item.desc}</p>
                  <div className="upgrade-actions">
                    {!isActive && <button className="buy-btn-mini" disabled={resources.money < item.cost} onClick={() => activateBooster(item)}>Activate</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activePanel === 'export' && (
        <div className="floating-side-panel">
          <div className="panel-header"><h3>Deploy Cargo</h3></div>
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
              <label>Vessel Class</label>
              <select value={ticketForm.vesselType} onChange={e => setTicketForm({...ticketForm, vesselType: e.target.value})} className="modern-select">
                <option value="Panamax Cargo Ship">Panamax Cargo Ship</option>
                <option value="RoRo Ferry">RoRo Ferry</option>
                <option value="LCT (Landing Craft)">LCT (Landing Craft)</option>
              </select>
            </div>

            <div className="form-group">
              <label>Destination Port</label>
              <input list="filtered-destinations" type="text" required placeholder="Select destination..." value={ticketForm.destination} onChange={e => setTicketForm({...ticketForm, destination: e.target.value})} className="modern-input" />
              <datalist id="filtered-destinations">{getOptions().map(port => <option key={port} value={port} />)}</datalist>
            </div>
            
            <div className="cost-tag">Route Cost: ${currentRouteCost > 0 ? currentRouteCost.toLocaleString() : "0"}</div>
            
            <button type="submit" className={`btn-launch-sim ${isFleetDeployed ? 'state-deployed' : (resources.money < currentRouteCost ? 'state-broke' : '')}`} disabled={resources.money < currentRouteCost || currentRouteCost === 0 || isFleetDeployed}>
              {isFleetDeployed ? "⏳ FLEET EN ROUTE (AWAIT/WARP)" : "Launch Route"}
            </button>
          </form>
        </div>
      )}

      <div className="sim-bottom-bar">
        <button className={`action-btn ${activePanel === 'upgrades' ? 'active-green' : ''}`} onClick={() => togglePanel('upgrades')}>🚀 Boosters</button>
        <button className={`action-btn ${activePanel === 'export' ? 'active-green' : ''}`} onClick={() => togglePanel('export')}>📦 Export</button>
        <button className={`action-btn ${activePanel === 'tasks' ? 'active-green' : ''}`} onClick={() => togglePanel('tasks')}>📚 Tasks</button>
        
        <div className="time-popover-wrapper">
          {showTimeMenu && (
            <div className="time-menu-dropdown">
              <button className={`time-opt-btn ${simSpeed === 1 ? 'selected' : ''}`} onClick={() => { setSimSpeed(1); setShowTimeMenu(false); }}>▶ Normal</button>
              <button className={`time-opt-btn ${simSpeed === 3600 ? 'selected' : ''}`} onClick={() => { setSimSpeed(3600); setShowTimeMenu(false); }}>⏩ Fast</button>
              <button className={`time-opt-btn ${simSpeed === 21600 ? 'selected' : ''}`} onClick={() => { setSimSpeed(21600); setShowTimeMenu(false); }}>⏭ Warp</button>
            </div>
          )}
          <button className={`action-btn time-toggle ${showTimeMenu ? 'active-green' : ''}`} onClick={() => { setShowTimeMenu(!showTimeMenu); setActivePanel(''); }}>
            ⏱️ Time: {simSpeed}x {showTimeMenu ? '▼' : '▲'}
          </button>
        </div>
      </div>

      <main className="sim-map-fullscreen">
        <MapContainer center={portPosition} zoom={14} className="leaflet-container" zoomControl={false} zoomSnap={2} zoomDelta={2}>
          <TileLayer url={isLightMode ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"} attribution='&copy; CARTO' />
          <IdleCameraController activeExports={activeExports} />
          <CustomSimControls isLightMode={isLightMode} setIsLightMode={setIsLightMode} />

          {activeExports.map((exp) => {
            const elapsed = simTime - exp.startTime;
            let progress = Math.min(elapsed / exp.duration, 1);
            let currentStatus = exp.status;
            if (progress >= 1 && currentStatus !== 'Failed') currentStatus = 'Arrived';
            
            const isHalted = currentStatus === 'Sheltered' || currentStatus === 'Failed';
            const nav = isHalted ? { pos: exp.waypoints[0], angle: 0 } : calculateNavigation(exp);

            return (
              <React.Fragment key={exp.id}>
                {/* 🔥 THE DASHED ROUTE LINE YOU WANTED */}
                {exp.waypoints && exp.waypoints.length > 0 && (
                  <Polyline 
                    positions={exp.waypoints} 
                    pathOptions={{ color: '#2ecc71', dashArray: '5, 10', weight: 2, opacity: 0.6 }} 
                  />
                )}

                <Marker position={nav.pos} icon={createSimIcon(currentStatus, nav.angle)}>
                  <Popup className={`custom-popup ${isLightMode ? 'light-popup' : 'dark-popup'}`}>
                    <div className="popup-header">
                      <strong>{exp.id}</strong><span className={`badge ${currentStatus.toLowerCase()}`}>{currentStatus}</span>
                    </div>
                    <div className="popup-body">
                      {currentStatus === 'Sheltered' ? (
                        <div className="relaunch-container">
                          <p className="relaunch-warning-text">STRIKE 1: SHELTERED</p>
                          <button className="btn-launch-sim relaunch-btn" onClick={() => handleRelaunchRoute(exp.id, exp.destination, exp.rawId)}>Relaunch</button>
                        </div>
                      ) : currentStatus === 'Failed' ? (
                        <p style={{color: '#ef4444', fontWeight: 'bold'}}>CONTRACT TERMINATED</p>
                      ) : (
                        <p>Progress: {(progress * 100).toFixed(1)}%</p>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>
      </main>
    </div>
  );
};
export default Simulation;