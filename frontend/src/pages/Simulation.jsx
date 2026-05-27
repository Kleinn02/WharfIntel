import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Simulation.css';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import TopHUD from './TopHUD';

const API_BASE = 'http://localhost:8000/api';

const PORT_DATABASE = {
  Local: ["Panabo Wharf", "Davao City Port"],
  National: ["Manila, Philippines", "Cebu Port", "Batangas Terminal"],
  Global: [
    "Singapore", "Ho Chi Minh, Vietnam", "Bangkok, Thailand", 
    "Jakarta, Indonesia", "Muara, Brunei", "Yangon, Myanmar", "Dili, Timor-Leste"
  ]
};

const DESTINATION_PRICING = {
  "Panabo Wharf": 500, "Davao City Port": 800,
  "Manila, Philippines": 5000, "Cebu Port": 3500, "Batangas Terminal": 4200,
  "Singapore": 20000, "Ho Chi Minh, Vietnam": 12000, "Bangkok, Thailand": 15000, 
  "Jakarta, Indonesia": 19000, "Muara, Brunei": 11000, "Yangon, Myanmar": 17000, "Dili, Timor-Leste": 6000
};

const PANABO_HUBS = [
  { id: 1, pos: [7.300, 125.650], name: 'Panabo North Facility', type: 'WAREHOUSE', stat: 'Storage: 88%', status: 'Active' },
  { id: 2, pos: [7.285, 125.660], name: 'Central Cold Storage', type: 'CLIMATE CONTROL', stat: 'Temp: -4.2°C', status: 'Optimal' },
  { id: 3, pos: [7.270, 125.680], name: 'Export Processing Zone', type: 'CUSTOMS', stat: 'Queue: 3 Trucks', status: 'Busy' },
];

const getBearing = (startLat, startLng, endLat, endLng) => {
  const startLatRad = startLat * (Math.PI / 180);
  const endLatRad = endLat * (Math.PI / 180);
  const dLng = (endLng - startLng) * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(endLatRad);
  const x = Math.cos(startLatRad) * Math.sin(endLatRad) - Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(dLng);
  return ((Math.atan2(y, x) * (180 / Math.PI)) + 360) % 360;
};

const createHouseIcon = () => {
  return L.divIcon({
    className: 'hub-house-icon',
    html: `<div style="background: #2ecc71; border-radius: 50%; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(46,204,113,0.4); border: 2px solid white;">
             <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
           </div>`,
    iconSize: [30, 30], iconAnchor: [15, 15]
  });
};

