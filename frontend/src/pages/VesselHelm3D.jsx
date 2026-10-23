// VesselHelm3D.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const VesselHelm3D = ({
  mode = 'PUSH',             // 'PUSH', 'RETREAT', 'REROUTE'
  weatherState = 'NOMINAL',  // 'NOMINAL', 'DETERIORATING', 'CYCLONE IMMINENT'
  cargo = 'Container Cargo',
  weightKg = 2500,
  initialHealth = 100,
  onComplete,
  onExit,
  onSwitchToQuiz
}) => {
  const mountRef = useRef(null);

  // LIVE WEATHER STATE & REF (Syncs with Simulation.jsx prop AND live backend clock)
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
        // Fallback to prop if offline
      }
    };
    syncLiveWeather();
    const interval = setInterval(syncLiveWeather, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // --- HUD & TELEMETRY STATE ---
  const [hud, setHud] = useState({
    speed: 20,
    throttle: 24,
    rudder: 0,
    rollDeg: 0,
    signedRollDeg: 0,
    headingDeg: 0,
    health: Math.round(initialHealth),
    progress: 0,
    status: 'ACTIVE', // 'ACTIVE' | 'CAPSIZED' | 'SUNK' | 'CLEARED'
    failReason: '',
    warning: '',
    channelNotice: '🧭 SECTOR 1: HARBOR FAIRWAY — FOLLOW GREEN/RED CHANNEL BUOYS',
    vhfAlert: '',
    ballastState: 'READY', // 'READY' | 'ACTIVE' | 'COOLDOWN'
    ballastSeconds: 0,
    jettisonCount: 0,
    remainingContainers: 6,
    radarBlips: [],
    radarWaypoints: []
  });

  // Auto-Fading Controls & [?] Toggle
  const [showControls, setShowControls] = useState(true);
  const controlsFadeTimerRef = useRef(null);

  const triggerControlsAutoFade = () => {
    if (controlsFadeTimerRef.current) clearTimeout(controlsFadeTimerRef.current);
    controlsFadeTimerRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  };

  useEffect(() => {
    triggerControlsAutoFade();
    return () => {
      if (controlsFadeTimerRef.current) clearTimeout(controlsFadeTimerRef.current);
    };
  }, []);

  // Refs for 60FPS loop access
  const keysRef = useRef({ w: false, s: false, a: false, d: false, space: false });
  const jettisonTriggerRef = useRef(false);
  const camOrbitRef = useRef({
    isRightDown: false,
    lastX: 0,
    lastY: 0,
    yawOffset: 0,
    pitchOffset: 0,
    zoomDist: 34
  });

  const simRef = useRef({
    speed: 20,
    throttle: 24,
    rudderAngle: 0,      // -35 to +35 deg
    yawRate: 0,          // angular velocity (heavy momentum)
    heading: 0,          // ship rotation Y (rad)
    rollAngle: 0,        // tilt angle in degrees (42+ = CAPSIZE!)
    rollVelocity: 0,
    health: Number(initialHealth) || 100,
    distance: 0,
    targetDistance: 1080, // Final Breakwater Lighthouse Z coordinate (-1080)
    targetPortX: 190,     // Final Breakwater Lighthouse X coordinate (+190)
    isCapsized: false,
    isFinished: false,
    // Deliverable 1: Ballast 10s Active + 30s Recharge Cooldown Engine
    ballastState: 'READY', // 'READY' | 'ACTIVE' | 'COOLDOWN'
    ballastTimer: 0,
    ballastCooldown: 0,
    ballastStabilizer: 1.0,
    jettisonCount: 0,
    dynamicWeightFactor: 0.65 + (Number(weightKg || 2500) / 5000) * 0.8,
    maxSpeedCap: 55,
    cameraShake: 0,
    waveAmp: 0.38,
    lightningAlertTimer: 0,
    vhfAlertTimer: 0,
    vhfMessage: '',
    autoJettisonUsed: false
  });

  const CAPSIZE_DEG = 42;

  // Deliverable 1: Ergonomic [Q] Ballast Activation (10s Active -> 30s Cooldown)
  const activateBallastStabilizer = () => {
    const s = simRef.current;
    if (s.isCapsized || s.isFinished) return;
    if (s.ballastState !== 'READY') return; // Disabled while ACTIVE or in COOLDOWN

    s.ballastState = 'ACTIVE';
    s.ballastTimer = 10.0;       // Exactly 10 seconds active
    s.ballastStabilizer = 0.55;  // +45% roll stability
    s.maxSpeedCap = 35;          // Speed capped at 35 km/h
    if (s.throttle > 35) s.throttle = 35;
    if (s.speed > 35) s.speed = 35;
  };

  // Deliverable 1: Ergonomic [E] Emergency Jettison Top Container
  const triggerManualJettison = () => {
    const s = simRef.current;
    if (s.isCapsized || s.isFinished) return;
    jettisonTriggerRef.current = true;
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ==========================================
    // 1. SCENE, WEATHER ATMOSPHERE & CHASE CAMERA
    // ==========================================
    const scene = new THREE.Scene();
    const initialW = weatherRef.current;
    const initCyclone = initialW === 'CYCLONE IMMINENT';
    const initDet = initialW === 'DETERIORATING';

    const skyHex = initCyclone ? 0x162433 : initDet ? 0x3b5266 : 0x5da9e9;
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.FogExp2(skyHex, initCyclone ? 0.0022 : 0.0014);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.5,
      1600
    );
    camera.position.set(0, 16, 36);
    camera.lookAt(0, 3, -16);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e4e79, initCyclone ? 0.65 : 1.0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffdf5, initCyclone ? 0.8 : 1.3);
    dirLight.position.set(80, 150, 60);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ==========================================
    // 2. 3D OCEAN SURFACE & DYNAMIC RAIN PARTICLES
    // ==========================================
    const waterGeo = new THREE.PlaneGeometry(3200, 3200, 100, 100);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhongMaterial({
      color: initCyclone ? 0x103f5e : initDet ? 0x19587a : 0x1d7ed6,
      emissive: 0x061e33,
      specular: 0x99d6ff,
      shininess: 80,
      flatShading: true
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    scene.add(waterMesh);

    const rainCount = 1800;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i += 3) {
      rainPositions[i] = (Math.random() - 0.5) * 180;
      rainPositions[i + 1] = Math.random() * 60;
      rainPositions[i + 2] = (Math.random() - 0.5) * 180;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.45,
      transparent: true,
      opacity: initCyclone ? 0.65 : initDet ? 0.35 : 0.0
    });
    const rainSystem = new THREE.Points(rainGeo, rainMat);
    scene.add(rainSystem);

    // ==========================================
    // 3. DELIVERABLE 2: AUTHENTIC 3D FEEDER CONTAINER VESSEL
    // ==========================================
    const playerGroup = new THREE.Group();
    const hullTiltGroup = new THREE.Group();
    playerGroup.add(hullTiltGroup);
    scene.add(playerGroup);

    const antiFoulingRedMat = new THREE.MeshLambertMaterial({ color: 0x991b1b });
    const darkNavyHullMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const deckGreyMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const guideSteelMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const superWhiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const bridgeGlassMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    const funnelAmberMat = new THREE.MeshLambertMaterial({ color: 0xd97706 });
    const darkSteelMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

    // A. Lower Red Antifouling Hull & Bulbous Bow
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.8, 30), antiFoulingRedMat);
    lowerHull.position.set(0, 0.3, 0);
    hullTiltGroup.add(lowerHull);

    const bulbousBow = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 5.5, 10), antiFoulingRedMat);
    bulbousBow.rotation.x = Math.PI / 2;
    bulbousBow.position.set(0, 0.1, -16.5);
    hullTiltGroup.add(bulbousBow);

    // B. Dark Slate/Navy Topsides Freeboard
    const upperHull = new THREE.Mesh(new THREE.BoxGeometry(6.6, 2.0, 29), darkNavyHullMat);
    upperHull.position.set(0, 1.9, 0.5);
    hullTiltGroup.add(upperHull);

    // White Plimsoll Waterline Stripe
    const waterlineStripe = new THREE.Mesh(new THREE.BoxGeometry(6.68, 0.22, 29.2), superWhiteMat);
    waterlineStripe.position.set(0, 1.1, 0.4);
    hullTiltGroup.add(waterlineStripe);

    // C. Raised Forecastle Bow with Forward Navigation Mast & Anchor Deck Fittings
    const bowWedgeGeo = new THREE.ConeGeometry(4.7, 9.5, 4);
    bowWedgeGeo.rotateX(-Math.PI / 2);
    bowWedgeGeo.rotateZ(Math.PI / 4);
    const bowWedge = new THREE.Mesh(bowWedgeGeo, darkNavyHullMat);
    bowWedge.scale.set(1.0, 0.72, 1.0);
    bowWedge.position.set(0, 2.3, -17.5);
    hullTiltGroup.add(bowWedge);

    const forecastleDeck = new THREE.Mesh(new THREE.BoxGeometry(6.2, 1.1, 7.5), darkNavyHullMat);
    forecastleDeck.position.set(0, 3.1, -13.2);
    hullTiltGroup.add(forecastleDeck);

    const forecastleFloor = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.2, 7.2), deckGreyMat);
    forecastleFloor.position.set(0, 3.7, -13.2);
    hullTiltGroup.add(forecastleFloor);

    // Anchor Windlass & Foredeck Fittings
    [-1.4, 1.4].forEach((ax) => {
      const windlass = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 8), darkSteelMat);
      windlass.rotation.z = Math.PI / 2;
      windlass.position.set(ax, 4.1, -15.2);
      hullTiltGroup.add(windlass);
    });

    // Forward Navigation Mast on Forecastle
    const foreMast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.24, 6.2, 8), superWhiteMat);
    foreMast.position.set(0, 6.6, -15.5);
    hullTiltGroup.add(foreMast);

    const foreCrossYard = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.14, 0.14), superWhiteMat);
    foreCrossYard.position.set(0, 8.6, -15.5);
    hullTiltGroup.add(foreCrossYard);

    const navLight = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    navLight.position.set(0, 9.8, -15.5);
    hullTiltGroup.add(navLight);

    // D. Recessed Main Cargo Well Amidships (Z = -9.5 to +6.5) & Cell Guides
    const wellFloor = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.3, 16.5), deckGreyMat);
    wellFloor.position.set(0, 2.85, -1.2);
    hullTiltGroup.add(wellFloor);

    // Port & Starboard Coaming Walls
    [-3.15, 3.15].forEach((wx) => {
      const coaming = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, 16.5), darkNavyHullMat);
      coaming.position.set(wx, 3.3, -1.2);
      hullTiltGroup.add(coaming);
    });

    // Vertical Cell Guide Frames around the Amidships Container Bay
    [-8.6, -1.2, 6.2].forEach((gz) => {
      [-2.85, 0, 2.85].forEach((gx) => {
        const guidePost = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.8, 0.25), guideSteelMat);
        guidePost.position.set(gx, 5.2, gz);
        hullTiltGroup.add(guidePost);
      });
    });

    // Amidships 2x2x2 TEU Container Bay Stacks (Detachable with [E]!)
    const stackedContainers = [];
    const fallingContainers = [];
    const teuColors = [
      0xd97706, // Maersk/Hapag Amber
      0x0284c7, // Marine Cyan
      0x16a34a, // Evergreen Green
      0xdc2626, // ONE/CMA Red
      0x2563eb, // Ocean Blue
      0x9333ea  // Logistics Violet
    ];

    const bayZPositions = [-5.0, 2.4]; // Fore & Aft bays in amidships cargo well
    const bayXPositions = [-1.45, 1.45]; // Port & Starboard rows
    const tiers = Math.max(2, Math.min(3, Math.ceil(Number(weightKg || 2500) / 1400)));

    // Build bottom-to-top so .pop() always removes the highest top-tier container first!
    let colorIdx = 0;
    for (let tier = 0; tier < tiers; tier++) {
      for (let bz = 0; bz < bayZPositions.length; bz++) {
        for (let bx = 0; bx < bayXPositions.length; bx++) {
          const cMesh = new THREE.Mesh(
            new THREE.BoxGeometry(2.55, 1.45, 6.6),
            new THREE.MeshLambertMaterial({ color: teuColors[colorIdx % teuColors.length] })
          );
          cMesh.position.set(bayXPositions[bx], 3.75 + tier * 1.5, bayZPositions[bz]);
          hullTiltGroup.add(cMesh);
          stackedContainers.push(cMesh);
          colorIdx++;
        }
      }
    }

    // E. Aft Superstructure / Accommodation Bridge Tower (Positioned near Stern Z = +10.8)
    const poopDeck = new THREE.Mesh(new THREE.BoxGeometry(6.4, 1.4, 8.2), darkNavyHullMat);
    poopDeck.position.set(0, 3.2, 10.9);
    hullTiltGroup.add(poopDeck);

    const accommodationBlock = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.6, 5.2), superWhiteMat);
    accommodationBlock.position.set(0, 6.0, 10.6);
    hullTiltGroup.add(accommodationBlock);

    // Bridge Wings & Command Wheelhouse
    const wheelhouse = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.6, 3.6), superWhiteMat);
    wheelhouse.position.set(0, 8.9, 9.9);
    hullTiltGroup.add(wheelhouse);

    // Wrap-around Bridge Window Visor
    const bridgeVisor = new THREE.Mesh(new THREE.BoxGeometry(5.88, 0.75, 3.68), bridgeGlassMat);
    bridgeVisor.position.set(0, 9.05, 9.85);
    hullTiltGroup.add(bridgeVisor);

    const compassDeckRoof = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.3, 4.0), superWhiteMat);
    compassDeckRoof.position.set(0, 9.8, 9.9);
    hullTiltGroup.add(compassDeckRoof);

    // Rotating X-Band Radar Scanner on Bridge Roof
    const radarPedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.2, 8), superWhiteMat);
    radarPedestal.position.set(0, 10.5, 9.5);
    hullTiltGroup.add(radarPedestal);

    const radarScannerBar = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.22, 0.35), funnelAmberMat);
    radarScannerBar.position.set(0, 11.2, 9.5);
    hullTiltGroup.add(radarScannerBar);

    // Dual Engine Exhaust Funnels Behind Bridge
    [-1.4, 1.4].forEach((fx) => {
      const funnelBase = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.78, 3.4, 10), funnelAmberMat);
      funnelBase.position.set(fx, 9.4, 12.3);
      hullTiltGroup.add(funnelBase);

      const funnelCasing = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.7, 10), darkSteelMat);
      funnelCasing.position.set(fx, 11.1, 12.3);
      hullTiltGroup.add(funnelCasing);
    });

    // Helper to physically uncouple & drop the topmost container from the amidships bay ([E])
    const detachTopContainer = () => {
      if (stackedContainers.length === 0) return;
      const s = simRef.current;
      const topBox = stackedContainers.pop();
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      topBox.getWorldPosition(worldPos);
      topBox.getWorldQuaternion(worldQuat);

      hullTiltGroup.remove(topBox);
      topBox.position.copy(worldPos);
      topBox.quaternion.copy(worldQuat);
      scene.add(topBox);

      const slideDir = s.rollAngle >= 0 ? -1 : 1;
      fallingContainers.push({
        mesh: topBox,
        vx: slideDir * 13,
        vy: 4.2,
        vz: -s.speed * 0.2,
        rotSpeed: slideDir * 3.0
      });

      s.health = Math.max(5, s.health - 8); // -8% cargo integrity penalty
      s.rollAngle *= 0.3;                   // Relieves top-heavy heel immediately
      s.rollVelocity *= 0.2;
      s.dynamicWeightFactor = Math.max(0.52, s.dynamicWeightFactor - 0.12);
      s.jettisonCount += 1;
    };

    // Multi-Segment Stern Wake with Opacity Falloff
    const wakeGroup = new THREE.Group();
    const wakePlanes = [];
    [
      { z: 19, w: 5.2, l: 10, baseOp: 0.55 },
      { z: 29, w: 6.8, l: 12, baseOp: 0.34 },
      { z: 41, w: 8.4, l: 14, baseOp: 0.16 }
    ].forEach((seg) => {
      const wGeo = new THREE.PlaneGeometry(seg.w, seg.l);
      wGeo.rotateX(-Math.PI / 2);
      const wMat = new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: seg.baseOp
      });
      const wMesh = new THREE.Mesh(wGeo, wMat);
      wMesh.position.set(0, 0.16, seg.z);
      wakeGroup.add(wMesh);
      wakePlanes.push({ mesh: wMesh, mat: wMat, baseOp: seg.baseOp });
    });
    playerGroup.add(wakeGroup);

    // Dynamic Bow Spray & Foam Particle Emitter
    const sprayCount = 140;
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
        vz: 4.0 + Math.random() * 6.0,
        life: Math.random()
      });
    }
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPositions, 3));
    const sprayMat = new THREE.PointsMaterial({
      color: 0xf0f9ff,
      size: 0.65,
      transparent: true,
      opacity: 0.75
    });
    const bowSpraySystem = new THREE.Points(sprayGeo, sprayMat);
    playerGroup.add(bowSpraySystem);

    // ==========================================
    // 4. DELIVERABLE 3 & 5: MULTI-TURN ISLAND FAIRWAY & DIVERSE HAZARDS
    // ==========================================
    // Fairway Centerline Waypoints:
    // WP0 (Start):         (0, 0)
    // WP1 (Sector 1 End):  (0, -260)   -> 45° Starboard Turn around Barrier Cape Island
    // WP2 (Sector 2 End):  (190, -520) -> Straight into Cross-Current Strait
    // WP3 (Sector 3 End):  (190, -820) -> 45° Port Turn / Final Port Approach
    // WP4 (Harbor Gate):   (190, -1080)
    const fairwayWaypoints = [
      { x: 0, z: 0 },
      { x: 0, z: -130 },
      { x: 0, z: -260 },
      { x: 95, z: -390 },
      { x: 190, z: -520 },
      { x: 190, z: -670 },
      { x: 190, z: -820 },
      { x: 190, z: -950 },
      { x: 190, z: -1080 }
    ];

    const obstacles = [];
    const channelBuoys = [];
    const floatingDebris = [];
    const yellowBeaconMaterials = [];

    const rockMat = new THREE.MeshLambertMaterial({ color: 0x475569, flatShading: true });
    const islandVegMat = new THREE.MeshLambertMaterial({ color: 0x1e4620, flatShading: true });
    const buoyRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const buoyGreenMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    const timberWoodMat = new THREE.MeshLambertMaterial({ color: 0x78350f });

    // Spawn Port (Green) & Starboard (Red) Fairway Buoys along the 4-Sector S-Curve
    const spawnChannelBuoyPair = (cx, cz, nx, nz, halfWidth = 46) => {
      [
        { side: -1, isGreen: true },
        { side: 1, isGreen: false }
      ].forEach((b) => {
        const bx = cx + nx * b.side * halfWidth;
        const bz = cz + nz * b.side * halfWidth;
        const bGroup = new THREE.Group();
        bGroup.position.set(bx, 0, bz);

        const floatBase = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1, 1.4, 2.2, 10),
          b.isGreen ? buoyGreenMat : buoyRedMat
        );
        floatBase.position.y = 1.0;
        bGroup.add(floatBase);

        const topLamp = new THREE.Mesh(
          new THREE.SphereGeometry(0.75, 8, 8),
          b.isGreen ? buoyGreenMat : buoyRedMat
        );
        topLamp.position.y = 2.6;
        bGroup.add(topLamp);

        scene.add(bGroup);
        channelBuoys.push({ x: bx, z: bz, isPortGreen: b.isGreen, mesh: bGroup });
      });
    };

    // Sector 1 Buoys (Harbor Departure: X = 0, Z = -70 to -230)
    [-70, -150, -230].forEach((z) => spawnChannelBuoyPair(0, z, 1, 0, 44));
    // Sector 2 Buoys (45° Starboard Turn Channel: (0,-260) -> (190,-520))
    [0.25, 0.55, 0.85].forEach((t) => {
      const cx = 190 * t;
      const cz = -260 - 260 * t;
      spawnChannelBuoyPair(cx, cz, 0.8, 0.6, 48);
    });
    // Sector 3 Buoys (Cross-Current Strait: X = 190, Z = -560 to -800)
    [-570, -680, -790].forEach((z) => spawnChannelBuoyPair(190, z, 1, 0, 46));
    // Sector 4 Buoys (Final Port Approach: X = 190, Z = -880 to -1000)
    [-890, -985].forEach((z) => spawnChannelBuoyPair(190, z, 1, 0, 46));

    // MASSIVE BARRIER CAPE ISLAND AT (X = -35, Z = -360) FORCING THE 45° STARBOARD TURN!
    const barrierCape = new THREE.Group();
    barrierCape.position.set(-38, 0, -365);
    const capeBase = new THREE.Mesh(new THREE.DodecahedronGeometry(36, 1), rockMat);
    capeBase.scale.set(1.4, 0.65, 1.35);
    capeBase.position.y = 3;
    barrierCape.add(capeBase);

    const capeTop = new THREE.Mesh(new THREE.DodecahedronGeometry(26, 1), islandVegMat);
    capeTop.scale.set(1.25, 0.55, 1.2);
    capeTop.position.y = 12;
    barrierCape.add(capeTop);

    const capeTower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 9, 10), superWhiteMat);
    capeTower.position.set(18, 17, 14);
    barrierCape.add(capeTower);
    scene.add(barrierCape);

    obstacles.push({
      mesh: barrierCape,
      type: 'ISLAND',
      radius: 42,
      vx: 0,
      cooldown: 0
    });

    // Secondary Outer Reef Island on Starboard side of Sector 3 (X = 285, Z = -690)
    const eastIsland = new THREE.Group();
    eastIsland.position.set(285, 0, -690);
    const eastBase = new THREE.Mesh(new THREE.DodecahedronGeometry(28, 1), rockMat);
    eastBase.scale.set(1.2, 0.6, 1.5);
    eastBase.position.y = 2.5;
    eastIsland.add(eastBase);
    const eastVeg = new THREE.Mesh(new THREE.DodecahedronGeometry(19, 1), islandVegMat);
    eastVeg.scale.set(1.1, 0.5, 1.3);
    eastVeg.position.y = 9.5;
    eastIsland.add(eastVeg);
    scene.add(eastIsland);

    obstacles.push({
      mesh: eastIsland,
      type: 'ISLAND',
      radius: 32,
      vx: 0,
      cooldown: 0
    });

    // Helper: Create Local Motorized Banca / Fishing Skiff (Outrigger Boat)
    const createBancaSkiff = (x, z, moveDirX, speed, minX, maxX) => {
      const skiff = new THREE.Group();
      skiff.position.set(x, 0, z);
      skiff.rotation.y = moveDirX > 0 ? Math.PI / 2 : -Math.PI / 2;

      const mainHull = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 11.5), superWhiteMat);
      mainHull.position.y = 0.5;
      skiff.add(mainHull);

      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.3, 4.2),
        new THREE.MeshLambertMaterial({ color: 0x0284c7 })
      );
      cabin.position.set(0, 1.4, 0.5);
      skiff.add(cabin);

      // Bamboo Outriggers (Katig)
      [-2.2, 2.2].forEach((ox) => {
        const floatPole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 10.5, 6), timberWoodMat);
        floatPole.rotation.x = Math.PI / 2;
        floatPole.position.set(ox, 0.25, 0);
        skiff.add(floatPole);
      });

      const crossBoom = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.15, 0.2), timberWoodMat);
      crossBoom.position.set(0, 0.7, -1.5);
      skiff.add(crossBoom);

      scene.add(skiff);
      return {
        mesh: skiff,
        type: 'SKIFF',
        radius: 6.5,
        vx: moveDirX * speed,
        minX,
        maxX,
        cooldown: 0,
        vhfWarned: false
      };
    };

    // Helper: Create Crossing Passenger Steamer
    const createSteamerObstacle = (x, z, moveDirX, minX, maxX) => {
      const steamer = new THREE.Group();
      steamer.position.set(x, 0, z);
      steamer.rotation.y = moveDirX > 0 ? Math.PI / 2 : -Math.PI / 2;

      const sRed = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.5, 34), antiFoulingRedMat);
      sRed.position.y = 0.6;
      steamer.add(sRed);

      const sWhite = new THREE.Mesh(new THREE.BoxGeometry(7.8, 3.2, 35), superWhiteMat);
      sWhite.position.y = 3.2;
      steamer.add(sWhite);

      const sBridge = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 20), superWhiteMat);
      sBridge.position.set(0, 6.2, 2);
      steamer.add(sBridge);

      [0, 5.5].forEach((fz) => {
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 12), funnelAmberMat);
        funnel.position.set(0, 9.5, fz);
        steamer.add(funnel);
      });

      scene.add(steamer);
      return {
        mesh: steamer,
        type: 'STEAMER',
        radius: 15.5,
        vx: moveDirX * 13,
        minX,
        maxX,
        cooldown: 0,
        vhfWarned: false
      };
    };

    // Sector 1: Fishing Banca Skiffs & Steamer
    obstacles.push(createBancaSkiff(-28, -115, 1, 7.5, -55, 55));
    obstacles.push(createBancaSkiff(30, -195, -1, 8.5, -55, 55));
    obstacles.push(createSteamerObstacle(-45, -245, 1, -70, 85));

    // Sector 2 & 3: Crossing Steamer & Skiff in Strait
    obstacles.push(createSteamerObstacle(240, -610, -1, 110, 265));
    obstacles.push(createBancaSkiff(140, -750, 1, 9.0, 120, 255));

    // Sector 4: Final Approach Steamer
    obstacles.push(createSteamerObstacle(130, -930, 1, 115, 265));

    // Shallow Reef Rock Outcroppings Marked with Flashing Yellow Buoys
    const reefPositions = [
      { x: 24, z: -155, r: 6.5 },
      { x: 52, z: -295, r: 8.0 },
      { x: 135, z: -445, r: 7.5 },
      // Cross-Current Strait Shallow Reefs (Left/West edge where current pushes you!)
      { x: 142, z: -585, r: 8.5 },
      { x: 146, z: -695, r: 8.5 },
      { x: 234, z: -645, r: 7.5 },
      // Final Approach Reefs
      { x: 162, z: -875, r: 7.5 },
      { x: 218, z: -965, r: 8.0 }
    ];

    reefPositions.forEach((h) => {
      const rockGroup = new THREE.Group();
      rockGroup.position.set(h.x, 0, h.z);

      const mainRock = new THREE.Mesh(new THREE.DodecahedronGeometry(h.r, 1), rockMat);
      mainRock.scale.set(1.25, 0.7, 1.15);
      mainRock.position.y = 1.2;
      rockGroup.add(mainRock);

      // Flashing Yellow Hazard Buoy beside Reef
      const beaconPole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.8, 8), funnelAmberMat);
      beaconPole.position.set(0, h.r * 0.65 + 1.8, 0);
      rockGroup.add(beaconPole);

      const flashMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });
      yellowBeaconMaterials.push(flashMat);
      const flashLamp = new THREE.Mesh(new THREE.SphereGeometry(0.85, 8, 8), flashMat);
      flashLamp.position.set(0, h.r * 0.65 + 4.0, 0);
      rockGroup.add(flashLamp);

      scene.add(rockGroup);
      obstacles.push({
        mesh: rockGroup,
        type: 'ROCK',
        radius: h.r + 2.2,
        vx: 0,
        cooldown: 0
      });
    });

    // Deliverable 3: Drifting Loose Containers & Timber Debris Floating Low in the Water
    const debrisConfigs = [
      { x: -12, z: -90, isContainer: true, color: 0xdc2626 },
      { x: 35, z: -340, isContainer: false },
      { x: 105, z: -415, isContainer: true, color: 0xd97706 },
      { x: 185, z: -545, isContainer: false },
      { x: 202, z: -665, isContainer: true, color: 0x0284c7 },
      { x: 178, z: -795, isContainer: false },
      { x: 192, z: -910, isContainer: true, color: 0x16a34a }
    ];

    debrisConfigs.forEach((d, idx) => {
      const dGroup = new THREE.Group();
      dGroup.position.set(d.x, 0, d.z);
      dGroup.rotation.y = idx * 1.1;

      if (d.isContainer) {
        // Half-submerged drifting shipping container
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(2.8, 2.2, 6.8),
          new THREE.MeshLambertMaterial({ color: d.color })
        );
        box.position.y = 0.25;
        box.rotation.z = 0.18;
        box.rotation.x = -0.08;
        dGroup.add(box);
      } else {
        // Floating timber log raft debris
        [-0.9, 0, 0.9].forEach((lx) => {
          const log = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 7.5, 7), timberWoodMat);
          log.rotation.x = Math.PI / 2;
          log.position.set(lx, 0.15, 0);
          dGroup.add(log);
        });
      }

      scene.add(dGroup);
      floatingDebris.push({ mesh: dGroup, phase: idx * 1.3 });
      obstacles.push({
        mesh: dGroup,
        type: 'DEBRIS',
        radius: 4.2,
        vx: (idx % 2 === 0 ? 1 : -1) * 1.8,
        minX: d.x - 18,
        maxX: d.x + 18,
        cooldown: 0
      });
    });

    // 3D Harbor Breakwater Lighthouses at (X = +190, Z = -1080)
    const harborGroup = new THREE.Group();
    harborGroup.position.set(simRef.current.targetPortX, 0, -simRef.current.targetDistance);
    const searchlights = [];

    [-52, 52].forEach((lx) => {
      const lhGroup = new THREE.Group();
      lhGroup.position.set(lx, 0, 0);

      const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(10, 1), rockMat);
      baseRock.scale.set(1.4, 0.5, 1.4);
      baseRock.position.y = 1.5;
      lhGroup.add(baseRock);

      const towerLower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 14, 12), superWhiteMat);
      towerLower.position.y = 9;
      lhGroup.add(towerLower);

      const towerMid = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 10, 12), antiFoulingRedMat);
      towerMid.position.y = 21;
      lhGroup.add(towerMid);

      const lanternRoom = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 4, 12),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      lanternRoom.position.y = 28;
      lhGroup.add(lanternRoom);

      const beamGeo = new THREE.ConeGeometry(6, 45, 16, 1, true);
      beamGeo.translate(0, -22.5, 0);
      beamGeo.rotateX(Math.PI / 2);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        transparent: true,
        opacity: 0.22,
        side: THREE.DoubleSide
      });
      const beamMesh = new THREE.Mesh(beamGeo, beamMat);
      beamMesh.position.y = 28;
      lhGroup.add(beamMesh);
      searchlights.push(beamMesh);

      harborGroup.add(lhGroup);
    });

    for (let bx = -36; bx <= 36; bx += 12) {
      const buoy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), buoyGreenMat);
      buoy.position.set(bx, 0.6, 0);
      harborGroup.add(buoy);
    }
    scene.add(harborGroup);

    // ==========================================
    // 5. DELIVERABLE 1: ERGONOMIC KEYBOARD CONTROLS ([Q] BALLAST & [E] JETTISON)
    // ==========================================
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keysRef.current.w = true;
      if (k === 's' || e.key === 'ArrowDown') keysRef.current.s = true;
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.a = true;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.d = true;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        keysRef.current.space = true;
      }
      // [Q] -> Activate Ballast Stabilization (10s Active / 30s Cooldown)
      if (k === 'q' && !e.repeat) {
        activateBallastStabilizer();
      }
      // [E] -> Emergency Jettison Top Container
      if (k === 'e' && !e.repeat) {
        triggerManualJettison();
      }
    };

    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keysRef.current.w = false;
      if (k === 's' || e.key === 'ArrowDown') keysRef.current.s = false;
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.a = false;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.d = false;
      if (e.code === 'Space' || e.key === ' ') keysRef.current.space = false;
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
        -6,
        Math.min(22, camOrbitRef.current.pitchOffset + dy * 0.08)
      );
    };
    const onMouseUp = (e) => {
      if (e.button === 2) camOrbitRef.current.isRightDown = false;
    };
    const onWheel = (e) => {
      camOrbitRef.current.zoomDist = Math.max(
        18,
        Math.min(58, camOrbitRef.current.zoomDist + e.deltaY * 0.025)
      );
    };

    container.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    container.addEventListener('wheel', onWheel, { passive: true });

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    // ==========================================
    // 6. 60FPS PHYSICS, BALLAST COOLDOWN, CURRENTS & RADAR LOOP
    // ==========================================
    const clock = new THREE.Clock();
    let animId;
    let hudTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const s = simRef.current;

      // Spin Ship Bridge Radar Scanner
      radarScannerBar.rotation.y = elapsed * 4.5;

      // Flash Yellow Reef Hazard Beacons at 2Hz
      const beaconFlashOn = Math.floor(elapsed * 4) % 2 === 0;
      yellowBeaconMaterials.forEach((m) => {
        m.color.setHex(beaconFlashOn ? 0xfacc15 : 0x422006);
      });

      // LIVE WEATHER LERP ENGINE
      const currentW = weatherRef.current;
      const isCyclone = currentW === 'CYCLONE IMMINENT';
      const isDeteriorating = currentW === 'DETERIORATING';

      const targetSkyHex = isCyclone ? 0x162433 : isDeteriorating ? 0x3b5266 : 0x5da9e9;
      scene.background.lerp(new THREE.Color(targetSkyHex), dt * 1.8);
      scene.fog.color.lerp(new THREE.Color(targetSkyHex), dt * 1.8);
      scene.fog.density = THREE.MathUtils.lerp(
        scene.fog.density,
        isCyclone ? 0.0022 : isDeteriorating ? 0.0017 : 0.0011,
        dt * 1.8
      );

      const targetWaterHex = isCyclone ? 0x103f5e : isDeteriorating ? 0x19587a : 0x1d7ed6;
      waterMat.color.lerp(new THREE.Color(targetWaterHex), dt * 1.8);

      const targetRainOpacity = isCyclone ? 0.65 : isDeteriorating ? 0.35 : 0.0;
      rainMat.opacity = THREE.MathUtils.lerp(rainMat.opacity, targetRainOpacity, dt * 2.0);

      const targetWaveAmp = isCyclone ? 1.15 : isDeteriorating ? 0.7 : 0.38;
      s.waveAmp = THREE.MathUtils.lerp(s.waveAmp, targetWaveAmp, dt * 1.8);
      const waveAmp = s.waveAmp;

      // Deliverable 1: Ballast 10s Active -> 30s Recharge Cooldown State Machine
      if (s.ballastState === 'ACTIVE') {
        s.ballastTimer = Math.max(0, s.ballastTimer - dt);
        if (s.ballastTimer <= 0) {
          s.ballastState = 'COOLDOWN';
          s.ballastCooldown = 30.0;    // 30-second recharge cooldown
          s.ballastStabilizer = 1.0;
          s.maxSpeedCap = 55;
        }
      } else if (s.ballastState === 'COOLDOWN') {
        s.ballastCooldown = Math.max(0, s.ballastCooldown - dt);
        if (s.ballastCooldown <= 0) {
          s.ballastState = 'READY';
        }
      }

      // Check Manual or Auto Container Jettison ([E])
      if (jettisonTriggerRef.current) {
        jettisonTriggerRef.current = false;
        detachTopContainer();
      }

      // Animate Falling / Jettisoned Containers
      fallingContainers.forEach((fc) => {
        fc.mesh.position.x += fc.vx * dt;
        fc.mesh.position.y += fc.vy * dt;
        fc.mesh.position.z += fc.vz * dt;
        fc.vy -= 18 * dt;
        fc.mesh.rotation.z += fc.rotSpeed * dt;
        if (fc.mesh.position.y < -1.5) {
          fc.vy = -1.2;
          fc.vx *= 0.9;
        }
      });

      // Rotate Harbor Lighthouse Searchlights
      searchlights.forEach((beam, idx) => {
        beam.rotation.y = elapsed * (idx === 0 ? 1.2 : -1.2);
      });

      // Bob Channel Buoys & Drifting Debris on Waves
      channelBuoys.forEach((cb, i) => {
        cb.mesh.position.y = Math.sin(elapsed * 2.4 + i) * (waveAmp * 0.45);
      });
      floatingDebris.forEach((fd) => {
        fd.mesh.position.y = Math.sin(elapsed * 2.8 + fd.phase) * (waveAmp * 0.55);
        fd.mesh.rotation.z = Math.cos(elapsed * 2.1 + fd.phase) * 0.14;
      });

      // Typhoon Lightning Strikes & Rogue Waves
      if (s.lightningAlertTimer > 0) {
        s.lightningAlertTimer = Math.max(0, s.lightningAlertTimer - dt);
      }
      if (s.vhfAlertTimer > 0) {
        s.vhfAlertTimer = Math.max(0, s.vhfAlertTimer - dt);
      }
      if (isCyclone && !s.isFinished && !s.isCapsized) {
        if (Math.random() < 0.0014) {
          hemiLight.intensity = 4.5;
          setTimeout(() => {
            hemiLight.intensity = 0.65;
          }, 120);

          s.cameraShake = 2.5;
          s.rollAngle += (Math.random() > 0.5 ? 1 : -1) * 22;
          s.health = Math.max(5, s.health - Math.floor(Math.random() * 8 + 4));
          s.lightningAlertTimer = 3.0;
        }
      }

      // Animate 3D Ocean Waves
      const posAttr = waterGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const waveY =
          Math.sin(vx * 0.04 + elapsed * 1.9) * waveAmp +
          Math.cos(vz * 0.03 + elapsed * 1.5) * (waveAmp * 0.8);
        posAttr.setY(i, waveY);
      }
      posAttr.needsUpdate = true;

      // Animate Storm Rain Particles
      if (rainSystem && rainMat.opacity > 0.01) {
        rainSystem.position.copy(playerGroup.position);
        const rPos = rainSystem.geometry.attributes.position;
        for (let i = 1; i < rPos.count * 3; i += 3) {
          rPos.array[i] -= 55 * dt;
          if (rPos.array[i] < 0) rPos.array[i] = 60;
        }
        rPos.needsUpdate = true;
      }

      // Animate Bow Spray & Wake Opacity Falloff
      const absSpeedRatio = Math.min(1.2, Math.abs(s.speed) / 40);
      const sprayIntensity = absSpeedRatio * (0.7 + waveAmp * 0.8);
      sprayMat.opacity = Math.min(0.85, sprayIntensity * 0.75);
      sprayMat.size = 0.45 + waveAmp * 0.35;

      const sPos = bowSpraySystem.geometry.attributes.position;
      for (let i = 0; i < sprayCount; i++) {
        const v = sprayVelocities[i];
        v.life += dt * (1.2 + absSpeedRatio * 1.4);
        if (v.life >= 1.0 || Math.abs(s.speed) < 2) {
          v.life = 0;
          sPos.array[i * 3] = v.side * (0.7 + Math.random() * 1.3);
          sPos.array[i * 3 + 1] = 0.2 + Math.random() * 0.5;
          sPos.array[i * 3 + 2] = -19.5 + Math.random() * 2.5;
        } else {
          const dispersion = 0.6 + sprayIntensity * 0.9;
          sPos.array[i * 3] += v.vx * dispersion * dt;
          sPos.array[i * 3 + 1] += (v.vy * sprayIntensity - 9.8 * v.life) * dt;
          sPos.array[i * 3 + 2] += v.vz * (0.5 + absSpeedRatio) * dt;
        }
      }
      sPos.needsUpdate = true;

      wakePlanes.forEach((wp, idx) => {
        wp.mat.opacity = wp.baseOp * Math.min(1, Math.abs(s.speed) / 18);
        wp.mesh.scale.x = 1 + Math.sin(elapsed * 4 + idx) * 0.06 * absSpeedRatio;
      });

      if (!s.isCapsized && !s.isFinished) {
        // THROTTLE & WATER-BRAKING REVERSE
        if (keysRef.current.space) {
          s.throttle = THREE.MathUtils.lerp(s.throttle, 0, 3.2 * dt);
          s.speed = THREE.MathUtils.lerp(s.speed, 0, 2.2 * dt);
          s.rollVelocity *= Math.pow(0.4, dt);
        } else {
          if (keysRef.current.w) {
            s.throttle = Math.min(s.maxSpeedCap, s.throttle + 22 * dt);
          }
          if (keysRef.current.s) {
            if (s.throttle > 0) {
              s.throttle = Math.max(0, s.throttle - 45 * dt);
            } else {
              s.throttle = Math.max(-12, s.throttle - 14 * dt);
            }
          }
        }
        if (s.throttle > s.maxSpeedCap) s.throttle = s.maxSpeedCap;
        s.speed += (s.throttle - s.speed) * 1.5 * dt;

        // RUDDER & DELAYED ANGULAR MOMENTUM
        const rudderSpeed = 48;
        if (keysRef.current.a) {
          s.rudderAngle = Math.min(35, s.rudderAngle + rudderSpeed * dt);
        } else if (keysRef.current.d) {
          s.rudderAngle = Math.max(-35, s.rudderAngle - rudderSpeed * dt);
        } else {
          s.rudderAngle *= Math.pow(0.25, dt);
        }

        const effectiveSpeedFactor =
          Math.max(0.22, Math.abs(s.speed) / 35) * (s.speed >= 0 ? 1 : -0.5);
        const targetYawRate = (s.rudderAngle / 35) * 0.68 * effectiveSpeedFactor;
        s.yawRate += (targetYawRate - s.yawRate) * (1.8 / s.dynamicWeightFactor) * dt;
        s.heading += s.yawRate * dt;

        // Deliverable 3: Sector 3 Cross-Current Strait (Z = -520 to -820)
        // Applies westward lateral drift velocity (-X) toward the shallow reefs and slight roll torque
        const inCrossCurrentStrait =
          playerGroup.position.z < -510 && playerGroup.position.z > -825;
        const tidalDriftVx = inCrossCurrentStrait
          ? -(isCyclone ? 6.2 : isDeteriorating ? 4.8 : 3.6)
          : 0;

        // CENTRIFUGAL HEEL / TOPPLE PHYSICS CALCULATION
        const speedRatio = Math.abs(s.speed) / 32;
        const centrifugalRollTorque =
          s.yawRate * speedRatio * 78 * s.dynamicWeightFactor * s.ballastStabilizer;

        const weatherSwellMultiplier = isCyclone ? 11.5 : isDeteriorating ? 6.5 : 3.2;
        const currentRollBias = inCrossCurrentStrait ? 2.8 * s.ballastStabilizer : 0;
        const swellTorque = Math.sin(elapsed * 2.1) * weatherSwellMultiplier + currentRollBias;

        const restoringForce = -s.rollAngle * 2.4;
        const rollAccel =
          centrifugalRollTorque + swellTorque + restoringForce - s.rollVelocity * 1.65;

        s.rollVelocity += rollAccel * dt;
        s.rollAngle += s.rollVelocity * dt * 12;

        // Auto-snap top container overboard if tilt exceeds 37° once
        if (Math.abs(s.rollAngle) >= 37 && !s.autoJettisonUsed && stackedContainers.length > 1) {
          s.autoJettisonUsed = true;
          detachTopContainer();
        }

        // CHECK FOR CAPSIZE (42+ DEGREES)
        if (Math.abs(s.rollAngle) >= CAPSIZE_DEG) {
          s.isCapsized = true;
          s.health = 0;
          setHud((prev) => ({
            ...prev,
            status: 'CAPSIZED',
            health: 0,
            rollDeg: Math.round(Math.abs(s.rollAngle)),
            failReason: 'VESSEL CAPSIZED! Turned too sharply at high speed for cargo weight.'
          }));
        }

        // MOVE PLAYER VESSEL (Including Lateral Cross-Current Drift in Sector 3)
        const forwardStep = s.speed * 0.65 * dt;
        playerGroup.position.x += -Math.sin(s.heading) * forwardStep + tidalDriftVx * dt;
        playerGroup.position.z += -Math.cos(s.heading) * forwardStep;
        playerGroup.rotation.y = s.heading;

        hullTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        hullTiltGroup.rotation.x = Math.sin(elapsed * 2.5) * 0.025;
        hullTiltGroup.position.y = Math.sin(elapsed * 2.2) * 0.2;

        waterMesh.position.x = playerGroup.position.x;
        waterMesh.position.z = playerGroup.position.z;
        s.distance = Math.min(s.targetDistance, Math.abs(playerGroup.position.z));

        // OBSTACLE MOVEMENT, VHF RADIO ALERTS & ANGULAR TORQUE COLLISION DYNAMICS
        obstacles.forEach((obs) => {
          if (obs.cooldown > 0) obs.cooldown = Math.max(0, obs.cooldown - dt);

          if (obs.vx !== 0) {
            obs.mesh.position.x += obs.vx * dt;
            const minBound = obs.minX !== undefined ? obs.minX : -85;
            const maxBound = obs.maxX !== undefined ? obs.maxX : 85;
            if (obs.mesh.position.x > maxBound) obs.vx = -Math.abs(obs.vx);
            if (obs.mesh.position.x < minBound) obs.vx = Math.abs(obs.vx);
            if (obs.type === 'STEAMER' || obs.type === 'SKIFF') {
              obs.mesh.rotation.y = obs.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
            }
          }

          const dx = playerGroup.position.x - obs.mesh.position.x;
          const dz = playerGroup.position.z - obs.mesh.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);

          // Broadcast non-blocking VHF CH-16 radio dispatch when approaching crossing traffic
          if (
            (obs.type === 'STEAMER' || obs.type === 'SKIFF') &&
            !obs.vhfWarned &&
            dz > 0 &&
            dz < 110 &&
            Math.abs(dx) < 65
          ) {
            obs.vhfWarned = true;
            s.vhfAlertTimer = 5.0;
            s.vhfMessage =
              obs.type === 'STEAMER'
                ? '📻 CH-16 TRAFFIC: Passenger steamer crossing fairway — yield or adjust helm'
                : '📻 CH-16 ADVISORY: Local fishing banca crossing bow — reduce wake';
          }

          const minSep = obs.radius + 4.2;
          if (dist < minSep) {
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            const penetration = minSep - dist;

            playerGroup.position.x += nx * penetration * 0.85;
            playerGroup.position.z += nz * penetration * 0.85;

            if (obs.cooldown <= 0) {
              obs.cooldown = 1.2;
              const impactSpeed = Math.max(8, Math.abs(s.speed));
              const speedFactor = Math.min(1.6, impactSpeed / 25);
              const baseDmg =
                obs.type === 'STEAMER'
                  ? 18
                  : obs.type === 'DEBRIS'
                  ? 8
                  : obs.type === 'SKIFF'
                  ? 10
                  : 14;
              const proportionalDmg = Math.round(baseDmg * speedFactor);

              s.health = Math.max(0, s.health - proportionalDmg);

              const crossYaw = nx * Math.cos(s.heading) - nz * Math.sin(s.heading);
              const yawTorqueDir = crossYaw >= 0 ? -1 : 1;
              s.yawRate += yawTorqueDir * 0.65 * speedFactor;
              s.rollVelocity += (nx >= 0 ? -1 : 1) * 14 * speedFactor;
              s.rollAngle += (nx >= 0 ? -1 : 1) * 11 * speedFactor;

              s.speed = -Math.max(6, impactSpeed * 0.3);
              s.throttle = Math.min(0, s.throttle);
              s.cameraShake = 1.2 + speedFactor * 0.8;

              if (s.health <= 0) {
                s.isCapsized = true;
                setHud((prev) => ({
                  ...prev,
                  status: 'SUNK',
                  health: 0,
                  failReason: 'HULL BREACHED! High-speed impact destroyed cargo integrity.'
                }));
              }
            }
          }
        });

        // CHECK IF HARBOR LIGHTHOUSE GATE REACHED (Z <= -1080 near X = 190)
        const distToGateCenter = Math.hypot(
          playerGroup.position.x - s.targetPortX,
          playerGroup.position.z - -s.targetDistance
        );
        if (playerGroup.position.z <= -s.targetDistance + 12 && distToGateCenter < 68) {
          s.isFinished = true;
          setHud((prev) => ({
            ...prev,
            status: 'CLEARED',
            progress: 100,
            health: Math.round(s.health)
          }));
        }
      } else if (s.isCapsized) {
        const targetFlip = s.rollAngle >= 0 ? 115 : -115;
        s.rollAngle += (targetFlip - s.rollAngle) * 2.2 * dt;
        hullTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        hullTiltGroup.rotation.x += 0.12 * dt;
        hullTiltGroup.position.y -= 1.8 * dt;
        s.speed *= 0.95;
      }

      // ==========================================
      // 7. OVER-THE-SHOULDER + RIGHT-CLICK ORBIT CAMERA
      // ==========================================
      const orb = camOrbitRef.current;
      const totalCamAngle = s.heading + orb.yawOffset;
      const camDistance = orb.zoomDist;
      const camHeight = Math.max(3.5, 15.5 + orb.pitchOffset);
      const targetCamX = playerGroup.position.x + Math.sin(totalCamAngle) * camDistance;
      const targetCamZ = playerGroup.position.z + Math.cos(totalCamAngle) * camDistance;

      camera.position.x += (targetCamX - camera.position.x) * 10 * dt;
      camera.position.z += (targetCamZ - camera.position.z) * 10 * dt;
      camera.position.y += (camHeight - camera.position.y) * 8 * dt;

      if (s.cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * s.cameraShake * 2.2;
        camera.position.y += (Math.random() - 0.5) * s.cameraShake * 2.2;
        s.cameraShake = Math.max(0, s.cameraShake - 3.5 * dt);
      }

      camera.lookAt(playerGroup.position.x, 3.5, playerGroup.position.z);

      // ==========================================
      // 8. UPDATE REACT HUD & RADAR FAIRWAY WAYPOINTS AT 10Hz
      // ==========================================
      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        const absRoll = Math.round(Math.abs(s.rollAngle));
        let warnMsg = '';
        if (s.lightningAlertTimer > 0) {
          warnMsg = '⚡ LIGHTNING & TYPHOON SWELL HIT! CARGO DAMAGED!';
        } else if (absRoll >= 24) {
          warnMsg = '🚨 CRITICAL HEEL: COUNTER-RUDDER OR BACK ENGINE (S)';
        } else if (absRoll >= 16) {
          warnMsg = '⚠️ ELEVATED HEEL ANGLE — EASE RUDDER OR ENGAGE BALLAST [Q]';
        }

        // Deliverable 3: Dynamic Multi-Turn Sector Guidance Banner
        const pz = playerGroup.position.z;
        let chanNotice = '';
        if (pz > -235) {
          chanNotice = '🧭 SECTOR 1: HARBOR FAIRWAY — WATCH FOR CROSSING SKIFFS';
        } else if (pz > -515) {
          chanNotice = '↪️ SECTOR 2: BARRIER CAPE — STEER 45° STARBOARD [D] INTO CHANNEL';
        } else if (pz > -820) {
          chanNotice = '🌊 SECTOR 3: CROSS-CURRENT STRAIT — STRONG WEST DRIFT, HOLD COUNTER-RUDDER!';
        } else {
          chanNotice = '↩️ SECTOR 4: FINAL APPROACH — ALIGN PORT [A] FOR BREAKWATER LIGHTHOUSES';
        }

        // Deliverable 5: Compute Vessel-Relative Radar Blips & Fairway Waypoints (Range = 360 units)
        const RADAR_RANGE = 360;
        const cosH = Math.cos(s.heading);
        const sinH = Math.sin(s.heading);
        const toRadarCoords = (wx, wz, color, size = 5) => {
          const dx = wx - playerGroup.position.x;
          const dz = wz - playerGroup.position.z;
          const rx = dx * cosH - dz * sinH;
          const rz = dx * sinH + dz * cosH;
          const dist = Math.hypot(rx, rz);
          if (dist > RADAR_RANGE) return null;
          return {
            x: (rx / RADAR_RANGE) * 72,
            y: (rz / RADAR_RANGE) * 72,
            color,
            size
          };
        };

        const blips = [];
        obstacles.forEach((obs) => {
          const color =
            obs.type === 'STEAMER' || obs.type === 'SKIFF'
              ? '#ef4444'
              : obs.type === 'DEBRIS'
              ? '#fb923c'
              : '#f1c40f';
          const sz =
            obs.type === 'STEAMER'
              ? 6
              : obs.type === 'ISLAND'
              ? 8.5
              : obs.type === 'DEBRIS'
              ? 3.8
              : 4.5;
          const b = toRadarCoords(obs.mesh.position.x, obs.mesh.position.z, color, sz);
          if (b) blips.push(b);
        });

        channelBuoys.forEach((cb) => {
          const b = toRadarCoords(
            cb.x,
            cb.z,
            cb.isPortGreen ? '#2ecc71' : '#f87171',
            3.2
          );
          if (b) blips.push(b);
        });

        // Harbor Lighthouse Gate Entrance (Blue Blips)
        [-52, 0, 52].forEach((lx) => {
          const hb = toRadarCoords(
            s.targetPortX + lx,
            -s.targetDistance,
            '#38bdf8',
            lx === 0 ? 7 : 5.5
          );
          if (hb) blips.push(hb);
        });

        // Project Fairway Centerline Waypoints onto Radar Scope
        const radarWps = fairwayWaypoints.map((wp) => {
          const dx = wp.x - playerGroup.position.x;
          const dz = wp.z - playerGroup.position.z;
          const rx = dx * cosH - dz * sinH;
          const rz = dx * sinH + dz * cosH;
          return {
            x: 75 + (rx / RADAR_RANGE) * 72,
            y: 75 + (rz / RADAR_RANGE) * 72
          };
        });

        const normHeading = ((Math.round(-THREE.MathUtils.radToDeg(s.heading)) % 360) + 360) % 360;

        setHud((prev) => ({
          ...prev,
          speed: Math.round(s.speed),
          throttle: Math.round(s.throttle),
          rudder: Math.round(s.rudderAngle),
          rollDeg: absRoll,
          signedRollDeg: Math.round(s.rollAngle),
          headingDeg: normHeading,
          health: Math.round(s.health),
          progress: Math.min(100, Math.round((s.distance / s.targetDistance) * 100)),
          warning: warnMsg,
          channelNotice: chanNotice,
          vhfAlert: s.vhfAlertTimer > 0 ? s.vhfMessage : '',
          ballastState: s.ballastState,
          ballastSeconds:
            s.ballastState === 'ACTIVE'
              ? Math.ceil(s.ballastTimer)
              : s.ballastState === 'COOLDOWN'
              ? Math.ceil(s.ballastCooldown)
              : 0,
          jettisonCount: s.jettisonCount,
          remainingContainers: stackedContainers.length,
          radarBlips: blips,
          radarWaypoints: radarWps
        }));
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
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [mode, weightKg]);

  // Danger Zone Threshold (>= 24° Heel)
  const isCriticalHeel = hud.rollDeg >= 24;
  const isCautionHeel = hud.rollDeg >= 15 && hud.rollDeg < 24;
  const rollColor = isCriticalHeel ? '#ef4444' : isCautionHeel ? '#f1c40f' : '#2ecc71';
  const heelStatusTag = isCriticalHeel ? '[CRITICAL]' : isCautionHeel ? '[CAUTION]' : '[STABLE]';

  // Knots conversion (1 km/h = 0.539957 knots)
  const speedKnots = (Math.abs(hud.speed) * 0.54).toFixed(1);

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
      {/* Embedded Keyframe Animations */}
      <style>{`
        @keyframes radarSweepSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes criticalHeelPulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 0.25; }
        }
        @keyframes criticalBannerPulse {
          0%, 100% { transform: translateX(-50%) scale(1); box-shadow: 0 0 18px rgba(239, 68, 68, 0.45); }
          50% { transform: translateX(-50%) scale(1.02); box-shadow: 0 0 32px rgba(239, 68, 68, 0.85); }
        }
      `}</style>

      {/* 3D THREE.JS VIEWPORT */}
      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />

      {/* CRITICAL HEEL (>24°) SCREEN EDGE PULSE & WARNING LABEL */}
      {isCriticalHeel && hud.status === 'ACTIVE' && (
        <>
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background:
                'radial-gradient(circle, transparent 48%, rgba(239, 68, 68, 0.42) 100%)',
              pointerEvents: 'none',
              zIndex: 10010,
              animation: 'criticalHeelPulse 0.65s infinite ease-in-out'
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(239, 68, 68, 0.92)',
              backdropFilter: 'blur(14px)',
              border: '1px solid #ffffff',
              borderRadius: 999,
              padding: '9px 24px',
              color: '#ffffff',
              fontFamily: "'Space Mono', monospace",
              fontSize: 12.5,
              fontWeight: 'bold',
              letterSpacing: 0.6,
              zIndex: 10020,
              whiteSpace: 'nowrap',
              animation: 'criticalBannerPulse 0.65s infinite ease-in-out'
            }}
          >
            🚨 CRITICAL HEEL ({hud.rollDeg}°): COUNTER-RUDDER OR BACK ENGINE (S)
          </div>
        </>
      )}

      {/* TOP LEFT: VESSEL TELEMETRY, [Q] BALLAST COOLDOWN & [E] JETTISON */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(10, 14, 23, 0.85)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 14,
          padding: '15px 18px',
          width: 330,
          color: '#fff',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.45)',
          zIndex: 10015
        }}
      >
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
              fontSize: 11,
              color: '#38bdf8',
              fontWeight: 700,
              letterSpacing: 0.8
            }}
          >
            ⚓ FEEDER VESSEL TELEMETRY
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              background: 'rgba(56, 189, 248, 0.14)',
              color: '#38bdf8',
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 'bold'
            }}
          >
            {Number(weightKg).toLocaleString()} KG
          </span>
        </div>

        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 4,
            textTransform: 'uppercase'
          }}
        >
          {cargo}
        </div>

        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>
          CLIMATE:{' '}
          <strong
            style={{
              fontFamily: "'Space Mono', monospace",
              color:
                liveWeather === 'NOMINAL'
                  ? '#2ecc71'
                  : liveWeather === 'DETERIORATING'
                  ? '#f1c40f'
                  : '#ef4444'
            }}
          >
            {liveWeather === 'NOMINAL'
              ? '☀️ NOMINAL'
              : liveWeather === 'DETERIORATING'
              ? '🌧️ DETERIORATING'
              : '⛈️ CYCLONE IMMINENT'}
          </strong>
        </div>

        {/* Cargo Health Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#94a3b8',
            marginBottom: 4
          }}
        >
          <span>CARGO INTEGRITY</span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              color: hud.health < 50 ? '#ef4444' : '#2ecc71',
              fontWeight: 'bold'
            }}
          >
            {hud.health}%
          </span>
        </div>
        <div
          style={{
            width: '100%',
            height: 6,
            background: '#1e293b',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 10
          }}
        >
          <div
            style={{
              width: `${hud.health}%`,
              height: '100%',
              background: hud.health < 50 ? '#ef4444' : '#2ecc71',
              transition: 'width 0.2s'
            }}
          />
        </div>

        {/* Sector Progress Bar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: '#94a3b8',
            marginBottom: 4
          }}
        >
          <span>HARBOR BREAKWATER</span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              color: '#38bdf8',
              fontWeight: 'bold'
            }}
          >
            {hud.progress}%
          </span>
        </div>
        <div
          style={{
            width: '100%',
            height: 6,
            background: '#1e293b',
            borderRadius: 4,
            overflow: 'hidden',
            marginBottom: 12
          }}
        >
          <div
            style={{
              width: `${hud.progress}%`,
              height: '100%',
              background: '#38bdf8',
              transition: 'width 0.2s'
            }}
          />
        </div>

        {/* Deliverable 1: Ergonomic [Q] Ballast & [E] Jettison Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <button
            type="button"
            disabled={hud.ballastState !== 'READY'}
            onClick={activateBallastStabilizer}
            style={{
              width: '100%',
              background:
                hud.ballastState === 'ACTIVE'
                  ? 'rgba(46, 204, 113, 0.22)'
                  : hud.ballastState === 'COOLDOWN'
                  ? 'rgba(255, 255, 255, 0.03)'
                  : 'rgba(56, 189, 248, 0.14)',
              border: `1px solid ${
                hud.ballastState === 'ACTIVE'
                  ? '#2ecc71'
                  : hud.ballastState === 'COOLDOWN'
                  ? 'rgba(255, 255, 255, 0.08)'
                  : '#38bdf8'
              }`,
              color:
                hud.ballastState === 'ACTIVE'
                  ? '#2ecc71'
                  : hud.ballastState === 'COOLDOWN'
                  ? '#64748b'
                  : '#38bdf8',
              borderRadius: 6,
              padding: '7px 10px',
              fontSize: 10.5,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 'bold',
              cursor: hud.ballastState === 'READY' ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease'
            }}
          >
            {hud.ballastState === 'READY'
              ? '[Q] BALLAST: READY'
              : hud.ballastState === 'ACTIVE'
              ? `[Q] BALLAST: ACTIVE (${hud.ballastSeconds}s)`
              : `[Q] RECHARGING (${hud.ballastSeconds}s)`}
          </button>

          <button
            type="button"
            disabled={hud.remainingContainers <= 0}
            onClick={triggerManualJettison}
            style={{
              width: '100%',
              background:
                hud.remainingContainers > 0
                  ? 'rgba(241, 196, 15, 0.14)'
                  : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                hud.remainingContainers > 0
                  ? 'rgba(241, 196, 15, 0.4)'
                  : 'rgba(255, 255, 255, 0.08)'
              }`,
              color: hud.remainingContainers > 0 ? '#f1c40f' : '#64748b',
              borderRadius: 6,
              padding: '7px 10px',
              fontSize: 10.5,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 'bold',
              cursor: hud.remainingContainers > 0 ? 'pointer' : 'not-allowed',
              transition: 'all 0.2s ease'
            }}
          >
            [E] JETTISON CONTAINER ({hud.remainingContainers} IN BAY)
          </button>
        </div>

        {/* Fairway Sector Guidance Notice */}
        {hud.channelNotice && (
          <div
            style={{
              marginTop: 10,
              padding: '7px 9px',
              borderRadius: 6,
              background: hud.channelNotice.includes('CROSS-CURRENT')
                ? 'rgba(241, 196, 15, 0.14)'
                : 'rgba(56, 189, 248, 0.1)',
              border: `1px solid ${
                hud.channelNotice.includes('CROSS-CURRENT')
                  ? 'rgba(241, 196, 15, 0.35)'
                  : 'rgba(56, 189, 248, 0.25)'
              }`,
              fontSize: 10,
              fontFamily: "'Space Mono', monospace",
              color: hud.channelNotice.includes('CROSS-CURRENT') ? '#f1c40f' : '#38bdf8',
              lineHeight: 1.4,
              fontWeight: 'bold'
            }}
          >
            {hud.channelNotice}
          </div>
        )}

        {/* VHF CH-16 RADIO ALERT BANNER */}
        {hud.vhfAlert && (
          <div
            style={{
              marginTop: 8,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(241, 196, 15, 0.14)',
              border: '1px solid #f1c40f',
              color: '#f1c40f',
              fontSize: 10,
              fontFamily: "'Space Mono', monospace",
              lineHeight: 1.4,
              fontWeight: 'bold'
            }}
          >
            {hud.vhfAlert}
          </div>
        )}
      </div>

      {/* DELIVERABLE 5: TOP-RIGHT BRIDGE MINI-RADAR SCOPE WITH FAIRWAY WAYPOINTS */}
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
          {onSwitchToQuiz && (
            <button
              type="button"
              onClick={onSwitchToQuiz}
              style={{
                height: 36,
                padding: '0 12px',
                borderRadius: 10,
                background: 'rgba(10, 14, 23, 0.85)',
                backdropFilter: 'blur(14px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              QUIZ MODE
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              const next = !showControls;
              setShowControls(next);
              if (next) triggerControlsAutoFade();
            }}
            title="Toggle Bridge Controls"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: showControls
                ? 'rgba(56, 189, 248, 0.2)'
                : 'rgba(10, 14, 23, 0.85)',
              backdropFilter: 'blur(14px)',
              border: `1px solid ${
                showControls ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)'
              }`,
              color: showControls ? '#38bdf8' : '#cbd5e1',
              fontFamily: "'Space Mono', monospace",
              fontSize: 13,
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            [?]
          </button>

          <button
            type="button"
            onClick={() =>
              onExit ? onExit() : onComplete({ success: true, finalHealth: hud.health })
            }
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 10,
              background: 'rgba(10, 14, 23, 0.85)',
              backdropFilter: 'blur(14px)',
              border: '1px solid rgba(239, 68, 68, 0.45)',
              color: '#ef4444',
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              fontWeight: 'bold',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            ✕ EXIT TO MAP
          </button>
        </div>

        {/* CIRCULAR TACTICAL MARINE MINI-RADAR SCOPE */}
        <div
          style={{
            background: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)'
          }}
        >
          <div
            style={{
              width: '100%',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              fontSize: 9.5,
              fontFamily: "'Space Mono', monospace",
              color: '#94a3b8'
            }}
          >
            <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>RADAR 2.0 NM</span>
            <span>HDG {hud.headingDeg.toString().padStart(3, '0')}°</span>
          </div>

          <div
            style={{
              position: 'relative',
              width: 150,
              height: 150,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(14, 34, 56, 0.65) 0%, rgba(6, 12, 22, 0.92) 100%)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              overflow: 'hidden',
              boxShadow: 'inset 0 0 18px rgba(56, 189, 248, 0.15)'
            }}
          >
            {/* Distance Rings */}
            <div
              style={{
                position: 'absolute',
                inset: 24,
                borderRadius: '50%',
                border: '1px dashed rgba(56, 189, 248, 0.2)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: 50,
                borderRadius: '50%',
                border: '1px dashed rgba(56, 189, 248, 0.18)'
              }}
            />
            {/* Crosshairs */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                right: 0,
                height: 1,
                background: 'rgba(56, 189, 248, 0.15)'
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 1,
                background: 'rgba(56, 189, 248, 0.15)'
              }}
            />

            {/* Deliverable 5: SVG Fairway Centerline Waypoint Path on Radar */}
            <svg
              width="150"
              height="150"
              viewBox="0 0 150 150"
              style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            >
              {hud.radarWaypoints.length > 1 && (
                <polyline
                  fill="none"
                  stroke="rgba(56, 189, 248, 0.55)"
                  strokeWidth="1.8"
                  strokeDasharray="3 3"
                  points={hud.radarWaypoints.map((p) => `${p.x},${p.y}`).join(' ')}
                />
              )}
              {hud.radarWaypoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r="2"
                  fill="#38bdf8"
                  opacity="0.8"
                />
              ))}
            </svg>

            {/* Rotating Radar Sweep Line */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                background:
                  'conic-gradient(from 0deg, rgba(56, 189, 248, 0.32) 0deg, transparent 55deg, transparent 360deg)',
                animation: 'radarSweepSpin 3.2s linear infinite'
              }}
            />

            {/* Real-Time Blips */}
            {hud.radarBlips.map((b, idx) => (
              <div
                key={idx}
                style={{
                  position: 'absolute',
                  left: 75 + b.x - b.size / 2,
                  top: 75 + b.y - b.size / 2,
                  width: b.size,
                  height: b.size,
                  borderRadius: '50%',
                  background: b.color,
                  boxShadow: `0 0 6px ${b.color}`
                }}
              />
            ))}

            {/* Player Vessel Center Marker */}
            <div
              style={{
                position: 'absolute',
                left: 72,
                top: 72,
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#ffffff',
                boxShadow: '0 0 6px #ffffff'
              }}
            />
          </div>

          {/* Radar Legend */}
          <div
            style={{
              display: 'flex',
              gap: 8,
              marginTop: 8,
              fontSize: 8.5,
              fontFamily: "'Space Mono', monospace",
              color: '#94a3b8'
            }}
          >
            <span>
              <strong style={{ color: '#ef4444' }}>●</strong> SHIP
            </span>
            <span>
              <strong style={{ color: '#f1c40f' }}>●</strong> REEF
            </span>
            <span>
              <strong style={{ color: '#2ecc71' }}>●</strong> BUOY
            </span>
            <span>
              <strong style={{ color: '#38bdf8' }}>--</strong> ROUTE
            </span>
          </div>
        </div>

        {/* AUTO-FADING CONTROLS CHEAT SHEET OVERLAY */}
        <div
          onMouseEnter={() => {
            if (controlsFadeTimerRef.current) clearTimeout(controlsFadeTimerRef.current);
          }}
          onMouseLeave={triggerControlsAutoFade}
          style={{
            background: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(14px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#cbd5e1',
            fontSize: 11,
            lineHeight: 1.75,
            width: 250,
            opacity: showControls ? 1 : 0,
            transform: showControls ? 'translateY(0)' : 'translateY(-8px)',
            pointerEvents: showControls ? 'auto' : 'none',
            transition: 'opacity 0.35s ease, transform 0.35s ease'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              color: '#fff',
              fontWeight: 700,
              marginBottom: 4,
              fontSize: 11
            }}
          >
            <span>BRIDGE HELM CONTROLS</span>
            <span style={{ fontSize: 9, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>
              AUTO-HIDE
            </span>
          </div>
          <div>
            <strong style={{ color: '#38bdf8', fontFamily: "'Space Mono', monospace" }}>[W / S]</strong> Engine Telegraph / Astern
          </div>
          <div>
            <strong style={{ color: '#38bdf8', fontFamily: "'Space Mono', monospace" }}>[A / D]</strong> Port / Starboard Rudder
          </div>
          <div>
            <strong style={{ color: '#ef4444', fontFamily: "'Space Mono', monospace" }}>[SPACE]</strong> Water Brakes (Steady Hull)
          </div>
          <div>
            <strong style={{ color: '#2ecc71', fontFamily: "'Space Mono', monospace" }}>[Q]</strong> Ballast Stabilizer (10s / 30s CD)
          </div>
          <div>
            <strong style={{ color: '#f1c40f', fontFamily: "'Space Mono', monospace" }}>[E]</strong> Jettison Top Container (-Weight)
          </div>
          <div>
            <strong style={{ color: '#38bdf8', fontFamily: "'Space Mono', monospace" }}>[R-CLICK]</strong> Drag 360° Bridge Cam
          </div>
        </div>
      </div>

      {/* DELIVERABLE 4: POLISHED 3-COLUMN BOTTOM BRIDGE DASHBOARD CLUSTER */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 14, 23, 0.85)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 16,
          padding: '14px 26px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          alignItems: 'center',
          gap: 24,
          boxShadow: '0 14px 36px rgba(0, 0, 0, 0.55)',
          width: 660,
          zIndex: 10015
        }}
      >
        {/* COLUMN 1: ENGINE TELEGRAPH & SPEED */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.8 }}>
            PROPULSION / SPEED
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              whiteSpace: 'nowrap'
            }}
          >
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 16,
                fontWeight: 'bold',
                color: hud.speed < 0 ? '#ef4444' : '#38bdf8'
              }}
            >
              {hud.speed < 0 ? '-' : ''}
              {speedKnots} KTS
            </span>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                color: '#64748b',
                fontWeight: 'bold'
              }}
            >
              ({hud.speed} KM/H)
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: 7,
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (Math.abs(hud.speed) / 55) * 100)}%`,
                height: '100%',
                background: hud.speed < 0 ? '#ef4444' : '#38bdf8',
                transition: 'width 0.1s linear'
              }}
            />
          </div>
        </div>

        {/* COLUMN 2: HELM & RUDDER */}
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
            HELM ANGLE
          </div>

          <div
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 14,
              fontWeight: 'bold',
              whiteSpace: 'nowrap',
              color:
                hud.rudder > 0
                  ? '#2ecc71'
                  : hud.rudder < 0
                  ? '#f1c40f'
                  : '#e2e8f0'
            }}
          >
            {hud.rudder > 0
              ? `PORT ${hud.rudder}°`
              : hud.rudder < 0
              ? `STARBOARD ${Math.abs(hud.rudder)}°`
              : 'MIDSHIPS 0°'}
          </div>

          {/* Centered Rudder Deviation Tick-Slider */}
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: 7,
              background: 'rgba(255, 255, 255, 0.08)',
              borderRadius: 4,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: 0,
                bottom: 0,
                width: 2,
                background: '#ffffff',
                transform: 'translateX(-50%)',
                zIndex: 2
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left:
                  hud.rudder >= 0
                    ? `${50 - (hud.rudder / 35) * 50}%`
                    : '50%',
                width: `${(Math.abs(hud.rudder) / 35) * 50}%`,
                background: hud.rudder >= 0 ? '#2ecc71' : '#f1c40f',
                transition: 'all 0.08s linear'
              }}
            />
          </div>
        </div>

        {/* COLUMN 3: HEEL & INCLINOMETER */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.8 }}>
            HEEL / INCLINOMETER
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              whiteSpace: 'nowrap'
            }}
          >
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 14,
                fontWeight: 'bold',
                color: rollColor
              }}
            >
              {hud.rollDeg}° / {CAPSIZE_DEG}° LIMIT
            </span>
            <span
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 10,
                fontWeight: 'bold',
                color: rollColor
              }}
            >
              {heelStatusTag}
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: 7,
              background: 'rgba(255, 255, 255, 0.08)',
              border: `1px solid ${
                isCriticalHeel ? '#ef4444' : 'rgba(255, 255, 255, 0.08)'
              }`,
              borderRadius: 4,
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                width: `${Math.min(100, (hud.rollDeg / CAPSIZE_DEG) * 100)}%`,
                height: '100%',
                background: rollColor,
                transition: 'width 0.08s linear, background 0.15s ease'
              }}
            />
          </div>
        </div>
      </div>

      {/* END-OF-MANEUVER OVERLAY */}
      {hud.status !== 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 8, 17, 0.82)',
            backdropFilter: 'blur(14px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10030
          }}
        >
          <div
            style={{
              background: 'rgba(10, 14, 23, 0.92)',
              border: `1px solid ${hud.status === 'CLEARED' ? '#2ecc71' : '#ef4444'}`,
              borderRadius: 16,
              padding: '32px 40px',
              textAlign: 'center',
              maxWidth: 440,
              color: '#fff',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)'
            }}
          >
            <h2
              style={{
                margin: '0 0 12px 0',
                fontFamily: "'Space Mono', monospace",
                fontSize: 22,
                color: hud.status === 'CLEARED' ? '#2ecc71' : '#ef4444'
              }}
            >
              {hud.status === 'CLEARED'
                ? '✅ HARBOR SECTOR REACHED'
                : hud.status === 'CAPSIZED'
                ? '⚠️ VESSEL CAPSIZED!'
                : '💥 HULL DESTROYED'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              {hud.status === 'CLEARED'
                ? `You navigated the multi-turn island fairway and breakwater lighthouses! Remaining Cargo Integrity: ${hud.health}%.`
                : hud.failReason}
            </p>
            <button
              onClick={() =>
                onComplete({
                  success: hud.status === 'CLEARED',
                  finalHealth: hud.status === 'CLEARED' ? hud.health : 0
                })
              }
              style={{
                background: hud.status === 'CLEARED' ? '#2ecc71' : '#ef4444',
                color: '#0a0e17',
                fontWeight: 700,
                border: 'none',
                padding: '12px 28px',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: "'Space Mono', monospace",
                fontSize: 13,
                width: '100%'
              }}
            >
              RETURN TO COMMAND MAP
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default VesselHelm3D;