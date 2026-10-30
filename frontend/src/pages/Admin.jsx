import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import {
  Users,
  Compass,
  FileText,
  X,
  Plus,
  LogOut,
  Activity,
  TrendingUp,
  Package,
  ShieldAlert,
  CheckCircle2,
  ChevronRight,
  KeyRound,
  Sliders,
  CloudRain,
  Sun,
  AlertTriangle,
  Search
} from 'lucide-react';
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
  let color = '#10b981';
  if (type === 'vessel') color = '#82a0ff';
  if (health < 70 || status === 'Failed') color = '#ef4444';

  const truckSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="${color}" stroke="#0b0f19" stroke-width="1.5"><path d="M12 2L22 20L12 17L2 20L12 2Z"/></svg>`;
  const vesselSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2"><path d="M4 22L12 2L20 22L12 16L4 22Z" fill="rgba(130, 160, 255, 0.22)"/></svg>`;

  return L.divIcon({
    className: 'sim-vessel-icon',
    html: `<div class="sim-vessel-wrapper" style="transform: rotate(${angle}deg);">
             ${type === 'truck' ? truckSvg : vesselSvg}
           </div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
};

const createDotIcon = () => {
  return L.divIcon({
    className: 'waypoint-dot',
    html: `<div style="width: 6px; height: 6px; background: #82a0ff; border-radius: 50%; border: 1px solid #0b0f19;"></div>`,
    iconSize: [6, 6],
    iconAnchor: [3, 3]
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
    html: `<div style="background: ${color}; border-radius: 50%; width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border: 2px solid #0b0f19;">
             <svg width="11" height="11" viewBox="0 0 24 24" fill="#0b0f19"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
           </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  });
};

// 7-day Multi-Brain Random Forest ETA Accuracy sparkline data (91% - 96%)
const etaPrecisionData = [
  { day: 'Mon', accuracy: 91.8 },
  { day: 'Tue', accuracy: 92.6 },
  { day: 'Wed', accuracy: 93.4 },
  { day: 'Thu', accuracy: 94.1 },
  { day: 'Fri', accuracy: 93.9 },
  { day: 'Sat', accuracy: 95.2 },
  { day: 'Sun', accuracy: 94.8 },
];

// Master Tab Definitions (Simplified Terminology)
const ALL_TABS = [
  { id: 'personnel', label: 'Users', icon: Users },
  { id: 'voyages', label: 'Fleet Overwatch', icon: Compass },
  { id: 'logs', label: 'System Logs', icon: FileText },
];