const createTransportIcon = (type, status, angle, health) => {
  let color = 'var(--accent-blue)'; 
  if (type === 'vessel') color = '#3498db'; 
  if (health < 70 || status === 'Failed') color = '#e74c3c'; 
  
  const truckSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${color}" stroke="#111" stroke-width="1"><path d="M12 2L22 20L12 17L2 20L12 2Z"/></svg>`;
  const vesselSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M4 22L12 2L20 22L12 16L4 22Z" fill="rgba(52, 152, 219, 0.2)"/></svg>`;

  return L.divIcon({
    className: 'sim-vessel-icon',
    html: `<div class="sim-vessel-wrapper" style="transform: rotate(${angle}deg); filter: drop-shadow(0px 0px 4px ${color});">
             ${type === 'truck' ? truckSvg : vesselSvg}
           </div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
  });
};

const createDotIcon = () => {
  return L.divIcon({
    className: 'waypoint-dot',
    html: `<div style="width: 8px; height: 8px; background: white; border-radius: 50%; box-shadow: 0 0 5px rgba(255,255,255,0.8);"></div>`,
    iconSize: [8, 8], iconAnchor: [4, 4]
  });
};

// --- ICON COMPONENTS ---
const LogoutIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', margin: 0 }}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const SunIcon = () => (
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', margin: 0 }}>
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
  <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '20px', height: '20px', margin: 0 }}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

// 🔥 ZOOM & LIGHT MODE CONTROLS RESTORED WITH SVGS
const CustomSimControls = ({ isLightMode, setIsLightMode }) => {
  const map = useMap();
  return (
    <div className="sim-map-controls">
      <button className="control-btn" onClick={() => map.zoomIn(3)}>+</button>
      <button className="control-btn" onClick={() => map.zoomOut(3)}>−</button>
      <button className="control-btn theme-toggle-btn" style={{ padding: 0 }} onClick={() => setIsLightMode(!isLightMode)}>
        {isLightMode ? <MoonIcon /> : <SunIcon />}
      </button>
    </div>
  );
};

const MapEventsTracker = ({ setZoomLevel }) => {
  const map = useMapEvents({
    zoomend: () => setZoomLevel(map.getZoom()),
  });
  return null;
};

const MapFlyToHandler = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target) {
      map.flyTo(target.pos, 16, { animate: true, duration: 1.5 });
    }
  }, [target, map]);
  return null;
};

const IdleCameraController = ({ activeExports }) => {
  const map = useMap();
  const [isIdle, setIsIdle] = useState(true);
  const timeoutRef = useRef(null);

  useMapEvents({
    dragstart: () => { setIsIdle(false); if (timeoutRef.current) clearTimeout(timeoutRef.current); },
    zoomstart: () => { setIsIdle(false); if (timeoutRef.current) clearTimeout(timeoutRef.current); },
    moveend: () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setIsIdle(true), 5000); 
    }
  });

  useEffect(() => {
    setIsIdle(true);
  }, [activeExports.length]);

  useEffect(() => {
    if (isIdle && activeExports.length > 0) {
      const latest = activeExports[activeExports.length - 1];
      if (latest.waypoints && latest.waypoints.length >= 2) {
        const bounds = L.latLngBounds(latest.waypoints); 
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], animate: true, duration: 1.5 }); 
        }
      }
    }
  }, [isIdle, activeExports, map]);
  
  return null; 
};

const Simulation = () => {
  const navigate = useNavigate();
  const portPosition = [7.284, 125.681]; 
  const [userId] = useState(() => localStorage.getItem('username') || 'GUEST');

  // --- STATE ---
  const [resources, setResources] = useState({ money: 200000, reputation: 50 }); 
  const [activeExports, setActiveExports] = useState([]);
  const [showExitModal, setShowExitModal] = useState(false);
  const [activePanel, setActivePanel] = useState(''); 
  const [isLightMode, setIsLightMode] = useState(false); 
  const [zoomLevel, setZoomLevel] = useState(14); 
  const [notification, setNotification] = useState(null);
  const [showFloatingIncome, setShowFloatingIncome] = useState(false);
  const [chaosEvent, setChaosEvent] = useState(null); 
  const [chaosTimer, setChaosTimer] = useState(15); 
  const [ticketForm, setTicketForm] = useState({ cargo: '', weight: '', destination: '', type: 'Perishable (Food)', scale: 'Global' });
  const [selectedTrackingId, setSelectedTrackingId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);

  // 🔥 THE NEW TERMINAL ENGINE (Now safely inside Simulation!)
  const [terminalLogs, setTerminalLogs] = useState([
    { time: new Date().toLocaleTimeString(), msg: "> SYSTEM_INIT: WharfIntel Node Alpha Online.", type: 'normal' },
    { time: new Date().toLocaleTimeString(), msg: "> RADAR: South East Asia Sector Locked.", type: 'highlight' }
  ]);

  const addTerminalLog = (msg, type = 'normal') => {
    setTerminalLogs(prev => {
      const newLogs = [...prev, { time: new Date().toLocaleTimeString(), msg, type }];
      return newLogs.length > 6 ? newLogs.slice(newLogs.length - 6) : newLogs; // Keep last 6 lines
    });
  };

  // 🔥 THE MAP BOUNDING BOX (Locks to SEA)
  const SEA_BOUNDS = [
    [-15.0, 90.0], 
    [30.0, 150.0]  
  ];

  const [simTime, setSimTime] = useState(() => {
    const savedOffset = Number(localStorage.getItem('wharf_time_offset')) || 0;
    return Date.now() + savedOffset;
  });

  // --- HELPER FUNCTIONS ---
  const changeShipSpeed = (shipId, newSpeed) => {
    setActiveExports(prev => {
      const updated = prev.map(s => s.id === shipId ? { ...s, currentSpeed: newSpeed } : s);
      localStorage.setItem(`speed_${shipId}`, newSpeed);
      return updated;
    });
  };

  const getOptions = () => {
    const activeDestinations = activeExports
      .filter(s => s.status !== 'Arrived' && s.status !== 'Failed')
      .map(s => s.destination);
    
    let options = PORT_DATABASE.Global;
    if (ticketForm.scale === 'Local') options = PORT_DATABASE.Local;
    if (ticketForm.scale === 'National') options = PORT_DATABASE.National;
    
    return options.filter(port => !activeDestinations.includes(port));
  };

  const formatShopeeTime = (ms, type) => {
    const d = new Date(ms);
    if (type === 'date') return `${d.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getMonth()]}`;
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  const calculatePhase = (progress) => {
    if (progress < 0.20) return { type: 'truck', label: 'Origin Hub (Truck)', step: 1 };
    if (progress < 0.80) return { type: 'vessel', label: 'Ocean Transit (Vessel)', step: 2 };
    if (progress < 1.0) return { type: 'truck', label: 'Out for Delivery (Truck)', step: 3 };
    return { type: 'truck', label: 'Delivered', step: 4 };
  };

  const calculateNavigation = (ship) => {
    const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
    const elapsed = shipPersonalTime - ship.startTime
    const waypoints = ship.waypoints || [];
    const totalSegments = Math.max(waypoints.length - 1, 1);
    
    const isHalted = ship.status === 'Sheltered' || ship.status === 'Failed';
    let progress = isHalted ? 0 : Math.min(elapsed / ship.duration, 1);
    
    if (progress >= 1 || waypoints.length < 2) {
      return { pos: waypoints[waypoints.length - 1] || [0,0], angle: 0, phase: calculatePhase(1), health: ship.cargoType === 'Perishable (Food)' ? 60 : 100 };
    }
    
    const segmentProgress = progress * totalSegments;
    const idx = Math.floor(segmentProgress);
    const nextIdx = idx + 1;
    const lerp = segmentProgress - idx;
    
    const currentPos = [waypoints[idx][0] + (waypoints[nextIdx][0] - waypoints[idx][0]) * lerp, waypoints[idx][1] + (waypoints[nextIdx][1] - waypoints[idx][1]) * lerp];
    
    return { 
      pos: currentPos, 
      angle: getBearing(currentPos[0], currentPos[1], waypoints[nextIdx][0], waypoints[nextIdx][1]),
      phase: calculatePhase(progress),
      health: ship.cargoType === 'Perishable (Food)' ? (100 - (progress * 40)).toFixed(1) : 100
    };
  };

  // --- API & DATA FETCHING ---
  const fetchGameState = async () => {
    if (userId === 'GUEST') return;
    try {
      const profRes = await fetch(`${API_BASE}/user/${userId}/profile`);
      if (profRes.ok) {
        const data = await profRes.json();
        setResources({ money: data.money, reputation: data.reputation });
      }
      
      const shipRes = await fetch(`${API_BASE}/ticketing/active?username=${userId}`);
      if (shipRes.ok) {
        const ships = await shipRes.json();
        const mappedShips = ships.map(s => {
          const shipId = `TRK-${s.id}`;
          return {
            id: shipId,
            rawId: s.id, 
            cargo: s.cargo_name, 
            cargoType: s.scale, 
            category: s.category, // 🔥 FIX: Grab the category from the FastAPI payload!
            destination: s.destination_country,
            // 🔥 FIX: Parse the Postgres JSON string back into a real Array!
            waypoints: typeof s.route_waypoints === 'string' ? JSON.parse(s.route_waypoints) : s.route_waypoints,
            startTime: new Date(s.departure_time).getTime(),
            duration: s.total_duration_ms,
            status: s.status,
            eventHandled: s.storm_event_handled,
            shelterCount: s.shelter_count,
            stormTime: s.storm_time ? new Date(s.storm_time).getTime() : null,
            lastSegment: 0,
            // 🔥 AMNESIA FIX: Load the saved offset and speed for THIS specific ship
            timeOffset: Number(localStorage.getItem(`offset_${shipId}`)) || 0, 
            currentSpeed: Number(localStorage.getItem(`speed_${shipId}`)) || 1
          };
        });
        setActiveExports(mappedShips);
      }
    } catch (e) { console.error("Backend sync failed.", e); }
  };

  useEffect(() => { fetchGameState(); }, [userId]);

  // --- ENGINES ---
  useEffect(() => {
    const tickRateMs = 1000;
    let tickCounter = 0;
    
    const interval = setInterval(() => {
      setSimTime(Date.now()); 

      setActiveExports(currentExports => {
        let hasActiveShip = false;
        
        const updatedExports = currentExports.map(exp => {
          if (exp.status === 'Outbound') {
            hasActiveShip = true;
            // Calculate the new offset
            const newOffset = (exp.timeOffset || 0) + (tickRateMs * (exp.currentSpeed || 1)) - tickRateMs;
            
            // 🔥 AMNESIA FIX: Force save the new offset to the browser memory!
            localStorage.setItem(`offset_${exp.id}`, newOffset.toString());
            
            return { ...exp, timeOffset: newOffset };
          }
          return exp;
        });

        if (hasActiveShip) {
          tickCounter++;
          if (tickCounter >= 10) {
            setResources(prevRes => ({ ...prevRes, money: prevRes.money + 50 }));
            tickCounter = 0;
            setShowFloatingIncome(true);
            setTimeout(() => setShowFloatingIncome(false), 900);
          }
        }
        return updatedExports;
      });
    }, tickRateMs);
    return () => clearInterval(interval);
  }, []); 

  useEffect(() => {
    activeExports.forEach(ship => {
      const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
      if (ship.stormTime && shipPersonalTime >= ship.stormTime && !ship.eventHandled && ship.status === 'Outbound') {
        changeShipSpeed(ship.id, 0); 
        setChaosEvent(ship); 
        addTerminalLog(`> MAYDAY: Severe weather anomaly detected at ${ship.id}.`, 'danger');
        setChaosTimer(15);
        setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, eventHandled: true } : s));
      }
    });
  }, [simTime, activeExports]); 

  useEffect(() => {
    let interval;
    if (chaosEvent && chaosTimer > 0) {
      interval = setInterval(() => { setChaosTimer(prev => prev - 1); }, 1000);
    } else if (chaosEvent && chaosTimer === 0) {
      handleChaosChoice('PUSH'); 
    }
    return () => clearInterval(interval);
  }, [chaosEvent, chaosTimer]);

  useEffect(() => {
    activeExports.forEach(ship => {
      if (ship.status === 'Outbound') {
        const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
        const elapsed = shipPersonalTime - ship.startTime;
        const progress = Math.min(elapsed / ship.duration, 1);
        const totalSegments = Math.max((ship.waypoints?.length || 2) - 1, 1);
        const currentIdx = Math.floor(progress * totalSegments);

        if (ship.lastSegment !== currentIdx && progress < 1) {
          changeShipSpeed(ship.id, 1); 
          setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, lastSegment: currentIdx } : s));
        }
      }
    });
  }, [simTime, activeExports]);

  // --- ACTIONS ---
  const handleShipArrival = async (ship) => {
    setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, status: 'Arrived' } : s));
    try {
      const res = await fetch(`${API_BASE}/ticketing/${ship.rawId}/arrive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userId })
      });
      if (res.ok) {
        const data = await res.json();
        setResources(prev => ({ ...prev, money: data.user_money, reputation: data.reputation }));
        addTerminalLog(`> INBOUND: ${ship.id} successfully docked. Funds secured.`, 'highlight');
        setNotification({ title: 'DELIVERY COMPLETE', message: `Cargo delivered! Bulk Payout: $${data.payout.toLocaleString()}`, type: 'success' });
        await fetchGameState(); 
      }
    } catch (e) { console.error("Arrival failed", e); }
  };

  useEffect(() => {
    activeExports.forEach(ship => {
      if (ship.status === 'Outbound') {
        const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
        const elapsed = shipPersonalTime - ship.startTime;
        if (elapsed >= ship.duration) {
          changeShipSpeed(ship.id, 1); 
          handleShipArrival(ship);
        }
      }
    });
  }, [simTime, activeExports]);

  const handleLaunchRoute = async (e) => {
    e.preventDefault();
    const cost = DESTINATION_PRICING[ticketForm.destination] || 0;

    const payload = {
      cargo_name: ticketForm.cargo,
      weight_kg: Number(ticketForm.weight) || 5000, 
      destination_country: ticketForm.destination,
      scale: ticketForm.scale, 
      category: ticketForm.type, // 🔥 ADD THIS: Send the category to the backend!
      username: userId,
      departure_time: new Date(simTime).toISOString()
    };

    try {
      const res = await fetch(`${API_BASE}/ticketing/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        await fetchGameState(); 
        addTerminalLog(`> OUTBOUND: ${ticketForm.cargo} dispatched to ${ticketForm.destination}.`, 'highlight');
        setTicketForm({ cargo: '', weight: '', destination: '', type: 'Perishable (Food)', scale: 'Global' });
        setActivePanel('tracking'); 
        
        const newShipsRes = await fetch(`${API_BASE}/ticketing/active?username=${userId}`);
        const newShips = await newShipsRes.json();
        //if(newShips.length > 0) setSelectedTrackingId(`TRK-${newShips[newShips.length - 1].id}`);
      } else {
        const errorData = await res.json();
        setNotification({ title: 'Launch Failed', message: `Server says: ${errorData.detail || "Unknown Error"}`, type: 'error' });
      }
    } catch (e) { 
      setNotification({ title: 'Connection Lost', message: 'Cannot reach FastAPI backend. Is your server running?', type: 'error' });
    }
  };

  const handleChaosChoice = async (choice) => {
    if (!chaosEvent) return;

    const shipPersonalTime = Date.now() + (chaosEvent.timeOffset || 0);
    const progress = Math.min((shipPersonalTime - chaosEvent.startTime) / chaosEvent.duration, 1);
    const currentIdx = Math.floor(progress * ((chaosEvent.waypoints?.length || 2) - 1));

    try {
      const res = await fetch(`${API_BASE}/ticketing/${chaosEvent.rawId}/resolve_event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userId, choice: choice, current_index: currentIdx }) 
      });
      if (res.ok) {
        const data = await res.json();
        await fetchGameState(); 
        setChaosEvent(null); 
        changeShipSpeed(chaosEvent.id, 1); 
        
        if (data.status === 'Failed') {
          setNotification({ title: "CONTRACT TERMINATED", message: "Second failure. Cargo lost.", type: "error" });
        } else if (data.status === 'Sheltered') {
          setNotification({ title: "BLOWN OFF COURSE", message: "Push failed! Vessel blown back to previous hub. Awaiting relaunch.", type: "error" });
        } else {
          setNotification({ title: "STORM NAVIGATED", message: "Miraculous success! Vessel continues.", type: "success" });
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleRelaunchRoute = async (rawId) => {
    try {
      const res = await fetch(`${API_BASE}/ticketing/${rawId}/relaunch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userId, departure_time: new Date(simTime).toISOString() })
      });
      if (res.ok) {
         await fetchGameState();
         setNotification({ title: 'ROUTE RELAUNCHED', message: 'Vessel repaired and underway.', type: 'success' });
      }
    } catch (e) { console.error("Relaunch failed", e); }
  };

  const currentRouteCost = DESTINATION_PRICING[ticketForm.destination] || 0;
  const activeShipCount = activeExports.filter(exp => exp.status !== 'Arrived' && exp.status !== 'Failed').length;
  const isFleetFull = activeShipCount >= 3;

  const trackedShip = activeExports.find(s => s.id === selectedTrackingId) || activeExports[activeExports.length - 1];
  let trackedNav = null;
  let progress = 0; // 🔥 NEW: Track precise 0.0 to 1.0 progress
  if (trackedShip) {
    trackedNav = calculateNavigation(trackedShip);
    progress = Math.min(((Date.now() + (trackedShip.timeOffset || 0)) - trackedShip.startTime) / trackedShip.duration, 1);
  }

  // --- RENDER ---
  return (
    /* 🔥 Added dynamic storm-alert class to the wrapper */
    <div className={`sim-wrapper ${isLightMode ? 'light-mode' : ''} ${chaosEvent ? 'storm-alert' : ''}`}>
      
      {/* 🔥 The subtle radar hex-grid over the map */}
      <div className="radar-grid-overlay"></div>

      <button className="sim-exit-btn" onClick={() => setShowExitModal(true)}>
        <LogoutIcon />
      </button>

      {/* 🔥 THE TACTICAL TERMINAL */}
      <div className="tactical-terminal">
        {terminalLogs.map((log, idx) => (
          <div key={idx} className={`terminal-line ${log.type}`}>
            <span className="timestamp">[{log.time}]</span> {log.msg}
          </div>
        ))}
      </div>

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
              <p style={{color: '#e4a11b', marginBottom: '20px'}}>Logistics order <strong>{chaosEvent.id}</strong> hit a severe storm.</p>
              <h3 style={{ color: '#ff4757', margin: '0 0 20px 0', animation: 'pulseGlow 1s infinite' }}>
                Auto-Push in: {chaosTimer}s
              </h3>
              <div className="chaos-actions">
                <p style={{ fontSize: '13px', color: '#ccc', marginBottom: '10px' }}>
                  You must push through. 20% chance of success. <br/>
                  If you fail, you will be blown back to the previous checkpoint and forced to shelter.
                </p>
                <button className="btn-push" onClick={() => handleChaosChoice('PUSH')}>
                  PUSH THROUGH <span className="btn-subtext">Roll the dice (80% Failure Risk)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{position: 'absolute', top: '90px', left: '45%', transform: 'translateX(-50%)', zIndex: 3001}}>
         {showFloatingIncome && <div className="floating-income-text" style={{ color: 'var(--accent-blue)' }}>+$50</div>}
      </div>
      
      <TopHUD resources={resources} />

      {notification && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className={`custom-notification ${notification.type}`}>
            <div className="notif-header">
              <span className="notif-icon">{notification.type === 'success' ? '✅' : '⚠️'}</span>
              <h3>{notification.title}</h3>
            </div>
            <p className="notif-message">{notification.message}</p>
            <button className="notif-ack-btn" onClick={() => setNotification(null)}>COMMAND ACKNOWLEDGED</button>
          </div>
        </div>
      )}

      {/* 📍 MASTER TRACKING PANEL (List & Detail View) */}
      {activePanel === 'tracking' && (
        <div className="floating-side-panel" style={{ width: '380px' }}>
          
          {/* THE LIST VIEW (Shows if no specific ship is selected) */}
          {!selectedTrackingId ? (
            <>
              <div className="panel-header">
                <h3>Live Fleet Tracking</h3>
                <span className="badge docked">{activeShipCount} Active</span>
              </div>
              
              <div className="traffic-list" style={{ marginTop: '10px' }}>
                {activeExports.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#666', marginTop: '20px' }}>No active logistics orders.</p>
                ) : (
                  activeExports.map(ship => (
                    <div 
                      className="upgrade-card" 
                      key={ship.id} 
                      onClick={() => setSelectedTrackingId(ship.id)}
                      style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                    >
                      <div>
                        <h4 style={{ margin: '0 0 4px 0', color: '#3498db', textTransform: 'uppercase' }}>{ship.cargo}</h4>
                        <p style={{ margin: 0, fontSize: '11px', color: '#aaa' }}>{ship.id} • {ship.destination}</p>
                      </div>
                      <span className={`badge ${ship.status === 'Arrived' ? 'docked' : (ship.status === 'Failed' ? 'failed' : 'outbound')}`}>
                        {ship.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            /* THE DETAIL VIEW (Shows the Shopee timeline for the selected ship) */
            trackedShip && trackedNav && (
              <>
                <div className="panel-header" style={{ borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '15px' }}>
                  <button 
                    onClick={() => setSelectedTrackingId(null)} 
                    style={{ background: 'none', border: 'none', color: 'var(--accent-blue)' , cursor: 'pointer', padding: 0, fontSize: '14px', fontWeight: 'bold' }}
                  >
                    ← Back to Fleet
                  </button>
                  <span className="badge docked">Standard Int'l</span>
                </div>
                
                <div className="tracking-info-header">
                  <h4 style={{ margin: '0 0 5px 0', textTransform: 'uppercase' }}>{trackedShip.cargo}</h4>
                  <p className="text-muted" style={{ margin: 0 }}>{trackedShip.id} • {trackedShip.destination}</p>
                </div>

                <div className="scrollable-timeline-container">
                  <div className="shopee-timeline">

                    {/* Step 8: Parcel Delivered */}
                    <div className={`timeline-step truck-step ${progress >= 1.0 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 1.0), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 1.0), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Parcel Delivered</strong>
                        <p>Parcel has been successfully delivered to the recipient.</p>
                      </div>
                    </div>

                    {/* Step 7: Arrived at final sorting */}
                    <div className={`timeline-step truck-step ${progress >= 0.9 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.9), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.9), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Arrived at Destination</strong>
                        <p>Arrived at final sorting facility in {trackedShip.destination}.</p>
                      </div>
                    </div>

                    {/* Exception Step (Only shows if storm hit) */}
                    {(trackedShip.status === 'Sheltered' || trackedShip.status === 'Failed') && (
                      <div className={`timeline-step ship-step completed`}>
                        <div className="step-timestamp">
                          <span className="date">{formatShopeeTime(Date.now(), 'date')}</span>
                          <span className="time">{formatShopeeTime(Date.now(), 'time')}</span>
                        </div>
                        <div className="step-indicator"><div className="step-dot" style={{backgroundColor: '#e74c3c', boxShadow: '0 0 8px #e74c3c'}}></div><div className="step-line"></div></div>
                        <div className="step-content">
                          <strong style={{color: '#e74c3c'}}>Delivery Exception</strong>
                          <p>Severe weather condition detected. Vessel holding position.</p>
                        </div>
                      </div>
                    )}

                    {/* Step 6: Ocean Transit */}
                    <div className={`timeline-step ship-step ${progress >= 0.3 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.3), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.3), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Ocean Transit</strong>
                        <p>Vessel is in transit across international waters.</p>
                      </div>
                    </div>

                    {/* Step 5: Vessel cleared customs */}
                    <div className={`timeline-step ship-step ${progress >= 0.2 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.2), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.2), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Cleared Customs</strong>
                        <p>Blue Vessel cleared customs and departed Davao Port.</p>
                      </div>
                    </div>

                    {/* Step 4: Customs Processing */}
                    <div className={`timeline-step truck-step ${progress >= 0.15 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.15), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.15), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Customs Processing</strong>
                        <p>Parcel is undergoing export customs clearance.</p>
                      </div>
                    </div>

                    {/* Step 3: Arrived at Export Zone */}
                    <div className={`timeline-step truck-step ${progress >= 0.1 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.1), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.1), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Export Hub Arrival</strong>
                        <p>Parcel arrived at Export Processing Zone.</p>
                      </div>
                    </div>

                    {/* Step 2: Seller preparing */}
                    <div className={`timeline-step truck-step ${progress >= 0.05 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.05), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.05), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Preparation</strong>
                        <p>Seller is preparing to ship your parcel.</p>
                      </div>
                    </div>

                    {/* Step 1: Order Placed */}
                    <div className={`timeline-step truck-step ${progress >= 0.0 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime, 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime, 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Order Placed</strong>
                        <p>Order received at {trackedShip.category && trackedShip.category.includes('Perishable') ? 'Central Cold Storage' : 'Panabo North Facility'}.</p>
                      </div>
                    </div>

                  </div>
                </div>
              </>
            )
          )}
        </div>
      )}

      {activePanel === 'hubs' && (
        <div className="floating-side-panel">
          <div className="panel-header">
            <h3>Facility Operations</h3>
            <span className="badge docked">3 Online</span>
          </div>
          <div className="traffic-list" style={{ marginTop: '10px' }}>
            {PANABO_HUBS.map(hub => (
              <div className="upgrade-card" key={hub.id} onClick={() => setFlyTarget({ pos: hub.pos })} style={{ cursor: 'pointer' }}>
                <div className="tc-top">
                  <h4>{hub.name}</h4>
                  <span className={`badge ${hub.status === 'Optimal' || hub.status === 'Active' ? 'docked' : 'outbound'}`}>{hub.status}</span>
                </div>
                <p className="upgrade-desc" style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>
                  {hub.type} <span style={{ color: '#aaa', fontWeight: 'normal' }}>• {hub.stat}</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activePanel === 'export' && (
        <div className="floating-side-panel">
          <div className="panel-header"><h3>Deploy Logistics</h3></div>
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
              <label>Goods Category</label>
              <select value={ticketForm.type} onChange={e => setTicketForm({...ticketForm, type: e.target.value})} className="modern-select">
                <option value="Perishable (Food)">Perishable (Food) - Spoilage Risk</option>
                <option value="Electronics">Electronics - Secure Transit</option>
                <option value="Raw Materials">Raw Materials - Standard</option>
              </select>
            </div>
            <div className="form-group">
              <label>Destination Market</label>
              <input list="filtered-destinations" type="text" required placeholder="Select destination..." value={ticketForm.destination} onChange={e => setTicketForm({...ticketForm, destination: e.target.value})} className="modern-input" />
              <datalist id="filtered-destinations">{getOptions().map(port => <option key={port} value={port} />)}</datalist>
            </div>
            <div className="cost-tag">Logistics Cost: ${currentRouteCost > 0 ? currentRouteCost.toLocaleString() : "0"}</div>
            <button type="submit" className={`btn-launch-sim ${isFleetFull ? 'state-deployed' : ''}`} disabled={resources.money < currentRouteCost || currentRouteCost === 0 || isFleetFull}>
              {isFleetFull ? "⏳ FLEET AT CAPACITY (3/3)" : "Confirm Order"}
            </button>
          </form>
        </div>
      )}

      <div className="sim-bottom-bar">
        <button className={`action-btn ${activePanel === 'tracking' ? 'tracking-active-pulse' : ''}`} onClick={() => setActivePanel('tracking')}>
          📍 Live Tracking {activePanel === 'tracking' && <span className="pulsing-dot-blue"></span>}
        </button>
        <button className={`action-btn ${activePanel === 'hubs' ? 'active-blue' : ''}`} onClick={() => setActivePanel('hubs')}>
          🏠 Facility Ops
        </button>
        <button className={`action-btn ${activePanel === 'export' ? 'active-blue' : ''}`} onClick={() => setActivePanel('export')}>
          📦 Logistics
        </button>
      </div>

      <main className="sim-map-fullscreen">
        <MapContainer 
          center={portPosition} 
          zoom={5} 
          minZoom={4} 
          maxZoom={12} 
          maxBounds={SEA_BOUNDS} 
          maxBoundsViscosity={1.0} 
          className="leaflet-container" 
          zoomControl={false} 
          zoomSnap={0.5} 
          zoomDelta={0.5}
        >
          <TileLayer url={isLightMode ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png" : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"} attribution='&copy; CARTO' />
          <MapFlyToHandler target={flyTarget} />
          <IdleCameraController activeExports={activeExports} />
          <CustomSimControls isLightMode={isLightMode} setIsLightMode={setIsLightMode} />
          <MapEventsTracker setZoomLevel={setZoomLevel} />

          {zoomLevel > 10 && PANABO_HUBS.map(hub => (
            <Marker key={hub.id} position={hub.pos} icon={createHouseIcon()}>
              <Popup className="custom-popup dark-popup">
                <div style={{ padding: '5px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: 'var(--accent-blue)' }}>{hub.name}</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#ccc' }}>{hub.type} • {hub.stat}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {activeExports.map((exp) => {
            const nav = calculateNavigation(exp);
            
            // 🔥 FIX: Trust the A* Algorithm completely. Remove the unshift hack.
            // 🔥 FIX: Trust the A* Algorithm completely. Remove the unshift hack.
            let displayWaypoints = exp.waypoints ? [...exp.waypoints] : [];

            return (
              <React.Fragment key={exp.id}>
                
                {/* 🔥 RESTORED: The dashed route line! */}
                {displayWaypoints.length > 0 && (
                  <Polyline positions={displayWaypoints} pathOptions={{ color: '#2ecc71', dashArray: '5, 10', weight: 2, opacity: 0.6 }} />
                )}
                
                {displayWaypoints.map((wp, i) => (
                  <Marker key={`dot-${i}`} position={wp} icon={createDotIcon()} />
                ))}

                <Marker 
                  position={nav.pos} 
                  icon={createTransportIcon(nav.phase.type, exp.status, nav.angle, nav.health)}
                  eventHandlers={{ click: () => { setSelectedTrackingId(exp.id); setActivePanel('tracking'); } }}
                >
                  <Popup className="custom-popup dark-popup">
                    <div style={{ padding: '12px', textAlign: 'left', minWidth: '180px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          {/* 🔥 FIX: Shows the Cargo Name instead of the ID */}
                          <h4 style={{ margin: 0, color: '#3498db', textTransform: 'uppercase' }}>{exp.cargo}</h4>
                          <span style={{ fontSize: '10px', color: '#888' }}>{exp.id}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#ccc', marginTop: '2px' }}>{exp.status}</span>
                      </div>
                      
                      {exp.status === 'Sheltered' ? (
                         <div className="relaunch-container">
                           <p className="relaunch-warning-text" style={{ color: '#e74c3c' }}>VESSEL BLOWN BACK</p>
                           <button className="btn-launch-sim relaunch-btn" onClick={() => handleRelaunchRoute(exp.rawId)}>
                             Pay to Relaunch & Restock
                           </button>
                         </div>
                      ) : exp.status === 'Failed' ? (
                         <p style={{ color: '#e74c3c', fontWeight: 'bold', textAlign: 'center' }}>CONTRACT TERMINATED</p>
                      ) : (
                         <>
                           <div style={{ marginBottom: '10px' }}>
                             <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', marginBottom: '4px' }}>
                               <span>Goods Health</span><span>{nav.health}%</span>
                             </div>
                             <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                               <div style={{ width: `${nav.health}%`, height: '100%', background: nav.health < 70 ? '#e74c3c' : 'var(--accent-blue)', transition: 'width 0.3s' }}></div>
                             </div>
                           </div>

                           <div style={{ fontSize: '11px', color: '#ccc', marginBottom: '12px' }}>
                              Progress: <strong style={{ color: 'var(--accent-blue)' }}>{((Math.min(((Date.now() + (exp.timeOffset || 0)) - exp.startTime) / exp.duration, 1)) * 100).toFixed(1)}%</strong>
                           </div>

                           {/* Independent Timeskip Controls */}
                           {exp.status === 'Outbound' && (
                             <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                               <button className={`time-opt-btn ${exp.currentSpeed === 1 ? 'active-blue' : ''}`} style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => changeShipSpeed(exp.id, 1)}>▶</button>
                               <button className={`time-opt-btn ${exp.currentSpeed === 3600 ? 'active-blue' : ''}`} style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => changeShipSpeed(exp.id, 3600)}>⏭</button>
                               <button className={`time-opt-btn ${exp.currentSpeed === 21600 ? 'active-blue' : ''}`} style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => changeShipSpeed(exp.id, 21600)}>🚀</button>
                             </div>
                           )}
                         </>
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