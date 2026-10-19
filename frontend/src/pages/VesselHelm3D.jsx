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

  // 🔥 LIVE WEATHER STATE & REF (Syncs with Simulation.jsx prop AND live backend clock!)
  const [liveWeather, setLiveWeather] = useState(weatherState || 'NOMINAL');
  const weatherRef = useRef(weatherState || 'NOMINAL');

  useEffect(() => {
    if (weatherState) {
      weatherRef.current = weatherState;
      setLiveWeather(weatherState);
    }
  }, [weatherState]);

  // Poll backend weather every 2 seconds while inside 3D mode so 10-second countdown shifts happen live!
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
    rudder: 0,
    rollDeg: 0,
    health: Math.round(initialHealth),
    progress: 0,
    status: 'ACTIVE', // 'ACTIVE' | 'CAPSIZED' | 'SUNK' | 'CLEARED'
    failReason: '',
    warning: '',
    channelNotice: ''
  });

  // --- LIVE DECISION-MAKING EVENT STATE ---
  const [decisionPrompt, setDecisionPrompt] = useState(null);
  const decisionActiveRef = useRef(null);
  const [ballastActive, setBallastActive] = useState(false);
  const [jettisonCount, setJettisonCount] = useState(0);

  // Refs for 60FPS loop access
  const keysRef = useRef({ w: false, s: false, a: false, d: false, space: false });
  const jettisonTriggerRef = useRef(false);

  const simRef = useRef({
    speed: 20,
    throttle: 24,
    rudderAngle: 0,      // -35 to +35 deg
    yawRate: 0,          // angular velocity (heavy momentum)
    heading: 0,          // ship rotation Y
    rollAngle: 0,        // tilt angle in degrees (42+ = CAPSIZE!)
    rollVelocity: 0,
    health: Number(initialHealth) || 100,
    distance: 0,
    targetDistance: 980, // Distance to Harbor Lighthouse Gate
    isCapsized: false,
    isFinished: false,
    ballastStabilizer: 1.0,
    dynamicWeightFactor: 0.65 + (Number(weightKg || 2500) / 5000) * 0.8,
    maxSpeedCap: 55,
    cameraShake: 0,
    waveAmp: 0.38,
    lightningAlertTimer: 0,
    decisionTriggered1: false,
    decisionTriggered2: false,
    decisionTriggered3: false,
    autoJettisonUsed: false
  });

  const CAPSIZE_DEG = 42;

  const setActiveDecision = (promptObj) => {
    decisionActiveRef.current = promptObj;
    setDecisionPrompt(promptObj);
  };

  // --- HANDLE MID-MANEUVER TACTICAL DECISIONS ---
  const handleDecisionChoice = (option) => {
    const s = simRef.current;
    const currentDecision = decisionActiveRef.current;
    if (!currentDecision || s.isCapsized || s.isFinished) return;

    if (currentDecision.id === 'CROSSING_VESSEL') {
      if (option === 1) {
        // Emergency Reverse / Brake to Yield
        s.throttle = -10;
        s.speed = Math.min(s.speed, 6);
        s.rollVelocity *= 0.3;
      } else if (option === 2) {
        // Overclock Engines to beat bow
        s.throttle = s.maxSpeedCap;
        s.speed = Math.min(s.maxSpeedCap, s.speed + 10);
      }
    } else if (currentDecision.id === 'ISLAND_FORK') {
      if (option === 1) {
        // Steer Port into Narrow Shortcut Channel
        s.rudderAngle = 22;
        setHud((prev) => ({ ...prev, channelNotice: '⚡ PORT SHORTCUT: +TAILWIND BOOST ACTIVE' }));
      } else if (option === 2) {
        // Steer Starboard into Wide Deep-Water Channel
        s.rudderAngle = -22;
        setHud((prev) => ({ ...prev, channelNotice: '🌊 STARBOARD DETOUR: DEEP WATER CHANNEL' }));
      }
    } else if (currentDecision.id === 'CARGO_SHIFT') {
      if (option === 1) {
        // Flood Counter-Ballast: High stability, lower top speed
        s.ballastStabilizer = 0.55;
        s.maxSpeedCap = 40;
        s.throttle = Math.min(s.throttle, 40);
        setBallastActive(true);
      } else if (option === 2) {
        // Jettison Top Container: -10% Cargo Health, physical container drops into ocean!
        s.health = Math.max(5, s.health - 10);
        s.rollAngle *= 0.25;
        s.rollVelocity = 0;
        s.dynamicWeightFactor = Math.max(0.6, s.dynamicWeightFactor - 0.22);
        jettisonTriggerRef.current = true;
      }
    }

    setActiveDecision(null);
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
    scene.fog = new THREE.FogExp2(skyHex, initCyclone ? 0.0024 : 0.0016);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.5,
      1400
    );
    // FIX 1: Set camera immediately behind the vessel on frame 0 (no spawning inside containers!)
    camera.position.set(0, 15, 32);
    camera.lookAt(0, 2, -16);

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
    const waterGeo = new THREE.PlaneGeometry(2600, 2600, 95, 95);
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

    // 🔥 LERP RAIN SYSTEM: Pre-allocated so it can fade in/out smoothly when weather changes mid-voyage!
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
    // 3. BUILD PLAYER VESSEL & DETACHABLE CONTAINERS
    // ==========================================
    const playerGroup = new THREE.Group();
    const hullTiltGroup = new THREE.Group();
    playerGroup.add(hullTiltGroup);
    scene.add(playerGroup);

    const redHullMat = new THREE.MeshLambertMaterial({ color: 0xa62626 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
    const woodDeckMat = new THREE.MeshLambertMaterial({ color: 0xbfa084 });
    const darkBollardMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1e3a5f });

    // Lower Red Hull
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.0, 28), redHullMat);
    lowerHull.position.set(0, 0.2, 0);
    hullTiltGroup.add(lowerHull);

    // Bow Wedge
    const bowGeo = new THREE.ConeGeometry(4.0, 8, 4);
    bowGeo.rotateX(-Math.PI / 2);
    bowGeo.rotateZ(Math.PI / 4);
    const bowMesh = new THREE.Mesh(bowGeo, whiteMat);
    bowMesh.scale.set(1, 0.65, 1);
    bowMesh.position.set(0, 1.5, -17.5);
    hullTiltGroup.add(bowMesh);

    // Side Bulwarks
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.8, 28), whiteMat);
    leftWall.position.set(-2.6, 1.9, 0);
    hullTiltGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.8, 28), whiteMat);
    rightWall.position.set(2.6, 1.9, 0);
    hullTiltGroup.add(rightWall);

    // Wooden Foredeck
    const woodDeck = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 27.5), woodDeckMat);
    woodDeck.position.set(0, 1.25, 0);
    hullTiltGroup.add(woodDeck);

    // 4 Black Foredeck Bollards
    [-8.5, -11.5].forEach((zPos) => {
      [-1.7, 1.7].forEach((xPos) => {
        const bollard = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 1.4), darkBollardMat);
        bollard.position.set(xPos, 1.55, zPos);
        hullTiltGroup.add(bollard);
      });
    });

    // White Bridge Superstructure
    const cabinMain = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 15.5), whiteMat);
    cabinMain.position.set(0, 2.7, 3.2);
    hullTiltGroup.add(cabinMain);

    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 16.2), whiteMat);
    cabinRoof.position.set(0, 4.1, 3.0);
    hullTiltGroup.add(cabinRoof);

    const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.2), glassMat);
    bridgeWin.position.set(0, 3.1, -4.5);
    hullTiltGroup.add(bridgeWin);

    // Stacked Cargo Containers (Can be jettisoned overboard!)
    const stackedContainers = [];
    const fallingContainers = [];
    const containerRows = Math.max(2, Math.round(Number(weightKg || 2500) / 1200));
    const containerColors = [0xe67e22, 0x2980b9, 0x27ae60, 0x8e44ad];
    for (let r = 0; r < containerRows; r++) {
      const cMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 1.4, 5.5),
        new THREE.MeshLambertMaterial({ color: containerColors[r % containerColors.length] })
      );
      cMesh.position.set(0, 4.9 + r * 1.45, 6.5);
      hullTiltGroup.add(cMesh);
      stackedContainers.push(cMesh);
    }

    // Helper to physically drop the top container into the sea (Idea A)
    const detachTopContainer = () => {
      if (stackedContainers.length === 0) return;
      const topBox = stackedContainers.pop();
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      topBox.getWorldPosition(worldPos);
      topBox.getWorldQuaternion(worldQuat);

      hullTiltGroup.remove(topBox);
      topBox.position.copy(worldPos);
      topBox.quaternion.copy(worldQuat);
      scene.add(topBox);

      const slideDir = simRef.current.rollAngle >= 0 ? -1 : 1;
      fallingContainers.push({
        mesh: topBox,
        vx: slideDir * 12,
        vy: 3.5,
        vz: -simRef.current.speed * 0.2,
        rotSpeed: slideDir * 2.8
      });
      setJettisonCount((c) => c + 1);
    };

    // Wake Trail
    const wakeGeo = new THREE.PlaneGeometry(4.8, 18);
    wakeGeo.rotateX(-Math.PI / 2);
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.45
    });
    const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat);
    wakeMesh.position.set(0, 0.15, 22);
    playerGroup.add(wakeMesh);

    // ==========================================
    // 4. OBSTACLES, SPLIT-ISLAND FORK & LIGHTHOUSE HARBOR
    // ==========================================
    const obstacles = [];
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x475569, flatShading: true });
    const islandVegMat = new THREE.MeshLambertMaterial({ color: 0x1e4620, flatShading: true });
    const buoyMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });

    const createSteamerObstacle = (x, z, moveDirX) => {
      const steamer = new THREE.Group();
      steamer.position.set(x, 0, z);
      steamer.rotation.y = moveDirX > 0 ? Math.PI / 2 : -Math.PI / 2;

      const sRed = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.5, 34), redHullMat);
      sRed.position.y = 0.6;
      steamer.add(sRed);

      const sWhite = new THREE.Mesh(new THREE.BoxGeometry(7.8, 3.2, 35), whiteMat);
      sWhite.position.y = 3.2;
      steamer.add(sWhite);

      const sBridge = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 20), whiteMat);
      sBridge.position.set(0, 6.2, 2);
      steamer.add(sBridge);

      const funnelMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
      [0, 5.5].forEach((fz) => {
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 12), funnelMat);
        funnel.position.set(0, 9.5, fz);
        steamer.add(funnel);
      });

      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 11, 8), darkBollardMat);
      mast.position.set(0, 9, -11);
      steamer.add(mast);

      scene.add(steamer);
      return {
        mesh: steamer,
        type: 'STEAMER',
        radius: 15.5,
        vx: moveDirX * 13,
        cooldown: 0
      };
    };

    // Crossing Steamers
    obstacles.push(createSteamerObstacle(-45, -190, 1));
    obstacles.push(createSteamerObstacle(55, -360, -1));
    obstacles.push(createSteamerObstacle(-50, -740, 1));

    // IDEA B: Central Split-Channel Island Fork at Z = -510
    const forkIsland = new THREE.Group();
    forkIsland.position.set(0, 0, -510);
    const islandBase = new THREE.Mesh(new THREE.DodecahedronGeometry(22, 1), rockMat);
    islandBase.scale.set(1.25, 0.65, 1.5);
    islandBase.position.y = 2;
    forkIsland.add(islandBase);

    const islandTop = new THREE.Mesh(new THREE.DodecahedronGeometry(15, 1), islandVegMat);
    islandTop.scale.set(1.1, 0.55, 1.3);
    islandTop.position.y = 8;
    forkIsland.add(islandTop);

    // Warning Lighthouse Beacon on the Fork Island
    const forkBeacon = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.1, 7, 8), buoyMat);
    forkBeacon.position.set(0, 14, 15);
    forkIsland.add(forkBeacon);
    scene.add(forkIsland);

    obstacles.push({
      mesh: forkIsland,
      type: 'ISLAND',
      radius: 25,
      vx: 0,
      cooldown: 0
    });

    // Sea Rocks & Reefs (Left shortcut has tighter rocks; Right detour is wider)
    const hazardPositions = [
      { x: 5, z: -115, r: 6.5 },
      { x: -18, z: -260, r: 8.5 },
      { x: 16, z: -310, r: 7.5 },
      // Port (Left) Shortcut Channel Reefs
      { x: -52, z: -480, r: 8 },
      { x: -29, z: -545, r: 6.5 },
      // Post-Island Rocks
      { x: -18, z: -660, r: 8 },
      { x: 20, z: -680, r: 8.5 },
      { x: 0, z: -830, r: 9.5 },
      { x: -22, z: -890, r: 7.5 },
      { x: 22, z: -890, r: 7.5 }
    ];

    hazardPositions.forEach((h) => {
      const rockGroup = new THREE.Group();
      rockGroup.position.set(h.x, 0, h.z);

      const mainRock = new THREE.Mesh(new THREE.DodecahedronGeometry(h.r, 1), rockMat);
      mainRock.scale.set(1.2, 0.75, 1.1);
      mainRock.position.y = 1.5;
      rockGroup.add(mainRock);

      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 3.5, 8), buoyMat);
      beacon.position.y = h.r * 0.75 + 2;
      rockGroup.add(beacon);

      scene.add(rockGroup);
      obstacles.push({
        mesh: rockGroup,
        type: 'ROCK',
        radius: h.r + 2.2,
        vx: 0,
        cooldown: 0
      });
    });

    // FIX 4: Replace Floating Neon Wire Gate with 3D Harbor Breakwater Lighthouses!
    const harborGroup = new THREE.Group();
    harborGroup.position.set(0, 0, -simRef.current.targetDistance);
    const searchlights = [];

    [-52, 52].forEach((lx) => {
      const lhGroup = new THREE.Group();
      lhGroup.position.set(lx, 0, 0);

      // Rocky Breakwater Base
      const baseRock = new THREE.Mesh(new THREE.DodecahedronGeometry(10, 1), rockMat);
      baseRock.scale.set(1.4, 0.5, 1.4);
      baseRock.position.y = 1.5;
      lhGroup.add(baseRock);

      // Lighthouse Striped Tower
      const towerLower = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 14, 12), whiteMat);
      towerLower.position.y = 9;
      lhGroup.add(towerLower);

      const towerMid = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 10, 12), redHullMat);
      towerMid.position.y = 21;
      lhGroup.add(towerMid);

      const lanternRoom = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 4, 12),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      lanternRoom.position.y = 28;
      lhGroup.add(lanternRoom);

      // Rotating Searchlight Cone
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

    // Floating Green Safe-Channel Buoys at Sea Level
    const safeBuoyMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    for (let bx = -36; bx <= 36; bx += 12) {
      const buoy = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), safeBuoyMat);
      buoy.position.set(bx, 0.6, 0);
      harborGroup.add(buoy);
    }
    scene.add(harborGroup);

    // ==========================================
    // 5. KEYBOARD CONTROLS & LISTENERS
    // ==========================================
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keysRef.current.w = true;
      if (k === 's' || e.key === 'ArrowDown') keysRef.current.s = true;
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.a = true;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.d = true;
      if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); keysRef.current.space = true; }
      if (e.key === '1') handleDecisionChoice(1);
      if (e.key === '2') handleDecisionChoice(2);
    };

    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keysRef.current.w = false;
      if (k === 's' || e.key === 'ArrowDown') keysRef.current.s = false;
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.a = false;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.d = false;
      if (e.code === 'Space' || e.key === ' ') keysRef.current.space = false;
    };

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
    // 6. 60FPS PHYSICS, LERP WEATHER & CAPSIZE LOOP
    // ==========================================
    const clock = new THREE.Clock();
    let animId;
    let hudTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const rawDt = Math.min(clock.getDelta(), 0.05);
      // FIX 2: Tactical Slow-Mo (15% speed) while a decision modal is on screen!
      const timeScale = decisionActiveRef.current ? 0.15 : 1.0;
      const dt = rawDt * timeScale;
      const elapsed = clock.getElapsedTime();
      const s = simRef.current;

      // 🔥 LIVE WEATHER LERP ENGINE (Reads real-time weather without resetting the 3D scene!)
      const currentW = weatherRef.current;
      const isCyclone = currentW === 'CYCLONE IMMINENT';
      const isDeteriorating = currentW === 'DETERIORATING';

      // 1. Lerp Sky, Fog & Ocean Colors smoothly
      const targetSkyHex = isCyclone ? 0x162433 : isDeteriorating ? 0x3b5266 : 0x5da9e9;
      scene.background.lerp(new THREE.Color(targetSkyHex), rawDt * 1.8);
      scene.fog.color.lerp(new THREE.Color(targetSkyHex), rawDt * 1.8);
      scene.fog.density = THREE.MathUtils.lerp(
        scene.fog.density,
        isCyclone ? 0.0024 : isDeteriorating ? 0.0019 : 0.0012,
        rawDt * 1.8
      );

      const targetWaterHex = isCyclone ? 0x103f5e : isDeteriorating ? 0x19587a : 0x1d7ed6;
      waterMat.color.lerp(new THREE.Color(targetWaterHex), rawDt * 1.8);

      // 2. Lerp Rain Opacity (0% in Nominal, 35% in Deteriorating, 65% in Cyclone)
      const targetRainOpacity = isCyclone ? 0.65 : isDeteriorating ? 0.35 : 0.0;
      rainMat.opacity = THREE.MathUtils.lerp(rainMat.opacity, targetRainOpacity, rawDt * 2.0);

      // 3. Lerp Wave Height
      const targetWaveAmp = isCyclone ? 1.15 : isDeteriorating ? 0.7 : 0.38;
      s.waveAmp = THREE.MathUtils.lerp(s.waveAmp, targetWaveAmp, rawDt * 1.8);
      const waveAmp = s.waveAmp;

      // Check if player triggered Container Jettison
      if (jettisonTriggerRef.current) {
        jettisonTriggerRef.current = false;
        detachTopContainer();
      }

      // Animate Falling / Jettisoned Containers (Idea A)
      fallingContainers.forEach((fc) => {
        fc.mesh.position.x += fc.vx * rawDt;
        fc.mesh.position.y += fc.vy * rawDt;
        fc.mesh.position.z += fc.vz * rawDt;
        fc.vy -= 18 * rawDt; // Gravity
        fc.mesh.rotation.z += fc.rotSpeed * rawDt;
        if (fc.mesh.position.y < -1.5) {
          fc.vy = -1.2; // Slowly sinks underwater
          fc.vx *= 0.9;
        }
      });

      // Rotate Harbor Lighthouse Searchlights
      searchlights.forEach((beam, idx) => {
        beam.rotation.y = elapsed * (idx === 0 ? 1.2 : -1.2);
      });

      // 🔥 IDEA C: Typhoon Lightning Strikes & Rogue Waves (Only during CYCLONE IMMINENT)
      if (s.lightningAlertTimer > 0) {
        s.lightningAlertTimer = Math.max(0, s.lightningAlertTimer - rawDt);
      }
      if (isCyclone && !s.isFinished && !s.isCapsized) {
        if (Math.random() < 0.0014) {
          // Lightning Flash
          hemiLight.intensity = 4.5;
          setTimeout(() => {
            hemiLight.intensity = 0.65;
          }, 120);

          // Typhoon / Lightning Impact (Shakes camera, tilts ship, deducts Cargo Health)
          s.cameraShake = 2.5;
          s.rollAngle += (Math.random() > 0.5 ? 1 : -1) * 22;
          s.health = Math.max(5, s.health - Math.floor(Math.random() * 8 + 4)); // -4% to -11% health
          s.lightningAlertTimer = 3.0;

          setHud((prev) => ({
            ...prev,
            warning: '⚡ LIGHTNING & TYPHOON SWELL HIT! CARGO DAMAGED!',
            health: Math.round(s.health)
          }));
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

      // Animate Storm Rain Particles when visible
      if (rainSystem && rainMat.opacity > 0.01) {
        rainSystem.position.copy(playerGroup.position);
        const rPos = rainSystem.geometry.attributes.position;
        for (let i = 1; i < rPos.count * 3; i += 3) {
          rPos.array[i] -= 55 * rawDt;
          if (rPos.array[i] < 0) rPos.array[i] = 60;
        }
        rPos.needsUpdate = true;
      }

      if (!s.isCapsized && !s.isFinished) {
        // FIX 3: Realistic Throttle & Water-Braking Reverse (Capped at -12 knots)
        if (keysRef.current.space) {
            // 🔥 SPACEBAR WATER BRAKE: Smoothly slows throttle & speed toward 0
            s.throttle = THREE.MathUtils.lerp(s.throttle, 0, 3.2 * dt);
            s.speed = THREE.MathUtils.lerp(s.speed, 0, 2.2 * dt);
            s.rollVelocity *= Math.pow(0.4, dt); // Helps steady the hull while braking
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

        // Port Shortcut Channel Tailwind Boost (around Z = -460 to -560 on Left side)
        const inPortShortcut =
          playerGroup.position.z < -440 &&
          playerGroup.position.z > -570 &&
          playerGroup.position.x < -15;
        const channelBoost = inPortShortcut ? 10 : 0;

        s.speed += (s.throttle + channelBoost - s.speed) * 1.5 * dt;

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

        // CENTRIFUGAL HEEL / TOPPLE PHYSICS CALCULATION
        const speedRatio = Math.abs(s.speed) / 32;
        const centrifugalRollTorque =
          s.yawRate * speedRatio * 78 * s.dynamicWeightFactor * s.ballastStabilizer;

        const weatherSwellMultiplier = isCyclone ? 11.5 : isDeteriorating ? 6.5 : 3.2;
        const swellTorque = Math.sin(elapsed * 2.1) * weatherSwellMultiplier;

        const restoringForce = -s.rollAngle * 2.4;
        const rollAccel =
          centrifugalRollTorque + swellTorque + restoringForce - s.rollVelocity * 1.65;

        s.rollVelocity += rollAccel * dt;
        s.rollAngle += s.rollVelocity * dt * 12;

        // IDEA A: Auto-snap top container overboard if tilt exceeds 37° once!
        if (Math.abs(s.rollAngle) >= 37 && !s.autoJettisonUsed && stackedContainers.length > 1) {
          s.autoJettisonUsed = true;
          detachTopContainer();
          s.rollAngle *= 0.65; // Saves the ship slightly as top weight falls off!
          s.dynamicWeightFactor = Math.max(0.6, s.dynamicWeightFactor - 0.2);
          s.health = Math.max(5, s.health - 8);
        }

        // CHECK FOR CAPSIZE (42+ DEGREES)
        if (Math.abs(s.rollAngle) >= CAPSIZE_DEG) {
          s.isCapsized = true;
          s.health = 0;
          setActiveDecision(null);
          setHud((prev) => ({
            ...prev,
            status: 'CAPSIZED',
            health: 0,
            rollDeg: Math.round(Math.abs(s.rollAngle)),
            failReason: 'VESSEL CAPSIZED! Turned too sharply at high speed for cargo weight.'
          }));
        }

        // MOVE PLAYER VESSEL
        const forwardStep = s.speed * 0.65 * dt;
        playerGroup.position.x -= Math.sin(s.heading) * forwardStep;
        playerGroup.position.z -= Math.cos(s.heading) * forwardStep;
        playerGroup.rotation.y = s.heading;

        hullTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        hullTiltGroup.rotation.x = Math.sin(elapsed * 2.5) * 0.025;
        hullTiltGroup.position.y = Math.sin(elapsed * 2.2) * 0.2;

        waterMesh.position.z = playerGroup.position.z;

        // TRIGGER MID-VOYAGE TACTICAL DECISIONS (With Slow-Mo!)
        const currentProgress = Math.abs(playerGroup.position.z) / s.targetDistance;
        s.distance = Math.abs(playerGroup.position.z);

        if (currentProgress > 0.12 && !s.decisionTriggered1) {
          s.decisionTriggered1 = true;
          setActiveDecision({
            id: 'CROSSING_VESSEL',
            title: '⚠️ TRAFFIC ALERT: STEAMER CROSSING BOW',
            desc: 'Passenger steamer crossing lane ahead! Time slowed for tactical command:',
            opt1: '[1] Water Brakes & Yield (-Speed, Safe Tilt)',
            opt2: '[2] Overclock Engines (+Speed, High Tilt Risk)'
          });
        }

        if (currentProgress > 0.38 && !s.decisionTriggered2) {
          s.decisionTriggered2 = true;
          setActiveDecision({
            id: 'ISLAND_FORK',
            title: '🧭 SPLIT CHANNEL AHEAD: CHOOSE ROUTE',
            desc: 'Barrier island dividing the sector ahead! Select your approach:',
            opt1: '[1] Port Channel (Narrow Shortcut + Speed Current)',
            opt2: '[2] Starboard Channel (Wide Deep Water, Safe Clearance)'
          });
        }

        if (currentProgress > 0.62 && !s.decisionTriggered3) {
          s.decisionTriggered3 = true;
          setActiveDecision({
            id: 'CARGO_SHIFT',
            title: '🚨 STABILITY ALARM: CARGO LASHINGS STRAINING',
            desc: `Heavy ${Number(weightKg).toLocaleString()} kg load is amplifying roll angles during turns!`,
            opt1: '[1] Flood Counter-Ballast (+45% Stability, Max Speed 40)',
            opt2: '[2] Jettison Top Container (-10% Health, Drop Top Weight Overboard)'
          });
        }

        // FIX 3: SOLID COLLISION RICOCHET & CAMERA SHAKE (NO GHOSTING THROUGH SHIPS!)
        obstacles.forEach((obs) => {
          if (obs.cooldown > 0) obs.cooldown = Math.max(0, obs.cooldown - rawDt);

          if (obs.vx !== 0) {
            obs.mesh.position.x += obs.vx * dt;
            if (obs.mesh.position.x > 85) obs.vx = -Math.abs(obs.vx);
            if (obs.mesh.position.x < -85) obs.vx = Math.abs(obs.vx);
            obs.mesh.rotation.y = obs.vx > 0 ? Math.PI / 2 : -Math.PI / 2;
          }

          const dx = playerGroup.position.x - obs.mesh.position.x;
          const dz = playerGroup.position.z - obs.mesh.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const minSep = obs.radius + 4.2;

          if (dist < minSep) {
            // Physically push player hull outside obstacle radius so it NEVER ghosts inside!
            const nx = dx / (dist || 1);
            const nz = dz / (dist || 1);
            playerGroup.position.x = obs.mesh.position.x + nx * (minSep + 1.5);
            playerGroup.position.z = obs.mesh.position.z + nz * (minSep + 1.5);

            if (obs.cooldown <= 0) {
              obs.cooldown = 1.4;
              const dmg = obs.type === 'STEAMER' ? 25 : 18;
              s.health = Math.max(0, s.health - dmg);

              // Bounce-back velocity & camera shake
              s.speed = -Math.max(8, Math.abs(s.speed) * 0.35);
              s.throttle = 0;
              s.cameraShake = 1.4;
              const knockDir = dx >= 0 ? -1 : 1;
              s.rollAngle += knockDir * 19;

              if (s.health <= 0) {
                s.isCapsized = true;
                setActiveDecision(null);
                setHud((prev) => ({
                  ...prev,
                  status: 'SUNK',
                  health: 0,
                  failReason: 'HULL BREACHED! Direct collision destroyed cargo integrity.'
                }));
              }
            }
          }
        });

        // CHECK IF HARBOR LIGHTHOUSE GATE REACHED
        if (playerGroup.position.z <= -s.targetDistance) {
          s.isFinished = true;
          setActiveDecision(null);
          setHud((prev) => ({
            ...prev,
            status: 'CLEARED',
            progress: 100,
            health: Math.round(s.health)
          }));
        }
      } else if (s.isCapsized) {
        // SINKING & CAPSIZING ANIMATION
        const targetFlip = s.rollAngle >= 0 ? 115 : -115;
        s.rollAngle += (targetFlip - s.rollAngle) * 2.2 * rawDt;
        hullTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        hullTiltGroup.rotation.x += 0.12 * rawDt;
        hullTiltGroup.position.y -= 1.8 * rawDt;
        s.speed *= 0.95;
      }

      // ==========================================
      // 7. OVER-THE-SHOULDER CHASE CAMERA + IMPACT SHAKE
      // ==========================================
      const camDistance = 30;
      const camHeight = 14.5;
      const targetCamX = playerGroup.position.x + Math.sin(s.heading) * camDistance;
      const targetCamZ = playerGroup.position.z + Math.cos(s.heading) * camDistance;

      camera.position.x += (targetCamX - camera.position.x) * 8 * rawDt;
      camera.position.z += (targetCamZ - camera.position.z) * 8 * rawDt;
      camera.position.y += (camHeight - camera.position.y) * 6 * rawDt;

      if (s.cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * s.cameraShake * 2.2;
        camera.position.y += (Math.random() - 0.5) * s.cameraShake * 2.2;
        s.cameraShake = Math.max(0, s.cameraShake - 3.5 * rawDt);
      }

      camera.lookAt(
        playerGroup.position.x - Math.sin(s.heading) * 16,
        2.0,
        playerGroup.position.z - Math.cos(s.heading) * 16
      );

      // Update React HUD at 10Hz
      hudTimer += rawDt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        const absRoll = Math.round(Math.abs(s.rollAngle));
        let warnMsg = '';
        if (s.lightningAlertTimer > 0) {
          warnMsg = '⚡ LIGHTNING & TYPHOON SWELL HIT! CARGO DAMAGED!';
        } else if (absRoll >= 28) {
          warnMsg = '🚨 CRITICAL TILT! COUNTER-STEER OR HIT BRAKES (S) NOW!';
        } else if (absRoll >= 18) {
          warnMsg = '⚠️ HEAVY HEEL ANGLE — EASE OFF RUDDER';
        }

        setHud((prev) => ({
          ...prev,
          speed: Math.round(s.speed),
          rudder: Math.round(s.rudderAngle),
          rollDeg: absRoll,
          health: Math.round(s.health),
          progress: Math.min(100, Math.round((s.distance / s.targetDistance) * 100)),
          warning: warnMsg
        }));
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [mode, weightKg]);

  const rollColor =
    hud.rollDeg >= 28 ? '#ef4444' : hud.rollDeg >= 18 ? '#f59e0b' : '#2ecc71';

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10005,
        background: '#050811',
        fontFamily: "'Space Mono', monospace",
        userSelect: 'none'
      }}
    >
      {/* 3D THREE.JS VIEWPORT */}
      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />

      {/* TOP LEFT: VESSEL TELEMETRY & CARGO HEALTH */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(10, 14, 23, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(130, 160, 255, 0.25)',
          borderRadius: 12,
          padding: '14px 18px',
          width: 285,
          color: '#fff'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#82a0ff', fontWeight: 'bold' }}>⚓ 3D HELM CONTROL</span>
          <span style={{ fontSize: 11, background: 'rgba(130,160,255,0.15)', padding: '2px 8px', borderRadius: 4 }}>
            {Number(weightKg).toLocaleString()} KG
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' }}>
          {cargo}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10 }}>
          CLIMATE:{' '}
          <strong
            style={{
              color:
                liveWeather === 'NOMINAL'
                  ? '#2ecc71'
                  : liveWeather === 'DETERIORATING'
                  ? '#f59e0b'
                  : '#ef4444'
            }}
          >
            {liveWeather === 'NOMINAL'
              ? '☀️ NOMINAL (SUNNY)'
              : liveWeather === 'DETERIORATING'
              ? '🌧️ DETERIORATING (RAIN)'
              : '⛈️ CYCLONE IMMINENT (TYPHOON)'}
          </strong>
        </div>

        {/* Cargo Health Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          <span>CARGO INTEGRITY</span>
          <span style={{ color: hud.health < 50 ? '#ef4444' : '#2ecc71', fontWeight: 'bold' }}>{hud.health}%</span>
        </div>
        <div style={{ width: '100%', height: 7, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 12 }}>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          <span>HARBOR LIGHTHOUSE</span>
          <span style={{ color: '#82a0ff', fontWeight: 'bold' }}>{hud.progress}%</span>
        </div>
        <div style={{ width: '100%', height: 7, background: '#1e293b', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${hud.progress}%`, height: '100%', background: '#82a0ff', transition: 'width 0.2s' }} />
        </div>

        {ballastActive && (
          <div style={{ marginTop: 10, fontSize: 10, color: '#2ecc71', textAlign: 'center', border: '1px solid #2ecc71', borderRadius: 4, padding: '3px 6px' }}>
            ✓ COUNTER-BALLAST ENGAGED (+STABILITY)
          </div>
        )}
        {jettisonCount > 0 && (
          <div style={{ marginTop: 6, fontSize: 10, color: '#f59e0b', textAlign: 'center', border: '1px solid #f59e0b', borderRadius: 4, padding: '3px 6px' }}>
            📦 {jettisonCount} CONTAINER JETTISONED (-WEIGHT)
          </div>
        )}
        {hud.channelNotice && (
          <div style={{ marginTop: 6, fontSize: 10, color: '#38bdf8', textAlign: 'center' }}>
            {hud.channelNotice}
          </div>
        )}
      </div>

      {/* TOP CENTER: INCLINOMETER (CAPSIZE CALCULATOR HUD) */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(12px)',
          border: `2px solid ${rollColor}`,
          borderRadius: 14,
          padding: '10px 26px',
          textAlign: 'center',
          minWidth: 350,
          boxShadow: hud.rollDeg >= 25 ? '0 0 25px rgba(239, 68, 68, 0.5)' : '0 8px 25px rgba(0,0,0,0.4)'
        }}
      >
        <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1 }}>
          HULL TILT ANGLE (CAPSIZE LIMIT: {CAPSIZE_DEG}°)
        </div>
        <div style={{ fontSize: 23, fontWeight: 'bold', color: rollColor, margin: '2px 0' }}>
          {hud.rollDeg}° / {CAPSIZE_DEG}°
        </div>

        <div style={{ width: '100%', height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
          <div
            style={{
              width: `${Math.min(100, (hud.rollDeg / CAPSIZE_DEG) * 100)}%`,
              height: '100%',
              background: rollColor,
              transition: 'width 0.1s'
            }}
          />
        </div>

        <div style={{ fontSize: 11, color: '#cbd5e1' }}>
          RUDDER: <strong>{hud.rudder > 0 ? `PORT ${hud.rudder}°` : hud.rudder < 0 ? `STBD ${Math.abs(hud.rudder)}°` : 'CENTER 0°'}</strong>
        </div>

        {hud.warning && (
          <div style={{ marginTop: 5, fontSize: 11, color: '#ef4444', fontWeight: 'bold' }}>
            {hud.warning}
          </div>
        )}
      </div>

      {/* TOP RIGHT: CONTROLS GUIDE & LEGACY QUIZ SWITCHER */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          background: 'rgba(10, 14, 23, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(130, 160, 255, 0.25)',
          borderRadius: 12,
          padding: '14px 18px',
          color: '#cbd5e1',
          fontSize: 11,
          lineHeight: 1.7
        }}
      >
        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>CONTROLS</div>
        <div><strong style={{ color: '#82a0ff' }}>[W / S]</strong> Throttle / Reverse</div>
        <div><strong style={{ color: '#82a0ff' }}>[SPACE]</strong> Hold to Brake Slowly</div>
        <div><strong style={{ color: '#82a0ff' }}>[A / D]</strong> Turn Rudder (Watch Tilt!)</div>
        <div><strong style={{ color: '#f1c40f' }}>[1 / 2]</strong> Tactical Radio Decisions</div>

        <button
          onClick={() => (onExit ? onExit() : onComplete({ success: true, finalHealth: hud.health }))}
          style={{
            marginTop: 10,
            width: '100%',
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid #ef4444',
            color: '#ff7675',
            padding: '7px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 'bold',
            fontFamily: 'inherit'
          }}
        >
          EXIT TO MAP
        </button>
        
      </div>

      {/* FIX 2: TOP-BANNER TACTICAL DECISION WITH SLOW-MO (DOES NOT BLOCK YOUR BOW VIEW!) */}
      {decisionPrompt && hud.status === 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            top: 132,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 15, 28, 0.88)',
            backdropFilter: 'blur(10px)',
            border: '2px solid #f1c40f',
            borderRadius: 12,
            padding: '12px 20px',
            width: 520,
            color: '#fff',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ color: '#f1c40f', fontWeight: 'bold', fontSize: 13 }}>{decisionPrompt.title}</span>
            <span style={{ fontSize: 10, background: 'rgba(241,196,15,0.2)', color: '#f1c40f', padding: '2px 6px', borderRadius: 4 }}>
              ⏱ TACTICAL SLOW-MO ACTIVE
            </span>
          </div>
          <p style={{ margin: '0 0 10px 0', fontSize: 11, color: '#cbd5e1', fontFamily: 'Inter, sans-serif' }}>
            {decisionPrompt.desc}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => handleDecisionChoice(1)}
              style={{
                flex: 1,
                background: 'rgba(46, 204, 113, 0.18)',
                border: '1px solid #2ecc71',
                color: '#2ecc71',
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: 'bold'
              }}
            >
              {decisionPrompt.opt1}
            </button>
            <button
              onClick={() => handleDecisionChoice(2)}
              style={{
                flex: 1,
                background: 'rgba(241, 196, 15, 0.18)',
                border: '1px solid #f1c40f',
                color: '#f1c40f',
                padding: '8px 10px',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 11,
                fontWeight: 'bold'
              }}
            >
              {decisionPrompt.opt2}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM CENTER: ROBLOX-STYLE SPEED BAR */}
      <div
        style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 240,
          textAlign: 'center'
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#fff',
            fontSize: 12,
            fontWeight: 'bold',
            textShadow: '0 1px 4px rgba(0,0,0,0.9)',
            marginBottom: 4
          }}
        >
          <span>{hud.speed < 0 ? 'Astern (Reverse)' : 'Speed'}</span>
          <span>{hud.speed} km/h</span>
        </div>
        <div
          style={{
            width: '100%',
            height: 6,
            background: 'rgba(0, 0, 0, 0.65)',
            border: '1px solid rgba(255,255,255,0.25)',
            borderRadius: 3,
            overflow: 'hidden'
          }}
        >
          <div
            style={{
              width: `${Math.min(100, Math.max(0, (Math.abs(hud.speed) / 55) * 100))}%`,
              height: '100%',
              background: hud.speed < 0 ? '#ef4444' : '#eab308',
              transition: 'width 0.1s'
            }}
          />
        </div>
      </div>

      {/* END-OF-MANEUVER OVERLAY */}
      {hud.status !== 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 8, 17, 0.78)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: `2px solid ${hud.status === 'CLEARED' ? '#2ecc71' : '#ef4444'}`,
              borderRadius: 16,
              padding: '32px 40px',
              textAlign: 'center',
              maxWidth: 440,
              color: '#fff',
              boxShadow: '0 20px 50px rgba(0,0,0,0.7)'
            }}
          >
            <h2
              style={{
                margin: '0 0 12px 0',
                fontSize: 24,
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
                ? `You calculated your turns and navigated past the breakwater lighthouses! Remaining Cargo Integrity: ${hud.health}%.`
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
                color: '#000',
                fontWeight: 'bold',
                border: 'none',
                padding: '12px 28px',
                borderRadius: 8,
                cursor: 'pointer',
                fontFamily: 'inherit',
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