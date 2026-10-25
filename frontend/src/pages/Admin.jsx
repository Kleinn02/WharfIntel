import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import WeatherHUD from './WeatherHUD';
import './Admin.css';

// --- OVERWATCH MAP HELPERS ---
const getBearing = (startLat, startLng, endLat, endLng) => {
  const startLatRad = startLat * (Math.PI / 180);
  const endLatRad = endLat * (Math.PI / 180);
  const dLng = (endLng - startLng) * (Math.PI / 180);
  const y = Math.sin(dLng) * Math.cos(endLatRad);
  const x = Math.cos(startLatRad) * Math.sin(endLatRad) - Math.sin(startLatRad) * Math.cos(endLatRad) * Math.cos(dLng);
  return ((Math.atan2(y, x) * (180 / Math.PI)) + 360) % 360;
};

const createTransportIcon = (type, status, angle, health) => {
  let color = '#10b981'; // Default to admin green
  if (type === 'vessel') color = '#3498db'; 
  if (health < 70 || status === 'Failed') color = '#ef4444'; 
  
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

const SEA_BOUNDS = [[-15.0, 90.0], [30.0, 150.0]];

const PANABO_HUBS = [
  { id: 1, pos: [7.300, 125.650], name: 'Panabo North Facility', type: 'WAREHOUSE', stat: 'Storage: 88%' },
  { id: 2, pos: [7.285, 125.660], name: 'Central Cold Storage', type: 'CLIMATE CONTROL', stat: 'Temp: -4.2°C' },
  { id: 3, pos: [7.270, 125.680], name: 'Export Processing Zone', type: 'CUSTOMS', stat: 'Queue: 3 Trucks' },
];
const NATIONAL_HUBS = [
  { id: 201, pos: [14.599, 120.984], name: 'Port of Manila', type: 'NATIONAL HUB', stat: 'Capacity: 88%' },
  { id: 202, pos: [10.292, 123.901], name: 'Cebu International Port', type: 'REGIONAL HUB', stat: 'Capacity: 82%' },
  { id: 203, pos: [13.756, 121.058], name: 'Batangas Terminal', type: 'NATIONAL HUB', stat: 'Capacity: 79%' }
];
const GLOBAL_HUBS = [
  { id: 101, pos: [1.290, 103.850], name: 'Port of Singapore', type: 'GLOBAL HUB', stat: 'Capacity: 95%' },
  { id: 102, pos: [10.823, 106.629], name: 'Ho Chi Minh Terminal', type: 'REGIONAL HUB', stat: 'Capacity: 80%' },
  { id: 103, pos: [13.756, 100.501], name: 'Bangkok Logistics', type: 'REGIONAL HUB', stat: 'Capacity: 75%' },
  { id: 104, pos: [-6.208, 106.845], name: 'Jakarta Tanjung Priok', type: 'GLOBAL HUB', stat: 'Capacity: 92%' },
  { id: 105, pos: [5.027, 115.064], name: 'Muara Port, Brunei', type: 'REGIONAL HUB', stat: 'Capacity: 65%' },
  { id: 106, pos: [16.840, 96.145], name: 'Yangon Port', type: 'REGIONAL HUB', stat: 'Capacity: 70%' },
  { id: 107, pos: [-8.558, 125.573], name: 'Port of Dili', type: 'LOCAL HUB', stat: 'Capacity: 60%' }
];

const createHouseIcon = (color) => {
  return L.divIcon({
    className: 'hub-house-icon',
    html: `<div style="background: ${color}; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.5); border: 2px solid #111;">
             <svg width="12" height="12" viewBox="0 0 24 24" fill="#111"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
           </div>`,
    iconSize: [24, 24], iconAnchor: [12, 12]
  });
};

const economyData = [
  { day: 'Mon', revenue: 850000 }, { day: 'Tue', revenue: 920000 },
  { day: 'Wed', revenue: 980000 }, { day: 'Thu', revenue: 1050000 },
  { day: 'Fri', revenue: 1120000 }, { day: 'Sat', revenue: 1150000 },
  { day: 'Sun', revenue: 1189900 },
];

const Admin = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('personnel'); 
  const [users, setUsers] = useState([]);
  const [globalFleets, setGlobalFleets] = useState([]);
  // 🔥 NEW: Weather Modal State
  const [overrideModal, setOverrideModal] = useState({ isOpen: false, state: null, duration: 5 });
  
  // UI State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create'); 
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showFacilityOps, setShowFacilityOps] = useState(true);
  const [showClimate, setShowClimate] = useState(false); // 🔥 Repurposed from showEnvironment
  const [weatherSyncTrigger, setWeatherSyncTrigger] = useState(0); // 🔥 NEW: Syncs HUD to Admin actions
  
  // Data State
  const [systemLogs, setSystemLogs] = useState([]); // 🔥 State for DB logs
  const [activeWeatherOverride, setActiveWeatherOverride] = useState(null);

  // Form State
  const [editId, setEditId] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(''); 
  const [money, setMoney] = useState(200000);
  const [reputation, setReputation] = useState(50);
  const [message, setMessage] = useState('');
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteAdminPassword, setInviteAdminPassword] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [inviteError, setInviteError] = useState('');
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

  const toggleFacilityOps = () => {
    setShowFacilityOps(true);
    setShowClimate(false);
  };

  const toggleClimate = () => {
    setShowClimate(true);
    setShowFacilityOps(false);
  };

  useEffect(() => {
    const currentUser = localStorage.getItem('username');
    if (currentUser !== 'admin' && localStorage.getItem('role') !== 'admin') {
      navigate('/dashboard'); 
    }
  }, [navigate]);

  const fetchData = async () => {
    try {
      // 1. Fetch Users
      const resUsers = await fetch('http://127.0.0.1:8000/api/admin/users');
      if (resUsers.ok) setUsers(await resUsers.json());

      // 2. Fetch Active Ships
      const resShips = await fetch('http://127.0.0.1:8000/api/admin/ticketing/active'); 
      if (resShips.ok) {
        const ships = await resShips.json();
        const mappedShips = ships.map(s => {
          const shipId = `TRK-${s.id}`;
          return {
            ...s,
            id: shipId,
            cargo: s.cargo_name,
            category: s.category, 
            waypoints: typeof s.route_waypoints === 'string' ? JSON.parse(s.route_waypoints) : s.route_waypoints,
            startTime: new Date(s.departure_time).getTime(),
            duration: s.total_duration_ms,
            timeOffset: Number(localStorage.getItem(`offset_${shipId}`)) || 0 
          };
        });
        setGlobalFleets(mappedShips);
      }

      // 3. 🔥 Fetch Permanent System Logs
      const resLogs = await fetch('http://127.0.0.1:8000/api/admin/logs');
      if (resLogs.ok) setSystemLogs(await resLogs.json());

      // 4. 🔥 NEW: Fetch Live Weather to keep Admin buttons synced without refreshing!
      const resWeather = await fetch('http://127.0.0.1:8000/api/analytics/weather');
      if (resWeather.ok) {
        const weatherData = await resWeather.json();
        // This will automatically highlight the correct button based on the backend state
        setActiveWeatherOverride(weatherData.admin_override);
      }

    } catch (err) {
      console.error("Failed to fetch overwatch data:", err);
    }
  };

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 1000); 
    return () => clearInterval(interval);
  }, []); 

  const handleLogout = () => {
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    navigate('/');
  };

  // 🔥 NEW: God Mode Weather Control Sender
  const initiateWeatherOverride = (state) => {
    if (state === null) {
      handleWeatherOverride(null, 0); // AUTO mode doesn't need a duration
    } else {
      setOverrideModal({ isOpen: true, state: state, duration: 5 });
    }
  };

  const handleWeatherOverride = async (state, duration) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/admin/weather/override', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: state, duration_minutes: duration })
      });
      if (res.ok) {
        setActiveWeatherOverride(state);
        setOverrideModal({ ...overrideModal, isOpen: false });
        setWeatherSyncTrigger(prev => prev + 1); // 🔥 INSTANTLY SYNC THE WEATHER HUD!
        fetchData(); // Instantly refresh logs
      }
    } catch (e) { console.error("Override failed", e); }
  };

  const openCreateModal = () => {
    setModalMode('create'); setUsername(''); setPassword('');
    setMoney(200000); setReputation(50); setMessage(''); setIsModalOpen(true);
  };

  const openInviteModal = () => {
    setInviteAdminPassword('');
    setGeneratedInvite(null);
    setInviteError('');
    setInviteModalOpen(true);
  };

  const generateInstructorInvite = async (event) => {
    event.preventDefault();
    setInviteError('');
    setIsGeneratingInvite(true);
    try {
      const response = await fetch('http://127.0.0.1:8000/api/admin/instructor-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_username: localStorage.getItem('username'),
          admin_password: inviteAdminPassword,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not generate an instructor invite.');
      setGeneratedInvite(data);
      setInviteAdminPassword('');
    } catch (error) {
      setInviteError(error.message || 'Could not reach the backend.');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  const copyInstructorInvite = async () => {
    try {
      await navigator.clipboard.writeText(generatedInvite.invite_code);
      setInviteError('Invite copied. Share it only with the intended instructor.');
    } catch {
      setInviteError('Clipboard access is unavailable. Select and copy the invite code.');
    }
  };

  const openEditModal = (user) => {
    setModalMode('edit'); setEditId(user.id); setUsername(user.username);
    setMoney(user.money); setReputation(user.reputation); setMessage(''); setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const endpoint = modalMode === 'create' ? 'http://127.0.0.1:8000/api/admin/users' : `http://127.0.0.1:8000/api/admin/users/${editId}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      const body = modalMode === 'create' 
        ? { username, password, money: parseFloat(money), reputation: parseInt(reputation) }
        : { money: parseFloat(money), reputation: parseInt(reputation) };

      const res = await fetch(endpoint, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error("Database transaction failed");
      
      setIsModalOpen(false);
      fetchData();
    } catch (err) { setMessage(err.message); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`WARNING: Are you sure you want to completely purge Commander ${name}?`)) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/admin/users/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) { alert("Failed to delete user."); }
  };

  const calculateNavigation = (ship) => {
    const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
    const elapsed = shipPersonalTime - ship.startTime;
    const waypoints = ship.waypoints || [];
    const totalSegments = Math.max(waypoints.length - 1, 1);
    
    let progress = Math.min(elapsed / ship.duration, 1);
    
    if (ship.status === 'Arrived' || progress >= 1 || waypoints.length < 2) {
      return { pos: waypoints[waypoints.length - 1] || [0,0], angle: 0, phase: { type: 'vessel', label: 'Delivered', step: 4 }, health: ship.category && ship.category.includes('Perishable') ? 60 : 100, progress: 1 };
    }
    
    const segmentProgress = progress * totalSegments;
    const idx = Math.floor(segmentProgress);
    const nextIdx = idx + 1;
    const lerp = segmentProgress - idx;
    
    const currentPos = [waypoints[idx][0] + (waypoints[nextIdx][0] - waypoints[idx][0]) * lerp, waypoints[idx][1] + (waypoints[nextIdx][1] - waypoints[idx][1]) * lerp];    
    
    let currentPhase = { type: 'vessel', label: 'Ocean Transit (Vessel)', step: 2 };
    if (progress < 0.20) currentPhase = { type: 'truck', label: 'Origin Hub (Truck)', step: 1 };

    let currentHealth = 100;
    const isPerishable = (ship.category && ship.category.includes('Perishable')) || (ship.cargo && (ship.cargo.toLowerCase().includes('banana') || ship.cargo.toLowerCase().includes('food') || ship.cargo.toLowerCase().includes('fruit') || ship.cargo.toLowerCase().includes('meat') || ship.cargo.toLowerCase().includes('fish')));

    if (isPerishable) {
      currentHealth = 100 - (progress * 25) - ((ship.shelter_count || 0) * 30);
    } else {
      if (ship.storm_event_handled && (ship.shelter_count || 0) === 0) {
        currentHealth = 65; 
      }
    }
    
    currentHealth = Math.max(0, Math.min(100, currentHealth)).toFixed(1);

    return { 
      pos: currentPos, 
      angle: getBearing(currentPos[0], currentPos[1], waypoints[nextIdx][0], waypoints[nextIdx][1]),
      phase: currentPhase,
      health: currentHealth,
      progress
    };
  };

  return (
    <div className="dashboard-wrapper admin-theme dark-mode" style={{ backgroundColor: '#050505', height: '100vh', width: '100vw', overflow: 'hidden', position: 'relative' }}>
      
      {/* 1. THE FULLSCREEN BACKGROUND MAP & CYBER GRID */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }}>
        
        <MapContainer center={[7.284, 125.681]} zoom={5} minZoom={4} maxZoom={18} maxBounds={typeof SEA_BOUNDS !== 'undefined' ? SEA_BOUNDS : undefined} className="leaflet-container" zoomControl={false} style={{ width: '100%', height: '100%', background: '#030303' }}>
         <TileLayer 
            url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}" 
            attribution='Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ' 
          />
          
          {/* Hub Markers */}
          {PANABO_HUBS.map(hub => <Marker key={hub.id} position={hub.pos} icon={createHouseIcon('#10b981')} />)}
          {NATIONAL_HUBS.map(hub => <Marker key={hub.id} position={hub.pos} icon={createHouseIcon('#3498db')} />)}
          {GLOBAL_HUBS.map(hub => <Marker key={hub.id} position={hub.pos} icon={createHouseIcon('#f39c12')} />)}
          
          {globalFleets.map((exp) => {
            const nav = calculateNavigation(exp);
            return (
              <React.Fragment key={exp.id}>
                {exp.waypoints && exp.waypoints.length > 0 && exp.status === 'Outbound' && (
                  <Polyline positions={exp.waypoints} pathOptions={{ color: '#10b981', dashArray: '5, 10', weight: 2, opacity: 0.4 }} />
                )}
                
                {exp.status === 'Outbound' && exp.waypoints && exp.waypoints.map((wp, i) => (
                  <Marker key={`dot-${i}`} position={wp} icon={createDotIcon()} />
                ))}

                <Marker position={nav.pos} icon={createTransportIcon(nav.phase.type, exp.status, nav.angle, nav.health)}>
                  <Popup className="custom-popup dark-popup">
                    <div style={{ padding: '12px', textAlign: 'left', minWidth: '180px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <div>
                          <h4 style={{ margin: 0, color: '#10b981', textTransform: 'uppercase' }}>{exp.cargo}</h4>
                          <span style={{ fontSize: '10px', color: '#888' }}>ID: {exp.id} • Cmdr: {exp.commander}</span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#ccc', marginTop: '2px' }}>{exp.status}</span>
                      </div>
                      
                      <div style={{ marginBottom: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#aaa', textTransform: 'uppercase', marginBottom: '4px' }}>
                          <span>Goods Health</span><span>{nav.health}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: '#333', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ width: `${nav.health}%`, height: '100%', background: nav.health < 70 ? '#e74c3c' : '#10b981', transition: 'width 0.3s' }}></div>
                        </div>
                      </div>

                      <div style={{ padding: '6px', borderRadius: '4px', marginBottom: '12px', border: '1px solid rgba(16, 185, 129, 0.1)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '4px' }}>
                          <span>Current Phase</span>
                          <span>Progress</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', color: '#e8eaf0', fontWeight: 'bold' }}>
                            {exp.status === 'Arrived' ? 'DELIVERED' : nav.phase.label.toUpperCase()}
                          </span>
                          <strong style={{ color: '#10b981', fontSize: '12px' }}>
                            {exp.status === 'Arrived' ? '100.0' : (nav.progress * 100).toFixed(1)}%
                          </strong>
                        </div>
                      </div>
                      
                      <div style={{ fontSize: '9px', color: '#6b7280', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        Admin Read-Only Access
                      </div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}
        </MapContainer>

        {/* ENHANCED MAP RADAR GRID OVERLAY */}
        <div style={{ position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none', backgroundImage: 'linear-gradient(rgba(16, 185, 129, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(16, 185, 129, 0.1) 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
      </div>

      {/* Admin Sidebar */}
      <aside className="sidebar expanded" style={{ borderRightColor: '#1e2330', zIndex: 10, background: 'rgba(5, 5, 5, 0.85)', backdropFilter: 'blur(15px)' }}>
        <div className="sidebar-header">
          <div className="brand-text">
            <h2>Wharf<span style={{ color: '#10b981' }}>Admin</span></h2>
            <p style={{ letterSpacing: '2px' }}>SYSTEM OVERWATCH</p>
          </div>
        </div>
        <div className="sidebar-content">
          <nav className="side-nav">
            <button 
              className={activeTab === 'personnel' ? 'active' : ''} 
              onClick={() => setActiveTab('personnel')}
              style={activeTab === 'personnel' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderLeft: '3px solid #10b981' } : {}}
            >
               Personnel
            </button>
            <button 
              className={activeTab === 'voyages' ? 'active' : ''} 
              onClick={() => setActiveTab('voyages')}
              style={activeTab === 'voyages' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderLeft: '3px solid #10b981' } : {}}
            >
               Active Voyages
            </button>
            <button 
              className={activeTab === 'logs' ? 'active' : ''} 
              onClick={() => setActiveTab('logs')}
              style={activeTab === 'logs' ? { backgroundColor: 'rgba(16, 185, 129, 0.1)', color: '#10b981', borderLeft: '3px solid #10b981' } : {}}
            >
              System Logs
            </button>
          </nav>
          <div className="nav-group bottom-group">
            <button className="logout-btn" onClick={() => setShowLogoutModal(true)} style={{ color: '#ef4444' }}>
              Disconnect System
            </button>
          </div>
        </div>
      </aside>

      {/* Main Admin Content */}
      <main 
        className="map-view" 
        style={{ 
          padding: activeTab === 'voyages' ? '0' : '16px 16px 16px 0', /* 🔥 Perfect 16px gap from sidebar */
          overflow: 'hidden', 
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 10,
          pointerEvents: activeTab === 'voyages' ? 'none' : 'auto',
          boxSizing: 'border-box'
        }}
      >
        
        {/* --- TAB: PERSONNEL --- */}
        {activeTab === 'personnel' && (
          <div style={{ 
            pointerEvents: 'auto', 
            background: 'rgba(5, 5, 5, 0.85)', 
            backdropFilter: 'blur(12px)', 
            padding: '24px', 
            borderRadius: '20px', 
            border: '1px solid var(--cyber-border)', 
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)', 
            display: 'flex', 
            flexDirection: 'column', 
            flex: 1, 
            minHeight: 0, /* 🔥 CRUCIAL: Forces Chrome to scroll internally instead of overflowing screen */
            boxSizing: 'border-box'
          }}>
            <div className="admin-provision-actions">
              <button
                onClick={openCreateModal}
                style={{ backgroundColor: 'var(--cyber-green)', color: '#000', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer', transition: '0.2s', boxShadow: '0 0 15px var(--cyber-glow)' }}
              >
                + Provision New Commander
              </button>
              <button className="admin-invite-button" type="button" onClick={openInviteModal}>
                Generate Instructor Invite
              </button>
            </div>

            <div className="bento-grid-header">
              {/* Card 1: Economy Graph */}
              <div className="bento-card" style={{ padding: '24px', height: '220px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div className="stat-label">System Economy Growth (7 Days)</div>
                  <span style={{ fontSize: '10px', background: 'rgba(16, 185, 129, 0.1)', color: '#10b981', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>+12.4%</span>
                </div>
                <div style={{ flex: 1, minHeight: 0, marginTop: '10px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={economyData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2330" vertical={false} />
                      <XAxis dataKey="day" stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#6b7280" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value/1000}k`} />
                      <Tooltip contentStyle={{ backgroundColor: '#0b0f19', borderColor: '#1e2330', borderRadius: '8px', color: '#fff', fontSize: '12px' }} />
                      <Line type="monotone" dataKey="revenue" stroke="var(--cyber-green)" strokeWidth={3} dot={false} activeDot={{ r: 6, fill: 'var(--cyber-green)', strokeWidth: 0 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Card 2: Circulating Economy */}
              <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="stat-label">Circulating Economy</div>
                  <span style={{ fontSize: '10px', background: 'rgba(130, 160, 255, 0.1)', color: '#82a0ff', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>Stable</span>
                </div>
                <div className="stat-value" style={{ color: 'var(--cyber-green)', fontSize: '36px', marginTop: '20px' }}>
                  ${users.reduce((acc, curr) => acc + (curr.money || 0), 0).toLocaleString()}
                </div>
              </div>

              {/* Card 3: Combined Commander Roster */}
              <div className="bento-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="stat-label">Commander Roster</div>
                  <span style={{ fontSize: '10px', background: 'rgba(130, 160, 255, 0.1)', color: '#82a0ff', padding: '4px 10px', borderRadius: '12px', fontWeight: 'bold' }}>Synced</span>
                </div>
                <div className="stat-value" style={{ marginTop: '20px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                  <span style={{ fontSize: '36px', color: '#fff' }}>{users.length}</span>
                  <span style={{ fontSize: '14px', color: '#94a3b8', fontFamily: 'var(--font-sans)', fontWeight: '500' }}>Users</span>
                </div>
                <div style={{ marginTop: '16px', fontSize: '13px', color: '#3498db', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                  <span style={{ marginRight: '8px', fontSize: '10px' }}>●</span> {Math.floor(Math.random() * 2) + 2} ONLINE
                </div>
              </div>
            </div>

            {/* 🔥 Added flex: 1 and overflowY so the table scrolls, not the page! */}
            <div className="bento-main-table-card" style={{ flex: 1, overflowY: 'auto', minHeight: '200px' }}>
              <table className="admin-custom-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Username</th>
                    <th>Credits</th>
                    <th>Reputation Map</th>
                    <th style={{ textAlign: 'right' }}>Administrative Override</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td style={{ fontFamily: 'var(--font-mono)', color: '#6b7280' }}>#{user.id}</td>
                      <td style={{ fontWeight: '600' }}>
                        {user.username} {user.username === 'admin' && <span style={{fontSize: '10px', background: 'rgba(16,185,129,0.2)', color: 'var(--cyber-green)', padding: '2px 6px', borderRadius: '4px', marginLeft: '8px'}}>OVERSEER</span>}
                      </td>
                      <td style={{ color: 'var(--cyber-green)', fontFamily: 'var(--font-mono)' }}>${user.money.toLocaleString()}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '80px', height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${user.reputation}%`, height: '100%', background: user.reputation > 40 ? 'var(--cyber-green)' : 'var(--cyber-danger)' }}></div>
                          </div>
                          <span style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'var(--font-mono)' }}>{user.reputation}%</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button onClick={() => openEditModal(user)} className="btn-edit-glow" style={{ marginRight: '8px', pointerEvents: 'auto' }}>Edit</button>
                        <button onClick={() => handleDelete(user.id, user.username)} className="btn-purge-glow" style={{ pointerEvents: 'auto' }}>Purge</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: GLOBAL MAP OVERWATCH --- */}
        {activeTab === 'voyages' && (
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>

            {/* 🔥 GLOBAL OVERWATCH HEADER (Top Left, perfectly aligned with sidebar) */}
            <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 1000, background: 'rgba(10, 10, 10, 0.85)', backdropFilter: 'blur(10px)', padding: '15px 20px', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.3)', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', pointerEvents: 'auto' }}>
              <h3 style={{ margin: '0 0 5px 0', color: '#10b981', fontFamily: 'monospace', textTransform: 'uppercase' }}>Global Overwatch</h3>
              <p style={{ margin: 0, fontSize: '12px', color: '#94a3b8' }}>Tracking {globalFleets.filter(f => f.status === 'Outbound').length} Active Deployments</p>
            </div>

            {/* 🔥 WEATHER HUD (Bottom Left, directly next to the Disconnect button) */}
            <div style={{ position: 'absolute', bottom: '16px', left: '16px', zIndex: 1000, pointerEvents: 'auto' }}>
               <WeatherHUD syncTrigger={weatherSyncTrigger} />
            </div>

            <div style={{ position: 'absolute', top: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: '15px', zIndex: 1000, pointerEvents: 'auto', width: '320px' }}>
                   
              {/* 1. FACILITY OPS PANEL */}
              <div className={`admin-ops-panel ${!showFacilityOps ? 'minimized' : ''}`} style={{ position: 'relative', top: 0, right: 0, width: '100%', padding: showFacilityOps ? '16px' : '10px 16px', margin: 0, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                {!showFacilityOps ? (
                  <div onClick={toggleFacilityOps} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#10b981', fontWeight: 'bold', fontSize: '12px', letterSpacing: '1px', cursor: 'pointer' }}>
                    <span>FACILITY OPERATIONS</span>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                      <h3 style={{ margin: '0 0 14px 0', fontSize: '14px', color: '#fff' }}>FACILITY OPERATIONS</h3>
                      <button onClick={() => setShowFacilityOps(false)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '18px' }}>×</button>
                    </div>
                    
                    <div style={{ maxHeight: '350px', overflowY: 'auto', paddingRight: '5px' }}>
                      <p style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', marginBottom: '8px' }}>Local Origin Hubs</p>
                      {PANABO_HUBS.map(hub => (
                        <div key={hub.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid #333', borderLeft: '3px solid #10b981', borderRadius: '6px', marginBottom: '8px' }}>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#10b981' }}>{hub.name}</h4>
                          <span style={{ fontSize: '10px', color: '#888' }}>{hub.type} • {hub.stat}</span>
                        </div>
                      ))}
                      
                      <p style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', margin: '15px 0 8px 0' }}>National Markets</p>
                      {NATIONAL_HUBS.map(hub => (
                        <div key={hub.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid #333', borderLeft: `3px solid #3498db`, borderRadius: '6px', marginBottom: '8px' }}>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#fff' }}>{hub.name}</h4>
                          <span style={{ fontSize: '10px', color: '#888' }}>{hub.type} • {hub.stat}</span>
                        </div>
                      ))}

                      <p style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', margin: '15px 0 8px 0' }}>Global Terminals</p>
                      {GLOBAL_HUBS.map(hub => (
                        <div key={hub.id} style={{ padding: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid #333', borderLeft: `3px solid #f39c12`, borderRadius: '6px', marginBottom: '8px' }}>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#fff' }}>{hub.name}</h4>
                          <span style={{ fontSize: '10px', color: '#888' }}>{hub.type} • {hub.stat}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 2. 🔥 REPLACED: GLOBAL CLIMATE DIRECTIVE PANEL */}
              <div className={`admin-ops-panel ${!showClimate ? 'minimized' : ''}`} style={{ position: 'relative', top: 0, right: 0, width: '100%', padding: showClimate ? '16px' : '10px 16px', margin: 0, border: '1px solid rgba(130, 160, 255, 0.4)', boxShadow: '0 8px 32px rgba(130, 160, 255, 0.15)' }}>
                {!showClimate ? (
                  <div onClick={toggleClimate} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: '#82a0ff', fontWeight: 'bold', fontSize: '12px', letterSpacing: '1px', cursor: 'pointer' }}>
                    <span>GLOBAL CLIMATE DIRECTIVE</span>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', borderBottom: '1px solid rgba(130, 160, 255, 0.3)', paddingBottom: '10px' }}>
                      <h3 style={{ margin: 0, fontSize: '14px', color: '#82a0ff' }}>GLOBAL CLIMATE DIRECTIVE</h3>
                      <button onClick={() => setShowClimate(false)} style={{ background: 'none', border: 'none', color: '#82a0ff', cursor: 'pointer', fontSize: '18px' }}>×</button>
                    </div>
                    
                    <p style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Override Stochastic RNG Engine</p>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button 
                        onClick={() => initiateWeatherOverride(null)} 
                        style={{ padding: '10px', background: activeWeatherOverride === null ? 'rgba(130, 160, 255, 0.2)' : 'rgba(255,255,255,0.02)', border: `1px solid ${activeWeatherOverride === null ? '#82a0ff' : '#333'}`, color: '#fff', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontSize: '12px' }}
                      >
                        🎲 AUTO (STOCHASTIC)
                      </button>
                      
                      <button 
                        onClick={() => initiateWeatherOverride('NOMINAL')} 
                        style={{ padding: '10px', background: activeWeatherOverride === 'NOMINAL' ? '#2ecc71' : 'rgba(255,255,255,0.02)', border: `1px solid ${activeWeatherOverride === 'NOMINAL' ? '#2ecc71' : '#333'}`, color: activeWeatherOverride === 'NOMINAL' ? '#000' : '#fff', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontSize: '12px', fontWeight: activeWeatherOverride === 'NOMINAL' ? 'bold' : 'normal' }}
                      >
                        🟢 FORCE NOMINAL <span style={{fontSize: '10px', opacity: 0.8}}>(5% Risk)</span>
                      </button>
                      
                      <button 
                        onClick={() => initiateWeatherOverride('DETERIORATING')} 
                        style={{ padding: '10px', background: activeWeatherOverride === 'DETERIORATING' ? '#f1c40f' : 'rgba(255,255,255,0.02)', border: `1px solid ${activeWeatherOverride === 'DETERIORATING' ? '#f1c40f' : '#333'}`, color: activeWeatherOverride === 'DETERIORATING' ? '#000' : '#fff', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontSize: '12px', fontWeight: activeWeatherOverride === 'DETERIORATING' ? 'bold' : 'normal' }}
                      >
                        🟡 FORCE DETERIORATING <span style={{fontSize: '10px', opacity: 0.8}}>(35% Risk)</span>
                      </button>

                      <button 
                        onClick={() => initiateWeatherOverride('CYCLONE IMMINENT')} 
                        style={{ padding: '10px', background: activeWeatherOverride === 'CYCLONE IMMINENT' ? '#e74c3c' : 'rgba(255,255,255,0.02)', border: `1px solid ${activeWeatherOverride === 'CYCLONE IMMINENT' ? '#e74c3c' : '#333'}`, color: '#fff', borderRadius: '6px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s', fontSize: '12px', fontWeight: activeWeatherOverride === 'CYCLONE IMMINENT' ? 'bold' : 'normal' }}
                      >
                        🔴 FORCE CYCLONE <span style={{fontSize: '10px', opacity: 0.8}}>(85% Risk)</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

            </div>
          </div>
        )}

        {/* --- TAB: SYSTEM LOGS --- */}
        {activeTab === 'logs' && (
          <div style={{ 
            pointerEvents: 'auto', 
            background: 'rgba(5, 5, 5, 0.85)', 
            backdropFilter: 'blur(12px)', 
            padding: '24px', 
            borderRadius: '20px', 
            border: '1px solid var(--cyber-border)', 
            boxShadow: '0 10px 40px rgba(0,0,0,0.6)', 
            display: 'flex', 
            flexDirection: 'column', 
            flex: 1,
            minHeight: 0, /* 🔥 CRUCIAL for Chrome flexbox scrolling */
            boxSizing: 'border-box' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ color: '#fff', margin: 0, fontSize: '24px' }}>Server Audit Logs</h2>
              <span className="badge docked">IMMUTABLE LEDGER</span>
            </div>
            {/* 🔥 Uses flex: 1 and minHeight: 0 to force internal scrolling */}
            <div className="bento-main-table-card" style={{ padding: '20px', flex: 1, minHeight: 0, overflowY: 'auto' }}>

              {systemLogs.length > 0 ? systemLogs.map(log => {
                const d = new Date(log.timestamp);
                const timeString = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')} ${d.toLocaleDateString()}`;
                return (
                  <div key={log.id} style={{ display: 'flex', gap: '15px', padding: '12px 0', borderBottom: '1px solid rgba(16, 185, 129, 0.1)', fontFamily: 'var(--font-mono)', fontSize: '13px' }}>
                    <span style={{ color: '#6b7280', minWidth: '130px' }}>[{timeString}]</span>
                    <span style={{ 
                      color: log.event_type.includes('SYSTEM') ? '#ef4444' : 
                             log.event_type.includes('CLIMATE') ? '#f1c40f' : '#3498db', 
                      minWidth: '70px', fontWeight: 'bold' 
                    }}>
                      {log.event_type}
                    </span>
                    <span style={{ color: '#e8eaf0' }}>{log.description}</span>
                  </div>
                );
              }) : (
                <p style={{ color: '#6b7280', textAlign: 'center', marginTop: '20px' }}>No audit logs recorded yet.</p>
              )}
            </div>
          </div>
        )}
      </main>

      {/* --- WEATHER DURATION MODAL --- */}
      {overrideModal.isOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}>
          <div className="card auth-modal-card admin-modal-card" onClick={e => e.stopPropagation()} style={{ minHeight: 'auto', paddingBottom: '30px' }}>
            <button className="exit-btn" onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}>&times;</button>
            
            <div className="screen-title" style={{ color: overrideModal.state === 'CYCLONE IMMINENT' ? '#ef4444' : '#f1c40f', marginBottom: '24px' }}>
              Confirm Climate Override
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleWeatherOverride(overrideModal.state, overrideModal.duration); }} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div style={{ padding: '15px', background: 'rgba(255,255,255,0.05)', borderRadius: '8px', borderLeft: `3px solid ${overrideModal.state === 'CYCLONE IMMINENT' ? '#ef4444' : '#f1c40f'}` }}>
                <strong style={{ display: 'block', color: '#fff', marginBottom: '5px' }}>TARGET STATE: {overrideModal.state}</strong>
                <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8' }}>This will immediately force all connected simulation instances into this weather state.</p>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label>DURATION (MINUTES)</label>
                <div className="input-wrap">
                  <input 
                    type="number" 
                    value={overrideModal.duration} 
                    onChange={e => setOverrideModal({...overrideModal, duration: parseInt(e.target.value)})} 
                    min="1" 
                    required 
                  />
                </div>
                <p style={{ margin: '5px 0 0 0', fontSize: '10px', color: '#6b7280' }}>No maximum limit. Engine reverts to AUTO when timer expires.</p>
              </div>
              
              <button type="submit" className="btn-primary" style={{ backgroundColor: overrideModal.state === 'CYCLONE IMMINENT' ? '#ef4444' : '#f1c40f', color: '#000', marginTop: '10px' }}>
                EXECUTE OVERRIDE
              </button>
            </form>
          </div>
        </div>
        )
      }

      {/* --- CREATE / EDIT MODAL --- */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setIsModalOpen(false)}>
          <div className="card auth-modal-card admin-modal-card" onClick={e => e.stopPropagation()} style={{ minHeight: 'auto', paddingBottom: '30px' }}>
            <button className="exit-btn" onClick={() => setIsModalOpen(false)}>&times;</button>
            
            <div className="screen-title" style={{ color: '#10b981', marginBottom: '24px' }}>
              {modalMode === 'create' ? 'Provision Commander' : 'Modify Parameters'}
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label>Username</label>
                <div className="input-wrap">
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} disabled={modalMode === 'edit'} style={{ opacity: modalMode === 'edit' ? 0.5 : 1 }} required />
                </div>
              </div>
              {modalMode === 'create' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Initial Password</label>
                  <div className="input-wrap">
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} minLength={8} required />
                  </div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Credits ($)</label>
                  <div className="input-wrap">
                    <input type="number" value={money} onChange={e => setMoney(e.target.value)} min="0" step="0.01" required />
                  </div>
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label>Reputation (0-100)</label>
                  <div className="input-wrap">
                    <input type="number" value={reputation} onChange={e => setReputation(e.target.value)} min="0" required />
                  </div>
                </div>
              </div>
              <button type="submit" className="btn-primary" style={{ backgroundColor: '#10b981', color: '#000', marginTop: '10px' }}>
                {modalMode === 'create' ? 'Execute Provision' : 'Commit Changes'}
              </button>
              {message && <div style={{ color: '#ef4444', fontSize: '12px', textAlign: 'center' }}>{message}</div>}
            </form>
          </div>
        </div>
      )}

      {inviteModalOpen && (
        <div className="modal-overlay admin-invite-overlay" onClick={() => setInviteModalOpen(false)}>
          <section className="card auth-modal-card admin-modal-card admin-invite-card" role="dialog" aria-modal="true" aria-labelledby="instructor-invite-title" onClick={event => event.stopPropagation()}>
            <button className="exit-btn" type="button" onClick={() => setInviteModalOpen(false)} aria-label="Close instructor invite">&times;</button>
            <p className="admin-invite-eyebrow">PERSONNEL / ACCESS CONTROL</p>
            <h2 id="instructor-invite-title">Generate instructor invite</h2>
            <p className="admin-invite-description">Create a random, single-use code that expires after 24 hours. Verify your admin password to continue.</p>

            {!generatedInvite ? (
              <form className="admin-invite-form" onSubmit={generateInstructorInvite}>
                <label htmlFor="invite-admin-username">Admin username</label>
                <input id="invite-admin-username" type="text" value={localStorage.getItem('username') || ''} readOnly />
                <label htmlFor="invite-admin-password">Admin password</label>
                <input id="invite-admin-password" type="password" value={inviteAdminPassword} onChange={event => setInviteAdminPassword(event.target.value)} autoComplete="current-password" required />
                {inviteError && <p className="admin-invite-error" role="alert">{inviteError}</p>}
                <div className="admin-invite-actions">
                  <button className="admin-invite-cancel" type="button" onClick={() => setInviteModalOpen(false)}>Cancel</button>
                  <button className="admin-invite-submit" type="submit" disabled={isGeneratingInvite}>{isGeneratingInvite ? 'Generating…' : 'Generate code'}</button>
                </div>
              </form>
            ) : (
              <div className="admin-invite-result">
                <label htmlFor="generated-instructor-invite">Single-use instructor code</label>
                <input id="generated-instructor-invite" value={generatedInvite.invite_code} readOnly onFocus={event => event.target.select()} />
                <p>Expires {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(generatedInvite.expires_at))}. The instructor enters this code when registering.</p>
                {inviteError && <p className="admin-invite-copy-note" role="status">{inviteError}</p>}
                <div className="admin-invite-actions">
                  <button className="admin-invite-cancel" type="button" onClick={() => setInviteModalOpen(false)}>Close</button>
                  <button className="admin-invite-submit" type="button" onClick={copyInstructorInvite}>Copy code</button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
      
      {/* --- LOGOUT WARNING MODAL --- */}
      {showLogoutModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }} onClick={() => setShowLogoutModal(false)}>
          <div className="card auth-modal-card admin-modal-card" onClick={e => e.stopPropagation()} style={{ minHeight: 'auto', textAlign: 'center', padding: '30px' }}>
            <h3 style={{ color: '#ef4444', fontFamily: 'var(--font-mono)', margin: '0 0 10px 0' }}>SYSTEM DISCONNECT</h3>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '25px' }}>Are you sure you want to drop your secure connection to the WharfAdmin terminal?</p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setShowLogoutModal(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: '1px solid #333', color: '#fff', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={handleLogout} style={{ flex: 1, padding: '10px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #ef4444', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Confirm Disconnect</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;