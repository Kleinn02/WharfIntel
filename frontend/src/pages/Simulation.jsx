import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Simulation.css';
import AssessmentModal from './AssessmentModal';
import VesselHelm3D from './VesselHelm3D'; // 🔥 NEW: 3D Boat Physics Simulator
import TruckHaul3D from './TruckHaul3D'; // 🔥 NEW: 3D Inland Truck Simulator
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

// Coordinate lookup for Interactive Route Hover Previews
const DESTINATION_COORDINATES = {
  "Panabo Wharf": [7.300, 125.650],
  "Davao City Port": [7.284, 125.681],
  "Manila, Philippines": [14.599, 120.984],
  "Cebu Port": [10.292, 123.901],
  "Batangas Terminal": [13.756, 121.058],
  "Singapore": [1.290, 103.850],
  "Ho Chi Minh, Vietnam": [10.823, 106.629],
  "Bangkok, Thailand": [13.756, 100.501],
  "Jakarta, Indonesia": [-6.208, 106.845],
  "Muara, Brunei": [5.027, 115.064],
  "Yangon, Myanmar": [16.840, 96.145],
  "Dili, Timor-Leste": [-8.558, 125.573]
};

const getPortTier = (portName) => {
  if (PORT_DATABASE.Local.includes(portName)) return 'Local';
  if (PORT_DATABASE.National.includes(portName)) return 'National';
  return 'Global';
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
  // 🔥 FIX: Assign Green for Trucks, Sky Blue (#38bdf8) for Sea Vessels
  let color = type === 'truck' ? '#2ecc71' : '#38bdf8'; 
  
  if (health < 70 || status === 'Failed') color = '#ef4444'; 
  
  const truckSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="${color}" stroke="#111" stroke-width="1"><path d="M12 2L22 20L12 17L2 20L12 2Z"/></svg>`;
  const vesselSvg = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M4 22L12 2L20 22L12 16L4 22Z" fill="rgba(56, 189, 248, 0.2)"/></svg>`;

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

// Deliverable 5: Contextual Auto-Follow Feedback in MapEventsTracker
const MapEventsTracker = ({ setZoomLevel, setIsAutoFollow, isAutoFollow, setManualPanToast }) => {
  const map = useMapEvents({
    zoomend: () => setZoomLevel(map.getZoom()),
    dragstart: () => {
      if (isAutoFollow) {
        setIsAutoFollow(false);
        setManualPanToast(true);
      }
    }
  });
  return null;
};

// Deliverable 6: Smooth Warp & FlyTo Camera Transitions
const MapFlyToHandler = ({ target }) => {
  const map = useMap();
  useEffect(() => {
    if (target && target.pos) {
      map.flyTo(target.pos, target.zoom || 16, {
        animate: true,
        duration: target.duration || 1.5,
        easeLinearity: 0.25
      });
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
  const [chaosEvent, setChaosEvent] = useState(null); 
  const [chaosTimer, setChaosTimer] = useState(15); 
  const [globalWeather, setGlobalWeather] = useState('NOMINAL');
  const [weatherSyncTrigger, setWeatherSyncTrigger] = useState(0); // 🔥 NEW: Triggers HUD update
  const [relaunchEvent, setRelaunchEvent] = useState(null); // 🔥 THE FIX: Added Relaunch State!
  const [assessmentConfig, setAssessmentConfig] = useState(null);
  const [truckSimEvent, setTruckSimEvent] = useState(null); // 🔥 Tracks active 3D Truck Haul
  const [useLegacyQuiz, setUseLegacyQuiz] = useState(false); // 🔥 Keeps quiz hidden unless toggled!  
  const [ticketForm, setTicketForm] = useState({ cargo: '', weight: '1500', destination: '', type: 'Perishable (Food)', scale: 'Global' });
  const [selectedTrackingId, setSelectedTrackingId] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [isAutoFollow, setIsAutoFollow] = useState(false); // 🔥 AUTO Camera State
  const [fleetFilter, setFleetFilter] = useState('ALL'); // 🔥 FIX: The missing filter state!
  const [showBoosters, setShowBoosters] = useState(false);

  // Deliverable 1, 2, 5, 6 New States
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState('');
  const [previewRoute, setPreviewRoute] = useState(null);
  const [manualPanToast, setManualPanToast] = useState(false);
  const [isWarpFlying, setIsWarpFlying] = useState(false);
  const comboboxRef = useRef(null);

  // Close combobox when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target)) {
        setIsComboboxOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Clear preview polyline when switching panels
  useEffect(() => {
    setPreviewRoute(null);
  }, [activePanel]);

  // Clear manual pan toast automatically if auto-follow is re-engaged
  useEffect(() => {
    if (isAutoFollow) {
      setManualPanToast(false);
    }
  }, [isAutoFollow]);

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
  const AutoFollowCamera = ({ targetPos, isAutoFollow, transportType, currentSpeed, isWarpFlying }) => {
    const map = useMap();

    useEffect(() => {
      // Hold off immediate setView snapping while smooth flyTo warp lock-on is in progress
      if (isAutoFollow && targetPos && !isWarpFlying) {
        // Truck = Zoom 15, Sea Vessel = Zoom 10
        const targetZoom = transportType === 'truck' ? 15 : 10;
        
        // 🔥 CRITICAL FIX: If speed is > 1 (Warping), disable smooth animation 
        // to prevent Leaflet from crashing/graying out the map.
        const isWarping = currentSpeed > 1;
        
        map.setView(targetPos, targetZoom, { 
          animate: !isWarping, 
          duration: isWarping ? 0 : 0.5 
        });
      }
    }, [targetPos, isAutoFollow, map, transportType, currentSpeed, isWarpFlying]);
    
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

  // 🔥 UNIVERSAL 3D LAUNCHER (Truck on Land 0-20%, Vessel at Sea 20%+)
  const launchManual3DHelm = (shipObj, currentHealthVal) => {
    if (!shipObj) return;
    changeShipSpeed(shipObj.id, 0);
    const nav = calculateNavigation(shipObj);
    if (nav.phase.type === 'truck') {
      setTruckSimEvent({
        event: shipObj,
        health: parseFloat(currentHealthVal) || 100
      });
    } else {
      setUseLegacyQuiz(false);
      setAssessmentConfig({
        event: shipObj,
        type: 'PUSH',
        health: parseFloat(currentHealthVal) || 100
      });
    }
  };

  // Deliverable 6: Smooth Warp Camera Transitions using map.flyTo()
  const triggerWarpSequence = (shipId, newSpeed) => {
    if (newSpeed === 1 || newSpeed === 0) {
      changeShipSpeed(shipId, newSpeed);
      return;
    }

    const targetShip = activeExports.find(s => s.id === shipId);
    const nav = targetShip ? calculateNavigation(targetShip) : null;
    const targetZoom = nav?.phase?.type === 'truck' ? 15 : 10;

    // 1. Lock target & pause vessel while camera glides smoothly via flyTo
    setSelectedTrackingId(shipId);
    setManualPanToast(false);
    setIsWarpFlying(true);
    setIsAutoFollow(true);
    changeShipSpeed(shipId, 0);

    if (nav?.pos) {
      setFlyTarget({ pos: nav.pos, zoom: targetZoom, duration: 1.4, timestamp: Date.now() });
    }

    addTerminalLog(`> SEQUENCE: Locking camera to ${shipId}...`, 'warning');

    // 2. Engage warp speed after smooth flyTo completes
    setTimeout(() => {
      setIsWarpFlying(false);
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

  // Deliverable 2: Route Hover Preview Handler
  const handlePreviewHover = (destCoords) => {
    if (!destCoords) {
      setPreviewRoute(null);
      return;
    }
    const originHubPos = ticketForm.type && ticketForm.type.includes('Perishable')
      ? PANABO_HUBS[1].pos
      : PANABO_HUBS[0].pos;
    
    // If destination is Panabo Wharf or Davao Port, draw direct segment, else route through Davao Port
    const isSameAsPort = Math.abs(destCoords[0] - portPosition[0]) < 0.02 && Math.abs(destCoords[1] - portPosition[1]) < 0.02;
    if (isSameAsPort) {
      setPreviewRoute([originHubPos, destCoords]);
    } else {
      setPreviewRoute([originHubPos, portPosition, destCoords]);
    }
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
    
    let progress = Math.min(elapsed / ship.duration, 1);
    
    if (ship.status === 'Arrived' || progress >= 1 || waypoints.length < 2) {
      return { pos: waypoints[waypoints.length - 1] || [0,0], angle: 0, phase: { type: 'vessel', label: 'Delivered', step: 4 }, health: ship.cargoType === 'Perishable (Food)' ? 60 : 100 };
    }
    
    const segmentProgress = progress * totalSegments;
    const idx = Math.floor(segmentProgress);
    const nextIdx = idx + 1;
    const lerp = segmentProgress - idx;
    
    const currentPos = [waypoints[idx][0] + (waypoints[nextIdx][0] - waypoints[idx][0]) * lerp, waypoints[idx][1] + (waypoints[nextIdx][1] - waypoints[idx][1]) * lerp];    
    
    const davaoIdx = waypoints.findIndex(wp => Math.abs(wp[0] - 7.284) < 0.01 && Math.abs(wp[1] - 125.681) < 0.01);
    const portThreshold = davaoIdx > -1 ? davaoIdx : 1;

    let currentPhase = { type: 'vessel', label: 'Ocean Transit (Vessel)', step: 2 };
    
    if (progress < 0.20) {
      currentPhase = { type: 'truck', label: 'Origin Hub (Truck)', step: 1 };
    }

    let currentHealth = ship.cargoHealth !== undefined ? ship.cargoHealth : 100;
    currentHealth = Math.max(0, Math.min(100, currentHealth)).toFixed(1);

    return { 
      pos: currentPos, 
      angle: getBearing(currentPos[0], currentPos[1], waypoints[nextIdx][0], waypoints[nextIdx][1]),
      phase: currentPhase,
      health: currentHealth
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
            weightKg: s.weight_kg || 2500,
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
            cargoHealth: s.cargo_health,
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
    const interval = setInterval(() => {
      setChaosEvent(currentChaos => {
        setRelaunchEvent(currentRelaunch => {
          if (currentChaos || currentRelaunch) {
             return currentRelaunch;
          }

          setSimTime(Date.now()); 

          setActiveExports(currentExports => {
            
            const updatedExports = currentExports.map(exp => {
              if (exp.status === 'Outbound') {
                const newOffset = (exp.timeOffset || 0) + (tickRateMs * (exp.currentSpeed || 1)) - tickRateMs;
                localStorage.setItem(`offset_${exp.id}`, newOffset.toString());
                return { ...exp, timeOffset: newOffset };
              }
              return exp;
            });
            return updatedExports;
          });

          return currentRelaunch;
        });
        return currentChaos;
      });
    }, tickRateMs);
    
    return () => clearInterval(interval);
  }, [userId]);

  useEffect(() => {
    activeExports.forEach(ship => {
      const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
      
      if (ship.stormTime && shipPersonalTime >= ship.stormTime && !ship.eventHandled && ship.status === 'Outbound') {
        const nav = calculateNavigation(ship);
        if (nav.phase.type === 'truck') {
          setActiveExports(prev => prev.map(s => s.id === ship.id ? { ...s, stormTime: shipPersonalTime + 3000 } : s));
          return; 
        }

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
    if (!ticketForm.destination) {
      setNotification({ title: 'Missing Destination', message: 'Please select a valid destination market from the list.', type: 'error' });
      return;
    }

    const payload = {
      cargo_name: ticketForm.cargo,
      weight_kg: Number(ticketForm.weight) || 5000, 
      destination_country: ticketForm.destination,
      scale: ticketForm.scale, 
      category: ticketForm.type,
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
        setTicketForm({ cargo: '', weight: '1500', destination: '', type: 'Perishable (Food)', scale: 'Global' });
        setDestinationSearch('');
        setPreviewRoute(null);
        setActivePanel('tracking'); 
        
        const newShipsRes = await fetch(`${API_BASE}/admin/ticketing/active?username=${userId}`);
        await newShipsRes.json();
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
    const nav = calculateNavigation(chaosEvent);
    const startingHealth = parseFloat(nav.health) || 100;
    
    setAssessmentConfig({
      event: chaosEvent,
      type: choice,
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
      return;
    }
    
    processAssessmentResult(relaunchEvent, choice, { success: true, finalHealth: Math.max(0, (parseFloat(calculateNavigation(relaunchEvent).health) || 100) - 15) });
  };

  const processAssessmentResult = async (activeEvent, choice, result) => {
    setAssessmentConfig(null);
    if (choice === 'PUSH' || choice === 'RETREAT') setChaosEvent(null);
    if (choice === 'REROUTE' || choice === 'WAIT') setRelaunchEvent(null);

    const shipPersonalTime = Date.now() + (activeEvent.timeOffset || 0);
    const progress = Math.min((shipPersonalTime - activeEvent.startTime) / activeEvent.duration, 1);
    const currentIdx = Math.floor(progress * ((activeEvent.waypoints?.length || 2) - 1));

    const nav = calculateNavigation(activeEvent);
    const startingHealth = parseFloat(nav.health) || 100;
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
          is_success: result.success,
          health_penalty: healthPenalty
        }) 
      });
      
      if (res.ok) {
        const data = await res.json();
        
        const penaltyMs = choice === 'WAIT' ? 172800000 : (choice === 'REROUTE' ? 86400000 : 0);
        const newDuration = activeEvent.duration + penaltyMs;
        const requiredElapsed = progress * newDuration;
        const newTimeOffset = requiredElapsed - Date.now() + activeEvent.startTime;
        localStorage.setItem(`offset_${activeEvent.id}`, newTimeOffset.toString());

        await fetchGameState(); 
        
        if (data.status !== 'Sheltered' && data.status !== 'Failed') {
          changeShipSpeed(activeEvent.id, 1); 
        }
        
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

  const trackedShip = activeExports.find(s => s.id === selectedTrackingId) || myShips.find(s => s.status === 'Outbound') || activeExports[activeExports.length - 1];
  let trackedNav = null;
  let progress = 0;
  if (trackedShip) {
    trackedNav = calculateNavigation(trackedShip);
    progress = Math.min(((Date.now() + (trackedShip.timeOffset || 0)) - trackedShip.startTime) / trackedShip.duration, 1);
  }

  // Filtered options for Custom Destination Combobox
  const filteredDestinations = getOptions().filter(port =>
    port.toLowerCase().includes(destinationSearch.toLowerCase())
  );

  // --- RENDER ---
  return (
    <div className={`sim-wrapper ${isLightMode ? 'light-mode' : ''} ${chaosEvent ? 'storm-alert' : ''}`}>
      
      {/* 🔥 The subtle radar hex-grid over the map */}
      <div className="radar-grid-overlay"></div>

      <div className="climate-overlay"></div>

      {/* Deliverable 5: Contextual Auto-Follow Feedback Toast */}
      {manualPanToast && !isAutoFollow && (
        <div className="manual-pan-toast">
          <span className="toast-status-dot"></span>
          <span className="toast-text">
            Manual Pan Engaged — Click Target Card or <strong>[Re-Center]</strong> to Resume Tracking
          </span>
          <button
            type="button"
            className="btn-recenter-toast"
            onClick={() => {
              setIsAutoFollow(true);
              setManualPanToast(false);
            }}
          >
            Re-Center
          </button>
          <button
            type="button"
            className="btn-dismiss-toast"
            onClick={() => setManualPanToast(false)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* 🔥 Hide Exit Button when AUTO is ON to prevent breaking the simulation */}
      {!isAutoFollow && (
        <button className="sim-exit-btn" onClick={() => setShowExitModal(true)}>
          <LogoutIcon />
        </button>
      )}

      {/* 🔥 MACRO-CLIMATE WEATHER HUD & REPUTATION */}
      {!isAutoFollow && (
        <>
          <div className="reputation-hud-pill">
            REP: <span style={{ color: 'var(--accent-blue)' }}>{resources.reputation}</span>
          </div>
          <WeatherHUD onWeatherUpdate={setGlobalWeather} syncTrigger={weatherSyncTrigger} />
        </>
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

      {/* 🚛 3D INLAND TRUCK SIMULATOR (Warehouse -> Port Terminal) */}
      {truckSimEvent && (
        <TruckHaul3D
          weatherState={globalWeather}
          cargo={truckSimEvent.event.cargo}
          weightKg={truckSimEvent.event.weightKg || Number(ticketForm.weight) || 2500}
          originHub={
            truckSimEvent.event.category && truckSimEvent.event.category.includes('Perishable')
              ? 'Central Cold Storage'
              : 'Panabo North Facility'
          }
          initialHealth={truckSimEvent.health}
          onExit={() => {
            changeShipSpeed(truckSimEvent.event.id, 1);
            setTruckSimEvent(null);
          }}
          onComplete={(result) => {
            const activeShip = truckSimEvent.event;
            setTruckSimEvent(null);

            if (result.success) {
              const targetElapsed = activeShip.duration * 0.21;
              const newOffset = targetElapsed - (Date.now() - activeShip.startTime);
              localStorage.setItem(`offset_${activeShip.id}`, newOffset.toString());

              const updatedShip = { ...activeShip, timeOffset: newOffset, cargoHealth: result.finalHealth };
              setActiveExports(prev => prev.map(s => s.id === activeShip.id ? updatedShip : s));

              setUseLegacyQuiz(false);
              setAssessmentConfig({
                event: updatedShip,
                type: 'PUSH',
                health: result.finalHealth
              });
            } else {
              processAssessmentResult(activeShip, 'PUSH', result);
            }
          }}
        />
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
            weatherState={globalWeather}
            cargo={assessmentConfig.event.cargo}
            weightKg={assessmentConfig.event.weightKg || Number(ticketForm.weight) || 2500}
            initialHealth={assessmentConfig.health}
            onComplete={(result) => processAssessmentResult(assessmentConfig.event, assessmentConfig.type, result)}
            onSwitchToQuiz={() => setUseLegacyQuiz(true)}
            onExit={() => {
              changeShipSpeed(assessmentConfig.event.id, 1);
              setAssessmentConfig(null);
            }}
          />
        )
      )}
  
      {/* ⚠️ PHASE 1: INITIAL STORM DETECTED MODAL */}
      {chaosEvent && (
        <div className="modal-overlay" style={{ zIndex: 10000 }}>
          <div className="chaos-modal" style={{ borderTopColor: '#ef4444', boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 40px rgba(239, 68, 68, 0.15)' }}>
            <div className="modal-shake-chaos">
              <h1 className="warning-title" style={{ color: '#ef4444' }}>⚠️ MAYDAY: STORM DETECTED</h1>
              <p style={{ color: '#94a3b8', marginBottom: '20px', fontSize: '14px' }}>Logistics order <strong style={{color: '#fff'}}>{chaosEvent.cargo}</strong> hit a severe storm.</p>
              
              <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', padding: '12px', borderRadius: '8px', display: 'inline-block', marginBottom: '10px' }}>
                <h3 style={{ color: '#ef4444', margin: 0, animation: 'pulseGlow 1s infinite', fontSize: '16px', letterSpacing: '2px', fontFamily: 'var(--font-mono)' }}>
                  AUTO-PUSH IN: {chaosTimer}s
                </h3>
              </div>

              <div className="chaos-actions">
                <button className="btn-push danger-btn" onClick={() => handleChaosChoice('PUSH')} style={{ flex: 1 }}>
                  PUSH THROUGH <span className="btn-subtext">Roll the dice (80% Risk)</span>
                </button>
                
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
          <div className="chaos-modal" style={{ borderTopColor: '#38bdf8', boxShadow: '0 20px 50px rgba(0,0,0,0.5), 0 0 40px rgba(56, 189, 248, 0.15)' }}>
            <h1 className="warning-title" style={{ color: '#38bdf8' }}>TACTICAL RELAUNCH</h1>
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

      {/* Deliverable 4: Animated Slide-Over Drawer */}
      <aside className={`floating-side-panel ${activePanel ? 'is-open' : ''}`}>
        
        {/* 📍 MASTER TRACKING PANEL (List & Detail View) */}
        {activePanel === 'tracking' && (
          <>
            {!selectedTrackingId ? (
              <>
                <div className="panel-header">
                  <h3>Live Fleet Tracking</h3>
                  <span className="badge docked">{activeShipCount} Active</span>
                </div>
                
                <div className="status-filters">
                  <button className={`filter-pill ${fleetFilter === 'ALL' ? 'active' : ''}`} onClick={() => setFleetFilter('ALL')}>ALL</button>
                  <button className={`filter-pill ${fleetFilter === 'OUTBOUND' ? 'active' : ''}`} onClick={() => setFleetFilter('OUTBOUND')}>OUTBOUND</button>
                  <button className={`filter-pill ${fleetFilter === 'ARRIVED' ? 'active' : ''}`} onClick={() => setFleetFilter('ARRIVED')}>ARRIVED</button>
                  <button className={`filter-pill ${fleetFilter === 'EXCEPTIONS' ? 'active' : ''}`} onClick={() => setFleetFilter('EXCEPTIONS')}>EXCEPTIONS</button>
                </div>
                
                <div className="traffic-list" style={{ marginTop: '10px' }}>
                  {myShips.length === 0 ? (
                    <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '20px', fontFamily: 'var(--font-sans)', fontSize: '13px' }}>No active logistics orders.</p>
                  ) : (
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
                        onClick={() => {
                          setSelectedTrackingId(ship.id);
                          if (ship.status === 'Outbound') {
                            setIsAutoFollow(true);
                            setManualPanToast(false);
                          }
                        }}
                        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                      >
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', color: 'var(--accent-blue)', textTransform: 'uppercase', fontFamily: 'var(--font-sans)', fontWeight: 700 }}>{ship.cargo}</h4>
                          <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{ship.id} • {ship.destination}</p>
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
              trackedShip && trackedNav && (
                <>
                  <div className="panel-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px', marginBottom: '15px' }}>
                    <button 
                      onClick={() => setSelectedTrackingId(null)} 
                      style={{ background: 'none', border: 'none', color: 'var(--accent-blue)', cursor: 'pointer', padding: 0, fontSize: '13px', fontWeight: 600, fontFamily: 'var(--font-sans)' }}
                    >
                      ← Back to Fleet
                    </button>

                    <button 
                      className={`btn-auto-toggle ${isAutoFollow ? 'active' : ''}`}
                      onClick={() => {
                        const nextState = !isAutoFollow;
                        setIsAutoFollow(nextState);
                        if (nextState) setManualPanToast(false);
                      }}
                      disabled={trackedShip.status !== 'Outbound'}
                      style={{ opacity: trackedShip.status !== 'Outbound' ? 0.5 : 1, cursor: trackedShip.status !== 'Outbound' ? 'not-allowed' : 'pointer' }}
                    >
                      {isAutoFollow ? '◉ AUTO: ON' : '○ AUTO: OFF'}
                    </button>
                  </div>
                  
                  <div className="tracking-info-header">
                    <h4 style={{ margin: '0 0 5px 0', textTransform: 'uppercase', fontFamily: 'var(--font-sans)', fontSize: '15px' }}>{trackedShip.cargo}</h4>
                    <p className="text-muted" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--text-secondary)' }}>{trackedShip.id} • {trackedShip.destination}</p>

                    {trackedShip.status === 'Outbound' && (
                      <button
                        type="button"
                        className="btn-launch-sim"
                        style={{
                          width: '100%',
                          marginTop: '12px',
                          padding: '10px',
                          fontSize: '12px',
                          backgroundColor: 'var(--accent-blue)',
                          color: '#0b0f19',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'block'
                        }}
                        onClick={() => launchManual3DHelm(trackedShip, trackedNav.health)}
                      >
                        3D SIMULATION
                      </button>
                    )}
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
                          <div className="step-indicator"><div className="step-dot" style={{backgroundColor: '#ef4444', boxShadow: '0 0 8px #ef4444'}}></div><div className="step-line"></div></div>
                          <div className="step-content">
                            <strong style={{color: '#ef4444'}}>Navigational Exception</strong>
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
          </>
        )}

        {/* 🏠 FACILITY OPERATIONS PANEL (With Route Hover Previews) */}
        {activePanel === 'hubs' && (
          <>
            <div className="panel-header">
              <h3>Facility Operations</h3>
              <span className="badge docked">{PANABO_HUBS.length + NATIONAL_HUBS.length + GLOBAL_HUBS.length} Online</span>
            </div>
            
            <div className="traffic-list" style={{ marginTop: '10px' }}>
              <h4 className="hub-section-label">Origin Facilities (Local)</h4>
              {PANABO_HUBS.map(hub => (
                <div
                  className="upgrade-card"
                  key={hub.id}
                  onClick={() => setFlyTarget({ pos: hub.pos, zoom: 16 })}
                  onMouseEnter={() => handlePreviewHover(hub.pos)}
                  onMouseLeave={() => handlePreviewHover(null)}
                  style={{ cursor: 'pointer', padding: '12px' }}
                >
                  <div className="tc-top">
                    <h4>{hub.name}</h4>
                    <span className={`badge ${hub.status === 'Optimal' || hub.status === 'Active' ? 'docked' : 'outbound'}`}>{hub.status}</span>
                  </div>
                  <p className="upgrade-desc" style={{ color: 'var(--accent-blue)', fontWeight: 'bold' }}>
                    {hub.type} <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontFamily: 'var(--font-mono)' }}>• {hub.stat}</span>
                  </p>
                </div>
              ))}

              <h4 className="hub-section-label" style={{ marginTop: '15px' }}>Domestic Markets (National)</h4>
              {NATIONAL_HUBS.map(hub => (
                <div
                  className="upgrade-card"
                  key={hub.id}
                  onClick={() => setFlyTarget({ pos: hub.pos, zoom: 12 })}
                  onMouseEnter={() => handlePreviewHover(hub.pos)}
                  onMouseLeave={() => handlePreviewHover(null)}
                  style={{ cursor: 'pointer', padding: '12px', borderLeft: '3px solid var(--accent-green)' }}
                >
                  <div className="tc-top">
                    <h4>{hub.name}</h4>
                    <span className="badge docked">{hub.status}</span>
                  </div>
                  <p className="upgrade-desc" style={{ color: 'var(--accent-green)', fontWeight: 'bold' }}>
                    {hub.type} <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontFamily: 'var(--font-mono)' }}>• {hub.stat}</span>
                  </p>
                </div>
              ))}

              <h4 className="hub-section-label" style={{ marginTop: '15px' }}>Destination Markets (Global)</h4>
              {GLOBAL_HUBS.map(hub => (
                <div
                  className="upgrade-card"
                  key={hub.id}
                  onClick={() => setFlyTarget({ pos: hub.pos, zoom: 10 })}
                  onMouseEnter={() => handlePreviewHover(hub.pos)}
                  onMouseLeave={() => handlePreviewHover(null)}
                  style={{ cursor: 'pointer', padding: '12px', borderLeft: '3px solid var(--accent-warning)' }}
                >
                  <div className="tc-top">
                    <h4>{hub.name}</h4>
                    <span className="badge docked">{hub.status}</span>
                  </div>
                  <p className="upgrade-desc" style={{ color: 'var(--accent-warning)', fontWeight: 'bold' }}>
                    {hub.type} <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal', fontFamily: 'var(--font-mono)' }}>• {hub.stat}</span>
                  </p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* 📦 DEPLOY LOGISTICS PANEL (Deliverable 1 & 2: Custom Searchable Combobox + Route Hover Previews) */}
        {activePanel === 'export' && (
          <>
            <div className="panel-header"><h3>Deploy Logistics</h3></div>
            <form onSubmit={handleLaunchRoute} className="sim-export-form">
              <div className="form-group">
                <label>Cargo Type</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Cavendish Bananas"
                  value={ticketForm.cargo}
                  onChange={e => setTicketForm({...ticketForm, cargo: e.target.value})}
                  className="modern-input"
                />
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
                  <select
                    value={ticketForm.scale}
                    onChange={e => {
                      setTicketForm({...ticketForm, scale: e.target.value, destination: ''});
                      setDestinationSearch('');
                      setPreviewRoute(null);
                    }}
                    className="modern-select"
                  >
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

              {/* Deliverable 1: Custom Searchable Destination Combobox */}
              <div className="form-group combobox-container" ref={comboboxRef}>
                <label>Destination Market</label>
                <div className={`combobox-input-wrapper ${isComboboxOpen ? 'focused' : ''}`}>
                  <input
                    type="text"
                    required
                    placeholder="Search or select destination port..."
                    value={isComboboxOpen ? destinationSearch : (ticketForm.destination || destinationSearch)}
                    onFocus={() => {
                      setIsComboboxOpen(true);
                      setDestinationSearch('');
                    }}
                    onChange={e => {
                      setDestinationSearch(e.target.value);
                      setTicketForm({...ticketForm, destination: e.target.value});
                      setIsComboboxOpen(true);
                    }}
                    className="modern-input combobox-input"
                  />
                  <button
                    type="button"
                    className="combobox-chevron-btn"
                    onClick={() => setIsComboboxOpen(!isComboboxOpen)}
                    tabIndex={-1}
                  >
                    ▾
                  </button>
                </div>

                {isComboboxOpen && (
                  <div className="combobox-popover">
                    {filteredDestinations.length === 0 ? (
                      <div className="combobox-empty">No available ports matching filter</div>
                    ) : (
                      filteredDestinations.map(port => {
                        const tier = getPortTier(port);
                        const basePrice = DESTINATION_PRICING[port] || 0;
                        const isSelected = ticketForm.destination === port;
                        return (
                          <div
                            key={port}
                            className={`combobox-option ${isSelected ? 'active' : ''}`}
                            onMouseEnter={() => handlePreviewHover(DESTINATION_COORDINATES[port])}
                            onMouseLeave={() => handlePreviewHover(null)}
                            onClick={() => {
                              setTicketForm({ ...ticketForm, destination: port });
                              setDestinationSearch(port);
                              setIsComboboxOpen(false);
                              handlePreviewHover(null);
                            }}
                          >
                            <span className="combobox-port-name">{port}</span>
                            <span className={`tier-badge tier-${tier.toLowerCase()}`}>{tier}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              <button type="submit" className={`btn-launch-sim ${isFleetFull ? 'state-deployed' : ''}`} disabled={isFleetFull}>
                {isFleetFull ? "⏳ FLEET AT CAPACITY (3/3)" : "Confirm Order"}
              </button>
            </form>
          </>
        )}
      </aside>

      {/* Deliverable 3: Centered Floating Navigation Pill */}
      <nav className="sim-bottom-bar">
        <button 
          className={`action-btn ${activePanel === 'tracking' ? 'active-blue tracking-active-pulse' : ''}`} 
          onClick={() => setActivePanel(activePanel === 'tracking' ? '' : 'tracking')}
        >
          <span className={`nav-indicator-dot ${activePanel === 'tracking' || activeShipCount > 0 ? 'dot-live' : ''}`}></span>
          <span>Live Tracking</span>
        </button>
        <button 
          className={`action-btn ${activePanel === 'hubs' ? 'active-blue' : ''}`} 
          onClick={() => setActivePanel(activePanel === 'hubs' ? '' : 'hubs')}
        >
          <span className={`nav-indicator-dot ${activePanel === 'hubs' ? 'dot-active' : ''}`}></span>
          <span>Facility Ops</span>
        </button>
        <button 
          className={`action-btn ${activePanel === 'export' ? 'active-blue' : ''}`} 
          onClick={() => setActivePanel(activePanel === 'export' ? '' : 'export')}
        >
          <span className={`nav-indicator-dot ${activePanel === 'export' ? 'dot-active' : ''}`}></span>
          <span>Logistics</span>
        </button>
      </nav>

      <main className="sim-map-fullscreen">
        <MapContainer 
          center={portPosition} 
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
          
          <MapFlyToHandler target={flyTarget} />
          
          <AutoFollowCamera
            targetPos={trackedNav?.pos}
            isAutoFollow={isAutoFollow} 
            transportType={trackedNav?.phase.type}
            currentSpeed={trackedShip?.currentSpeed}
            isWarpFlying={isWarpFlying}
          />

          {!isAutoFollow && <CustomSimControls isLightMode={isLightMode} setIsLightMode={setIsLightMode} />}
          
          <MapEventsTracker
            setZoomLevel={setZoomLevel}
            setIsAutoFollow={setIsAutoFollow}
            isAutoFollow={isAutoFollow}
            setManualPanToast={setManualPanToast}
          />

          {/* Deliverable 2: Interactive Route Hover Preview Polyline */}
          {previewRoute && previewRoute.length > 1 && (
            <Polyline
              positions={previewRoute}
              pathOptions={{
                color: '#38bdf8',
                dashArray: '8, 12',
                weight: 3,
                opacity: 0.9
              }}
            />
          )}

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

          {zoomLevel < 25 && GLOBAL_HUBS.map(hub => (
            <Marker key={hub.id} position={hub.pos} icon={createHouseIcon()}>
              <Popup className="custom-popup dark-popup">
                <div style={{ padding: '5px' }}>
                  <h4 style={{ margin: '0 0 5px 0', color: '#f1c40f' }}>{hub.name}</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: '#ccc' }}>{hub.type} • {hub.stat}</p>
                </div>
              </Popup>
            </Marker>
          ))}

          {activeExports.map((exp) => {
            const nav = calculateNavigation(exp);
            let displayWaypoints = exp.waypoints ? [...exp.waypoints] : [];

            return (
              <React.Fragment key={exp.id}>
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
                    if (exp.commander === userId) {
                      setSelectedTrackingId(exp.id); 
                      setActivePanel('tracking'); 
                    }
                  } }}
                >
                  {!(isAutoFollow && selectedTrackingId === exp.id) && (
                    <Popup className="custom-popup dark-popup">
                      <div style={{ padding: '12px', textAlign: 'left', minWidth: '190px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <div>
                            <h4 style={{ margin: 0, color: 'var(--accent-blue)', textTransform: 'uppercase' }}>{exp.cargo}</h4>
                            <span style={{ fontSize: '10px', color: '#888', fontFamily: 'var(--font-mono)' }}>{exp.id} • Cmdr: {exp.commander}</span>
                          </div>
                          <span style={{ fontSize: '10px', color: '#ccc', marginTop: '2px' }}>{exp.status}</span>
                        </div>
                        
                        {exp.commander !== userId ? (
                           <div style={{ textAlign: 'center', padding: '10px 0', borderTop: '1px solid #333', marginTop: '10px' }}>
                             <p style={{ color: 'var(--text-secondary)', fontSize: '11px', margin: 0 }}>Restricted Access.</p>
                             <p style={{ color: 'var(--accent-blue)', fontSize: '10px', margin: '4px 0 0 0', textTransform: 'uppercase' }}>Vessel belongs to allied commander.</p>
                           </div>
                        ) : exp.status === 'Sheltered' ? (
                           <div className="relaunch-container">
                             <p className="relaunch-warning-text" style={{ color: '#ef4444' }}>VESSEL BLOWN BACK</p>
                             <button className="btn-launch-sim relaunch-btn" onClick={() => setRelaunchEvent(exp)}>
                               Review Tactical Options
                             </button>
                           </div>
                        ) : exp.status === 'Failed' ? (
                           <p style={{ color: '#ef4444', fontWeight: 'bold', textAlign: 'center' }}>CONTRACT TERMINATED</p>
                        ) : (
                           <>
                              <div style={{ marginBottom: '12px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', marginBottom: '4px' }}>
                                  <span>Goods Health</span><span style={{ fontFamily: 'var(--font-mono)' }}>{nav.health}%</span>
                                </div>
                                <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                                  <div style={{ width: `${nav.health}%`, height: '100%', background: nav.health < 70 ? '#ef4444' : 'var(--accent-blue)', transition: 'width 0.3s' }}></div>
                                </div>
                              </div>

                              <div className="telemetry-grid">
                                <div className="telemetry-box">
                                  <span className="tele-label">DIST TO PORT</span>
                                  <span className="tele-val">{exp.status === 'Arrived' ? '0' : Math.max(1, Math.round(1000 - ((Math.min(((Date.now() + (exp.timeOffset || 0)) - exp.startTime) / exp.duration, 1)) * 1000)))} <small>NM</small></span>
                                </div>
                                <div className="telemetry-box">
                                  <span className="tele-label">HEADING</span>
                                  <span className="tele-val">{Math.round(nav.angle)}°</span>
                                </div>
                                <div className="telemetry-box">
                                  <span className="tele-label">LATITUDE</span>
                                  <span className="tele-val">{nav.pos[0].toFixed(4)}</span>
                                </div>
                                <div className="telemetry-box">
                                  <span className="tele-label">LONGITUDE</span>
                                  <span className="tele-val">{nav.pos[1].toFixed(4)}</span>
                                </div>
                              </div>
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

        {/* 🔥 THE NEW TARGET HUD */}
        {isAutoFollow && trackedNav && trackedShip && (
          <div className="target-hud-overlay">
            <div style={{ padding: '15px', textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <h4 style={{ margin: 0, color: 'var(--accent-blue)', textTransform: 'uppercase', fontSize: '16px', fontFamily: 'var(--font-sans)' }}>{trackedShip.cargo}</h4>
                  <span style={{ fontSize: '11px', color: '#888', fontFamily: 'var(--font-mono)' }}>{trackedShip.id} • Cmdr: {userId}</span>
                </div>
                <span className={`badge ${trackedShip.status === 'Failed' || trackedShip.status === 'Sheltered' ? 'failed' : 'outbound'}`} style={{ marginTop: '2px' }}>{trackedShip.status}</span>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', marginBottom: '6px' }}>
                  <span>Goods Health</span><span style={{ fontFamily: 'var(--font-mono)' }}>{trackedNav.health}%</span>
                </div>
                <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                  <div style={{ width: `${trackedNav.health}%`, height: '100%', background: trackedNav.health < 70 ? '#ef4444' : 'var(--accent-blue)', transition: 'width 0.3s' }}></div>
                </div>
              </div>

              <div style={{ padding: '8px', borderRadius: '6px', marginBottom: '15px', border: '1px solid var(--border-color)', background: 'rgba(255, 255, 255, 0.02)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
                  <span>Current Phase</span>
                  <span>Progress</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 'bold' }}>
                    {trackedShip.status === 'Arrived' ? 'DELIVERED' : (trackedNav.phase?.label || 'IN TRANSIT').toUpperCase()}
                  </span>
                  <strong style={{ color: 'var(--accent-blue)', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
                    {trackedShip.status === 'Arrived' ? '100.0' : ((Math.min(((Date.now() + (trackedShip.timeOffset || 0)) - trackedShip.startTime) / trackedShip.duration, 1)) * 100).toFixed(1)}%
                  </strong>
                </div>
              </div>

              {trackedShip.status === 'Outbound' && (
                <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                    <button type="button" disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${trackedShip.currentSpeed === 1 ? 'active-blue' : ''}`} style={{ padding: '8px 16px', fontSize: '14px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(trackedShip.id, 1)}>▶</button>
                    <button type="button" disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${trackedShip.currentSpeed > 1 && trackedShip.currentSpeed < 21600 ? 'active-blue' : ''}`} style={{ padding: '8px 16px', fontSize: '14px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(trackedShip.id, Math.max(2, Math.floor(trackedShip.duration * 0.01 / 3000)))}>⏭</button>
                    <button type="button" disabled={chaosEvent || relaunchEvent} className={`time-opt-btn ${trackedShip.currentSpeed >= 21600 ? 'active-blue' : ''}`} style={{ padding: '8px 16px', fontSize: '14px', opacity: (chaosEvent || relaunchEvent) ? 0.3 : 1 }} onClick={() => triggerWarpSequence(trackedShip.id, 21600)}>🚀</button>
                  </div>
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