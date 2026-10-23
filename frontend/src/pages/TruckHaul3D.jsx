// TruckHaul3D.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const TruckHaul3D = ({
  weatherState = 'NOMINAL',
  cargo = 'Cavendish Bananas',
  weightKg = 2500,
  originHub = 'Central Cold Storage',
  initialHealth = 100,
  onComplete,
  onExit
}) => {
  const mountRef = useRef(null);

  // Live Weather Sync
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
      } catch (e) {}
    };
    syncLiveWeather();
    const interval = setInterval(syncLiveWeather, 2000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const [hud, setHud] = useState({
    speed: 0,
    steerDeg: 0,
    articulationDeg: 0,
    rollDeg: 0,
    signedRollDeg: 0,
    brakePressure: 0,
    isBraking: false,
    isReversingHitch: false,
    violationAlertActive: false,
    turnViolationAlertActive: false,
    blinker: 'OFF', // 'OFF' | 'LEFT' | 'RIGHT'
    blinkOn: false,
    navInstruction: '[ 🅿️ Reverse [S] into Blue Trailer (or Press [H]) ]',
    health: Math.round(initialHealth),
    progress: 0,
    timeLeft: 90,
    strikes: 0,
    governorTimer: 0,
    nextLightState: 'GREEN',
    nextLightDist: 0,
    stage: 'HITCH', // 'HITCH' -> 'HAUL' -> 'DELIVERED' | 'CRASHED'
    status: 'ACTIVE',
    failReason: ''
  });

  // Controls Overlay with 3.5s Auto-Fade & [?] Toggle
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

  const [cameraFlash, setCameraFlash] = useState(false);

  const keysRef = useRef({ w: false, s: false, a: false, d: false, space: false });
  const forceHitchRef = useRef(false);

  // Right-Click 360 Orbit Camera Ref
  const camOrbitRef = useRef({
    isRightDown: false,
    lastX: 0,
    lastY: 0,
    yawOffset: 0,
    pitchOffset: 0,
    zoomDist: 26
  });

  const simRef = useRef({
    speed: 0,
    throttle: 0,
    steerAngle: 0,        // Front wheel steering (-38 to +38 deg)
    cabHeading: 0,        // Tractor Head orientation (rad)
    trailerHeading: 0,    // Blue Trailer orientation (rad)
    rollAngle: 0,
    brakePressure: 0,     // Pneumatic air brake gauge (0-100)
    hitchCamBlend: 0,     // Smooth camera blend for Reverse Hitching Assistance
    blinker: 'OFF',       // 'OFF' | 'LEFT' | 'RIGHT'
    turnActive: false,    // Tracks whether steering exceeded 12 deg during current turn
    turnStartHeading: 0,  // Reference heading before entering turn
    unsignaledPenaltyCooldown: 0,
    turnViolationTimer: 0,
    routeLeg: 1,          // 1: Northbound to Jct 1, 2: Westbound Coastal Bypass, 3: Port Approach
    health: Number(initialHealth) || 100,
    timeLeft: 90,         // 90-second Port Gate Slot Countdown once hitched
    strikes: 0,           // 3 Red Light Violations = Contract Terminated
    governorTimer: 0,     // 8-second 20 km/h speed limiter penalty
    violationAlertTimer: 0,
    isHitched: false,
    isFinished: false,
    isCrashed: false,
    cameraShake: 0,
    maxSpeedCap: 40,
    weightFactor: 0.7 + (Number(weightKg || 2500) / 5000) * 0.75
  });

  const ROLLOVER_LIMIT = 38;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ==========================================
    // 1. THREE.JS SCENE, SKY & CAMERA
    // ==========================================
    const scene = new THREE.Scene();
    const initW = weatherRef.current;
    const isCyc = initW === 'CYCLONE IMMINENT';
    const isDet = initW === 'DETERIORATING';

    const skyHex = isCyc ? 0x1a2634 : isDet ? 0x4a5d6e : 0x74b9ff;
    scene.background = new THREE.Color(skyHex);
    scene.fog = new THREE.FogExp2(skyHex, 0.0013);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.5,
      1800
    );
    camera.position.set(7, 12, 6);
    const camLookTarget = new THREE.Vector3(7, 3.2, 22);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.25);
    dirLight.position.set(80, 160, 60);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ==========================================
    // 2. MULTI-TURN ROUTE GEOMETRY (WAREHOUSE -> LEFT TURN JCT -> RIGHT TURN PORT)
    // ==========================================
    // Segment 1: Warehouse Exit along X = 0, Z = +30 to Z = -420 (Northbound -Z)
    // Junction 1 (Left Turn): (X = 0, Z = -420) -> Turn Left 90° onto Coastal Bypass (-X)
    // Segment 2: Coastal Port Bypass along Z = -420, X = 0 to X = -520 (Westbound -X)
    // Junction 2 (Right Turn): (X = -520, Z = -420) -> Turn Right 90° onto Port Terminal Approach (-Z)
    // Segment 3: Port Terminal Approach along X = -520, Z = -420 to Z = -820 (Drop-Off Zone)

    const grassMat = new THREE.MeshLambertMaterial({ color: 0x244218 });
    const coastalVergeMat = new THREE.MeshLambertMaterial({ color: 0x1f3a18 });
    const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x26292e });
    const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const brickMat = new THREE.MeshLambertMaterial({ color: 0x7c3f2c });
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
    const cyanGuideMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // World Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3600, 3600), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Warehouse Yard Asphalt (Origin)
    const yardAsphalt = new THREE.Mesh(new THREE.PlaneGeometry(96, 105), asphaltMat);
    yardAsphalt.rotation.x = -Math.PI / 2;
    yardAsphalt.position.set(0, 0.01, 25);
    scene.add(yardAsphalt);

    // Brick Warehouse Building
    const warehouseBuilding = new THREE.Mesh(new THREE.BoxGeometry(72, 18, 16), brickMat);
    warehouseBuilding.position.set(0, 9, 68);
    scene.add(warehouseBuilding);

    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(74, 1.4, 17), concreteMat);
    roofTrim.position.set(0, 18.2, 68);
    scene.add(roofTrim);

    const doorMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    [-21, -7, 7, 21].forEach((dx) => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(8.5, 10, 0.6), doorMat);
      door.position.set(dx, 5, 59.8);
      scene.add(door);

      [-4.6, 4.6].forEach((rx) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.9, 14), concreteMat);
        rail.position.set(dx + rx, 0.45, 52);
        scene.add(rail);
      });
    });

    const parkedTrailer = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 5.2, 16.5),
      new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
    );
    parkedTrailer.position.set(21, 3.8, 46);
    scene.add(parkedTrailer);

    // --- SEGMENT 1: NORTHBOUND HIGHWAY (X = 0, Z = -20 to -450) ---
    const seg1Shoulder = new THREE.Mesh(new THREE.PlaneGeometry(48, 460), shoulderMat);
    seg1Shoulder.rotation.x = -Math.PI / 2;
    seg1Shoulder.position.set(0, 0.015, -220);
    scene.add(seg1Shoulder);

    const seg1Asphalt = new THREE.Mesh(new THREE.PlaneGeometry(42, 460), asphaltMat);
    seg1Asphalt.rotation.x = -Math.PI / 2;
    seg1Asphalt.position.set(0, 0.02, -220);
    scene.add(seg1Asphalt);

    [-0.35, 0.35].forEach((yx) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 390), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(yx, 0.04, -195);
      scene.add(line);
    });

    for (let z = -20; z > -390; z -= 20) {
      [-10.2, 10.2].forEach((lx) => {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 8), whiteLineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.04, z);
        scene.add(dash);
      });
    }

    // --- SEGMENT 2: COASTAL PORT BYPASS (WESTBOUND: Z = -420, X = +30 to -550) ---
    const seg2Shoulder = new THREE.Mesh(new THREE.PlaneGeometry(590, 48), shoulderMat);
    seg2Shoulder.rotation.x = -Math.PI / 2;
    seg2Shoulder.position.set(-260, 0.016, -420);
    scene.add(seg2Shoulder);

    const seg2Asphalt = new THREE.Mesh(new THREE.PlaneGeometry(590, 42), asphaltMat);
    seg2Asphalt.rotation.x = -Math.PI / 2;
    seg2Asphalt.position.set(-260, 0.022, -420);
    scene.add(seg2Asphalt);

    [-0.35, 0.35].forEach((yz) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(470, 0.25), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-260, 0.042, -420 + yz);
      scene.add(line);
    });

    for (let x = -40; x > -490; x -= 20) {
      [-10.2, 10.2].forEach((lz) => {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(8, 0.3), whiteLineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.042, -420 + lz);
        scene.add(dash);
      });
    }

    // --- SEGMENT 3: PORT TERMINAL APPROACH (NORTHBOUND: X = -520, Z = -395 to -860) ---
    const seg3Shoulder = new THREE.Mesh(new THREE.PlaneGeometry(48, 460), shoulderMat);
    seg3Shoulder.rotation.x = -Math.PI / 2;
    seg3Shoulder.position.set(-520, 0.015, -625);
    scene.add(seg3Shoulder);

    const seg3Asphalt = new THREE.Mesh(new THREE.PlaneGeometry(42, 460), asphaltMat);
    seg3Asphalt.rotation.x = -Math.PI / 2;
    seg3Asphalt.position.set(-520, 0.02, -625);
    scene.add(seg3Asphalt);

    [-0.35, 0.35].forEach((yx) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 330), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-520 + yx, 0.04, -615);
      scene.add(line);
    });

    for (let z = -460; z > -770; z -= 20) {
      [-10.2, 10.2].forEach((lx) => {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 8), whiteLineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(-520 + lx, 0.04, z);
        scene.add(dash);
      });
    }

    // Subtle Ground Turn Chevrons at Junction 1 (0, -420) & Junction 2 (-520, -420)
    for (let i = 0; i < 4; i++) {
      const guide1 = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), cyanGuideMat);
      guide1.rotation.x = -Math.PI / 2;
      guide1.position.set(8 - i * 6, 0.055, -395 - i * 4.5);
      scene.add(guide1);

      const guide2 = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 2.5), cyanGuideMat);
      guide2.rotation.x = -Math.PI / 2;
      guide2.position.set(-495 - i * 5, 0.055, -412 - i * 6);
      scene.add(guide2);
    }

    // ==========================================
    // 3. TRAFFIC LIGHT GANTRIES AT INTERSECTIONS
    // ==========================================
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const trafficLights = [];

    const createGantry = (x, z, rotY, stopX, stopZ, axis, dir, cycleOffset, label) => {
      const gantryGroup = new THREE.Group();
      gantryGroup.position.set(x, 0, z);
      gantryGroup.rotation.y = rotY;

      const vPole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 15, 10), poleMat);
      vPole.position.y = 7.5;
      gantryGroup.add(vPole);

      const hArm = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 0.45), poleMat);
      hArm.position.set(-11, 14.2, 0);
      gantryGroup.add(hArm);

      const redBulbs = [];
      const yellowBulbs = [];
      const greenBulbs = [];

      [-7, -16.5].forEach((hx) => {
        const housing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 4.6, 1.2), boxMat);
        housing.position.set(hx, 13.5, 0);
        gantryGroup.add(housing);

        const rMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
        const yMat = new THREE.MeshBasicMaterial({ color: 0x332200 });
        const gMat = new THREE.MeshBasicMaterial({ color: 0x00ff66 });

        const rBulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), rMat);
        rBulb.position.set(hx, 14.8, 0.65);
        gantryGroup.add(rBulb);
        redBulbs.push(rMat);

        const yBulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), yMat);
        yBulb.position.set(hx, 13.5, 0.65);
        gantryGroup.add(yBulb);
        yellowBulbs.push(yMat);

        const gBulb = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 10), gMat);
        gBulb.position.set(hx, 12.2, 0.65);
        gantryGroup.add(gBulb);
        greenBulbs.push(gMat);
      });

      scene.add(gantryGroup);

      // White Stop Line
      const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(20.5, 1.2), whiteLineMat);
      stopLine.rotation.x = -Math.PI / 2;
      stopLine.rotation.z = rotY;
      stopLine.position.set(stopX, 0.05, stopZ);
      scene.add(stopLine);

      trafficLights.push({
        label,
        axis, // 'Z' or 'X'
        dir,  // -1
        stopX,
        stopZ,
        cycleOffset,
        state: 'GREEN',
        violated: false,
        redBulbs,
        yellowBulbs,
        greenBulbs
      });
    };

    // Signal 1: Mid-Segment 1 Crosswalk Signal (Z = -210)
    createGantry(22, -225, 0, 10.2, -192, 'Z', -1, 0.0, 'MIDWAY CROSSING');
    // Signal 2: Junction 1 Left Turn Signal (Z = -420)
    createGantry(22, -438, 0, 10.2, -396, 'Z', -1, 5.5, 'COASTAL BYPASS JCT');
    // Signal 3: Junction 2 Right Turn Signal (X = -520, Z = -420, facing Westbound traffic)
    createGantry(-538, -442, Math.PI / 2, -496, -409.8, 'X', -1, 11.0, 'PORT APPROACH JCT');

    // ==========================================
    // 4. DELIVERABLE 5: BALANCED SCENERY
    // LEFT OF ROAD: Coastal Trees & Green Verge
    // RIGHT OF ROAD: Industrial Warehouses, Brick Depots & Logistics Buildings
    // ==========================================
    const treeFoliageMat = new THREE.MeshLambertMaterial({ color: 0x1e4620 });
    const treeFoliageAltMat = new THREE.MeshLambertMaterial({ color: 0x2d5a27 });
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3525 });
    const depotMat1 = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const depotMat2 = new THREE.MeshLambertMaterial({ color: 0x7c3f2c });
    const depotMat3 = new THREE.MeshLambertMaterial({ color: 0x334155 });

    const spawnTreeCluster = (tx, tz) => {
      const group = new THREE.Group();
      group.position.set(tx, 0, tz);

      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.85, 4.5, 7), trunkMat);
      trunk.position.y = 2.25;
      group.add(trunk);

      const canopy1 = new THREE.Mesh(new THREE.ConeGeometry(4.8, 11, 7), treeFoliageMat);
      canopy1.position.y = 8.5;
      group.add(canopy1);

      const canopy2 = new THREE.Mesh(new THREE.ConeGeometry(3.6, 8, 7), treeFoliageAltMat);
      canopy2.position.set(2.8, 6.2, 1.5);
      group.add(canopy2);

      scene.add(group);
    };

    const spawnIndustrialDepot = (bx, bz, rotY, index) => {
      const w = 18 + (index % 3) * 4;
      const h = 14 + (index % 4) * 4;
      const d = 24;
      const mat = index % 3 === 0 ? depotMat2 : index % 2 === 0 ? depotMat1 : depotMat3;

      const bldgGroup = new THREE.Group();
      bldgGroup.position.set(bx, 0, bz);
      bldgGroup.rotation.y = rotY;

      const mainBox = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      mainBox.position.y = h / 2;
      bldgGroup.add(mainBox);

      const roofCap = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 1.0, d + 1), concreteMat);
      roofCap.position.y = h + 0.5;
      bldgGroup.add(roofCap);

      scene.add(bldgGroup);
    };

    // Segment 1 Scenery (Z = -40 to -370): Left is X = -36 (Trees), Right is X = +38 (Industrial Depots)
    let sceneryIdx = 0;
    for (let z = -45; z > -375; z -= 48) {
      spawnTreeCluster(-34, z);
      spawnTreeCluster(-45, z - 18);
      spawnIndustrialDepot(40, z, 0, sceneryIdx++);
    }

    // Segment 2 Scenery (Westbound X = -55 to -465 along Z = -420):
    // Travelling -X: Driver's LEFT is South (Z = -384, Coastal Trees), Driver's RIGHT is North (Z = -460, Depots)
    const coastalVergeStrip = new THREE.Mesh(new THREE.PlaneGeometry(520, 40), coastalVergeMat);
    coastalVergeStrip.rotation.x = -Math.PI / 2;
    coastalVergeStrip.position.set(-260, 0.005, -375);
    scene.add(coastalVergeStrip);

    for (let x = -55; x > -465; x -= 48) {
      spawnTreeCluster(x, -384);
      spawnTreeCluster(x - 16, -370);
      spawnIndustrialDepot(x, -462, Math.PI / 2, sceneryIdx++);
    }

    // Segment 3 Scenery (Northbound X = -520, Z = -475 to -750):
    // Driver's LEFT is West (X = -555, Trees), Driver's RIGHT is East (X = -480, Depots)
    for (let z = -475; z > -750; z -= 48) {
      spawnTreeCluster(-555, z);
      spawnTreeCluster(-568, z - 16);
      spawnIndustrialDepot(-480, z, 0, sceneryIdx++);
    }

    // ==========================================
    // 5. DAVAO PORT TERMINAL DROP-OFF YARD (AT X = -520, Z = -820)
    // ==========================================
    const portCenterX = -520;
    const portCenterZ = -820;

    const portYard = new THREE.Mesh(new THREE.PlaneGeometry(110, 100), asphaltMat);
    portYard.rotation.x = -Math.PI / 2;
    portYard.position.set(portCenterX, 0.03, portCenterZ);
    scene.add(portYard);

    const dropZoneGroup = new THREE.Group();
    dropZoneGroup.position.set(portCenterX + 8, 0.06, portCenterZ);
    [
      { x: -4.2, z: 0, w: 0.45, l: 26 },
      { x: 4.2, z: 0, w: 0.45, l: 26 },
      { x: 0, z: -13, w: 8.8, l: 0.45 },
      { x: 0, z: 13, w: 8.8, l: 0.45 }
    ].forEach((b) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.l), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(b.x, 0, b.z);
      dropZoneGroup.add(line);
    });
    scene.add(dropZoneGroup);

    // Port Gantry Crane
    const craneMat = new THREE.MeshLambertMaterial({ color: 0xeab308 });
    [-22, 22].forEach((cx) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 34, 2.4), craneMat);
      leg.position.set(portCenterX + 8 + cx, 17, portCenterZ - 28);
      scene.add(leg);
    });
    const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(52, 2.6, 3.2), craneMat);
    craneBeam.position.set(portCenterX + 8, 33, portCenterZ - 28);
    scene.add(craneBeam);

    // ==========================================
    // 6. ARTICULATED TRACTOR CAB (WITH AMBER BLINKER LIGHTS) & BLUE TRAILER
    // ==========================================
    const cabGroup = new THREE.Group();
    cabGroup.position.set(7, 0, 22);
    const cabTiltGroup = new THREE.Group();
    cabGroup.add(cabTiltGroup);
    scene.add(cabGroup);

    const whiteCabMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const chassisMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const windshieldMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const blueTrailerMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });

    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 8.8), chassisMat);
    frameMesh.position.set(0, 1.1, 0);
    cabTiltGroup.add(frameMesh);

    const hitchPlate = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 12), chassisMat);
    hitchPlate.position.set(0, 1.65, 2.4);
    cabTiltGroup.add(hitchPlate);

    const cabBox = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.4, 4.2), whiteCabMat);
    cabBox.position.set(0, 3.5, -2.0);
    cabTiltGroup.add(cabBox);

    const roofSpoiler = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.9, 2.6), whiteCabMat);
    roofSpoiler.position.set(0, 6.0, -1.6);
    cabTiltGroup.add(roofSpoiler);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.4, 0.2), windshieldMat);
    windshield.position.set(0, 4.1, -4.05);
    cabTiltGroup.add(windshield);

    // Deliverable 2: Physical Amber Turn Signal Meshes & PointLights on Cab Corners
    const leftBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x332200 });
    const rightBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x332200 });
    const blinkerGeo = new THREE.BoxGeometry(0.45, 0.35, 0.45);

    // Front & Rear Left Cab Blinkers
    const flBlinker = new THREE.Mesh(blinkerGeo, leftBlinkerMat);
    flBlinker.position.set(-1.92, 2.3, -4.05);
    cabTiltGroup.add(flBlinker);

    const rlBlinker = new THREE.Mesh(blinkerGeo, leftBlinkerMat);
    rlBlinker.position.set(-1.65, 1.35, 4.35);
    cabTiltGroup.add(rlBlinker);

    const leftBlinkerLight = new THREE.PointLight(0xf59e0b, 0, 12);
    leftBlinkerLight.position.set(-2.3, 2.4, -3.8);
    cabTiltGroup.add(leftBlinkerLight);

    // Front & Rear Right Cab Blinkers
    const frBlinker = new THREE.Mesh(blinkerGeo, rightBlinkerMat);
    frBlinker.position.set(1.92, 2.3, -4.05);
    cabTiltGroup.add(frBlinker);

    const rrBlinker = new THREE.Mesh(blinkerGeo, rightBlinkerMat);
    rrBlinker.position.set(1.65, 1.35, 4.35);
    cabTiltGroup.add(rrBlinker);

    const rightBlinkerLight = new THREE.PointLight(0xf59e0b, 0, 12);
    rightBlinkerLight.position.set(2.3, 2.4, -3.8);
    cabTiltGroup.add(rightBlinkerLight);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.65, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const frontLeftWheel = new THREE.Mesh(wheelGeo, chassisMat);
    frontLeftWheel.position.set(-1.85, 0.85, -2.3);
    cabTiltGroup.add(frontLeftWheel);

    const frontRightWheel = new THREE.Mesh(wheelGeo, chassisMat);
    frontRightWheel.position.set(1.85, 0.85, -2.3);
    cabTiltGroup.add(frontRightWheel);

    [-1.85, 1.85].forEach((wx) => {
      const rw = new THREE.Mesh(wheelGeo, chassisMat);
      rw.position.set(wx, 0.85, 2.2);
      cabTiltGroup.add(rw);
    });

    // BLUE REFRIGERATED TRAILER
    const trailerGroup = new THREE.Group();
    trailerGroup.position.set(7, 0, 44);
    const trailerTiltGroup = new THREE.Group();
    trailerGroup.add(trailerTiltGroup);
    scene.add(trailerGroup);

    const trailerBox = new THREE.Mesh(new THREE.BoxGeometry(4.3, 5.2, 17.5), blueTrailerMat);
    trailerBox.position.set(0, 4.1, 8.2);
    trailerTiltGroup.add(trailerBox);

    const reeferUnit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 0.9), whiteCabMat);
    reeferUnit.position.set(0, 4.2, -0.8);
    trailerTiltGroup.add(reeferUnit);

    // Trailer rear corner blinkers
    const tlTrailerBlinker = new THREE.Mesh(blinkerGeo, leftBlinkerMat);
    tlTrailerBlinker.position.set(-2.1, 2.0, 16.95);
    trailerTiltGroup.add(tlTrailerBlinker);

    const trTrailerBlinker = new THREE.Mesh(blinkerGeo, rightBlinkerMat);
    trTrailerBlinker.position.set(2.1, 2.0, 16.95);
    trailerTiltGroup.add(trTrailerBlinker);

    [11, 13.2, 15.4].forEach((twz) => {
      [-1.95, 1.95].forEach((twx) => {
        const tw = new THREE.Mesh(wheelGeo, chassisMat);
        tw.position.set(twx, 0.85, twz);
        trailerTiltGroup.add(tw);
      });
    });

    // Blue Hitch Target Ring
    const hitchRing = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 2.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
    );
    hitchRing.rotation.x = -Math.PI / 2;
    hitchRing.position.set(7, 0.12, 44);
    scene.add(hitchRing);

    // ==========================================
    // 7. AMBIENT TRAFFIC CARS ALONG ROUTE SEGMENTS & RAIN
    // ==========================================
    const trafficCars = [];
    const carColors = [0xd97706, 0x059669, 0x2563eb, 0xdc2626, 0x7c3aed];

    // Segment 1 Cars (along Z)
    [
      { x: -12, z: -120, vz: 22, vx: 0, minZ: -390, maxZ: -30, rotY: 0 },
      { x: 14, z: -250, vz: -15, vx: 0, minZ: -390, maxZ: -30, rotY: 0 },
      // Segment 2 Cars (along X at Z = -420)
      { x: -150, z: -432, vz: 0, vx: -16, minX: -480, maxX: -40, rotY: Math.PI / 2 },
      { x: -330, z: -408, vz: 0, vx: 22, minX: -480, maxX: -40, rotY: -Math.PI / 2 },
      // Segment 3 Cars (along Z at X = -520)
      { x: -532, z: -560, vz: 20, vx: 0, minZ: -770, maxZ: -460, rotY: 0 },
      { x: -506, z: -640, vz: -14, vx: 0, minZ: -770, maxZ: -460, rotY: 0 }
    ].forEach((cfg, i) => {
      const car = new THREE.Group();
      car.position.set(cfg.x, 0, cfg.z);
      car.rotation.y = cfg.rotY;
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 2.2, 7.2),
        new THREE.MeshLambertMaterial({ color: carColors[i % carColors.length] })
      );
      body.position.y = 1.4;
      car.add(body);
      scene.add(car);
      trafficCars.push({ mesh: car, ...cfg, cooldown: 0 });
    });

    // Rain Particles
    const rainCount = 1600;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i += 3) {
      rainPositions[i] = (Math.random() - 0.5) * 150;
      rainPositions[i + 1] = Math.random() * 50;
      rainPositions[i + 2] = (Math.random() - 0.5) * 150;
    }
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
    const rainMat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.4,
      transparent: true,
      opacity: isCyc ? 0.65 : isDet ? 0.35 : 0.0
    });
    const rainSystem = new THREE.Points(rainGeo, rainMat);
    scene.add(rainSystem);

    // ==========================================
    // 8. KEYBOARD (WITH [Q]/[E] BLINKERS) & ORBIT CAMERA CONTROLS
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
      if (k === 'h') forceHitchRef.current = true;

      // Deliverable 2: [Q] Left Turn Signal / [E] Right Turn Signal
      if (k === 'q' && !e.repeat) {
        simRef.current.blinker = simRef.current.blinker === 'LEFT' ? 'OFF' : 'LEFT';
      }
      if (k === 'e' && !e.repeat) {
        simRef.current.blinker = simRef.current.blinker === 'RIGHT' ? 'OFF' : 'RIGHT';
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
        -5,
        Math.min(18, camOrbitRef.current.pitchOffset + dy * 0.08)
      );
    };
    const onMouseUp = (e) => {
      if (e.button === 2) camOrbitRef.current.isRightDown = false;
    };
    const onWheel = (e) => {
      camOrbitRef.current.zoomDist = Math.max(
        14,
        Math.min(48, camOrbitRef.current.zoomDist + e.deltaY * 0.025)
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
    // 9. 60FPS PHYSICS, TURN SIGNAL ENFORCEMENT & RENDER LOOP
    // ==========================================
    const clock = new THREE.Clock();
    let animId;
    let hudTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const s = simRef.current;

      // Live Weather Lerp
      const curW = weatherRef.current;
      const cyc = curW === 'CYCLONE IMMINENT';
      const det = curW === 'DETERIORATING';
      const targetSky = cyc ? 0x1a2634 : det ? 0x4a5d6e : 0x74b9ff;
      scene.background.lerp(new THREE.Color(targetSky), dt * 1.8);
      scene.fog.color.lerp(new THREE.Color(targetSky), dt * 1.8);
      rainMat.opacity = THREE.MathUtils.lerp(
        rainMat.opacity,
        cyc ? 0.65 : det ? 0.35 : 0.0,
        dt * 2.0
      );

      if (rainMat.opacity > 0.01) {
        rainSystem.position.copy(cabGroup.position);
        const rPos = rainSystem.geometry.attributes.position;
        for (let i = 1; i < rPos.count * 3; i += 3) {
          rPos.array[i] -= 50 * dt;
          if (rPos.array[i] < 0) rPos.array[i] = 50;
        }
        rPos.needsUpdate = true;
      }

      // Pulse Hitch Target Ring in HITCH stage
      if (!s.isHitched && hitchRing.visible) {
        const pulseScale = 1 + Math.sin(elapsed * 5) * 0.08;
        hitchRing.scale.set(pulseScale, pulseScale, 1);
      }

      // Deliverable 2: 2Hz Turn Signal Blinker Flash on Cab & Trailer Meshes + PointLights
      const blinkWave = Math.floor(elapsed * 4) % 2 === 0;
      const leftActive = s.blinker === 'LEFT' && blinkWave;
      const rightActive = s.blinker === 'RIGHT' && blinkWave;

      leftBlinkerMat.color.setHex(leftActive ? 0xf59e0b : 0x332200);
      leftBlinkerLight.intensity = leftActive ? 2.2 : 0;

      rightBlinkerMat.color.setHex(rightActive ? 0xf59e0b : 0x332200);
      rightBlinkerLight.intensity = rightActive ? 2.2 : 0;

      // Update Traffic Light Cycles (8s GREEN -> 3s YELLOW -> 7s RED)
      trafficLights.forEach((tl) => {
        const cycleTime = (elapsed + tl.cycleOffset) % 18;
        if (cycleTime < 8) {
          tl.state = 'GREEN';
        } else if (cycleTime < 11) {
          tl.state = 'YELLOW';
        } else {
          tl.state = 'RED';
        }

        const isR = tl.state === 'RED';
        const isY = tl.state === 'YELLOW';
        const isG = tl.state === 'GREEN';

        tl.redBulbs.forEach((m) => m.color.setHex(isR ? 0xff1e1e : 0x2a0505));
        tl.yellowBulbs.forEach((m) => m.color.setHex(isY ? 0xfacc15 : 0x2a2005));
        tl.greenBulbs.forEach((m) => m.color.setHex(isG ? 0x2ecc71 : 0x052a10));
      });

      if (!s.isCrashed && !s.isFinished) {
        if (s.isHitched) {
          s.timeLeft = Math.max(0, s.timeLeft - dt);
          if (s.timeLeft <= 0) {
            s.isCrashed = true;
            setHud((prev) => ({
              ...prev,
              status: 'CRASHED',
              timeLeft: 0,
              failReason:
                'PORT GATE SLOT EXPIRED (00:00)! The container vessel departed Davao Port without your shipment.'
            }));
          }
        }
        if (s.governorTimer > 0) s.governorTimer = Math.max(0, s.governorTimer - dt);
        if (s.violationAlertTimer > 0) s.violationAlertTimer = Math.max(0, s.violationAlertTimer - dt);
        if (s.turnViolationTimer > 0) s.turnViolationTimer = Math.max(0, s.turnViolationTimer - dt);
        if (s.unsignaledPenaltyCooldown > 0) {
          s.unsignaledPenaltyCooldown = Math.max(0, s.unsignaledPenaltyCooldown - dt);
        }

        const activeMaxSpeed = s.governorTimer > 0 ? 20 : s.maxSpeedCap;

        // 1. THROTTLE, REVERSE & PNEUMATIC AIR BRAKES
        if (keysRef.current.space) {
          s.brakePressure = Math.min(100, s.brakePressure + 280 * dt);
          s.throttle = THREE.MathUtils.lerp(s.throttle, 0, 5.0 * dt);
          s.speed = THREE.MathUtils.lerp(s.speed, 0, 4.2 * dt);
          s.rollAngle *= Math.pow(0.25, dt);
        } else {
          s.brakePressure = Math.max(0, s.brakePressure - 220 * dt);
          if (keysRef.current.w) {
            s.throttle = Math.min(activeMaxSpeed, s.throttle + 26 * dt);
          } else if (keysRef.current.s) {
            if (s.speed > 2) {
              s.throttle = Math.max(0, s.throttle - 50 * dt);
            } else {
              s.throttle = Math.max(-18, s.throttle - 18 * dt);
            }
          } else {
            s.throttle *= Math.pow(0.5, dt);
          }
          if (s.throttle > activeMaxSpeed) s.throttle = activeMaxSpeed;
          s.speed += (s.throttle - s.speed) * 2.2 * dt;
        }

        // 2. STEERING & TRACTOR-TRAILER ARTICULATION
        const steerRate = 65;
        if (keysRef.current.a) {
          s.steerAngle = Math.min(38, s.steerAngle + steerRate * dt);
        } else if (keysRef.current.d) {
          s.steerAngle = Math.max(-38, s.steerAngle - steerRate * dt);
        } else {
          s.steerAngle *= Math.pow(0.14, dt);
        }

        const wheelSteerRad = THREE.MathUtils.degToRad(s.steerAngle * 0.75);
        frontLeftWheel.rotation.y = wheelSteerRad;
        frontRightWheel.rotation.y = wheelSteerRad;

        const moveStep = s.speed * 0.65 * dt;
        const cabTurnRate = (s.steerAngle / 38) * (s.speed / 19) * 1.25;
        s.cabHeading += cabTurnRate * dt;

        // Deliverable 2: Turn Signal Auto-Cancel & Unsignaled Turn Penalty (> 15° heading change at intersections)
        if (s.isHitched) {
          if (Math.abs(s.steerAngle) > 10 && !s.turnActive) {
            s.turnActive = true;
            s.turnStartHeading = s.cabHeading;
          }

          if (s.turnActive) {
            const headingDeltaDeg = THREE.MathUtils.radToDeg(s.cabHeading - s.turnStartHeading);

            // Check if near Junction 1 (0, -420) or Junction 2 (-520, -420)
            const distJct1 = Math.hypot(cabGroup.position.x - 0, cabGroup.position.z - -420);
            const distJct2 = Math.hypot(cabGroup.position.x - -520, cabGroup.position.z - -420);
            const inIntersectionZone = distJct1 < 55 || distJct2 < 55;

            if (
              inIntersectionZone &&
              Math.abs(headingDeltaDeg) > 15 &&
              s.unsignaledPenaltyCooldown <= 0
            ) {
              const requiredSignal = headingDeltaDeg > 0 ? 'LEFT' : 'RIGHT';
              if (s.blinker !== requiredSignal) {
                s.unsignaledPenaltyCooldown = 8.0;
                s.turnViolationTimer = 4.2;
                s.cameraShake = 1.1;
                s.health = Math.max(0, s.health - 5);

                if (s.health <= 0) {
                  s.isCrashed = true;
                  setHud((prev) => ({
                    ...prev,
                    status: 'CRASHED',
                    health: 0,
                    failReason: 'CARGO DESTROYED! Repeated unsignaled turns and road hazards ruined consignment integrity.'
                  }));
                }
              }
            }

            // Auto-cancel blinker once steering returns to center (< 5°) after completing a turn
            if (Math.abs(s.steerAngle) < 5) {
              if (Math.abs(headingDeltaDeg) > 15) {
                s.blinker = 'OFF';
              }
              s.turnActive = false;
            }
          }

          // Clamp max cab-to-trailer articulation angle to 65 degrees
          const maxArticulationRad = THREE.MathUtils.degToRad(65);
          const diff = s.cabHeading - s.trailerHeading;
          if (diff > maxArticulationRad) s.cabHeading = s.trailerHeading + maxArticulationRad;
          if (diff < -maxArticulationRad) s.cabHeading = s.trailerHeading - maxArticulationRad;
        }

        cabGroup.position.x -= Math.sin(s.cabHeading) * moveStep;
        cabGroup.position.z -= Math.cos(s.cabHeading) * moveStep;
        cabGroup.rotation.y = s.cabHeading;

        // 3. HITCHING & KINEMATIC TRAILER FOLLOW
        if (!s.isHitched) {
          const hitchWorldX = cabGroup.position.x + Math.sin(s.cabHeading) * 2.4;
          const hitchWorldZ = cabGroup.position.z + Math.cos(s.cabHeading) * 2.4;
          const distToTrailer = Math.hypot(hitchWorldX - 7, hitchWorldZ - 44);

          if (distToTrailer < 3.8 || forceHitchRef.current) {
            forceHitchRef.current = false;
            s.isHitched = true;
            s.speed = 0;
            s.throttle = 0;
            cabGroup.position.set(7, 0, 41.6);
            s.cabHeading = 0;
            s.trailerHeading = 0;
            s.turnStartHeading = 0;
            hitchRing.visible = false;
          }
        } else {
          const fifthWheelX = cabGroup.position.x + Math.sin(s.cabHeading) * 2.4;
          const fifthWheelZ = cabGroup.position.z + Math.cos(s.cabHeading) * 2.4;
          trailerGroup.position.set(fifthWheelX, 0, fifthWheelZ);

          const trailerWheelbase = 13.5;
          const angleDiff = s.cabHeading - s.trailerHeading;
          s.trailerHeading += (moveStep / trailerWheelbase) * Math.sin(angleDiff);
          trailerGroup.rotation.y = s.trailerHeading;
        }

        // 4. CENTRIFUGAL ROLLOVER / TILT PHYSICS (38° Limit)
        const wetRoadMultiplier = cyc ? 1.3 : det ? 1.15 : 1.0;
        const targetRoll =
          cabTurnRate * (Math.abs(s.speed) / 40) * 12 * s.weightFactor * wetRoadMultiplier;
        s.rollAngle = THREE.MathUtils.lerp(s.rollAngle, targetRoll, 3.5 * dt);

        cabTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle * 0.65);
        trailerTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);

        if (Math.abs(s.rollAngle) >= ROLLOVER_LIMIT) {
          s.isCrashed = true;
          s.health = 0;
          setHud((prev) => ({
            ...prev,
            status: 'CRASHED',
            health: 0,
            rollDeg: Math.round(Math.abs(s.rollAngle)),
            failReason: 'TRAILER ROLLED OVER! Took a junction turn too fast for cargo weight.'
          }));
        }

        // 5. RED LIGHT VIOLATIONS & TRAFFIC COLLISIONS
        if (s.isHitched) {
          trafficLights.forEach((tl) => {
            if (tl.violated || tl.state !== 'RED' || s.speed <= 5) return;

            let crossedStop = false;
            if (tl.axis === 'Z') {
              crossedStop =
                Math.abs(cabGroup.position.x - tl.stopX) < 16 &&
                cabGroup.position.z < tl.stopZ &&
                cabGroup.position.z > tl.stopZ - 16;
            } else {
              crossedStop =
                Math.abs(cabGroup.position.z - tl.stopZ) < 16 &&
                cabGroup.position.x < tl.stopX &&
                cabGroup.position.x > tl.stopX - 16;
            }

            if (crossedStop) {
              tl.violated = true;
              s.strikes += 1;
              s.health = Math.max(0, s.health - 10);
              s.governorTimer = 8.0;
              s.violationAlertTimer = 4.5;
              s.cameraShake = 1.5;

              setCameraFlash(true);
              setTimeout(() => setCameraFlash(false), 650);

              if (s.strikes >= 3 || s.health <= 0) {
                s.isCrashed = true;
                setHud((prev) => ({
                  ...prev,
                  status: 'CRASHED',
                  health: 0,
                  strikes: s.strikes,
                  failReason:
                    s.strikes >= 3
                      ? 'LICENSE REVOKED (3/3 RED LIGHT VIOLATIONS)! Port Authority terminated your freight contract.'
                      : 'CARGO DESTROYED! Reckless intersection violations ruined consignment integrity.'
                }));
              }
            }
          });

          // Update Ambient Traffic Cars
          trafficCars.forEach((tc) => {
            if (tc.cooldown > 0) tc.cooldown = Math.max(0, tc.cooldown - dt);

            if (tc.vz !== 0) {
              tc.mesh.position.z += tc.vz * dt;
              if (tc.mesh.position.z > tc.maxZ) tc.mesh.position.z = tc.minZ;
              if (tc.mesh.position.z < tc.minZ) tc.mesh.position.z = tc.maxZ;
            }
            if (tc.vx !== 0) {
              tc.mesh.position.x += tc.vx * dt;
              if (tc.mesh.position.x > tc.maxX) tc.mesh.position.x = tc.minX;
              if (tc.mesh.position.x < tc.minX) tc.mesh.position.x = tc.maxX;
            }

            const dx = cabGroup.position.x - tc.mesh.position.x;
            const dz = cabGroup.position.z - tc.mesh.position.z;
            if (Math.abs(dx) < 3.6 && Math.abs(dz) < 5.5 && tc.cooldown <= 0) {
              tc.cooldown = 1.5;
              s.health = Math.max(0, s.health - 20);
              s.speed = -8;
              s.throttle = 0;
              s.cameraShake = 1.8;
              s.rollAngle += (dx >= 0 ? -1 : 1) * 16;

              if (s.health <= 0) {
                s.isCrashed = true;
                setHud((prev) => ({
                  ...prev,
                  status: 'CRASHED',
                  health: 0,
                  failReason: 'HIGHWAY COLLISION! Cargo container damaged beyond export limits.'
                }));
              }
            }
          });

          // Track Route Leg Progression & Check Port Drop-Off Zone (X = -512, Z = -820)
          if (cabGroup.position.z < -390 && s.routeLeg === 1) {
            s.routeLeg = 2;
          }
          if (cabGroup.position.x < -490 && s.routeLeg === 2) {
            s.routeLeg = 3;
          }

          const distToDropZone = Math.hypot(
            cabGroup.position.x - (portCenterX + 8),
            cabGroup.position.z - portCenterZ
          );
          if (distToDropZone < 22) {
            s.isFinished = true;
            setHud((prev) => ({
              ...prev,
              status: 'DELIVERED',
              stage: 'DELIVERED',
              progress: 100,
              health: Math.round(s.health)
            }));
          }
        }
      } else if (s.isCrashed) {
        const flipTarget = s.rollAngle >= 0 ? 90 : -90;
        s.rollAngle += (flipTarget - s.rollAngle) * 3.0 * dt;
        cabTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        trailerTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
      }

      // ==========================================
      // 10. DELIVERABLE 6: HITCHING CAMERA ASSIST & CHASE CAMERA
      // ==========================================
      const orb = camOrbitRef.current;
      const isReversingForHitch = !s.isHitched && (keysRef.current.s || s.speed < -0.5);
      s.hitchCamBlend = THREE.MathUtils.lerp(
        s.hitchCamBlend,
        isReversingForHitch ? 1.0 : 0.0,
        4.5 * dt
      );

      const baseFollowAngle = s.isHitched
        ? s.trailerHeading * 0.72 + s.cabHeading * 0.28
        : s.cabHeading;

      const hitchAssistYaw = 0.52 * s.hitchCamBlend;
      const totalCamAngle = baseFollowAngle + orb.yawOffset + hitchAssistYaw;

      const normalCamDist = orb.zoomDist + (s.isHitched ? 4 : 0);
      const hitchAssistDist = 20;
      const camDist = THREE.MathUtils.lerp(normalCamDist, hitchAssistDist, s.hitchCamBlend);

      const normalCamHeight = Math.max(2.5, (s.isHitched ? 12.5 : 10.5) + orb.pitchOffset);
      const hitchAssistHeight = 19.5;
      const camHeight = THREE.MathUtils.lerp(normalCamHeight, hitchAssistHeight, s.hitchCamBlend);

      const targetCamX = cabGroup.position.x + Math.sin(totalCamAngle) * camDist;
      const targetCamZ = cabGroup.position.z + Math.cos(totalCamAngle) * camDist;

      camera.position.x += (targetCamX - camera.position.x) * 10 * dt;
      camera.position.z += (targetCamZ - camera.position.z) * 10 * dt;
      camera.position.y += (camHeight - camera.position.y) * 8 * dt;

      if (s.cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * s.cameraShake * 2;
        camera.position.y += (Math.random() - 0.5) * s.cameraShake * 2;
        s.cameraShake = Math.max(0, s.cameraShake - 3.5 * dt);
      }

      const fifthWheelWorldX = cabGroup.position.x + Math.sin(s.cabHeading) * 2.4;
      const fifthWheelWorldZ = cabGroup.position.z + Math.cos(s.cabHeading) * 2.4;
      const hitchMidX = (fifthWheelWorldX + 7) * 0.5;
      const hitchMidZ = (fifthWheelWorldZ + 44) * 0.5;

      const desiredLookX = THREE.MathUtils.lerp(cabGroup.position.x, hitchMidX, s.hitchCamBlend);
      const desiredLookY = THREE.MathUtils.lerp(3.2, 2.0, s.hitchCamBlend);
      const desiredLookZ = THREE.MathUtils.lerp(cabGroup.position.z, hitchMidZ, s.hitchCamBlend);

      camLookTarget.x = THREE.MathUtils.lerp(camLookTarget.x, desiredLookX, 10 * dt);
      camLookTarget.y = THREE.MathUtils.lerp(camLookTarget.y, desiredLookY, 10 * dt);
      camLookTarget.z = THREE.MathUtils.lerp(camLookTarget.z, desiredLookZ, 10 * dt);

      camera.lookAt(camLookTarget);

      // Update React HUD at 10Hz
      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        const absRoll = Math.round(Math.abs(s.rollAngle));
        const articulationDeg = Math.round(
          THREE.MathUtils.radToDeg(Math.abs(s.cabHeading - s.trailerHeading))
        );

        // Calculate Multi-Segment Route Progress & Deliverable 5 Navigation Breadcrumb
        let rawProg = 0;
        let navInstruction = '[ 🅿️ Reverse [S] into Blue Trailer (or Press [H]) ]';
        let upcomingLight = null;
        let nextLightDist = 0;

        if (s.isHitched) {
          const distLeg1 = Math.max(0, 41.6 - Math.max(-420, cabGroup.position.z)); // 0 to 461.6m
          const distLeg2 =
            cabGroup.position.z < -380
              ? Math.max(0, Math.min(520, -cabGroup.position.x))
              : 0; // 0 to 520m
          const distLeg3 =
            cabGroup.position.x < -480
              ? Math.max(0, Math.min(400, -420 - cabGroup.position.z))
              : 0; // 0 to 400m
          const totalDriven = distLeg1 + distLeg2 + distLeg3;
          rawProg = Math.min(99, Math.max(0, Math.round((totalDriven / 1380) * 100)));

          if (s.routeLeg === 1) {
            const distToTurn1 = Math.max(0, Math.round(cabGroup.position.z - -420));
            navInstruction = `[ ↰ ${distToTurn1}m: Signal [Q] & Turn Left at Highway Junction ]`;
            // Check Segment 1 lights
            for (let i = 0; i < 2; i++) {
              if (cabGroup.position.z > trafficLights[i].stopZ - 8) {
                upcomingLight = trafficLights[i];
                nextLightDist = Math.max(0, Math.round(cabGroup.position.z - trafficLights[i].stopZ));
                break;
              }
            }
          } else if (s.routeLeg === 2) {
            const distToTurn2 = Math.max(0, Math.round(cabGroup.position.x - -520));
            navInstruction = `[ ↱ ${distToTurn2}m: Signal [E] & Turn Right into Port Terminal ]`;
            if (cabGroup.position.x > trafficLights[2].stopX - 8) {
              upcomingLight = trafficLights[2];
              nextLightDist = Math.max(0, Math.round(cabGroup.position.x - trafficLights[2].stopX));
            }
          } else {
            const distToGate = Math.max(0, Math.round(cabGroup.position.z - portCenterZ));
            navInstruction =
              distToGate > 60
                ? `[ 🅿️ ${distToGate}m: Gate-In Drop Zone Ahead ]`
                : `[ 🅿️ Gate-In Zone Ahead ]`;
          }
        }

        const nextLightState = upcomingLight ? upcomingLight.state : 'CLEAR';

        setHud((prev) => ({
          ...prev,
          speed: Math.round(s.speed),
          steerDeg: Math.round(s.steerAngle),
          articulationDeg,
          rollDeg: absRoll,
          signedRollDeg: Math.round(s.rollAngle),
          brakePressure: Math.round(s.brakePressure),
          isBraking: keysRef.current.space,
          isReversingHitch: isReversingForHitch,
          violationAlertActive: s.violationAlertTimer > 0,
          turnViolationAlertActive: s.turnViolationTimer > 0,
          blinker: s.blinker,
          blinkOn: blinkWave,
          navInstruction,
          health: Math.round(s.health),
          progress: rawProg,
          timeLeft: Math.ceil(s.timeLeft),
          strikes: s.strikes,
          governorTimer: Math.ceil(s.governorTimer),
          nextLightState,
          nextLightDist,
          stage: s.isHitched ? 'HAUL' : 'HITCH'
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
  }, [weightKg]);

  // Deliverable 3: Rollover Danger Threshold (>= 22°) & Gauge Color
  const isDangerTilt = hud.rollDeg >= 22;
  const rollColor =
    hud.rollDeg >= 22 ? '#ef4444' : hud.rollDeg >= 14 ? '#f1c40f' : '#2ecc71';

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

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
      <style>{`
        @keyframes pulseDangerAlert {
          0%, 100% { transform: translateX(-50%) scale(1); box-shadow: 0 0 18px rgba(239, 68, 68, 0.45); }
          50% { transform: translateX(-50%) scale(1.03); box-shadow: 0 0 30px rgba(239, 68, 68, 0.85); }
        }
        @keyframes vignetteStrobe {
          0%, 100% { opacity: 0.95; }
          50% { opacity: 0.35; }
        }
      `}</style>

      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />

      {/* RED LIGHT RADIAL VIGNETTE STROBE */}
      {(cameraFlash || hud.violationAlertActive) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle, transparent 40%, rgba(239, 68, 68, 0.45) 100%)',
            pointerEvents: 'none',
            zIndex: 10010,
            animation: 'vignetteStrobe 0.45s infinite ease-in-out'
          }}
        />
      )}

      {/* DELIVERABLE 3: DANGER ZONE TILT WARNING OVERLAY (ONLY VISIBLE WHEN TILT >= 22°) */}
      {isDangerTilt && hud.status === 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            top: 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(239, 68, 68, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #fff',
            borderRadius: 999,
            padding: '10px 26px',
            color: '#fff',
            fontFamily: "'Space Mono', monospace",
            fontSize: 13,
            fontWeight: 'bold',
            letterSpacing: 0.8,
            zIndex: 10025,
            whiteSpace: 'nowrap',
            animation: 'pulseDangerAlert 0.6s infinite ease-in-out'
          }}
        >
          🚨 CRITICAL TILT ({hud.rollDeg}°): EASE OFF STEERING OR BRAKE [SPACE]
        </div>
      )}

      {/* DELIVERABLE 2: UNSIGNALED TURN VIOLATION ALERT */}
      {hud.turnViolationAlertActive && hud.status === 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            top: isDangerTilt ? 82 : 28,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 14, 23, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #f1c40f',
            boxShadow: '0 8px 28px rgba(241, 196, 15, 0.35)',
            borderRadius: 999,
            padding: '8px 22px',
            color: '#f1c40f',
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            fontWeight: 'bold',
            letterSpacing: 0.4,
            zIndex: 10020,
            whiteSpace: 'nowrap'
          }}
        >
          ⚠️ TRAFFIC VIOLATION: UNSIGNALED TURN (-5% Cargo Integrity)
        </div>
      )}

      {/* RED LIGHT VIOLATION HUD BANNER */}
      {hud.violationAlertActive && hud.status === 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            top: 130,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 14, 23, 0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid #ef4444',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.35)',
            borderRadius: 999,
            padding: '8px 22px',
            color: '#fff',
            fontFamily: "'Space Mono', monospace",
            fontSize: 12,
            fontWeight: 'bold',
            letterSpacing: 0.5,
            zIndex: 10015,
            whiteSpace: 'nowrap'
          }}
        >
          🚨 RED LIGHT VIOLATION (Strike {hud.strikes}/3) | Speed Governed to 20 km/h
        </div>
      )}

      {/* TOP LEFT: TRUCK, TIMER & TRAFFIC ENFORCEMENT TELEMETRY */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(10, 14, 23, 0.85)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 12,
          padding: '14px 18px',
          width: 305,
          color: '#fff'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: '#2ecc71', fontWeight: 700, letterSpacing: 0.5 }}>
            🚛 3D INLAND FREIGHT HAUL
          </span>
          <span
            style={{
              fontSize: 11,
              fontFamily: "'Space Mono', monospace",
              background: 'rgba(46, 204, 113, 0.15)',
              color: '#2ecc71',
              padding: '2px 8px',
              borderRadius: 4,
              fontWeight: 'bold'
            }}
          >
            {Number(weightKg).toLocaleString()} KG
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
          {cargo}
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
          ORIGIN: <strong style={{ color: '#cbd5e1' }}>{originHub}</strong> •{' '}
          <strong style={{ color: liveWeather === 'NOMINAL' ? '#2ecc71' : '#f1c40f' }}>{liveWeather}</strong>
        </div>

        {/* PORT SLOT COUNTDOWN TIMER BOX */}
        <div
          style={{
            background:
              hud.timeLeft <= 20 && hud.stage === 'HAUL'
                ? 'rgba(239, 68, 68, 0.18)'
                : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${
              hud.timeLeft <= 20 && hud.stage === 'HAUL'
                ? '#ef4444'
                : 'rgba(255, 255, 255, 0.08)'
            }`,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>⏱ PORT SLOT TIMER</span>
          <span
            style={{
              fontSize: 16,
              fontFamily: "'Space Mono', monospace",
              fontWeight: 'bold',
              color:
                hud.stage === 'HITCH'
                  ? '#f1c40f'
                  : hud.timeLeft <= 20
                  ? '#ef4444'
                  : '#38bdf8'
            }}
          >
            {hud.stage === 'HITCH' ? 'STANDBY' : formatTimer(hud.timeLeft)}
          </span>
        </div>

        {/* Cargo Integrity */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
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
        <div style={{ width: '100%', height: 6, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div
            style={{
              width: `${hud.health}%`,
              height: '100%',
              background: hud.health < 50 ? '#ef4444' : '#2ecc71',
              transition: 'width 0.2s'
            }}
          />
        </div>

        {/* Port Terminal Distance */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          <span>DAVAO PORT TERMINAL</span>
          <span style={{ fontFamily: "'Space Mono', monospace", color: '#38bdf8', fontWeight: 'bold' }}>
            {hud.progress}%
          </span>
        </div>
        <div style={{ width: '100%', height: 6, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div
            style={{
              width: `${hud.progress}%`,
              height: '100%',
              background: '#38bdf8',
              transition: 'width 0.2s'
            }}
          />
        </div>

        {/* Traffic Light & Strikes Row */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            color: '#cbd5e1',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: 8
          }}
        >
          <span>
            NEXT SIGNAL:{' '}
            <strong
              style={{
                fontFamily: "'Space Mono', monospace",
                color:
                  hud.nextLightState === 'RED'
                    ? '#ef4444'
                    : hud.nextLightState === 'YELLOW'
                    ? '#f1c40f'
                    : '#2ecc71'
              }}
            >
              {hud.nextLightState === 'CLEAR'
                ? 'CLEAR'
                : `${hud.nextLightState} (${hud.nextLightDist}m)`}
            </strong>
          </span>
          <span>
            STRIKES:{' '}
            <strong
              style={{
                fontFamily: "'Space Mono', monospace",
                color: hud.strikes > 0 ? '#ef4444' : '#94a3b8'
              }}
            >
              {hud.strikes}/3
            </strong>
          </span>
        </div>

        {hud.governorTimer > 0 && (
          <div
            style={{
              marginTop: 8,
              background: 'rgba(239, 68, 68, 0.16)',
              border: '1px solid #ef4444',
              color: '#ef4444',
              fontSize: 10,
              fontFamily: "'Space Mono', monospace",
              padding: '4px 8px',
              borderRadius: 6,
              textAlign: 'center',
              fontWeight: 'bold'
            }}
          >
            GOVERNOR ACTIVE: 20 KM/H ({hud.governorTimer}s)
          </div>
        )}

        {hud.stage === 'HITCH' && (
          <button
            onClick={() => {
              forceHitchRef.current = true;
            }}
            style={{
              marginTop: 10,
              width: '100%',
              background: '#2ecc71',
              color: '#0a0e17',
              border: 'none',
              padding: '8px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: "'Space Mono', monospace"
            }}
          >
            🔗 AUTO-HITCH TRAILER [H]
          </button>
        )}
      </div>

      {/* TOP RIGHT: [?] TOGGLE & [✕ EXIT TO MAP] */}
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
          <button
            type="button"
            onClick={() => {
              const next = !showControls;
              setShowControls(next);
              if (next) triggerControlsAutoFade();
            }}
            title="Toggle Controls Cheat Sheet"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: showControls ? 'rgba(56, 189, 248, 0.2)' : 'rgba(10, 14, 23, 0.85)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${showControls ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)'}`,
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
            onClick={onExit}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 10,
              background: 'rgba(10, 14, 23, 0.85)',
              backdropFilter: 'blur(12px)',
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

        {/* Auto-Fading Controls Cheat Sheet Overlay */}
        <div
          onMouseEnter={() => {
            if (controlsFadeTimerRef.current) clearTimeout(controlsFadeTimerRef.current);
          }}
          onMouseLeave={triggerControlsAutoFade}
          style={{
            background: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 12,
            padding: '12px 16px',
            color: '#cbd5e1',
            fontSize: 11,
            lineHeight: 1.75,
            width: 255,
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
            <span>DRIVING CONTROLS</span>
            <span style={{ fontSize: 9, color: '#64748b', fontFamily: "'Space Mono', monospace" }}>
              AUTO-HIDE
            </span>
          </div>
          <div>
            <strong style={{ color: '#2ecc71', fontFamily: "'Space Mono', monospace" }}>[W / S]</strong> Drive / Reverse Hitch
          </div>
          <div>
            <strong style={{ color: '#2ecc71', fontFamily: "'Space Mono', monospace" }}>[A / D]</strong> Steer Tractor Head
          </div>
          <div>
            <strong style={{ color: '#f1c40f', fontFamily: "'Space Mono', monospace" }}>[Q / E]</strong> Left / Right Turn Signal
          </div>
          <div>
            <strong style={{ color: '#ef4444', fontFamily: "'Space Mono', monospace" }}>[SPACE]</strong> Pneumatic Air Brakes
          </div>
          <div>
            <strong style={{ color: '#38bdf8', fontFamily: "'Space Mono', monospace" }}>[H]</strong> Instant Trailer Hitch
          </div>
          <div>
            <strong style={{ color: '#38bdf8', fontFamily: "'Space Mono', monospace" }}>[R-CLICK]</strong> Drag 360° Orbit Cam
          </div>
        </div>
      </div>

      {/* DELIVERABLE 2, 3 & 5: INTEGRATED BOTTOM DASHBOARD CLUSTER (WITH GPS NAV, BLINKERS & COMPACT ROLL GAUGE) */}
      <div
        style={{
          position: 'absolute',
          bottom: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          zIndex: 10015
        }}
      >
        {/* DELIVERABLE 5: SUBTLE GPS NAVIGATION BREADCRUMB PILL */}
        <div
          style={{
            background: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(56, 189, 248, 0.28)',
            borderRadius: 999,
            padding: '5px 18px',
            color: hud.isReversingHitch ? '#38bdf8' : '#e2e8f0',
            fontFamily: "'Space Mono', monospace",
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: 0.4,
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.4)'
          }}
        >
          {hud.isReversingHitch
            ? '🎥 [ HITCH ASSIST CAM ACTIVE — ALIGN KINGPIN WITH BLUE RING ]'
            : hud.navInstruction}
        </div>

        {/* MAIN INSTRUMENT CLUSTER */}
        <div
          style={{
            background: 'rgba(10, 14, 23, 0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '10px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)',
            minWidth: 540
          }}
        >
          {/* LEFT TURN SIGNAL ARROW [Q] */}
          <button
            type="button"
            onClick={() => {
              simRef.current.blinker = simRef.current.blinker === 'LEFT' ? 'OFF' : 'LEFT';
            }}
            title="Left Turn Signal [Q]"
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background:
                hud.blinker === 'LEFT' && hud.blinkOn
                  ? 'rgba(46, 204, 113, 0.25)'
                  : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                hud.blinker === 'LEFT' && hud.blinkOn
                  ? '#2ecc71'
                  : 'rgba(255, 255, 255, 0.08)'
              }`,
              color:
                hud.blinker === 'LEFT' && hud.blinkOn
                  ? '#2ecc71'
                  : '#64748b',
              boxShadow:
                hud.blinker === 'LEFT' && hud.blinkOn
                  ? '0 0 14px rgba(46, 204, 113, 0.5)'
                  : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: "'Space Mono', monospace",
              padding: 0
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>◄</span>
            <span style={{ fontSize: 8, opacity: 0.8 }}>[Q]</span>
          </button>

          {/* ACTIVE GEAR BADGE: [R] or [D] */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.8, marginBottom: 4 }}>
              GEAR
            </span>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: "'Space Mono', monospace",
                fontSize: 14,
                fontWeight: 'bold',
                background:
                  hud.speed < 0
                    ? 'rgba(241, 196, 15, 0.18)'
                    : 'rgba(46, 204, 113, 0.18)',
                border: `1px solid ${hud.speed < 0 ? '#f1c40f' : '#2ecc71'}`,
                color: hud.speed < 0 ? '#f1c40f' : '#2ecc71'
              }}
            >
              {hud.speed < 0 ? '[R]' : '[D]'}
            </div>
          </div>

          {/* DIGITAL SPEEDOMETER */}
          <div style={{ width: 110, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5 }}>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 26,
                  fontWeight: 'bold',
                  color: hud.governorTimer > 0 ? '#ef4444' : '#38bdf8',
                  lineHeight: 1
                }}
              >
                {Math.abs(hud.speed)}
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: '#94a3b8',
                  fontWeight: 'bold'
                }}
              >
                km/h
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 5,
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: 3,
                overflow: 'hidden',
                marginTop: 6
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (Math.abs(hud.speed) / 40) * 100)}%`,
                  height: '100%',
                  background:
                    hud.governorTimer > 0
                      ? '#ef4444'
                      : hud.speed < 0
                      ? '#f1c40f'
                      : '#38bdf8',
                  transition: 'width 0.1s linear'
                }}
              />
            </div>
          </div>

          {/* DELIVERABLE 3: COMPACT EMBEDDED GYRO ROLL & ARTICULATION METER */}
          <div
            style={{
              width: 135,
              display: 'flex',
              flexDirection: 'column',
              gap: 5,
              borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0 14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.5 }}>
                TILT / PIVOT
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10.5,
                  fontWeight: 'bold',
                  color: rollColor
                }}
              >
                {hud.rollDeg}° / {hud.articulationDeg}°
              </span>
            </div>

            {/* Compact Bi-Directional Roll Bar */}
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: 8,
                background: 'rgba(255, 255, 255, 0.06)',
                border: `1px solid ${isDangerTilt ? '#ef4444' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: 4,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${Math.min(100, (hud.rollDeg / ROLLOVER_LIMIT) * 100)}%`,
                  height: '100%',
                  background: rollColor,
                  transition: 'width 0.08s linear, background 0.15s ease'
                }}
              />
            </div>
          </div>

          {/* PNEUMATIC AIR BRAKE METER */}
          <div style={{ width: 110, display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: 0.5 }}>
                BRAKE [SPACE]
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  fontWeight: 'bold',
                  color: hud.isBraking ? '#ef4444' : '#64748b'
                }}
              >
                {hud.isBraking ? 'LOCK' : `${hud.brakePressure}%`}
              </span>
            </div>
            <div
              style={{
                width: '100%',
                height: 8,
                background: 'rgba(255, 255, 255, 0.06)',
                border: `1px solid ${hud.isBraking ? '#ef4444' : 'rgba(255, 255, 255, 0.08)'}`,
                borderRadius: 4,
                overflow: 'hidden'
              }}
            >
              <div
                style={{
                  width: `${hud.brakePressure}%`,
                  height: '100%',
                  background: hud.isBraking
                    ? 'linear-gradient(90deg, #f1c40f, #ef4444)'
                    : '#38bdf8',
                  transition: 'width 0.08s linear'
                }}
              />
            </div>
          </div>

          {/* RIGHT TURN SIGNAL ARROW [E] */}
          <button
            type="button"
            onClick={() => {
              simRef.current.blinker = simRef.current.blinker === 'RIGHT' ? 'OFF' : 'RIGHT';
            }}
            title="Right Turn Signal [E]"
            style={{
              width: 38,
              height: 38,
              borderRadius: 8,
              background:
                hud.blinker === 'RIGHT' && hud.blinkOn
                  ? 'rgba(46, 204, 113, 0.25)'
                  : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                hud.blinker === 'RIGHT' && hud.blinkOn
                  ? '#2ecc71'
                  : 'rgba(255, 255, 255, 0.08)'
              }`,
              color:
                hud.blinker === 'RIGHT' && hud.blinkOn
                  ? '#2ecc71'
                  : '#64748b',
              boxShadow:
                hud.blinker === 'RIGHT' && hud.blinkOn
                  ? '0 0 14px rgba(46, 204, 113, 0.5)'
                  : 'none',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontFamily: "'Space Mono', monospace",
              padding: 0
            }}
          >
            <span style={{ fontSize: 15, lineHeight: 1 }}>►</span>
            <span style={{ fontSize: 8, opacity: 0.8 }}>[E]</span>
          </button>
        </div>
      </div>

      {/* COMPLETION / CRASH MODAL */}
      {hud.status !== 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 8, 17, 0.82)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10030
          }}
        >
          <div
            style={{
              background: 'rgba(10, 14, 23, 0.92)',
              border: `1px solid ${hud.status === 'DELIVERED' ? '#2ecc71' : '#ef4444'}`,
              borderRadius: 16,
              padding: '32px 40px',
              textAlign: 'center',
              maxWidth: 440,
              color: '#fff',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)'
            }}
          >
            <h2
              style={{
                margin: '0 0 12px 0',
                fontFamily: "'Space Mono', monospace",
                fontSize: 20,
                color: hud.status === 'DELIVERED' ? '#2ecc71' : '#ef4444'
              }}
            >
              {hud.status === 'DELIVERED'
                ? '✅ PORT TERMINAL GATE-IN COMPLETE'
                : '💥 FREIGHT HAUL FAILED'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              {hud.status === 'DELIVERED'
                ? `Container hauled from ${originHub} to Davao Port Terminal with ${formatTimer(
                    hud.timeLeft
                  )} remaining! Cargo Integrity: ${hud.health}%.`
                : hud.failReason}
            </p>
            <button
              onClick={() =>
                onComplete({
                  success: hud.status === 'DELIVERED',
                  finalHealth: hud.status === 'DELIVERED' ? hud.health : 0
                })
              }
              style={{
                background: hud.status === 'DELIVERED' ? '#2ecc71' : '#ef4444',
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
              LOAD ONTO SEA VESSEL (RETURN TO MAP)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TruckHaul3D;