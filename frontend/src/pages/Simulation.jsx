import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Simulation.css';
import AssessmentModal from './AssessmentModal';
import VesselHelm3D from './VesselHelm3D'; // 🔥 NEW: 3D Boat Physics Simulator
import WeatherHUD from './WeatherHUD'; // 🔥 Add this line
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
  { id: 3, pos: [7.290391975152721, 125.71168144605834], name: 'Export Processing Zone', type: 'CUSTOMS', stat: 'Queue: 3 Trucks', status: 'Busy' },
];

// 🔥 NEW: Divided into National and Global for better UI hierarchy
const NATIONAL_HUBS = [
  { id: 201, pos: [14.599, 120.984], name: 'Port of Manila', type: 'NATIONAL HUB', stat: 'Capacity: 88%', status: 'Active' },
  { id: 202, pos: [10.292, 123.901], name: 'Cebu International Port', type: 'REGIONAL HUB', stat: 'Capacity: 82%', status: 'Active' },
  { id: 203, pos: [13.756, 121.058], name: 'Batangas Terminal', type: 'NATIONAL HUB', stat: 'Capacity: 79%', status: 'Active' }
];

const GLOBAL_HUBS = [
  { id: 101, pos: [1.290, 103.850], name: 'Port of Singapore', type: 'GLOBAL HUB', stat: 'Capacity: 95%', status: 'Active' },
  { id: 102, pos: [10.823, 106.629], name: 'Ho Chi Minh Terminal', type: 'REGIONAL HUB', stat: 'Capacity: 80%', status: 'Active' },
  { id: 103, pos: [13.756, 100.501], name: 'Bangkok Logistics', type: 'REGIONAL HUB', stat: 'Capacity: 75%', status: 'Active' },
  { id: 104, pos: [-6.208, 106.845], name: 'Jakarta Tanjung Priok', type: 'GLOBAL HUB', stat: 'Capacity: 92%', status: 'Active' },
  { id: 105, pos: [5.027, 115.064], name: 'Muara Port, Brunei', type: 'REGIONAL HUB', stat: 'Capacity: 65%', status: 'Active' },
  { id: 106, pos: [16.840, 96.145], name: 'Yangon Port', type: 'REGIONAL HUB', stat: 'Capacity: 70%', status: 'Active' },
  { id: 107, pos: [-8.558, 125.573], name: 'Port of Dili', type: 'LOCAL HUB', stat: 'Capacity: 60%', status: 'Active' }
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
  // 🔥 FIX: Assign Green for Trucks, Blue for Sea Vessels
  let color = type === 'truck' ? '#2ecc71' : '#3498db'; 
  
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

const MapEventsTracker = ({ setZoomLevel, setIsAutoFollow, isAutoFollow }) => {
  const map = useMapEvents({
    zoomend: () => setZoomLevel(map.getZoom()),
    // 🔥 FIX 1: Turn off Auto-Follow immediately if the user clicks and drags the map!
    dragstart: () => {
      if (isAutoFollow) setIsAutoFollow(false);
    }
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
  const [globalWeather, setGlobalWeather] = useState('NOMINAL');
  const [weatherSyncTrigger, setWeatherSyncTrigger] = useState(0); // 🔥 NEW: Triggers HUD update
  const [relaunchEvent, setRelaunchEvent] = useState(null); // 🔥 THE FIX: Added Relaunch State!
  const [assessmentConfig, setAssessmentConfig] = useState(null);
  const [useLegacyQuiz, setUseLegacyQuiz] = useState(false); // 🔥 Keeps quiz hidden unless toggled!  
  const [ticketForm, setTicketForm] = useState({ cargo: '', weight: '1500', destination: '', type: 'Perishable (Food)', scale: 'Global' });
  const [selectedTrackingId, setSelectedTrackingId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [isAutoFollow, setIsAutoFollow] = useState(false); // 🔥 AUTO Camera State
  const [fleetFilter, setFleetFilter] = useState('ALL'); // 🔥 FIX: The missing filter state!

  const [showBoosters, setShowBoosters] = useState(false);

  // 🔥 MOCK FUNCTION: Strictly UI for the presentation demo!
  const handleMockPurchase = (itemName) => {
    setShowBoosters(false);
    setNotification({ 
      title: 'TRANSACTION COMPLETE', 
      message: `[DEMO MODE] ${itemName} acquired. Credits & Reputation visually adjusted.`, 
      type: 'success' 
    });
  };

  // 🔥 MINIMAP SYNC COMPONENT
  const MinimapSync = ({ pos }) => {
    const map = useMap();
    useEffect(() => { if (pos) map.setView(pos); }, [pos, map]);
    return null;
  };

  // 🔥 AUTO FOLLOW COMPONENT (Dynamic Zoom & Warp Safety)
  const AutoFollowCamera = ({ targetPos, isAutoFollow, transportType, currentSpeed }) => {
    const map = useMap();

    useEffect(() => {
      if (isAutoFollow && targetPos) {
        // Truck = Zoom 15, Sea Vessel = Zoom 7 (Wider view)
        const targetZoom = transportType === 'truck' ? 15 : 10;
        
        // 🔥 CRITICAL FIX: If speed is > 1 (Warping), disable smooth animation 
        // to prevent Leaflet from crashing/graying out the map.
        const isWarping = currentSpeed > 1;
        
        map.setView(targetPos, targetZoom, { 
          animate: !isWarping, 
          duration: isWarping ? 0 : 0.5 
        });
      }
    }, [targetPos, isAutoFollow, map, transportType, currentSpeed]);
    
    return null;
  };

  // 🔥 MULTIPLAYER WEBSOCKET LISTENER
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/simulation');
    
    ws.onopen = () => console.log('🌐 Connected to Global Multiplayer Server');
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === 'SYNC_MAP') {
        fetchGameState(); // Another player did something! Update our map instantly!
        
        // Print it to the terminal if it wasn't us who did it
        if (data.commander !== userId) {
          addTerminalLog(`> NETWORK: Commander [${data.commander}] ${data.action}.`, 'warning');
        }
      }
      
      // 🔥 NEW: LISTEN FOR ADMIN WEATHER OVERRIDES
      if (data.event === 'SYNC_WEATHER') {
        setWeatherSyncTrigger(prev => prev + 1); // This tells WeatherHUD to re-fetch instantly!
        addTerminalLog(`> GLOBAL DIRECTIVE: ${data.action}`, 'highlight');
      }
    };
    
    return () => ws.close();
  }, [userId]);

  const [terminalLogs, setTerminalLogs] = useState([
    { time: new Date().toLocaleTimeString(), msg: "> SYSTEM_INIT: WharfIntel Node Alpha Online.", type: 'normal' },
    { time: new Date().toLocaleTimeString(), msg: "> RADAR: South East Asia Sector Locked.", type: 'highlight' }
  ]);

  const terminalRef = useRef(null); // 🔥 NEW: Ref to auto-scroll the terminal

  const addTerminalLog = (msg, type = 'normal') => {
    setTerminalLogs(prev => {
      const newLogs = [...prev, { time: new Date().toLocaleTimeString(), msg, type }];
      return newLogs.length > 50 ? newLogs.slice(newLogs.length - 50) : newLogs; // 🔥 Keep 50 logs instead of 6
    });
  };

  // 🔥 NEW: Auto-scroll terminal to the bottom when new logs arrive
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

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

  // 🔥 THE CINEMATIC WARP SEQUENCE
  const triggerWarpSequence = (shipId, newSpeed) => {
    // If it's just normal play/pause, do it instantly without moving the camera
    if (newSpeed === 1 || newSpeed === 0) {
      changeShipSpeed(shipId, newSpeed);
      return;
    }

    // 1. Lock the camera to the specific ship
    setSelectedTrackingId(shipId);
    setIsAutoFollow(true);
    
    // 2. Pause the ship temporarily to let the camera catch up
    changeShipSpeed(shipId, 0);
    addTerminalLog(`> SEQUENCE: Locking camera to ${shipId}...`, 'warning');

    // 3. Wait 1.5 seconds for the map to pan, then engage the warp drive!
    setTimeout(() => {
      changeShipSpeed(shipId, newSpeed);
      addTerminalLog(`> WARP ENGAGED: Vessel entering slipspace.`, 'highlight');
    }, 1500);
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
    if (progress < 0.85) return { type: 'vessel', label: 'Ocean Transit (Vessel)', step: 2 };
    if (progress < 1.0) return { type: 'truck', label: 'Out for Delivery (Truck)', step: 3 };
    return { type: 'truck', label: 'Delivered', step: 4 };
  };

  const calculateNavigation = (ship) => {
    const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
    const elapsed = shipPersonalTime - ship.startTime;
    const waypoints = ship.waypoints || [];
    const totalSegments = Math.max(waypoints.length - 1, 1);
    
    // 🔥 THE FIX: Removed "isHalted ? 0 :"
    // When the ship is Sheltered, currentSpeed is 0, which perfectly freezes 
    // the timeOffset and holds the ship exactly at its current coordinate!
    let progress = Math.min(elapsed / ship.duration, 1);
    
    if (ship.status === 'Arrived' || progress >= 1 || waypoints.length < 2) {
      return { pos: waypoints[waypoints.length - 1] || [0,0], angle: 0, phase: { type: 'vessel', label: 'Delivered', step: 4 }, health: ship.cargoType === 'Perishable (Food)' ? 60 : 100 };
    }
    
    const segmentProgress = progress * totalSegments;
    const idx = Math.floor(segmentProgress);
    const nextIdx = idx + 1;
    const lerp = segmentProgress - idx;
    
    const currentPos = [waypoints[idx][0] + (waypoints[nextIdx][0] - waypoints[idx][0]) * lerp, waypoints[idx][1] + (waypoints[nextIdx][1] - waypoints[idx][1]) * lerp];    
    
    // 🔥 SPATIAL PHASE LOGIC: Find exactly where Davao Port is in the route array
    // Davao Port coordinates from pathfinder: (7.284, 125.681)
    const davaoIdx = waypoints.findIndex(wp => Math.abs(wp[0] - 7.284) < 0.01 && Math.abs(wp[1] - 125.681) < 0.01);
    const portThreshold = davaoIdx > -1 ? davaoIdx : 1;

    // If our current waypoint index is BEFORE the Davao Port node, we are a truck on land.
    // Otherwise, we are a vessel on the ocean.
    let currentPhase = { type: 'vessel', label: 'Ocean Transit (Vessel)', step: 2 };
    
    // Use the 20% mark to determine if we are still at the origin hub
    if (progress < 0.20) {
      currentPhase = { type: 'truck', label: 'Origin Hub (Truck)', step: 1 };
    }

    // 🔥 ELITE KNOWLEDGE: Trust the authoritative health from the database!
    let currentHealth = ship.cargoHealth !== undefined ? ship.cargoHealth : 100;
    
    // Ensure health stays securely between 0 and 100 for the UI
    currentHealth = Math.max(0, Math.min(100, currentHealth)).toFixed(1);

    return { 
      pos: currentPos, 
      angle: getBearing(currentPos[0], currentPos[1], waypoints[nextIdx][0], waypoints[nextIdx][1]),
      phase: currentPhase,
      health: currentHealth // Injects the true DB health value into the UI
    };
    
    // Fail-safe: Check the explicit category OR infer from the cargo name
    const isPerishable = 
      (ship.category && ship.category.includes('Perishable')) || 
      (ship.cargo && (ship.cargo.toLowerCase().includes('banana') || ship.cargo.toLowerCase().includes('food') || ship.cargo.toLowerCase().includes('fruit') || ship.cargo.toLowerCase().includes('meat') || ship.cargo.toLowerCase().includes('fish')));

    if (isPerishable) {
      // Food rots over time. If they took a +2 Day delay (shelterCount), it drops massively.
      currentHealth = 100 - (progress * 25) - (ship.shelterCount * 30);
    } else {
      // Electronics/Raw Materials. If they PUSHED through a storm (eventHandled but no shelter), they take impact damage!
      if (ship.eventHandled && ship.shelterCount === 0) {
        currentHealth = 65; 
      }
    }
    
    // Ensure health stays between 0 and 100
    currentHealth = Math.max(0, Math.min(100, currentHealth)).toFixed(1);

    return { 
      pos: currentPos, 
      angle: getBearing(currentPos[0], currentPos[1], waypoints[nextIdx][0], waypoints[nextIdx][1]),
      phase: currentPhase,
      health: currentHealth // Inject the new health value
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
      
      const shipRes = await fetch(`${API_BASE}/admin/ticketing/active?username=${userId}`);
      if (shipRes.ok) {
        const ships = await shipRes.json();
        const mappedShips = ships.map(s => {
          const shipId = `TRK-${s.id}`;
          return {
            id: shipId,
            rawId: s.id, 
            cargo: s.cargo_name, 
            cargoType: s.scale, 
            category: s.category, 
            commander: s.commander, 
            destination: s.destination_country,
            waypoints: typeof s.route_waypoints === 'string' ? JSON.parse(s.route_waypoints) : s.route_waypoints,
            startTime: new Date(s.departure_time).getTime(),
            duration: s.total_duration_ms,
            status: s.status,
            eventHandled: s.storm_event_handled,
            shelterCount: s.shelter_count,
            stormTime: s.storm_time ? new Date(s.storm_time).getTime() : null,
            cargoHealth: s.cargo_health, // 🔥 THE FIX: Store the true DB health locally
            lastSegment: 0,
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
      // 🔥 FIX 1: If a Chaos Modal or Relaunch Modal is open, skip the tick entirely.
      // This perfectly freezes the background, the UI progress bars, and the map animation.
      setChaosEvent(currentChaos => {
        setRelaunchEvent(currentRelaunch => {
          if (currentChaos || currentRelaunch) {
             return currentRelaunch; // Do nothing, keep frozen
          }

          setSimTime(Date.now()); 

          setActiveExports(currentExports => {
            let hasActiveShip = false;
            
            const updatedExports = currentExports.map(exp => {
              if (exp.status === 'Outbound') {
                if (exp.commander === userId) hasActiveShip = true;
                const newOffset = (exp.timeOffset || 0) + (tickRateMs * (exp.currentSpeed || 1)) - tickRateMs;
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

          return currentRelaunch;
        });
        return currentChaos;
      });
    }, tickRateMs);
    
    return () => clearInterval(interval);
  }, [userId]); // 🔥 Make sure userId is the only dependency here

  useEffect(() => {
    activeExports.forEach(ship => {
      const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
      
      if (ship.stormTime && shipPersonalTime >= ship.stormTime && !ship.eventHandled && ship.status === 'Outbound') {
        
        // 🔥 THE INTERLOCK: Check if the cargo is currently on a truck
        const nav = calculateNavigation(ship);
        if (nav.phase.type === 'truck') {
          // Defer the storm by pushing its trigger time forward by 3 seconds.
          // The storm is essentially "waiting" in the ocean for the vessel to launch.
          setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, stormTime: shipPersonalTime + 3000 } : s));
          return; 
        }

        // If it's a vessel in the ocean, trigger the Chaos Engine!
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
    // 🔥 THE FIX: Stop the 15-second countdown if the Assessment Modal is active
    if (chaosEvent && chaosTimer > 0 && !assessmentConfig) {
      interval = setInterval(() => { setChaosTimer(prev => prev - 1); }, 1000);
    } else if (chaosEvent && chaosTimer === 0 && !assessmentConfig) {
      handleChaosChoice('PUSH'); 
    }
    return () => clearInterval(interval);
  }, [chaosEvent, chaosTimer, assessmentConfig]);

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
        
        const newShipsRes = await fetch(`${API_BASE}/admin/ticketing/active?username=${userId}`);
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

  const handleChaosChoice = (choice) => {
    if (!chaosEvent) return;

    // 🔥 Feature C & E: Launch Assessment instead of immediate result
    // Extract current health from tracked data, fallback to 100
    const nav = calculateNavigation(chaosEvent);
    const startingHealth = parseFloat(nav.health) || 100;
    
    setAssessmentConfig({
      event: chaosEvent,
      type: choice, // 'PUSH' or 'RETREAT'
      health: startingHealth
    });
  };

  const executeRelaunch = async (choice) => {
    if (!relaunchEvent) return;
    
    if (choice === 'REROUTE') {
      const nav = calculateNavigation(relaunchEvent);
      const startingHealth = parseFloat(nav.health) || 100;
      setAssessmentConfig({
        event: relaunchEvent,
        type: choice,
        health: startingHealth
      });
      return; // Stop here, modal will handle the rest
    }
    
    // WAIT IT OUT has no questions, just a direct API call (keep existing code for WAIT here, but add explicit health penalty param)
    processAssessmentResult(relaunchEvent, choice, { success: true, finalHealth: Math.max(0, (parseFloat(calculateNavigation(relaunchEvent).health) || 100) - 15) });
  };

  // 🔥 NEW: Fires when the user finishes the questionnaire
  const processAssessmentResult = async (activeEvent, choice, result) => {
    setAssessmentConfig(null);
    if (choice === 'PUSH' || choice === 'RETREAT') setChaosEvent(null);
    if (choice === 'REROUTE' || choice === 'WAIT') setRelaunchEvent(null);

    const shipPersonalTime = Date.now() + (activeEvent.timeOffset || 0);
    const progress = Math.min((shipPersonalTime - activeEvent.startTime) / activeEvent.duration, 1);
    const currentIdx = Math.floor(progress * ((activeEvent.waypoints?.length || 2) - 1));

    // Calculate how much health was lost during the quiz
    const nav = calculateNavigation(activeEvent);
    const startingHealth = parseFloat(nav.health) || 100;
    // 🔥 THE FIX: Round the penalty so the notification shows a clean integer!
    const healthPenalty = Math.round(startingHealth - result.finalHealth);

    try {
      const endpoint = (choice === 'REROUTE' || choice === 'WAIT') ? 'relaunch' : 'resolve_event';
      const res = await fetch(`${API_BASE}/ticketing/${activeEvent.rawId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          username: userId, 
          choice: choice, 
          current_index: currentIdx,
          is_success: result.success,       // Did they pass the threshold?
          health_penalty: healthPenalty     // Send exact % damage to DB
        }) 
      });
      
      if (res.ok) {
        const data = await res.json();
        
        // Sync time offset to prevent map jitter
        const penaltyMs = choice === 'WAIT' ? 172800000 : (choice === 'REROUTE' ? 86400000 : 0);
        const newDuration = activeEvent.duration + penaltyMs;
        const requiredElapsed = progress * newDuration;
        const newTimeOffset = requiredElapsed - Date.now() + activeEvent.startTime;
        localStorage.setItem(`offset_${activeEvent.id}`, newTimeOffset.toString());

        await fetchGameState(); 
        
        if (data.status !== 'Sheltered' && data.status !== 'Failed') {
          changeShipSpeed(activeEvent.id, 1); 
        }
        
        // Custom Notifications based on result
        if (data.status === 'Failed') {
          setNotification({ title: "CONTRACT TERMINATED", message: "Vessel lost at sea. Cargo unrecoverable.", type: "error" });
        } else if (choice === 'RETREAT') {
          setNotification({ title: "TACTICAL RETREAT", message: `Fell back to safe node. Cargo Damage: -${healthPenalty}%.`, type: "warning" });
        } else if (choice === 'REROUTE' && result.success) {
          setNotification({ title: "REROUTE INITIATED", message: `New trajectory calculated. Damage taken: -${healthPenalty}%.`, type: "reroute" });
        } else if (choice === 'WAIT') {
          setNotification({ title: "ANCHOR DROPPED", message: "Vessel holding position. -15% Health due to delay.", type: "warning" });
        } else {
          setNotification({ title: "STORM BREACHED", message: `Pushed through anomaly. Cargo Damage: -${healthPenalty}%.`, type: "success" });
        }
      }
    } catch (e) { console.error(e); }
  };

  // 🔥 DYNAMIC UI PRICING: Calculate cost based on weight multiplier
  const baseRouteCost = DESTINATION_PRICING[ticketForm.destination] || 0;
  const weightMultiplier = (Number(ticketForm.weight) || 1500) / 1000;
  const currentRouteCost = baseRouteCost * weightMultiplier;
  // 🔥 PRIVACY FILTER: Only calculate fleet capacity based on YOUR ships
  const myShips = activeExports.filter(ship => ship.commander === userId);
  const activeShipCount = myShips.filter(exp => exp.status !== 'Arrived' && exp.status !== 'Failed').length;
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

      <div className="climate-overlay"></div>

      {/* 🔥 Hide Exit Button when AUTO is ON to prevent breaking the simulation */}
      {!isAutoFollow && (
        <button className="sim-exit-btn" onClick={() => setShowExitModal(true)}>
          <LogoutIcon />
        </button>
      )}

      {/* 🔥 Hide Exit Button when AUTO is ON to prevent breaking the simulation */}
      {!isAutoFollow && (
        <>
          <button className="sim-exit-btn" onClick={() => setShowExitModal(true)}>
            <LogoutIcon />
          </button>
          
          {/* 🔥 THE NEW BOOSTER TRIGGER BUTTON */}
          <button className="sim-booster-btn" onClick={() => setShowBoosters(true)}>
            ⚡ BLACK MARKET
          </button>
        </>
      )}

      {/* 🔥 MACRO-CLIMATE WEATHER HUD */}
      {!isAutoFollow && <WeatherHUD onWeatherUpdate={setGlobalWeather} syncTrigger={weatherSyncTrigger} />}

      {/* 🔥 THE TACTICAL TERMINAL */}
      <div className="tactical-terminal" ref={terminalRef}></div>

      {/* 🔥 THE TACTICAL TERMINAL */}
      <div className="tactical-terminal" ref={terminalRef}>
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

      {/* ⚡ THE BLACK MARKET BOOSTER MODAL */}
      {showBoosters && (
        <div className="modal-overlay" style={{ zIndex: 10000 }} onClick={() => setShowBoosters(false)}>
          <div className="boosters-modal" onClick={e => e.stopPropagation()}>
            <div className="boosters-header">
              <h2 style={{ margin: 0, color: '#f1c40f', display: 'flex', alignItems: 'center', gap: '10px' }}>
                ⚡ TACTICAL ASSETS
              </h2>
              <button className="close-booster-btn" onClick={() => setShowBoosters(false)}>✕</button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '20px' }}>
              Acquire off-the-books logistics advantages. Transactions are final.
            </p>

            <div className="boosters-grid">
              
              {/* ITEM 1: Chaos Evader */}
              <div className="booster-card">
                <div className="booster-icon" style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }}>🛡️</div>
                <div className="booster-info">
                  <h4>Chaos Evader</h4>
                  <p>Guaranteed 100% success rate when pushing through the next severe weather anomaly.</p>
                </div>
                <div className="booster-action">
                  <span className="booster-price">$100,000</span>
                  <button onClick={() => handleMockPurchase('Chaos Evader')}>ACQUIRE</button>
                </div>
              </div>

              {/* ITEM 2: Buy Reputation */}
              <div className="booster-card">
                <div className="booster-icon" style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}>🤝</div>
                <div className="booster-info">
                  <h4>Port Influence</h4>
                  <p>Bribe local port authorities to permanently increase your global reputation standing.</p>
                </div>
                <div className="booster-action">
                  <span className="booster-price">$100,000</span>
                  <button onClick={() => handleMockPurchase('Port Influence (+10 Rep)')}>+10 REP</button>
                </div>
              </div>

              {/* ITEM 3: Sell Reputation */}
              <div className="booster-card">
                <div className="booster-icon" style={{ background: 'rgba(231, 76, 60, 0.1)', color: '#e74c3c' }}>💰</div>
                <div className="booster-info">
                  <h4>Reputation Liquidator</h4>
                  <p>Burn your established goodwill with harbor masters in exchange for immediate liquid capital.</p>
                </div>
                <div className="booster-action">
                  <span className="booster-price cost-rep">-10 REP</span>
                  <button className="sell-btn" onClick={() => handleMockPurchase('Liquid Capital (+$70,000)')}>+$70,000</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* 🧠 3D HELM SIMULATOR (With Non-Destructive Toggle to Legacy Quiz) */}
      {assessmentConfig && (
        useLegacyQuiz ? (
          <AssessmentModal 
            mode={assessmentConfig.type} 
            cargo={assessmentConfig.event.cargo}
            initialHealth={assessmentConfig.health}
            onComplete={(result) => processAssessmentResult(assessmentConfig.event, assessmentConfig.type, result)}
          />
        ) : (
          <VesselHelm3D
            mode={assessmentConfig.type}
            cargo={assessmentConfig.event.cargo}
            weightKg={assessmentConfig.event.weightKg || Number(ticketForm.weight) || 3500}
            initialHealth={assessmentConfig.health}
            onComplete={(result) => processAssessmentResult(assessmentConfig.event, assessmentConfig.type, result)}
            onSwitchToQuiz={() => setUseLegacyQuiz(true)}
          />
        )
      )}
  
      {/* ⚠️ PHASE 1: INITIAL STORM DETECTED MODAL */}
      {chaosEvent && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="chaos-modal" style={{ borderTopColor: '#e74c3c', boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 40px rgba(231, 76, 60, 0.1)' }}>
            <div className="modal-shake-chaos">
              <h1 className="warning-title" style={{ color: '#ff4757' }}>⚠️ MAYDAY: STORM DETECTED</h1>
              <p style={{ color: '#94a3b8', marginBottom: '20px', fontSize: '14px' }}>Logistics order <strong style={{color: '#fff'}}>{chaosEvent.cargo}</strong> hit a severe storm.</p>
              
              <div style={{ background: 'rgba(231, 76, 60, 0.1)', border: '1px solid rgba(231, 76, 60, 0.3)', padding: '12px', borderRadius: '8px', display: 'inline-block', marginBottom: '10px' }}>
                <h3 style={{ color: '#ff4757', margin: 0, animation: 'pulseGlow 1s infinite', fontSize: '16px', letterSpacing: '2px', fontFamily: 'var(--font-mono)' }}>
                  AUTO-PUSH IN: {chaosTimer}s
                </h3>
              </div>

              <div className="chaos-actions">
                <button className="btn-push danger-btn" onClick={() => handleChaosChoice('PUSH')} style={{ flex: 1 }}>
                  PUSH THROUGH <span className="btn-subtext">Roll the dice (80% Risk)</span>
                </button>
                
                {/* 🔥 UPDATED: Tactical Retreat Button */}
                <button className="btn-push warning-btn" onClick={() => handleChaosChoice('RETREAT')} style={{ flex: 1 }}>
                  TACTICAL RETREAT <span className="btn-subtext">Fall back to Safe Node (Freezes)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 🧭 PHASE 2: THE TACTICAL RELAUNCH MODAL */}
      {relaunchEvent && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="chaos-modal" style={{ borderTopColor: '#3498db', boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 40px rgba(52, 152, 219, 0.15)' }}>
            <h1 className="warning-title" style={{ color: '#3498db' }}>TACTICAL RELAUNCH</h1>
            <p style={{ color: '#94a3b8', marginBottom: '30px', fontSize: '14px' }}>Vessel <strong style={{color: '#fff'}}>{relaunchEvent.cargo}</strong> is holding position.</p>
            
            <div className="chaos-actions">
              <button className="btn-push info-btn" onClick={() => executeRelaunch('REROUTE')} style={{ flex: 1 }}>
                REROUTE 
                <span className="btn-subtext">Safe Path (Cost: ${(DESTINATION_PRICING[relaunchEvent.destination] * 0.7).toLocaleString()})<br/>Delay: +1 Day</span>
              </button>
              
              <button className="btn-push neutral-btn" onClick={() => executeRelaunch('WAIT')} style={{ flex: 1 }}>
                WAIT IT OUT 
                <span className="btn-subtext">Hold Position (Free)<br/>Delay: +2 Days</span>
              </button>
            </div>
            
            <button className="btn-cancel-tactical" onClick={() => setRelaunchEvent(null)}>CANCEL OPERATIONS</button>
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
          
          {/* THE LIST VIEW */}
          {!selectedTrackingId ? (
            <>
              <div className="panel-header">
                <h3>Live Fleet Tracking</h3>
                <span className="badge docked">{activeShipCount} Active</span>
              </div>
              
              {/* 🔥 NEW: Fleet Filter Pills */}
              <div className="status-filters" style={{ margin: '10px 0', display: 'flex', gap: '8px' }}>
                <button className={`filter-pill ${fleetFilter === 'ALL' ? 'active' : ''}`} onClick={() => setFleetFilter('ALL')}>ALL</button>
                <button className={`filter-pill ${fleetFilter === 'OUTBOUND' ? 'active' : ''}`} onClick={() => setFleetFilter('OUTBOUND')}>OUTBOUND</button>
                <button className={`filter-pill ${fleetFilter === 'ARRIVED' ? 'active' : ''}`} onClick={() => setFleetFilter('ARRIVED')}>ARRIVED</button>
                <button className={`filter-pill ${fleetFilter === 'FAILED' ? 'active' : ''}`} onClick={() => setFleetFilter('FAILED')}>EXCEPTIONS</button>
              </div>
              
              <div className="traffic-list" style={{ marginTop: '10px' }}>
                {myShips.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#666', marginTop: '20px' }}>No active logistics orders.</p>
                ) : (
                  // 🔥 FIX: Filter by status, then Reverse the array so latest is on top
                  [...myShips]
                    .filter(ship => {
                      if (fleetFilter === 'ALL') return true;
                      if (fleetFilter === 'EXCEPTIONS') return ship.status === 'Failed' || ship.status === 'Sheltered';
                      return ship.status.toUpperCase() === fleetFilter;
                    })
                    .sort((a, b) => b.rawId - a.rawId)
                    .map(ship => (
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
                      <span className={`badge ${ship.status === 'Arrived' ? 'docked' : (ship.status === 'Failed' || ship.status === 'Sheltered' ? 'failed' : 'outbound')}`}>
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

                  <button 
                    className={`btn-auto-toggle ${isAutoFollow ? 'active' : ''}`}
                    onClick={() => setIsAutoFollow(!isAutoFollow)}
                    disabled={trackedShip.status !== 'Outbound'}
                    style={{ opacity: trackedShip.status !== 'Outbound' ? 0.5 : 1, cursor: trackedShip.status !== 'Outbound' ? 'not-allowed' : 'pointer' }}
                  >
                    {isAutoFollow ? '◉ AUTO: ON' : '○ AUTO: OFF'}
                  </button>
                </div>
                
                <div className="tracking-info-header">
                  <h4 style={{ margin: '0 0 5px 0', textTransform: 'uppercase' }}>{trackedShip.cargo}</h4>
                  <p className="text-muted" style={{ margin: 0 }}>{trackedShip.id} • {trackedShip.destination}</p>
                </div>

                <div className="scrollable-timeline-container">
                  <div className="shopee-timeline">

                    {/* Step 8: Cargo Discharged */}
                    <div className={`timeline-step truck-step ${progress >= 0.95 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.95), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.95), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Cargo Discharged</strong>
                        <p>Consignment successfully handed over to the final consignee.</p>
                      </div>
                    </div>

                    {/* Step 7: Port of Discharge (POD) */}
                    <div className={`timeline-step truck-step ${progress >= 0.85 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.85), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.85), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Port of Discharge </strong>
                        <p>Vessel berthed and freight unloaded at destination terminal in {trackedShip.destination}.</p>
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
                          <strong style={{color: '#e74c3c'}}>Navigational Exception</strong>
                          <p>Severe meteorological anomaly detected. Vessel executing holding pattern.</p>
                        </div>
                      </div>
                    )}

                    {/* Step 6: Deep Sea Transit */}
                    <div className={`timeline-step ship-step ${progress > 0.20 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.21), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.21), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Deep Sea Transit</strong>
                        <p>Vessel navigating active maritime shipping lanes.</p>
                      </div>
                    </div>

                    {/* Step 5: Outbound Clearance */}
                    <div className={`timeline-step ship-step ${progress >= 0.20 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.20), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.20), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Outbound Clearance</strong>
                        <p>Manifest approved by port authority. Vessel departed Port of Loading (POL).</p>
                      </div>
                    </div>

                    {/* Step 4: Export Customs */}
                    <div className={`timeline-step truck-step ${progress >= 0.15 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.15), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.15), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Export Customs</strong>
                        <p>Consignment undergoing border security and export declaration.</p>
                      </div>
                    </div>

                    {/* Step 3: Terminal Gate-In */}
                    <div className={`timeline-step truck-step ${progress >= 0.1 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.1), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.1), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Terminal Gate-In</strong>
                        <p>Freight arrived at Origin Container Yard / Export Zone.</p>
                      </div>
                    </div>

                    {/* Step 2: Cargo Stuffing */}
                    <div className={`timeline-step truck-step ${progress >= 0.05 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.05), 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime + (trackedShip.duration * 0.05), 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Cargo Stuffing</strong>
                        <p>Freight forwarder consolidating cargo and generating Bill of Lading.</p>
                      </div>
                    </div>

                    {/* Step 1: Booking Confirmed */}
                    <div className={`timeline-step truck-step ${progress >= 0.0 ? 'completed' : 'pending'}`}>
                      <div className="step-timestamp">
                        <span className="date">{formatShopeeTime(trackedShip.startTime, 'date')}</span>
                        <span className="time">{formatShopeeTime(trackedShip.startTime, 'time')}</span>
                      </div>
                      <div className="step-indicator"><div className="step-dot"></div><div className="step-line"></div></div>
                      <div className="step-content">
                        <strong>Booking Confirmed</strong>
                        <p>Transport order registered at {trackedShip.category && trackedShip.category.includes('Perishable') ? 'Central Cold Storage' : 'Panabo North Facility'}.</p>
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
            <span className="badge docked">{PANABO_HUBS.length + NATIONAL_HUBS.length + GLOBAL_HUBS.length} Online</span>
          </div>
          
          <div className="traffic-list" style={{ marginTop: '10px' }}>
            {/* Origin Facilities */}
            <h4 style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '5px 0'}}>Origin Facilities (Local)</h4>
            {PANABO_HUBS.map(hub => (
              <div className="upgrade-card" key={hub.id} onClick={() => setFlyTarget({ pos: hub.pos })} style={{ cursor: 'pointer', padding: '12px' }}>
                <div className="tc-top">
                  <h4>{hub.name}</h4>
                  <span className={`badge ${hub.status === 'Optimal' || hub.status === 'Active' ? 'docked' : 'outbound'}`}>{hub.status}</span>
                </div>
                <p className="upgrade-desc" style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>
                  {hub.type} <span style={{ color: '#aaa', fontWeight: 'normal' }}>• {hub.stat}</span>
                </p>
              </div>
            ))}

            {/* 🔥 NEW: National Hubs */}
            <h4 style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '15px 0 5px 0'}}>Domestic Markets (National)</h4>
            {NATIONAL_HUBS.map(hub => (
              <div className="upgrade-card" key={hub.id} onClick={() => setFlyTarget({ pos: hub.pos })} style={{ cursor: 'pointer', padding: '12px', borderLeft: '3px solid #2ecc71' }}>
                <div className="tc-top">
                  <h4>{hub.name}</h4>
                  <span className="badge docked">{hub.status}</span>
                </div>
                <p className="upgrade-desc" style={{ color: '#2ecc71', fontWeight: 'bold' }}>
                  {hub.type} <span style={{ color: '#aaa', fontWeight: 'normal' }}>• {hub.stat}</span>
                </p>
              </div>
            ))}

            {/* Global Hubs */}
            <h4 style={{fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '15px 0 5px 0'}}>Destination Markets (Global)</h4>
            {GLOBAL_HUBS.map(hub => (
              <div className="upgrade-card" key={hub.id} onClick={() => setFlyTarget({ pos: hub.pos })} style={{ cursor: 'pointer', padding: '12px', borderLeft: '3px solid #f39c12' }}>
                <div className="tc-top">
                  <h4>{hub.name}</h4>
                  <span className="badge docked">{hub.status}</span>
                </div>
                <p className="upgrade-desc" style={{ color: '#f39c12', fontWeight: 'bold' }}>
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
                <select 
                  value={ticketForm.weight} 
                  onChange={e => setTicketForm({...ticketForm, weight: e.target.value})} 
                  className="modern-select"
                >
                  <option value="1500">1,500 kg (Light)</option>
                  <option value="2000">2,000 kg (Standard)</option>
                  <option value="2500">2,500 kg (Heavy)</option>
                  <option value="3000">3,000 kg</option>
                  <option value="4000">4,000 kg</option>
                  <option value="5000">5,000 kg (Maximum TEU)</option>
                </select>
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
        <button 
          className={`action-btn ${activePanel === 'tracking' ? 'tracking-active-pulse' : ''}`} 
          onClick={() => setActivePanel(activePanel === 'tracking' ? '' : 'tracking')}
        >
          📍 Live Tracking {activePanel === 'tracking' && <span className="pulsing-dot-blue"></span>}
        </button>
        <button 
          className={`action-btn ${activePanel === 'hubs' ? 'active-blue' : ''}`} 
          onClick={() => setActivePanel(activePanel === 'hubs' ? '' : 'hubs')}
        >
          🏠 Facility Ops
        </button>
        <button 
          className={`action-btn ${activePanel === 'export' ? 'active-blue' : ''}`} 
          onClick={() => setActivePanel(activePanel === 'export' ? '' : 'export')}
        >
          📦 Logistics
        </button>
      </div>

      <main className="sim-map-fullscreen">
        <MapContainer 
          center={portPosition} 
          zoom={5} 
          minZoom={4} 
          maxZoom={18} /* 🔥 INCREASED: Allows deep street-level zooming */
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
          
          <MapFlyToHandler target={flyTarget} />
          
          <AutoFollowCamera targetPos={trackedNav?.pos} isAutoFollow={isAutoFollow} 
          transportType={trackedNav?.phase.type} currentSpeed={trackedShip?.currentSpeed} />

          {/* 🔥 Hide normal controls when AUTO is on! */}
          {!isAutoFollow && <CustomSimControls isLightMode={isLightMode} setIsLightMode={setIsLightMode} />}
          {/* Update this line inside your <MapContainer> */}
          <MapEventsTracker setZoomLevel={setZoomLevel} setIsAutoFollow={setIsAutoFollow} isAutoFollow={isAutoFollow} />

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

          {/* 🔥 NEW: Render National Hubs on the Map */}
          {zoomLevel < 25 && NATIONAL_HUBS.map(hub => (
            <Marker key={hub.id} position={hub.pos} icon={createHouseIcon()}>
              <Popup className="custom-popup dark-popup">
                <div style={{ padding: '5px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#2ecc71' }}>{hub.name}</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#ccc' }}>{hub.type} • {hub.stat}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* 🔥 NEW: Global Destination Hubs */}
          {zoomLevel < 25 && GLOBAL_HUBS.map(hub => (
            <Marker key={hub.id} position={hub.pos} icon={createHouseIcon()}>
              <Popup className="custom-popup dark-popup">
                <div style={{ padding: '5px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#f39c12' }}>{hub.name}</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#ccc' }}>{hub.type} • {hub.stat}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {activeExports.map((exp) => {
            const nav = calculateNavigation(exp);
            
            // 🔥 FIX: Trust the A* Algorithm completely. Remove the unshift hack.
            let displayWaypoints = exp.waypoints ? [...exp.waypoints] : [];

            return (
              <React.Fragment key={exp.id}>
                
                {/* 🔥 MAP CLEANUP: Only draw lines if the ship is actively Outbound */}
                {displayWaypoints.length > 0 && exp.status === 'Outbound' && (
                  <Polyline positions={displayWaypoints} pathOptions={{ color: '#2ecc71', dashArray: '5, 10', weight: 2, opacity: 0.6 }} />
                )}
                
                {exp.status === 'Outbound' && displayWaypoints.map((wp, i) => (
                  <Marker key={`dot-${i}`} position={wp} icon={createDotIcon()} />
                ))}

                <Marker 
                  position={nav.pos} 
                  icon={createTransportIcon(nav.phase.type, exp.status, nav.angle, nav.health)}
                  eventHandlers={{ click: () => { 
                    // 🔥 PRIVACY: Only open the private side panel if YOU own the ship
                    if (exp.commander === userId) {
                      setSelectedTrackingId(exp.id); 
                      setActivePanel('tracking'); 
                    }
                  } }}
                >
                  {/* 🔥 HIDE POPUP WHEN AUTO IS ON (Prevents dual-modals on screen) */}
                  {!(isAutoFollow && selectedTrackingId === exp.id) && (
                    <Popup className="custom-popup dark-popup">
                      <div style={{ padding: '12px', textAlign: 'left', minWidth: '180px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div>
                            <h4 style={{ margin: 0, color: '#3498db', textTransform: 'uppercase' }}>{exp.cargo}</h4>
                            <span style={{ fontSize: '10px', color: '#888' }}>{exp.id} • Cmdr: {exp.commander}</span>
                          </div>
                          <span style={{ fontSize: '10px', color: '#ccc', marginTop: '2px' }}>{exp.status}</span>
                        </div>
                        
                        {/* 🔥 PRIVACY UI: Only show controls if the current user owns this ship */}
                        {exp.commander !== userId ? (
                           <div style={{ textAlign: 'center', padding: '10px 0', borderTop: '1px solid #333', marginTop: '10px' }}>
                             <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0 }}>Restricted Access.</p>
                             <p style={{ color: 'var(--accent-blue)', fontSize: '10px', margin: '4px 0 0 0', textTransform: 'uppercase' }}>Vessel belongs to allied commander.</p>
                           </div>
                        ) : exp.status === 'Sheltered' ? (
                           <div className="relaunch-container">
                             <p className="relaunch-warning-text" style={{ color: '#e74c3c' }}>VESSEL BLOWN BACK</p>
                             {/* 🔥 FIX: Open the new modal instead of launching instantly */}
                             <button className="btn-launch-sim relaunch-btn" onClick={() => setRelaunchEvent(exp)}>
                               Review Tactical Options
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

                             <div style={{ padding: '6px', borderRadius: '4px', marginBottom: '12px', border: '1px solid rgba(130, 160, 255, 0.1)' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
                                <span>Current Phase</span>
                                <span>Progress</span>
                              </div>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                                  {exp.status === 'Arrived' ? 'DELIVERED' : nav.phase.label.toUpperCase()}
                                </span>
                                <strong style={{ color: 'var(--accent-blue)', fontSize: '12px' }}>
                                  {exp.status === 'Arrived' ? '100.0' : ((Math.min(((Date.now() + (exp.timeOffset || 0)) - exp.startTime) / exp.duration, 1)) * 100).toFixed(1)}%
                                </strong>
                              </div>
                            </div>

                             {exp.status === 'Outbound' && (
                               <>
                                 <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '10px' }}>
                                   {/* 🔥 THE FIX: The middle button mathematically calculates exactly 1% progress per real-time second! */}
                                   <button disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${exp.currentSpeed === 1 ? 'active-blue' : ''}`} style={{ padding: '6px 12px', fontSize: '12px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(exp.id, 1)}>▶</button>
                                   <button disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${exp.currentSpeed > 1 && exp.currentSpeed < 21600 ? 'active-blue' : ''}`} style={{ padding: '6px 12px', fontSize: '12px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(exp.id, Math.max(2, Math.floor(exp.duration * 0.01 / 1000)))}>⏭</button>
                                   <button disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${exp.currentSpeed >= 21600 ? 'active-blue' : ''}`} style={{ padding: '6px 12px', fontSize: '12px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(exp.id, 21600)}>🚀</button>
                                 </div>

                                 {/* 🔥 NEW: Manual 3D Helm Trigger Button */}
                                 {/* 🔥 NEW: Manual 3D Helm Trigger Button */}
                                 <button className="btn-launch-sim" style={{ width: '100%', marginTop: '8px', padding: '7px', fontSize: '11px' }} onClick={() => { changeShipSpeed(exp.id, 0); setUseLegacyQuiz(false); setAssessmentConfig({
                                       event: exp, type: 'PUSH', health: parseFloat(nav.health) || 100});
                                   }}
                                 >
                                   ⚓ PILOT VESSEL (3D)
                                 </button>
                               </>
                             )}
                           </>
                        )}
                      </div>
                    </Popup>
                  )}
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* 🔥 THE NEW TARGET HUD (Replaces Minimap) */}
        {isAutoFollow && trackedNav && trackedShip && (
          <div className="target-hud-overlay">
            <div style={{ padding: '15px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ margin: 0, color: '#3498db', textTransform: 'uppercase', fontSize: '16px' }}>{trackedShip.cargo}</h4>
                  <span style={{ fontSize: '11px', color: '#888' }}>{trackedShip.id} • Cmdr: {userId}</span>
                </div>
                <span className={`badge ${trackedShip.status === 'Failed' || trackedShip.status === 'Sheltered' ? 'failed' : 'outbound'}`} style={{ marginTop: '2px' }}>{trackedShip.status}</span>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', marginBottom: '6px' }}>
                  <span>Goods Health</span><span>{trackedNav.health}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${trackedNav.health}%`, height: '100%', background: trackedNav.health < 70 ? '#e74c3c' : 'var(--accent-blue)', transition: 'width 0.3s' }}></div>
                </div>
              </div>

              {/* 🔥 NEW: Replaced the old text with the modern Phase / Progress Block */}
              <div style={{ padding: '6px', borderRadius: '4px', marginBottom: '15px', border: '1px solid rgba(130, 160, 255, 0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
                  <span>Current Phase</span>
                  <span>Progress</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                    {trackedShip.status === 'Arrived' ? 'DELIVERED' : (trackedNav.phase?.label || 'IN TRANSIT').toUpperCase()}
                  </span>
                  <strong style={{ color: 'var(--accent-blue)', fontSize: '12px' }}>
                    {trackedShip.status === 'Arrived' ? '100.0' : ((Math.min(((Date.now() + (trackedShip.timeOffset || 0)) - trackedShip.startTime) / trackedShip.duration, 1)) * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>

              {trackedShip.status === 'Outbound' && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  {/* 🔥 THE FIX: Applied the same 1% Dynamic Math here */}
                  <button disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${trackedShip.currentSpeed === 1 ? 'active-blue' : ''}`} style={{ padding: '8px 16px', fontSize: '14px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(trackedShip.id, 1)}>▶</button>
                  <button disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${trackedShip.currentSpeed > 1 && trackedShip.currentSpeed < 21600 ? 'active-blue' : ''}`} style={{ padding: '8px 16px', fontSize: '14px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(trackedShip.id, Math.max(2, Math.floor(trackedShip.duration * 0.01 / 3000)))}>⏭</button>
                  <button disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${trackedShip.currentSpeed >= 21600 ? 'active-blue' : ''}`} style={{ padding: '8px 16px', fontSize: '14px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(trackedShip.id, 21600)}>🚀</button>
                </div>
              )}
            </div>
          </div>
        )}
        
      </main>
    </div>
  );
};
export default Simulation;