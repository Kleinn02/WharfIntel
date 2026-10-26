// VesselHelm3D.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const CAMERA_MODES = [
  { id: 1, key: '1', label: 'CHASE' },
  { id: 2, key: '2', label: 'BRIDGE' },
  { id: 3, key: '3', label: 'FLYBY' },
  { id: 4, key: '4', label: 'ORBIT' }
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatETATimestamp = (etaMs) => {
  if (!etaMs || Number.isNaN(etaMs)) return 'CALCULATING...';
  const d = new Date(etaMs);
  const day = d.getDate().toString().padStart(2, '0');
  const mon = MONTHS[d.getMonth()];
  const hrs = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${mon}, ${hrs}:${mins}`;
};

const getBarometerData = (weather) => {
  if (weather === 'CYCLONE IMMINENT') {
    return { hpa: 960, trend: 'STORM', color: '#ef4444' };
  }
  if (weather === 'DETERIORATING') {
    return { hpa: 998, trend: 'FALLING', color: '#f1c40f' };
  }
  return { hpa: 1013, trend: 'CALM', color: '#2ecc71' };
};

const formatRemainingDuration = (remMs) => {
  if (!remMs || remMs <= 0) return '0d 0h 0m (ARRIVING)';
  const totalMinutes = Math.floor(remMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  return `${days}d ${hours}h ${mins}m`;
};

const VesselHelm3D = ({
  mode = 'PUSH',
  weatherState = 'NOMINAL',
  destination = 'Singapore',
  departureTime = Date.now(),
  totalDurationMs = 3600000,
  timeOffset = 0,
  cargo = 'Cavendish Bananas',
  category = 'Perishable (Food)',
  weightKg = 2500,
  teuCount: propTeuCount,
  initialHealth = 100,
  onComplete,
  onExit
}) => {
  const mountRef = useRef(null);

  // Live Weather Sync (Prop + Authoritative Backend Poll)
  const [liveWeather, setLiveWeather] = useState(weatherState || 'NOMINAL');
  const weatherRef = useRef(weatherState || 'NOMINAL');

  useEffect(() => {
    if (weatherState) {
      weatherRef.current = weatherState;
      setLiveWeather(weatherState);
    }
  }, [weatherState]);

  useEffect(() => {
    let isMounted = true;
    const syncLiveWeather = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/analytics/weather');
        if (res.ok && isMounted) {
          const data = await res.json();
          if (data?.current?.state) {
            weatherRef.current = data.current.state;
            setLiveWeather(data.current.state);
          }
        }
      } catch (err) {
        // Fallback to prop if backend is unreachable
      }
    };
    syncLiveWeather();
    const interval = setInterval(syncLiveWeather, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // Multi-Camera Director & Sim Speed States
  const [cameraMode, setCameraMode] = useState(1); // 1: Drone Chase, 2: Bridge POV, 3: Sea Level / Flyby, 4: Free Orbit
  const cameraModeRef = useRef(1);

  const [simSpeed, setSimSpeed] = useState(1); // 1x or 2x
  const simSpeedRef = useRef(1);

  const resolvedWeightKg = Number(weightKg) || 2500;
  const teuCount = Math.max(
    1,
    Number(propTeuCount) || Math.ceil(resolvedWeightKg / 25000)
  );
  const catLower = String(category || '').toLowerCase();
  const isElectronics = catLower.includes('electronic');
  const isRawMaterials = catLower.includes('raw');
  const isPerishable =
    !isElectronics &&
    !isRawMaterials &&
    (catLower.includes('perishable') ||
      cargo.toLowerCase().includes('banana') ||
      cargo.toLowerCase().includes('food'));

  const payloadPerTeu = Math.round(resolvedWeightKg / teuCount);
  const tareWeightPerTeu = isPerishable ? 3080 : 2250;
  const verifiedGrossMass = payloadPerTeu + tareWeightPerTeu;

  const switchCameraMode = (modeId) => {
    cameraModeRef.current = modeId;
    setCameraMode(modeId);
  };

  const toggleSimSpeed = () => {
    const next = simSpeedRef.current === 1 ? 2 : 1;
    simSpeedRef.current = next;
    setSimSpeed(next);
  };

  // --- HUD & TELEMETRY STATE ---
  const initialEtaMs = Number(departureTime) + Number(totalDurationMs) * 0.85;
  const initialRemainingMs = Math.max(
    0,
    initialEtaMs - (Date.now() + Number(timeOffset || 0))
  );

  const [hud, setHud] = useState({
    speedKmh: 28,
    speedKnots: '15.2',
    rpm: 85,
    fuelRateMt: '14.5',
    reeferTemp: '-4.1',
    rudder: 0,
    headingDeg: 36,
    rollDeg: '1.8',
    swellMeters: '0.4',
    health: Math.round(initialHealth),
    etaFormatted: formatETATimestamp(initialEtaMs),
    remainingFormatted: formatRemainingDuration(initialRemainingMs),
    autopilotBanner: `AUTOPILOT LOCKED • COURSE 036° TRUE TOWARD ${(
      destination || 'SINGAPORE'
    ).toUpperCase()}`
  });

  // Right-Click 360° Free Orbit Camera Ref
  const camOrbitRef = useRef({
    isRightDown: false,
    lastX: 0,
    lastY: 0,
    yawOffset: 0.48,
    pitchOffset: 4.0,
    zoomDist: 42
  });

  const hasCompletedRef = useRef(false);

  const simRef = useRef({
    speedKmh: 28.15, // ~15.2 Knots (28.15 km/h) commercial feeder cruise speed
    headingRad: 0,
    compassHeadingDeg: 36,
    rudderAngle: 0,
    rollAngleDeg: 1.5,
    pitchAngleDeg: 0.4,
    heaveY: 0,
    waveAmp: 0.4,
    extraSimOffsetMs: 0
  });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ==========================================
    // 1. THREE.JS SCENE, SKY, FOG & CAMERA
    // ==========================================
    const scene = new THREE.Scene();
    const initialW = weatherRef.current;
    const initCyclone = initialW === 'CYCLONE IMMINENT';
    const initDet = initialW === 'DETERIORATING';

    const skyHex = initCyclone ? 0x0f1a26 : initDet ? 0x3b4d5e : 0x5da9e9;
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.FogExp2(skyHex, initCyclone ? 0.0016 : initDet ? 0.0011 : 0.00065);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      3200
    );
    camera.position.set(18, 16, 42);
    const camLookTarget = new THREE.Vector3(0, 4.5, -10);
    camera.lookAt(camLookTarget);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e3a5f, initCyclone ? 0.65 : 1.05);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffdf5, initCyclone ? 0.75 : 1.35);
    dirLight.position.set(90, 180, 75);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ==========================================
    // 2. INFINITE MULTI-OCTAVE OCEAN SURFACE & RAIN
    // ==========================================
    const waterGeo = new THREE.PlaneGeometry(3600, 3600, 128, 128);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhongMaterial({
      color: initCyclone ? 0x0f293d : initDet ? 0x244c66 : 0x1570bf,
      emissive: initCyclone ? 0x040d17 : 0x061e33,
      specular: 0x99d6ff,
      shininess: 85,
      flatShading: true
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    scene.add(waterMesh);

    const rainCount = 2000;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i += 3) {
      rainPositions[i] = (Math.random() - 0.5) * 200;
      rainPositions[i + 1] = Math.random() * 65;
      rainPositions[i + 2] = (Math.random() - 0.5) * 200;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.45,
      transparent: true,
      opacity: initCyclone ? 0.7 : initDet ? 0.35 : 0.0
    });
    const rainSystem = new THREE.Points(rainGeo, rainMat);
    scene.add(rainSystem);

    // ==========================================
    // 3. HARMONIZED 3D FEEDER CONTAINER VESSEL (MV WHARF-ALPHA FROM PORTTERMINAL3D)
    // ==========================================
    const playerGroup = new THREE.Group();
    const hullTiltGroup = new THREE.Group();
    playerGroup.add(hullTiltGroup);
    scene.add(playerGroup);

    // Rotate the PortTerminal3D ship assembly (-90 deg around Y) so Bow (-X) points Forward (-Z)
    // and scale by 0.34 so the 122-unit feeder vessel matches the open-ocean camera & wake system
    const shipModelGroup = new THREE.Group();
    shipModelGroup.rotation.y = -Math.PI / 2;
    shipModelGroup.scale.setScalar(0.34);
    shipModelGroup.position.y = -0.55;
    hullTiltGroup.add(shipModelGroup);

    const navyHullMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const redBootMat = new THREE.MeshLambertMaterial({ color: 0x991b1b });
    const deckGreyMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const whiteSuperMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const bridgeGlassMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const funnelAmberMat = new THREE.MeshLambertMaterial({ color: 0xeab308 });

    // 1. Lower Antifouling Hull Block in Deep Marine Red (BoxGeometry 118 x 3.2 x 22)
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(118, 3.2, 22), redBootMat);
    lowerHull.position.set(0, 1.4, 0);
    shipModelGroup.add(lowerHull);

    // 2. Upper Hull Block in Dark Navy Slate (BoxGeometry 122 x 5.2 x 24)
    const upperHull = new THREE.Mesh(new THREE.BoxGeometry(122, 5.2, 24), navyHullMat);
    upperHull.position.set(0, 5.4, 0);
    shipModelGroup.add(upperHull);

    // 3. Raised Forecastle Bow Block at Forward End (-X)
    const bowBlock = new THREE.Mesh(new THREE.BoxGeometry(18, 3.2, 23.5), navyHullMat);
    bowBlock.position.set(-55, 9.2, 0);
    shipModelGroup.add(bowBlock);

    // 4. Main Cargo Deck Plate with Cell Guide Coamings
    const cargoDeck = new THREE.Mesh(new THREE.BoxGeometry(92, 0.6, 21.5), deckGreyMat);
    cargoDeck.position.set(-2, 8.2, 0);
    shipModelGroup.add(cargoDeck);

    // 5. Aft Bridge Superstructure Tower in Clean Maritime White with Panoramic Bridge Wing Windows
    const bridgeTower = new THREE.Mesh(new THREE.BoxGeometry(16, 15, 20), whiteSuperMat);
    bridgeTower.position.set(46, 15.5, 0);
    shipModelGroup.add(bridgeTower);

    const bridgeHelm = new THREE.Mesh(new THREE.BoxGeometry(17.5, 3.2, 22), whiteSuperMat);
    bridgeHelm.position.set(45.5, 23.5, 0);
    shipModelGroup.add(bridgeHelm);

    const bridgeWindows = new THREE.Mesh(new THREE.BoxGeometry(17.7, 1.3, 21.2), bridgeGlassMat);
    bridgeWindows.position.set(45.3, 23.6, 0);
    shipModelGroup.add(bridgeWindows);

    // Radar Scanner Bar atop Bridge Roof
    const radarScannerBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.6, 6.5),
      funnelAmberMat
    );
    radarScannerBar.position.set(45.5, 25.8, 0);
    shipModelGroup.add(radarScannerBar);

    // 6. Twin Diesel Exhaust Funnels Emitting Subtle Animated Dark Smoke Particles
    const exhaustPlumes = [];
    const exhaustMat = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.38
    });

    [-4.5, 4.5].forEach((fz) => {
      const funnel = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.7, 5.5, 10),
        funnelAmberMat
      );
      funnel.position.set(50, 26.5, fz);
      shipModelGroup.add(funnel);

      for (let pIdx = 0; pIdx < 3; pIdx++) {
        const plume = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1 + pIdx * 0.65, 0.8 + pIdx * 0.4, 2.6, 8),
          exhaustMat
        );
        plume.position.set(50 + pIdx * 1.5, 30.2 + pIdx * 2.4, fz);
        shipModelGroup.add(plume);
        exhaustPlumes.push({
          mesh: plume,
          baseY: 30.2 + pIdx * 2.4,
          baseX: 50 + pIdx * 1.5,
          phase: pIdx * 1.3
        });
      }
    });

    // 7. Full Multi-Bay Container Cargo Grid Across Bays 01, 02, 03, 05, and 06
    const isoColors = [
      0x0284c7, // Cyan
      0xd97706, // Amber
      0x059669, // Emerald
      0x991b1b, // Dark Red
      0x7c3aed  // Purple
    ];
    const bayPositions = [-36, -24, -12, 12, 24]; // Bays 01, 02, 03, 05, 06 (Bay 04 at X = 0 reserved)
    bayPositions.forEach((bx, bIdx) => {
      [-6.5, 0, 6.5].forEach((rz, rIdx) => {
        for (let tier = 0; tier < 2; tier++) {
          const cMat = new THREE.MeshLambertMaterial({
            color: isoColors[(bIdx + rIdx + tier) % isoColors.length]
          });
          const cMesh = new THREE.Mesh(new THREE.BoxGeometry(11.2, 3.2, 3.2), cMat);
          cMesh.position.set(bx, 10.1 + tier * 3.25, rz);
          shipModelGroup.add(cMesh);
        }
      });
    });

    // Side rows in Bay 04 (X = 0, Z = -6.5 and +6.5) + Base Tier under active slot (X = 0, Z = 0)
    [-6.5, 6.5].forEach((rz, rIdx) => {
      for (let tier = 0; tier < 2; tier++) {
        const sideMesh = new THREE.Mesh(
          new THREE.BoxGeometry(11.2, 3.2, 3.2),
          new THREE.MeshLambertMaterial({ color: isoColors[(rIdx + tier) % isoColors.length] })
        );
        sideMesh.position.set(0, 10.1 + tier * 3.25, rz);
        shipModelGroup.add(sideMesh);
      }
    });

    const bay04Base = new THREE.Mesh(
      new THREE.BoxGeometry(11.2, 3.2, 3.2),
      new THREE.MeshLambertMaterial({ color: 0x0284c7 })
    );
    bay04Base.position.set(0, 10.1, 0);
    shipModelGroup.add(bay04Base);

    // 8. Active User Consignment Locked in Bay 04 • Row 02 • Tier 82 (Reflects Selected Goods Category)
    const activeContainerColor = isPerishable
      ? 0xf8fafc
      : isElectronics
      ? 0x1e3a8a
      : 0x059669;
    const activeStripeColor = isPerishable
      ? 0x38bdf8
      : isElectronics
      ? 0x60a5fa
      : 0xfacc15;

    const userBay04Container = new THREE.Mesh(
      new THREE.BoxGeometry(11.4, 3.25, 3.25),
      new THREE.MeshLambertMaterial({ color: activeContainerColor })
    );
    userBay04Container.position.set(0, 13.35, 0);
    shipModelGroup.add(userBay04Container);

    const userBay04Stripe = new THREE.Mesh(
      new THREE.BoxGeometry(11.46, 0.48, 3.3),
      new THREE.MeshBasicMaterial({ color: activeStripeColor })
    );
    userBay04Stripe.position.set(0, 14.2, 0);
    shipModelGroup.add(userBay04Stripe);

    // F. Bow Foam Spray Particles (Parented to Bow for Breaking Wave Splash)
    const sprayCount = 160;
    const sprayGeo = new THREE.BufferGeometry();
    const sprayPositions = new Float32Array(sprayCount * 3);
    const sprayVelocities = [];

    for (let i = 0; i < sprayCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      sprayPositions[i * 3] = side * (0.8 + Math.random() * 2.2);
      sprayPositions[i * 3 + 1] = Math.random() * 2.5;
      sprayPositions[i * 3 + 2] = -18.5 + Math.random() * 6.0;
      sprayVelocities.push({
        side,
        vx: side * (2.5 + Math.random() * 4.5),
        vy: 3.5 + Math.random() * 4.5,
        vz: 4.5 + Math.random() * 6.5,
        life: Math.random()
      });
    }
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPositions, 3));
    const sprayMat = new THREE.PointsMaterial({
      color: 0xf0f9ff,
      size: 0.65,
      transparent: true,
      opacity: 0.78
    });
    const bowSpraySystem = new THREE.Points(sprayGeo, sprayMat);
    playerGroup.add(bowSpraySystem);

    // ==========================================
    // 4. WORLD-SPACE TRAILING WAKE, STREAMING FOAM & LOW-POLY CLOUDS
    // ==========================================
    // A. World-Space Trailing Propeller Wake Rings (NOT parented to ship — spawned in world coordinates!)
    const wakeTrailCount = 48;
    const wakeTrailParticles = [];
    const wakeRingGeo = new THREE.PlaneGeometry(4.8, 3.6);
    wakeRingGeo.rotateX(-Math.PI / 2);

    for (let i = 0; i < wakeTrailCount; i++) {
      const wMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.0,
        depthWrite: false
      });
      const wMesh = new THREE.Mesh(wakeRingGeo, wMat);
      const initialAge = i / wakeTrailCount;
      wMesh.position.set(0, 0.18, 16.5 + initialAge * 135);
      wMesh.scale.set(1 + initialAge * 2.8, 1, 1 + initialAge * 1.6);
      scene.add(wMesh);
      wakeTrailParticles.push({
        mesh: wMesh,
        mat: wMat,
        age: initialAge,
        driftX: (i % 2 === 0 ? 1 : -1) * (0.4 + (i % 5) * 0.18)
      });
    }

    // B. Streaming Surface Foam Streaks Rushing Past Hull Sides (World-Space Motion Parallax)
    const foamStreakCount = 110;
    const foamStreaks = [];
    const streakGeo = new THREE.PlaneGeometry(0.45, 7.5);
    streakGeo.rotateX(-Math.PI / 2);
    const streakMat = new THREE.MeshBasicMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.42,
      depthWrite: false
    });

    for (let i = 0; i < foamStreakCount; i++) {
      const sMesh = new THREE.Mesh(streakGeo, streakMat);
      const side = i % 2 === 0 ? -1 : 1;
      const laneX = side * (6.2 + Math.random() * 95);
      const offsetZ = (Math.random() - 0.5) * 320;
      sMesh.position.set(laneX, 0.14, offsetZ);
      scene.add(sMesh);
      foamStreaks.push({
        mesh: sMesh,
        baseX: laneX
      });
    }

    // C. Drifting Low-Poly Cumulus Clouds Overhead (Atmospheric Parallax)
    const clouds = [];
    const cloudMat = new THREE.MeshLambertMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.86,
      flatShading: true
    });

    for (let i = 0; i < 9; i++) {
      const cGroup = new THREE.Group();
      const puffCount = 3 + (i % 3);
      for (let p = 0; p < puffCount; p++) {
        const puff = new THREE.Mesh(
          new THREE.DodecahedronGeometry(9 + (p % 2) * 4, 1),
          cloudMat
        );
        puff.scale.set(1.6, 0.62, 1.25);
        puff.position.set((p - 1) * 10, (p % 2) * 2.2, (p % 2) * 4);
        cGroup.add(puff);
      }
      const relX = -220 + i * 55 + (i % 2) * 18;
      const relY = 68 + (i % 4) * 11;
      const relZ = -260 + ((i * 67) % 340);
      cGroup.position.set(relX, relY, relZ);
      scene.add(cGroup);
      clouds.push({
        group: cGroup,
        relX,
        relY,
        relZ,
        speedX: 1.4 + (i % 3) * 0.55,
        speedZ: 6.5 + (i % 4) * 1.8
      });
    }

    // ==========================================
    // 5. CAMERA HOTKEYS ([1]-[4]) & RIGHT-CLICK FREE ORBIT CONTROLS
    // ==========================================
    const onKeyDown = (e) => {
      if (e.key === '1') switchCameraMode(1);
      if (e.key === '2') switchCameraMode(2);
      if (e.key === '3') switchCameraMode(3);
      if (e.key === '4') switchCameraMode(4);
    };

    const onContextMenu = (e) => e.preventDefault();
    const onMouseDown = (e) => {
      if (e.button === 2) {
        camOrbitRef.current.isRightDown = true;
        camOrbitRef.current.lastX = e.clientX;
        camOrbitRef.current.lastY = e.clientY;
      }
    };
    const onMouseMove = (e) => {
      if (!camOrbitRef.current.isRightDown) return;
      const dx = e.clientX - camOrbitRef.current.lastX;
      const dy = e.clientY - camOrbitRef.current.lastY;
      camOrbitRef.current.lastX = e.clientX;
      camOrbitRef.current.lastY = e.clientY;
      camOrbitRef.current.yawOffset -= dx * 0.007;
      camOrbitRef.current.pitchOffset = Math.max(
        -3.5,
        Math.min(26, camOrbitRef.current.pitchOffset + dy * 0.08)
      );
    };
    const onMouseUp = (e) => {
      if (e.button === 2) camOrbitRef.current.isRightDown = false;
    };
    const onWheel = (e) => {
      camOrbitRef.current.zoomDist = Math.max(
        20,
        Math.min(75, camOrbitRef.current.zoomDist + e.deltaY * 0.025)
      );
    };

    container.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('keydown', onKeyDown);

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ==========================================
    // 6. 60FPS NON-HARMONIC SWELL, WORLD-SPACE WAKE & DAMPED CAMERA LOOP
    // ==========================================
    const clock = new THREE.Clock();
    let animId;
    let hudTimer = 0;
    let simElapsed = 0;

    // Prime-period angular frequencies (2 * PI / T) so motion never locks into a repeating GIF
    const OMEGA_LONG = (Math.PI * 2) / 14.3;  // 14.3s period: deep ocean heave & primary list
    const OMEGA_MID = (Math.PI * 2) / 5.7;    // 5.7s period: pitching bow & secondary swell
    const OMEGA_CHOP = (Math.PI * 2) / 1.9;   // 1.9s period: high-frequency surface micro-chop

    const evaluateOceanSurfaceY = (worldX, worldZ, t, amp) => {
      const longWave = Math.sin(worldX * 0.024 + worldZ * 0.019 + t * OMEGA_LONG) * (amp * 0.62);
      const midWave = Math.cos(worldX * 0.041 - worldZ * 0.053 + t * OMEGA_MID) * (amp * 0.31);
      const microChop = Math.sin((worldX + worldZ) * 0.11 + t * OMEGA_CHOP) * (amp * 0.12);
      return longWave + midWave + microChop;
    };

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const rawDt = Math.min(clock.getDelta(), 0.05);
      const dt = rawDt * simSpeedRef.current;
      simElapsed += dt;
      const s = simRef.current;

      if (simSpeedRef.current > 1) {
        s.extraSimOffsetMs += rawDt * (simSpeedRef.current - 1) * 1000;
      }

      // Spin Bridge X-Band Radar Scanner & Animate Twin Funnel Exhaust Smoke Plumes
      radarScannerBar.rotation.y = simElapsed * 4.2;
      exhaustPlumes.forEach((ep) => {
        const cycle = ((simElapsed * 2.0 + ep.phase) % 3.0) / 3.0;
        ep.mesh.position.y = ep.baseY + cycle * 6.0;
        ep.mesh.position.x = ep.baseX + cycle * 4.5;
        const sScale = 1.0 + cycle * 0.85;
        ep.mesh.scale.set(sScale, 1.0 + cycle * 0.45, sScale);
      });

      // Live Weather Atmosphere, Swell Amplitude & Water Color Lerp
      const currentW = weatherRef.current;
      const isCyclone = currentW === 'CYCLONE IMMINENT';
      const isDeteriorating = currentW === 'DETERIORATING';

      const targetSkyHex = isCyclone ? 0x0f1a26 : isDeteriorating ? 0x3b4d5e : 0x5da9e9;
      scene.background.lerp(new THREE.Color(targetSkyHex), rawDt * 1.8);
      scene.fog.color.lerp(new THREE.Color(targetSkyHex), rawDt * 1.8);
      scene.fog.density = THREE.MathUtils.lerp(
        scene.fog.density,
        isCyclone ? 0.0016 : isDeteriorating ? 0.0011 : 0.00065,
        rawDt * 1.8
      );

      const targetWaterHex = isCyclone ? 0x0f293d : isDeteriorating ? 0x244c66 : 0x1570bf;
      waterMat.color.lerp(new THREE.Color(targetWaterHex), rawDt * 1.8);

      cloudMat.color.lerp(
        new THREE.Color(isCyclone ? 0x475569 : isDeteriorating ? 0x94a3b8 : 0xf8fafc),
        rawDt * 1.5
      );

      const targetRainOpacity = isCyclone ? 0.7 : isDeteriorating ? 0.35 : 0.0;
      rainMat.opacity = THREE.MathUtils.lerp(rainMat.opacity, targetRainOpacity, rawDt * 2.0);

      // Swell amplitude scales with weather: Nominal 0.4m, Deteriorating 0.8m, Cyclone 1.4m
      const targetWaveAmp = isCyclone ? 1.4 : isDeteriorating ? 0.8 : 0.4;
      s.waveAmp = THREE.MathUtils.lerp(s.waveAmp, targetWaveAmp, rawDt * 1.8);
      const waveAmp = s.waveAmp;

      // Autonomous Commercial Feeder Speed (~15.2 Knots / 28.15 km/h)
      const targetSpeedKmh = isCyclone ? 26.5 : isDeteriorating ? 27.4 : 28.15;
      s.speedKmh = THREE.MathUtils.lerp(s.speedKmh, targetSpeedKmh, rawDt * 1.5);

      const forwardStep = s.speedKmh * 0.62 * dt;
      playerGroup.position.z -= forwardStep;

      // Keep infinite ocean centered on the vessel while evaluating world-space multi-octave waves
      waterMesh.position.x = playerGroup.position.x;
      waterMesh.position.z = playerGroup.position.z;

      const shipWorldX = playerGroup.position.x;
      const shipWorldZ = playerGroup.position.z;
      const posAttr = waterGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const wx = posAttr.getX(i) + shipWorldX;
        const wz = posAttr.getZ(i) + shipWorldZ;
        posAttr.setY(i, evaluateOceanSurfaceY(wx, wz, simElapsed, waveAmp));
      }
      posAttr.needsUpdate = true;

      // Multi-Octave Non-Harmonic Hydrodynamic Pitch, Roll & Heave (Zero Repeating Loop)
      const rollAmp = isCyclone ? 9.8 : isDeteriorating ? 5.0 : 1.7;
      s.rollAngleDeg =
        Math.sin(simElapsed * OMEGA_LONG) * (rollAmp * 0.62) +
        Math.cos(simElapsed * OMEGA_MID + 1.1) * (rollAmp * 0.28) +
        Math.sin(simElapsed * OMEGA_CHOP + 2.4) * (rollAmp * 0.1);

      const pitchAmp = isCyclone ? 3.5 : isDeteriorating ? 1.9 : 0.85;
      s.pitchAngleDeg =
        Math.cos(simElapsed * OMEGA_MID) * (pitchAmp * 0.65) +
        Math.sin(simElapsed * OMEGA_LONG + 0.7) * (pitchAmp * 0.25) +
        Math.cos(simElapsed * OMEGA_CHOP) * (pitchAmp * 0.1);

      s.heaveY =
        Math.sin(simElapsed * OMEGA_LONG + 0.4) * (waveAmp * 0.34) +
        Math.cos(simElapsed * OMEGA_MID) * (waveAmp * 0.18);

      hullTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngleDeg);
      hullTiltGroup.rotation.x = THREE.MathUtils.degToRad(s.pitchAngleDeg);
      hullTiltGroup.position.y = s.heaveY;

      // Update World-Space Trailing Propeller Wake Rings
      wakeTrailParticles.forEach((wp) => {
        wp.age += dt * 0.26;
        if (wp.age >= 1.0) {
          wp.age %= 1.0;
          // Respawn directly behind the moving stern in world coordinates
          wp.mesh.position.x =
            shipWorldX + (Math.random() - 0.5) * 1.4 - Math.sin(THREE.MathUtils.degToRad(s.rollAngleDeg)) * 0.8;
          wp.mesh.position.z = shipWorldZ + 16.0;
        }
        // Expand laterally and stream aft in world coordinates
        wp.mesh.position.x += wp.driftX * dt * 2.2;
        wp.mesh.position.y =
          evaluateOceanSurfaceY(wp.mesh.position.x, wp.mesh.position.z, simElapsed, waveAmp) + 0.14;
        wp.mesh.scale.set(1 + wp.age * 3.6, 1, 1 + wp.age * 2.1);
        wp.mat.opacity = Math.sin(wp.age * Math.PI) * (1 - wp.age * 0.68) * 0.52;
      });

      // Update Streaming Surface Foam Streaks Rushing Past Hull Sides
      streakMat.opacity = isCyclone ? 0.62 : isDeteriorating ? 0.48 : 0.36;
      foamStreaks.forEach((fs) => {
        // Foam stays anchored in world Z; wrap it ahead of the bow once it passes far behind the stern
        if (fs.mesh.position.z - shipWorldZ > 155) {
          fs.mesh.position.z = shipWorldZ - 165 - Math.random() * 35;
          const side = fs.baseX < 0 ? -1 : 1;
          fs.mesh.position.x = shipWorldX + side * (6.2 + Math.random() * 95);
        }
        fs.mesh.position.y =
          evaluateOceanSurfaceY(fs.mesh.position.x, fs.mesh.position.z, simElapsed, waveAmp) + 0.12;
      });

      // Update Drifting Low-Poly Cumulus Clouds in Upper Sky Layer
      clouds.forEach((cl) => {
        cl.relX += cl.speedX * dt;
        cl.relZ += cl.speedZ * dt;
        if (cl.relX > 260) cl.relX = -260;
        if (cl.relZ > 190) cl.relZ = -310;
        cl.group.position.set(shipWorldX + cl.relX, cl.relY, shipWorldZ + cl.relZ);
      });

      // Animate Storm Rain Streaks
      if (rainSystem && rainMat.opacity > 0.01) {
        rainSystem.position.copy(playerGroup.position);
        const rPos = rainSystem.geometry.attributes.position;
        for (let i = 1; i < rPos.count * 3; i += 3) {
          rPos.array[i] -= 58 * dt;
          if (rPos.array[i] < 0) rPos.array[i] = 65;
        }
        rPos.needsUpdate = true;
      }

      // Animate Bow Foam Spray
      const absSpeedRatio = Math.min(1.15, s.speedKmh / 28);
      const sprayIntensity = absSpeedRatio * (0.7 + waveAmp * 0.75);
      sprayMat.opacity = Math.min(0.88, sprayIntensity * 0.78);
      sprayMat.size = 0.48 + waveAmp * 0.35;

      const sPos = bowSpraySystem.geometry.attributes.position;
      for (let i = 0; i < sprayCount; i++) {
        const v = sprayVelocities[i];
        v.life += dt * (1.25 + absSpeedRatio * 1.2);
        if (v.life >= 1.0) {
          v.life = 0;
          sPos.array[i * 3] = v.side * (0.7 + Math.random() * 1.3);
          sPos.array[i * 3 + 1] = 0.2 + Math.random() * 0.5;
          sPos.array[i * 3 + 2] = -19.5 + Math.random() * 2.5;
        } else {
          const dispersion = 0.65 + sprayIntensity * 0.9;
          sPos.array[i * 3] += v.vx * dispersion * dt;
          sPos.array[i * 3 + 1] += (v.vy * sprayIntensity - 9.8 * v.life) * dt;
          sPos.array[i * 3 + 2] += v.vz * (0.5 + absSpeedRatio) * dt;
        }
      }
      sPos.needsUpdate = true;

      // ==========================================
      // 7. MULTI-CAMERA DIRECTOR ([1] DAMPED DRONE CHASE, [2] BRIDGE POV, [3] SEA LEVEL, [4] ORBIT)
      // ==========================================
      const modeId = cameraModeRef.current;
      const orb = camOrbitRef.current;

      if (modeId === 1) {
        // [1] Damped Inertial Drone Chase Camera (3.5 exponential damping factor for authentic naval mass)
        const followAngle =
          (orb.isRightDown ? orb.yawOffset : 0.34) + Math.sin(simElapsed * OMEGA_LONG) * 0.035;
        const camDist = 41 + Math.cos(simElapsed * OMEGA_MID) * 1.4;
        const camHeight = 16.2 + Math.sin(simElapsed * OMEGA_LONG + 1.2) * 0.85;

        const targetX = playerGroup.position.x + Math.sin(followAngle) * camDist;
        const targetZ = playerGroup.position.z + Math.cos(followAngle) * camDist;

        camera.position.lerp(new THREE.Vector3(targetX, camHeight, targetZ), 3.5 * rawDt);
        camLookTarget.lerp(
          new THREE.Vector3(
            playerGroup.position.x,
            4.8 + s.heaveY * 0.35,
            playerGroup.position.z - 3
          ),
          3.5 * rawDt
        );
        camera.lookAt(camLookTarget);
      } else if (modeId === 2) {
        // [2] Bridge POV (Positioned forward on bridge deck at Z = +7.3, Y = 9.45 outside wheelhouse mesh)
        const bridgeCamX = playerGroup.position.x;
        const bridgeCamY = 9.45 + hullTiltGroup.position.y;
        const bridgeCamZ = playerGroup.position.z + 7.3;

        camera.position.set(bridgeCamX, bridgeCamY, bridgeCamZ);
        camLookTarget.set(
          playerGroup.position.x - Math.sin(THREE.MathUtils.degToRad(s.rollAngleDeg)) * 3.5,
          6.0 + Math.sin(THREE.MathUtils.degToRad(s.pitchAngleDeg)) * 12,
          playerGroup.position.z - 48
        );
        camera.lookAt(camLookTarget);
      } else if (modeId === 3) {
        // [3] Sea Level / Flyby Camera (Low-angle ocean surface camera watching the hull slice through swells)
        const flybyZOffset = ((simElapsed * 12) % 72) - 36;
        const targetX = playerGroup.position.x + 20;
        const targetY = 3.2 + waveAmp * 1.1;
        const targetZ = playerGroup.position.z - flybyZOffset;

        camera.position.lerp(new THREE.Vector3(targetX, targetY, targetZ), 5.0 * rawDt);
        camLookTarget.lerp(
          new THREE.Vector3(playerGroup.position.x, 4.2, playerGroup.position.z - 4),
          8.0 * rawDt
        );
        camera.lookAt(camLookTarget);
      } else {
        // [4] Free 360° Orbit Camera (Right-Click Drag + Scroll Wheel Zoom)
        const totalAngle = orb.yawOffset;
        const dist = orb.zoomDist;
        const height = Math.max(3.5, 14.0 + orb.pitchOffset);

        const targetX = playerGroup.position.x + Math.sin(totalAngle) * dist;
        const targetZ = playerGroup.position.z + Math.cos(totalAngle) * dist;

        camera.position.lerp(new THREE.Vector3(targetX, height, targetZ), 6.0 * rawDt);
        camLookTarget.lerp(
          new THREE.Vector3(playerGroup.position.x, 4.5, playerGroup.position.z),
          8.0 * rawDt
        );
        camera.lookAt(camLookTarget);
      }

      // ==========================================
      // 8. 10Hz INDUSTRIAL IoT TELEMATICS & REAL VOYAGE ETA SYNC
      // ==========================================
      hudTimer += rawDt;
      if (hudTimer > 0.1) {
        hudTimer = 0;

        const depMs = Number(departureTime) || Date.now();
        const durMs = Number(totalDurationMs) || 3600000;
        // 85% mark corresponds to Step 7: Port of Discharge (POD) arrival at destination port
        const etaMs = depMs + durMs * 0.85;
        const remainingMs = Math.max(
          0,
          etaMs - (Date.now() + Number(timeOffset || 0) + s.extraSimOffsetMs)
        );

        const knots = (s.speedKmh * 0.539957).toFixed(1);
        const absHeel = Math.abs(s.rollAngleDeg).toFixed(1);
        const swellHeight = (waveAmp * 1.5).toFixed(1);

        let banner = `AUTOPILOT LOCKED • COURSE 036° TRUE TOWARD ${(
          destination || 'SINGAPORE'
        ).toUpperCase()}`;
        if (isCyclone) {
          banner = `HEAVY WEATHER AUTOPILOT • ACTIVE ANTI-HEEL STABILIZATION ENGAGED`;
        } else if (isDeteriorating) {
          banner = `MODERATE SEA SWELL • AUTOPILOT MAINTAINING 15.0 KTS CRUISE`;
        }

        const displayTemp = isPerishable
          ? (-4.1 + Math.sin(simElapsed * 0.45) * 0.1).toFixed(1)
          : isElectronics
          ? '+22.0'
          : '+24.5';

        setHud({
          speedKmh: Math.round(s.speedKmh),
          speedKnots: knots,
          rpm: Math.round(85 + Math.sin(simElapsed * OMEGA_MID) * 1.2),
          fuelRateMt: (14.4 + (s.speedKmh / 28.15) * 0.15).toFixed(1),
          reeferTemp: displayTemp,
          rudder: 0,
          headingDeg: s.compassHeadingDeg,
          rollDeg: absHeel,
          swellMeters: swellHeight,
          health: Math.round(initialHealth),
          etaFormatted: formatETATimestamp(etaMs),
          remainingFormatted: formatRemainingDuration(remainingMs),
          autopilotBanner: banner
        });

        // Automatically trigger Port of Discharge Arrival Debrief if countdown reaches zero
        if (remainingMs <= 0 && !hasCompletedRef.current && onComplete) {
          hasCompletedRef.current = true;
          onComplete({
            success: true,
            finalHealth: Math.round(initialHealth),
            stage: 'POD_ARRIVED'
          });
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [mode, weightKg, departureTime, totalDurationMs, timeOffset, destination, initialHealth]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10005,
        background: '#050811',
        fontFamily: "'Inter', sans-serif",
        userSelect: 'none'
      }}
    >
      {/* 3D THREE.JS OPEN-OCEAN VIEWPORT */}
      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />

      {/* TOP CENTER BAR: DESTINATION & REAL-TIME VOYAGE ETA */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
          background: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: 14,
          padding: '9px 24px',
          color: '#f1f5f9',
          zIndex: 10020,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)',
          whiteSpace: 'nowrap'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#38bdf8',
              boxShadow: '0 0 8px #38bdf8'
            }}
          />
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: 0.6,
              color: '#38bdf8'
            }}
          >
            OCEAN TRANSIT: OPEN-SEA AUTOPILOT • DESTINATION: {(destination || 'SINGAPORE').toUpperCase()}
          </span>
        </div>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: '#cbd5e1',
            letterSpacing: 0.4
          }}
        >
          ETA: <strong style={{ color: '#2ecc71' }}>{hud.etaFormatted}</strong> • REMAINING:{' '}
          <strong style={{ color: '#38bdf8' }}>{hud.remainingFormatted}</strong>
        </div>
      </div>

      {/* LEFT TELEMETRY PANEL: COLD CHAIN & MARINE ENGINEERING */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '16px 18px',
          width: 335,
          color: '#fff',
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)',
          zIndex: 10020
        }}
      >
        {/* Vessel Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 8
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              color: '#38bdf8',
              fontWeight: 700,
              letterSpacing: 0.8,
              fontFamily: "'Space Mono', monospace"
            }}
          >
            ⚓ MV WHARF-ALPHA (FEEDER)
          </span>
          <span
            style={{
              fontSize: 10,
              fontFamily: "'Space Mono', monospace",
              background: 'rgba(46, 204, 113, 0.15)',
              color: '#2ecc71',
              border: '1px solid rgba(46, 204, 113, 0.3)',
              padding: '2px 7px',
              borderRadius: 4,
              fontWeight: 'bold'
            }}
          >
            OPEN-OCEAN TWIN
          </span>
        </div>

        {/* Cargo Manifest & Total TEU Allocation */}
        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            marginBottom: 4,
            textTransform: 'uppercase',
            letterSpacing: 0.3
          }}
        >
          {cargo}
        </div>
        <div
          style={{
            fontSize: 11,
            color: '#94a3b8',
            marginBottom: 12,
            fontFamily: "'Space Mono', monospace"
          }}
        >
          NET {resolvedWeightKg.toLocaleString()} KG ({teuCount} TEU • VGM {(verifiedGrossMass * teuCount).toLocaleString()} KG) •{' '}
          <strong
            style={{
              color:
                liveWeather === 'NOMINAL'
                  ? '#2ecc71'
                  : liveWeather === 'DETERIORATING'
                  ? '#f1c40f'
                  : '#ef4444'
            }}
          >
            {liveWeather}
          </strong>
        </div>

        {/* Cold Chain Monitor */}
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.06)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 12
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6
            }}
          >
            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.5 }}>
              ❄️ COLD CHAIN MONITOR
            </span>
            <span
              style={{
                fontSize: 9.5,
                fontFamily: "'Space Mono', monospace",
                color: '#2ecc71',
                fontWeight: 'bold'
              }}
            >
              [OPTIMAL]
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              fontFamily: "'Space Mono', monospace"
            }}
          >
            <div>
              <div style={{ fontSize: 9, color: '#64748b' }}>
                {isPerishable ? 'INTERNAL REEFER TEMP' : 'CONTAINER CLIMATE'}
              </div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#38bdf8' }}>
                {hud.reeferTemp}°C
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#64748b' }}>BAY 04 STOWAGE</div>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#e2e8f0' }}>
                {isPerishable
                  ? 'SHIPBOARD AUX GRID'
                  : isElectronics
                  ? 'SEALED DRY VAULT'
                  : 'STABILITY TRIM LOCK'}
              </div>
            </div>
          </div>
        </div>

        {/* Marine Propulsion Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 8,
            marginBottom: 12
          }}
        >
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 8,
              padding: '8px'
            }}
          >
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>SOG</div>
            <div
              style={{
                fontSize: 13,
                fontFamily: "'Space Mono', monospace",
                fontWeight: 'bold',
                color: '#38bdf8',
                marginTop: 2
              }}
            >
              {hud.speedKnots} KTS
            </div>
          </div>

          {/* Replaced Telegraph with Marine Atmospheric Barometer */}
          {(() => {
            const baro = getBarometerData(liveWeather);
            return (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: 8,
                  padding: '8px'
                }}
              >
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>BAROMETER</div>
                <div
                  style={{
                    fontSize: 12,
                    fontFamily: "'Space Mono', monospace",
                    fontWeight: 'bold',
                    color: baro.color,
                    marginTop: 2
                  }}
                >
                  {baro.hpa} hPa
                </div>
                <div
                  style={{
                    fontSize: 8,
                    fontFamily: "'Space Mono', monospace",
                    color: baro.color,
                    opacity: 0.9,
                    marginTop: 1,
                    letterSpacing: 0.3
                  }}
                >
                  [{baro.trend}]
                </div>
              </div>
            );
          })()}

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 8,
              padding: '8px'
            }}
          >
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>FUEL RATE</div>
            <div
              style={{
                fontSize: 12,
                fontFamily: "'Space Mono', monospace",
                fontWeight: 'bold',
                color: '#2ecc71',
                marginTop: 2
              }}
            >
              {hud.fuelRateMt} MT/D
            </div>
          </div>
        </div>

        {/* Anti-Heel Ballast System */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontFamily: "'Space Mono', monospace",
            fontSize: 10,
            color: '#94a3b8',
            background: 'rgba(130, 160, 255, 0.06)',
            border: '1px solid rgba(130, 160, 255, 0.18)',
            borderRadius: 6,
            padding: '7px 10px',
            marginBottom: 12
          }}
        >
          <span>ANTI-HEEL BALLAST:</span>
          <strong style={{ color: '#2ecc71' }}>ACTIVE [OPTIMAL TRIM]</strong>
        </div>

        {/* Complete Voyage -> Port Arrival Button */}
        <button
          type="button"
          onClick={() => {
            if (hasCompletedRef.current) return;
            hasCompletedRef.current = true;
            if (onComplete) {
              onComplete({
                success: true,
                finalHealth: Math.round(initialHealth),
                stage: 'POD_ARRIVED'
              });
            }
          }}
          style={{
            width: '100%',
            background: '#38bdf8',
            color: '#060911',
            border: 'none',
            padding: '10px 14px',
            borderRadius: 8,
            fontFamily: "'Space Mono', monospace",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 0.4,
            boxShadow: '0 4px 14px rgba(56, 189, 248, 0.35)',
            transition: 'all 0.2s ease'
          }}
        >
          [COMPLETE VOYAGE ➔ PORT ARRIVAL]
        </button>
      </div>

      {/* TOP RIGHT: SPEED TOGGLE, EXIT BUTTON & CAMERA DIRECTOR ([1] - [4]) */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
          zIndex: 10020
        }}
      >
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* 1x / 2x Speed Toggle */}
          <button
            type="button"
            onClick={toggleSimSpeed}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              background:
                simSpeed === 2 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(10, 14, 23, 0.88)',
              backdropFilter: 'blur(14px)',
              border: `1px solid ${
                simSpeed === 2 ? '#38bdf8' : 'rgba(255, 255, 255, 0.12)'
              }`,
              color: simSpeed === 2 ? '#38bdf8' : '#cbd5e1',
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            ⚡ SPEED: {simSpeed}x
          </button>

          {/* Return to Command Map Button */}
          <button
            type="button"
            onClick={() =>
              onExit ? onExit() : onComplete && onComplete({ success: true, finalHealth: 100 })
            }
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 10,
              background: 'rgba(10, 14, 23, 0.88)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              color: '#ef4444',
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            [✕ RETURN TO COMMAND MAP]
          </button>
        </div>

        {/* 2x2 Matrix Camera Director Grid ([1] - [4]) */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 6,
            width: 220,
            background: 'rgba(11, 17, 32, 0.9)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: 6
          }}
        >
          {CAMERA_MODES.map((cam) => {
            const active = cameraMode === cam.id;
            return (
              <button
                key={cam.id}
                type="button"
                onClick={() => switchCameraMode(cam.id)}
                style={{
                  background: active ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                  border: `1px solid ${active ? '#38bdf8' : 'rgba(255, 255, 255, 0.06)'}`,
                  boxShadow: active ? '0 0 12px rgba(56, 189, 248, 0.28)' : 'none',
                  color: active ? '#38bdf8' : '#94a3b8',
                  borderRadius: 8,
                  padding: '7px 8px',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  fontWeight: 700,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                [{cam.key}] {cam.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* BOTTOM CENTER: CLEAN 3-COLUMN NAVIGATION GRID */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 10020
        }}
      >
        <div
          style={{
            background: 'rgba(10, 14, 23, 0.88)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: 999,
            padding: '5px 18px',
            color: '#e2e8f0',
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: 0.4
          }}
        >
          {hud.autopilotBanner}
        </div>

        <div
          style={{
            background: 'rgba(10, 14, 23, 0.9)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '14px 26px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            alignItems: 'center',
            gap: 24,
            boxShadow: '0 14px 36px rgba(0, 0, 0, 0.55)',
            width: 680
          }}
        >
          {/* COLUMN 1: PROPULSION / SPEED */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.8 }}>
              PROPULSION / SPEED
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 16,
                  fontWeight: 'bold',
                  color: '#38bdf8'
                }}
              >
                {hud.speedKnots} KTS
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 11,
                  color: '#64748b',
                  fontWeight: 'bold'
                }}
              >
                ({hud.speedKmh} KM/H)
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 3,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: '86%',
                  height: '100%',
                  background: '#38bdf8'
                }}
              />
            </div>
          </div>

          {/* COLUMN 2: HEADING & RUDDER */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0 22px'
            }}
          >
            <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.8 }}>
              HEADING & RUDDER
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 13.5,
                fontWeight: 'bold',
                color: '#e2e8f0',
                whiteSpace: 'nowrap'
              }}
            >
              HDG {String(hud.headingDeg).padStart(3, '0')}° •{' '}
              <span style={{ color: '#2ecc71' }}>MIDSHIPS 0°</span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 3,
                position: 'relative'
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: 0,
                  bottom: 0,
                  width: 6,
                  borderRadius: 3,
                  background: '#2ecc71',
                  transform: 'translateX(-50%)'
                }}
              />
            </div>
          </div>

          {/* COLUMN 3: HEEL & SEA SWELL */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.8 }}>
              HEEL & SEA SWELL
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 13,
                fontWeight: 'bold',
                whiteSpace: 'nowrap',
                color:
                  liveWeather === 'CYCLONE IMMINENT'
                    ? '#f1c40f'
                    : '#2ecc71'
              }}
            >
              {hud.rollDeg}° HEEL •{' '}
              <span style={{ color: '#38bdf8' }}>SWELL {hud.swellMeters}m</span>
            </div>
            <div
              style={{
                width: '100%',
                height: 6,
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 3,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (Number(hud.rollDeg) / 18) * 100)}%`,
                  height: '100%',
                  background:
                    liveWeather === 'CYCLONE IMMINENT' ? '#f1c40f' : '#2ecc71',
                  transition: 'width 0.15s ease'
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VesselHelm3D;