const Admin = () => {
  const navigate = useNavigate();

  // Dynamic Browser Tab Manager State
  const [openTabs, setOpenTabs] = useState(ALL_TABS);
  const [activeTabId, setActiveTabId] = useState('personnel');
  const [quickOpenVisible, setQuickOpenVisible] = useState(false);
  const quickOpenRef = useRef(null);

  // Core Data State
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [globalFleets, setGlobalFleets] = useState([]);
  const [systemLogs, setSystemLogs] = useState([]);
  const [activeWeatherOverride, setActiveWeatherOverride] = useState(null);

  // UI & Modal State
  const [overrideModal, setOverrideModal] = useState({ isOpen: false, state: null, duration: 5 });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('create');
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showFacilityOps, setShowFacilityOps] = useState(false);
  const [showClimate, setShowClimate] = useState(true);
  const [weatherSyncTrigger, setWeatherSyncTrigger] = useState(0);

  // User Form State
  const [editId, setEditId] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reputation, setReputation] = useState(50);
  const [message, setMessage] = useState('');

  // Instructor Invite Modal State
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteAdminPassword, setInviteAdminPassword] = useState('');
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [inviteError, setInviteError] = useState('');
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

  const currentAdminName = localStorage.getItem('username') || 'admin';

  // Close Quick Open menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (quickOpenRef.current && !quickOpenRef.current.contains(e.target)) {
        setQuickOpenVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auth Guard
  useEffect(() => {
    const currentUser = localStorage.getItem('username');
    if (currentUser !== 'admin' && localStorage.getItem('role') !== 'admin') {
      navigate('/dashboard');
    }
  }, [navigate]);

  // Tab Manager Handlers
  const handleSelectSidebarItem = (tabDef) => {
    const exists = openTabs.some((t) => t.id === tabDef.id);
    if (!exists) {
      setOpenTabs((prev) => [...prev, tabDef]);
    }
    setActiveTabId(tabDef.id);
    setQuickOpenVisible(false);
  };

  const handleCloseTab = (e, tabId) => {
    e.stopPropagation();
    const closingIdx = openTabs.findIndex((t) => t.id === tabId);
    const updatedTabs = openTabs.filter((t) => t.id !== tabId);
    setOpenTabs(updatedTabs);

    if (activeTabId === tabId) {
      if (updatedTabs.length === 0) {
        setActiveTabId(null);
      } else {
        const nextIdx = Math.min(closingIdx, updatedTabs.length - 1);
        setActiveTabId(updatedTabs[nextIdx].id);
      }
    }
  };

  const toggleFacilityOps = () => {
    setShowFacilityOps((prev) => !prev);
    if (!showFacilityOps) setShowClimate(false);
  };

  const toggleClimate = () => {
    setShowClimate((prev) => !prev);
    if (!showClimate) setShowFacilityOps(false);
  };

  const fetchData = async () => {
    try {
      // 1. Fetch Users
      const resUsers = await fetch('http://127.0.0.1:8000/api/admin/users');
      if (resUsers.ok) setUsers(await resUsers.json());

      // 2. Fetch Active Ships
      const resShips = await fetch('http://127.0.0.1:8000/api/admin/ticketing/active');
      if (resShips.ok) {
        const ships = await resShips.json();
        const mappedShips = ships.map((s) => {
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

      // 3. Fetch Permanent System Logs
      const resLogs = await fetch('http://127.0.0.1:8000/api/admin/logs');
      if (resLogs.ok) setSystemLogs(await resLogs.json());

      // 4. Fetch Live Weather State
      const resWeather = await fetch('http://127.0.0.1:8000/api/analytics/weather');
      if (resWeather.ok) {
        const weatherData = await resWeather.json();
        setActiveWeatherOverride(weatherData.admin_override);
      }
    } catch (err) {
      console.error('Failed to fetch overwatch data:', err);
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

  const initiateWeatherOverride = (state) => {
    if (state === null) {
      handleWeatherOverride(null, 0);
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
        setWeatherSyncTrigger((prev) => prev + 1);
        fetchData();
      }
    } catch (e) {
      console.error('Override failed', e);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setUsername('');
    setPassword('');
    setReputation(50);
    setMessage('');
    setIsModalOpen(true);
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
    setModalMode('edit');
    setEditId(user.id);
    setUsername(user.username);
    setReputation(user.reputation);
    setMessage('');
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      const endpoint =
        modalMode === 'create'
          ? 'http://127.0.0.1:8000/api/admin/users'
          : `http://127.0.0.1:8000/api/admin/users/${editId}`;
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      const existingUser = users.find((u) => u.id === editId);
      const preservedMoney = existingUser && typeof existingUser.money === 'number' ? existingUser.money : 0;

      const body =
        modalMode === 'create'
          ? { username, password, money: 0, reputation: parseInt(reputation, 10) }
          : { money: preservedMoney, reputation: parseInt(reputation, 10) };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error('Database transaction failed');

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete user ${name}?`)) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/admin/users/${id}`, { method: 'DELETE' });
      fetchData();
    } catch {
      alert('Failed to delete user.');
    }
  };

  // Compute deterministic Cargo Integrity Health Index per User
  const getCargoIntegrity = (user) => {
    const baseRep = Number(user.reputation) || 50;
    const rawHealth = Math.min(99.8, Math.max(74.0, 82.0 + baseRep * 0.162));
    return rawHealth.toFixed(1);
  };

  const calculateNavigation = (ship) => {
    const shipPersonalTime = Date.now() + (ship.timeOffset || 0);
    const elapsed = shipPersonalTime - ship.startTime;
    const waypoints = ship.waypoints || [];
    const totalSegments = Math.max(waypoints.length - 1, 1);

    const progress = Math.min(elapsed / ship.duration, 1);

    if (ship.status === 'Arrived' || progress >= 1 || waypoints.length < 2) {
      return {
        pos: waypoints[waypoints.length - 1] || [0, 0],
        angle: 0,
        phase: { type: 'vessel', label: 'Delivered', step: 4 },
        health: ship.category && ship.category.includes('Perishable') ? 60 : 100,
        progress: 1
      };
    }

    const segmentProgress = progress * totalSegments;
    const idx = Math.floor(segmentProgress);
    const nextIdx = idx + 1;
    const lerp = segmentProgress - idx;

    const currentPos = [
      waypoints[idx][0] + (waypoints[nextIdx][0] - waypoints[idx][0]) * lerp,
      waypoints[idx][1] + (waypoints[nextIdx][1] - waypoints[idx][1]) * lerp
    ];

    let currentPhase = { type: 'vessel', label: 'Ocean Transit (Vessel)', step: 2 };
    if (progress < 0.2) currentPhase = { type: 'truck', label: 'Origin Hub (Truck)', step: 1 };

    let currentHealth = 100;
    const isPerishable =
      (ship.category && ship.category.includes('Perishable')) ||
      (ship.cargo &&
        (ship.cargo.toLowerCase().includes('banana') ||
          ship.cargo.toLowerCase().includes('food') ||
          ship.cargo.toLowerCase().includes('fruit') ||
          ship.cargo.toLowerCase().includes('meat') ||
          ship.cargo.toLowerCase().includes('fish')));

    if (isPerishable) {
      currentHealth = 100 - progress * 25 - (ship.shelter_count || 0) * 30;
    } else if (ship.storm_event_handled && (ship.shelter_count || 0) === 0) {
      currentHealth = 65;
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

  // Resolve clean Audit Log Category Tag (AUTH, DISPATCH, CLIMATE)
  const getAuditCategory = (eventType = '') => {
    const upper = eventType.toUpperCase();
    if (upper.includes('CLIMATE') || upper.includes('WEATHER') || upper.includes('STORM')) {
      return { tag: 'CLIMATE', className: 'log-tag-climate' };
    }
    if (upper.includes('AUTH') || upper.includes('USER') || upper.includes('LOGIN') || upper.includes('ADMIN') || upper.includes('SYSTEM')) {
      return { tag: 'AUTH', className: 'log-tag-auth' };
    }
    return { tag: 'DISPATCH', className: 'log-tag-dispatch' };
  };

  // Sanitize logged event descriptions to replace "Cmdr" or "Commander" with "User"
  const formatLogDescription = (desc = '') => {
    return desc.replace(/\bCmdr\.?\b/gi, 'User').replace(/\bCommander\b/gi, 'User');
  };

  // Real-time case-insensitive user filtering
  const filteredUsers = users.filter((u) =>
    (u.username || '').toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  const onlineCount = Math.max(1, Math.min(users.length || 2, 3));

  return (
    <div className="admin-workbench-shell admin-theme">
      {/* --- LEFT MINIMALIST SIDEBAR --- */}
      <aside className="admin-sidebar">
        <div className="admin-sidebar-top">
          <div className="admin-brand-header">
            <div className="admin-brand-logo-wrap">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 4L10 13L3 13L10 4Z" stroke="#82a0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M13 6L13 13L19 13L13 6Z" stroke="#82a0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 15L22 15C22 15 19 18 12 18C5 18 2 15 2 15Z" stroke="#82a0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 21.5 Q 4.5 19.5 7 21.5 T 12 21.5 T 17 21.5 T 22 21.5" stroke="#82a0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="admin-brand-wordmark">
                Wharf<span>Intel</span>
              </span>
            </div>
            <span className="admin-pill-badge">Admin</span>
          </div>

          <div className="admin-nav-section-label">WORKSPACE VIEWS</div>
          <nav className="admin-side-nav">
            {ALL_TABS.map((item) => {
              const IconComponent = item.icon;
              const isOpen = openTabs.some((t) => t.id === item.id);
              const isActive = isOpen && activeTabId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`admin-nav-item ${isActive ? 'active' : ''}`}
                  onClick={() => handleSelectSidebarItem(item)}
                >
                  <span className="admin-nav-item-left">
                    <IconComponent size={17} className="admin-nav-icon" />
                    <span>{item.label}</span>
                  </span>
                  {isOpen && <span className="admin-nav-open-indicator" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* --- FLUSH DOCKED ACCOUNT ROW (BOTTOM LEFT) --- */}
        <div className="admin-account-dock">
          <div className="admin-account-info">
            <div className="admin-avatar-circle">
              <Users size={16} />
            </div>
            <div className="admin-account-meta">
              <span className="admin-account-name">{currentAdminName}</span>
              <span className="admin-account-role">Administrator</span>
            </div>
          </div>
          <button
            type="button"
            className="admin-dock-logout-btn"
            onClick={() => setShowLogoutModal(true)}
            title="Log Out"
            aria-label="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* --- MAIN WORKSPACE AREA WITH BROWSER TAB MANAGER --- */}
      <div className="admin-workspace-area">
        {/* Top Browser Tab Bar */}
        <header className="admin-tabbar-header">
          <div className="admin-tabs-strip" role="tablist">
            {openTabs.map((tab) => {
              const TabIcon = tab.icon;
              const isActive = activeTabId === tab.id;
              return (
                <div
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  tabIndex={0}
                  className={`admin-browser-tab ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveTabId(tab.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setActiveTabId(tab.id);
                  }}
                >
                  <TabIcon size={15} className="admin-tab-icon" />
                  <span className="admin-tab-title">{tab.label}</span>
                  <button
                    type="button"
                    className="admin-tab-close"
                    onClick={(e) => handleCloseTab(e, tab.id)}
                    aria-label={`Close ${tab.label} tab`}
                  >
                    <X size={13} />
                  </button>
                </div>
              );
            })}

            {/* Quick Open (+) Button */}
            <div className="admin-quick-open-wrapper" ref={quickOpenRef}>
              <button
                type="button"
                className="admin-tab-add-btn"
                onClick={() => setQuickOpenVisible((prev) => !prev)}
                aria-label="Open view tab"
                title="Quick Open View"
              >
                <Plus size={15} />
              </button>

              {quickOpenVisible && (
                <div className="admin-quick-open-menu">
                  <div className="admin-quick-open-header">Quick Open</div>
                  {ALL_TABS.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="admin-quick-open-item"
                        onClick={() => handleSelectSidebarItem(item)}
                      >
                        <ItemIcon size={15} />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="admin-tabbar-right-meta">
            <span className="admin-status-indicator">
              <span className="status-emerald-dot" />
              Administrator
            </span>
          </div>
        </header>

        {/* Active Tab Viewport */}
        <main className="admin-tab-viewport">
          {/* --- EMPTY STATE WHEN ALL TABS ARE CLOSED --- */}
          {openTabs.length === 0 || !activeTabId ? (
            <div className="admin-empty-workspace">
              <div className="admin-empty-card">
                <div className="admin-empty-icon-wrap">
                  <Compass size={28} />
                </div>
                <h3>No Active Workbench Tab</h3>
                <p>Select a view from the left sidebar or reopen a tab below to inspect operations.</p>
                <div className="admin-empty-actions">
                  {ALL_TABS.map((item) => {
                    const ItemIcon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="admin-empty-open-btn"
                        onClick={() => handleSelectSidebarItem(item)}
                      >
                        <ItemIcon size={15} />
                        <span>{item.label}</span>
                        <ChevronRight size={14} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}

          {/* --- TAB 1: USERS (FORMERLY PERSONNEL) --- */}
          {activeTabId === 'personnel' && openTabs.some((t) => t.id === 'personnel') && (
            <div className="admin-panel-container">
              <div className="admin-panel-toolbar">
                <div>
                  <h1 className="admin-panel-title">User Directory</h1>
                  <p className="admin-panel-subtitle">
                    Manage registered users, simulation trainees, and cargo handling integrity metrics.
                  </p>
                </div>
                <div className="admin-provision-actions">
                  <button type="button" className="btn-primary-periwinkle" onClick={openCreateModal}>
                    <Plus size={16} />
                    <span>+ Add User</span>
                  </button>
                  <button type="button" className="btn-secondary-slate" onClick={openInviteModal}>
                    <KeyRound size={15} />
                    <span>Generate Instructor Invite</span>
                  </button>
                </div>
              </div>

              {/* 3 Top Metric Cards */}
              <div className="bento-grid-header">
                {/* Card 1: Total Freight Handled */}
                <div className="bento-card">
                  <div className="bento-card-top">
                    <span className="stat-label">Total Freight Handled</span>
                    <div className="bento-icon-badge">
                      <Package size={16} />
                    </div>
                  </div>
                  <div className="stat-value">142 TEU</div>
                  <div className="stat-sublabel">
                    <CheckCircle2 size={13} className="text-emerald" />
                    <span>355,000 kg Cargo Discharged</span>
                  </div>
                </div>

                {/* Card 2: Multi-Brain ETA Precision */}
                <div className="bento-card bento-card-chart">
                  <div className="bento-card-top">
                    <div>
                      <span className="stat-label">Multi-Brain ETA Precision</span>
                      <div className="stat-value-inline">
                        <span className="stat-value">94.8%</span>
                        <span className="stat-sublabel-inline">Mean Ensemble Reliability</span>
                      </div>
                    </div>
                    <span className="status-tag-emerald">
                      <TrendingUp size={13} />
                      <span>RF ENSEMBLE</span>
                    </span>
                  </div>
                  <div className="sparkline-container">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={etaPrecisionData} margin={{ top: 6, right: 8, left: -26, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis dataKey="day" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis
                          domain={[90, 97]}
                          stroke="#64748b"
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                          formatter={(value) => [`${value}%`, 'ETA Accuracy']}
                          contentStyle={{
                            backgroundColor: '#0e1422',
                            borderColor: 'rgba(255,255,255,0.08)',
                            borderRadius: '8px',
                            color: '#ffffff',
                            fontSize: '12px'
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="accuracy"
                          stroke="#82a0ff"
                          strokeWidth={2.25}
                          dot={{ r: 2.5, fill: '#82a0ff', strokeWidth: 0 }}
                          activeDot={{ r: 4.5, fill: '#82a0ff', strokeWidth: 0 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Card 3: Active Users */}
                <div className="bento-card">
                  <div className="bento-card-top">
                    <span className="stat-label">Active Users</span>
                    <span className="status-tag-periwinkle">Synced</span>
                  </div>
                  <div className="stat-value-row">
                    <span className="stat-value">{users.length}</span>
                    <span className="stat-unit">Users</span>
                  </div>
                  <div className="stat-online-row">
                    <span className="status-emerald-dot" />
                    <span>{onlineCount} Online Now</span>
                  </div>
                </div>
              </div>

              {/* Search Bar Toolbar Directly Above the Users Table */}
              <div className="user-table-toolbar">
                <span className="user-table-count">
                  Showing <strong>{filteredUsers.length}</strong> of {users.length} users
                </span>
                <div className="user-search-wrapper">
                  <Search size={15} className="user-search-icon" />
                  <input
                    type="text"
                    className="user-search-input"
                    placeholder="Search users..."
                    style={{ paddingLeft: '38px' }}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    aria-label="Search users"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      className="user-search-clear"
                      onClick={() => setSearchTerm('')}
                      aria-label="Clear search"
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              {/* User Directory Table with Strict Shared Column Widths */}
              <div className="bento-main-table-card">
                <div className="table-scroll-container">
                  <table className="admin-custom-table users-table">
                    <colgroup>
                      <col style={{ width: '10%' }} />
                      <col style={{ width: '28%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '18%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Username</th>
                        <th>Cargo Integrity</th>
                        <th>Reputation</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUsers.length > 0 ? (
                        filteredUsers.map((user) => {
                          const integrity = getCargoIntegrity(user);
                          const isHighIntegrity = parseFloat(integrity) >= 90;
                          return (
                            <tr key={user.id}>
                              <td className="mono-cell">#{user.id}</td>
                              <td>
                                <div className="commander-cell">
                                  <span className="commander-name">{user.username}</span>
                                  {user.username === 'admin' && <span className="role-chip-overseer">Admin</span>}
                                </div>
                              </td>
                              <td>
                                <span className={`integrity-badge ${isHighIntegrity ? 'high' : 'moderate'}`}>
                                  <Activity size={13} />
                                  <span>{integrity}% Avg Health</span>
                                </span>
                              </td>
                              <td>
                                <div className="reputation-bar-group">
                                  <div className="reputation-track">
                                    <div
                                      className="reputation-fill"
                                      style={{
                                        width: `${Math.min(100, Math.max(0, user.reputation))}%`,
                                        backgroundColor: user.reputation > 40 ? '#10b981' : '#ef4444'
                                      }}
                                    />
                                  </div>
                                  <span className="reputation-value">{user.reputation}%</span>
                                </div>
                              </td>
                              <td className="text-right">
                                <button
                                  type="button"
                                  onClick={() => openEditModal(user)}
                                  className="btn-table-edit"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDelete(user.id, user.username)}
                                  className="btn-table-purge"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={5} className="empty-table-row">
                            No users found
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* --- TAB 2: FLEET OVERWATCH MAP --- */}
          {activeTabId === 'voyages' && openTabs.some((t) => t.id === 'voyages') && (
            <div className="overwatch-map-workbench">
              <div className="overwatch-map-frame">
                <MapContainer
                  center={[7.284, 125.681]}
                  zoom={5}
                  minZoom={4}
                  maxZoom={18}
                  maxBounds={SEA_BOUNDS}
                  className="leaflet-container"
                  zoomControl={false}
                >
                  <TileLayer
                    url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
                    attribution="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ"
                  />

                  {PANABO_HUBS.map((hub) => (
                    <Marker key={hub.id} position={hub.pos} icon={createHouseIcon('#10b981')} />
                  ))}
                  {NATIONAL_HUBS.map((hub) => (
                    <Marker key={hub.id} position={hub.pos} icon={createHouseIcon('#82a0ff')} />
                  ))}
                  {GLOBAL_HUBS.map((hub) => (
                    <Marker key={hub.id} position={hub.pos} icon={createHouseIcon('#f59e0b')} />
                  ))}

                  {globalFleets.map((exp) => {
                    const nav = calculateNavigation(exp);
                    return (
                      <React.Fragment key={exp.id}>
                        {exp.waypoints && exp.waypoints.length > 0 && exp.status === 'Outbound' && (
                          <Polyline
                            positions={exp.waypoints}
                            pathOptions={{ color: '#82a0ff', dashArray: '6, 8', weight: 2, opacity: 0.55 }}
                          />
                        )}

                        {exp.status === 'Outbound' &&
                          exp.waypoints &&
                          exp.waypoints.map((wp, i) => <Marker key={`dot-${i}`} position={wp} icon={createDotIcon()} />)}

                        <Marker
                          position={nav.pos}
                          icon={createTransportIcon(nav.phase.type, exp.status, nav.angle, nav.health)}
                        >
                          <Popup className="custom-popup dark-popup">
                            <div className="map-popup-body">
                              <div className="map-popup-header">
                                <div>
                                  <h4>{exp.cargo}</h4>
                                  <span>
                                    ID: {exp.id} &bull; User: {exp.commander}
                                  </span>
                                </div>
                                <span className="map-popup-status">{exp.status}</span>
                              </div>

                              <div className="map-popup-health">
                                <div className="map-popup-row">
                                  <span>Cargo Integrity</span>
                                  <span>{nav.health}%</span>
                                </div>
                                <div className="map-popup-track">
                                  <div
                                    className="map-popup-fill"
                                    style={{
                                      width: `${nav.health}%`,
                                      backgroundColor: nav.health < 70 ? '#ef4444' : '#10b981'
                                    }}
                                  />
                                </div>
                              </div>

                              <div className="map-popup-phase">
                                <div className="map-popup-row">
                                  <span>Current Phase</span>
                                  <span>Progress</span>
                                </div>
                                <div className="map-popup-row-strong">
                                  <span>{exp.status === 'Arrived' ? 'DELIVERED' : nav.phase.label.toUpperCase()}</span>
                                  <strong>{exp.status === 'Arrived' ? '100.0' : (nav.progress * 100).toFixed(1)}%</strong>
                                </div>
                              </div>

                              <div className="map-popup-footer">Admin Read-Only View</div>
                            </div>
                          </Popup>
                        </Marker>
                      </React.Fragment>
                    );
                  })}
                </MapContainer>

                {/* Top-Left Overwatch Status Pill */}
                <div className="overwatch-status-overlay">
                  <div className="overwatch-status-title">
                    <Compass size={16} className="text-periwinkle" />
                    <span>BIMP-EAGA Fleet Overwatch</span>
                  </div>
                  <p>
                    Tracking <strong>{globalFleets.filter((f) => f.status === 'Outbound').length}</strong> active deployments
                  </p>
                </div>

                {/* Bottom-Left Weather HUD */}
                <div className="overwatch-weather-hud-dock">
                  <WeatherHUD syncTrigger={weatherSyncTrigger} />
                </div>

                {/* Top-Right Compact Slate Glass Toolbar */}
                <div className="overwatch-Right-toolbar">
                  <div className="overwatch-toolbar-toggles">
                    <button
                      type="button"
                      className={`toolbar-toggle-btn ${showFacilityOps ? 'active' : ''}`}
                      onClick={toggleFacilityOps}
                    >
                      <Package size={14} />
                      <span>Facility Hubs</span>
                    </button>
                    <button
                      type="button"
                      className={`toolbar-toggle-btn ${showClimate ? 'active' : ''}`}
                      onClick={toggleClimate}
                    >
                      <Sliders size={14} />
                      <span>Climate Directive</span>
                    </button>
                  </div>

                  {/* Collapsible Facility Hubs Drawer */}
                  {showFacilityOps && (
                    <div className="overwatch-drawer-card">
                      <div className="overwatch-drawer-header">
                        <span>REGIONAL PORT &amp; WAREHOUSE HUBS</span>
                        <button type="button" onClick={() => setShowFacilityOps(false)} aria-label="Close Facility Hubs">
                          <X size={14} />
                        </button>
                      </div>
                      <div className="overwatch-drawer-scroll">
                        <div className="hub-group-label">Local Origin Hubs (Panabo)</div>
                        {PANABO_HUBS.map((hub) => (
                          <div key={hub.id} className="hub-list-item emerald-border">
                            <h4>{hub.name}</h4>
                            <span>{hub.type} &bull; {hub.stat}</span>
                          </div>
                        ))}

                        <div className="hub-group-label">National Terminals</div>
                        {NATIONAL_HUBS.map((hub) => (
                          <div key={hub.id} className="hub-list-item periwinkle-border">
                            <h4>{hub.name}</h4>
                            <span>{hub.type} &bull; {hub.stat}</span>
                          </div>
                        ))}

                        <div className="hub-group-label">ASEAN &amp; Global Hubs</div>
                        {GLOBAL_HUBS.map((hub) => (
                          <div key={hub.id} className="hub-list-item amber-border">
                            <h4>{hub.name}</h4>
                            <span>{hub.type} &bull; {hub.stat}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Collapsible Climate Directive Drawer */}
                  {showClimate && (
                    <div className="overwatch-drawer-card">
                      <div className="overwatch-drawer-header">
                        <span>WEATHER OVERRIDE</span>
                        <button type="button" onClick={() => setShowClimate(false)} aria-label="Close Climate Panel">
                          <X size={14} />
                        </button>
                      </div>
                      <p className="overwatch-drawer-desc">
                        Override Beaufort wind and wave conditions across all connected simulation sessions.
                      </p>

                      <div className="climate-controls-list">
                        <button
                          type="button"
                          className={`climate-control-btn ${activeWeatherOverride === null ? 'active-auto' : ''}`}
                          onClick={() => initiateWeatherOverride(null)}
                        >
                          <span className="climate-btn-left">
                            <Activity size={14} />
                            <span>AUTO (DEFAULT)</span>
                          </span>
                          <span className="climate-risk-tag">Dynamic</span>
                        </button>

                        <button
                          type="button"
                          className={`climate-control-btn ${activeWeatherOverride === 'NOMINAL' ? 'active-nominal' : ''}`}
                          onClick={() => initiateWeatherOverride('NOMINAL')}
                        >
                          <span className="climate-btn-left">
                            <Sun size={14} />
                            <span>FORCE NOMINAL</span>
                          </span>
                          <span className="climate-risk-tag">5% Risk</span>
                        </button>

                        <button
                          type="button"
                          className={`climate-control-btn ${activeWeatherOverride === 'DETERIORATING' ? 'active-deteriorating' : ''}`}
                          onClick={() => initiateWeatherOverride('DETERIORATING')}
                        >
                          <span className="climate-btn-left">
                            <CloudRain size={14} />
                            <span>FORCE DETERIORATING</span>
                          </span>
                          <span className="climate-risk-tag">35% Risk</span>
                        </button>

                        <button
                          type="button"
                          className={`climate-control-btn ${activeWeatherOverride === 'CYCLONE IMMINENT' ? 'active-cyclone' : ''}`}
                          onClick={() => initiateWeatherOverride('CYCLONE IMMINENT')}
                        >
                          <span className="climate-btn-left">
                            <AlertTriangle size={14} />
                            <span>FORCE CYCLONE</span>
                          </span>
                          <span className="climate-risk-tag">85% Risk</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- TAB 3: SYSTEM LOGS (ACTIVITY LOG) --- */}
          {activeTabId === 'logs' && openTabs.some((t) => t.id === 'logs') && (
            <div className="admin-panel-container">
              <div className="admin-panel-toolbar">
                <div>
                  <h1 className="admin-panel-title">System Logs</h1>
                  <p className="admin-panel-subtitle">
                    Chronological activity log of user logins, dispatches, and weather changes.
                  </p>
                </div>
                <span className="audit-ledger-badge">
                  <ShieldAlert size={14} />
                  <span>Activity Log</span>
                </span>
              </div>

              <div className="bento-main-table-card">
                <div className="table-scroll-container">
                  <table className="admin-custom-table audit-ledger-table">
                    <colgroup>
                      <col style={{ width: '22%' }} />
                      <col style={{ width: '16%' }} />
                      <col style={{ width: '62%' }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Category</th>
                        <th>Event Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {systemLogs.length > 0 ? (
                        systemLogs.map((log) => {
                          const d = new Date(log.timestamp);
                          const timeString = `${d.getHours().toString().padStart(2, '0')}:${d
                            .getMinutes()
                            .toString()
                            .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')} ${d.toLocaleDateString()}`;
                          const category = getAuditCategory(log.event_type);
                          return (
                            <tr key={log.id}>
                              <td className="mono-cell">{timeString}</td>
                              <td>
                                <span className={`audit-category-tag ${category.className}`}>{category.tag}</span>
                              </td>
                              <td className="audit-desc-cell">{formatLogDescription(log.description)}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={3} className="empty-table-row">
                            No activity logs recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* --- WEATHER DURATION MODAL --- */}
      {overrideModal.isOpen && (
        <div
          className="modal-overlay"
          onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}
        >
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>Confirm Weather Override</h2>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleWeatherOverride(overrideModal.state, overrideModal.duration);
              }}
              className="admin-modal-form"
            >
              <div className="override-target-callout">
                <strong>TARGET STATE: {overrideModal.state}</strong>
                <p>This will immediately update all connected simulation sessions to this weather state.</p>
              </div>

              <div className="form-group">
                <label htmlFor="override-duration">DURATION (MINUTES)</label>
                <input
                  id="override-duration"
                  type="number"
                  value={overrideModal.duration}
                  onChange={(e) => setOverrideModal({ ...overrideModal, duration: parseInt(e.target.value, 10) })}
                  min="1"
                  required
                />
                <span className="form-helper-text">
                  Simulation reverts to automatic weather mode when the timer expires.
                </span>
              </div>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="btn-secondary-slate"
                  onClick={() => setOverrideModal({ ...overrideModal, isOpen: false })}
                >
                  Cancel
                </button>
                <button type="submit" className="btn-primary-periwinkle">
                  Apply Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CREATE / EDIT USER MODAL --- */}
      {isModalOpen && (
        <div className="modal-overlay" onClick={() => setIsModalOpen(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>{modalMode === 'create' ? 'Create User' : 'Edit User'}</h2>
              <button type="button" className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSave} className="admin-modal-form">
              <div className="form-group">
                <label htmlFor="user-username">Username</label>
                <input
                  id="user-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={modalMode === 'edit'}
                  required
                />
              </div>

              {modalMode === 'create' && (
                <div className="form-group">
                  <label htmlFor="user-password">Initial Password</label>
                  <input
                    id="user-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>
              )}

              <div className="form-group">
                <label htmlFor="user-reputation">Reputation Rating (0 - 100)</label>
                <input
                  id="user-reputation"
                  type="number"
                  value={reputation}
                  onChange={(e) => setReputation(e.target.value)}
                  min="0"
                  max="100"
                  required
                />
              </div>

              {message && <div className="modal-error-banner">{message}</div>}

              <div className="admin-modal-actions">
                <button type="button" className="btn-secondary-slate" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary-periwinkle">
                  Save User
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- INSTRUCTOR INVITE MODAL --- */}
      {inviteModalOpen && (
        <div className="modal-overlay" onClick={() => setInviteModalOpen(false)}>
          <section
            className="admin-modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="instructor-invite-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="admin-modal-header">
              <div>
                <p className="admin-invite-eyebrow">USERS / ACCESS CONTROL</p>
                <h2 id="instructor-invite-title">Generate Instructor Invite</h2>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setInviteModalOpen(false)}
                aria-label="Close instructor invite"
              >
                <X size={16} />
              </button>
            </div>

            <p className="admin-invite-description">
              Create a random, single-use invite code that expires after 24 hours. Verify your admin password to continue.
            </p>

            {!generatedInvite ? (
              <form className="admin-modal-form" onSubmit={generateInstructorInvite}>
                <div className="form-group">
                  <label htmlFor="invite-admin-username">Admin Username</label>
                  <input id="invite-admin-username" type="text" value={currentAdminName} readOnly />
                </div>
                <div className="form-group">
                  <label htmlFor="invite-admin-password">Admin Password</label>
                  <input
                    id="invite-admin-password"
                    type="password"
                    value={inviteAdminPassword}
                    onChange={(e) => setInviteAdminPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                </div>
                {inviteError && (
                  <p className="modal-error-banner" role="alert">
                    {inviteError}
                  </p>
                )}
                <div className="admin-modal-actions">
                  <button type="button" className="btn-secondary-slate" onClick={() => setInviteModalOpen(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn-primary-periwinkle" disabled={isGeneratingInvite}>
                    {isGeneratingInvite ? 'Generating...' : 'Generate Code'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="admin-modal-form">
                <div className="form-group">
                  <label htmlFor="generated-instructor-invite">Single-Use Instructor Code</label>
                  <input
                    id="generated-instructor-invite"
                    value={generatedInvite.invite_code}
                    readOnly
                    onFocus={(e) => e.target.select()}
                  />
                </div>
                <p className="admin-invite-description">
                  Expires{' '}
                  {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
                    new Date(generatedInvite.expires_at)
                  )}
                  . The instructor enters this code when registering.
                </p>
                {inviteError && (
                  <p className="admin-invite-copy-note" role="status">
                    {inviteError}
                  </p>
                )}
                <div className="admin-modal-actions">
                  <button type="button" className="btn-secondary-slate" onClick={() => setInviteModalOpen(false)}>
                    Close
                  </button>
                  <button type="button" className="btn-primary-periwinkle" onClick={copyInstructorInvite}>
                    Copy Code
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* --- LOGOUT CONFIRMATION MODAL --- */}
      {showLogoutModal && (
        <div className="modal-overlay" onClick={() => setShowLogoutModal(false)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <h2>Log Out</h2>
              <button type="button" className="modal-close-btn" onClick={() => setShowLogoutModal(false)}>
                <X size={16} />
              </button>
            </div>
            <p className="admin-invite-description">
              Are you sure you want to log out of your administrator account?
            </p>
            <div className="admin-modal-actions">
              <button type="button" className="btn-secondary-slate" onClick={() => setShowLogoutModal(false)}>
                Cancel
              </button>
              <button type="button" className="btn-danger-flat" onClick={handleLogout}>
                Confirm Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Admin;