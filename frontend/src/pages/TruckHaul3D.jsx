// TruckHaul3D.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const CAMERA_MODES = [
  { id: 1, key: '1', label: 'DRONE CHASE' },
  { id: 2, key: '2', label: 'IN-CAB POV' },
  { id: 3, key: '3', label: 'ROADSIDE CCTV' },
  { id: 4, key: '4', label: 'FREE ORBIT' }
];

const TruckHaul3D = ({
  weatherState = 'NOMINAL',
  cargo = 'Cavendish Bananas',
  weightKg = 2500,
  originHub = 'Central Cold Storage',
  initialHealth = 100,
  remainingSeconds = 1420,
  onComplete,
  onExit
}) => {
  const mountRef = useRef(null);

  // Live Weather Sync
  const [liveWeather, setLiveWeather] = useState(weatherState || 'NOMINAL');
  const weatherRef = useRef(weatherState || 'NOMINAL');

  // Camera Director & Speed Multiplier States
  const [cameraMode, setCameraMode] = useState(1); // 1: Drone Chase, 2: In-Cab, 3: CCTV, 4: Free Orbit
  const cameraModeRef = useRef(1);

  const [simSpeed, setSimSpeed] = useState(1); // 1x or 2x
  const simSpeedRef = useRef(1);

  const teuCount = Math.max(1, Math.ceil((Number(weightKg) || 2500) / 25000));
  const isPerishable =
    originHub.toLowerCase().includes('cold') ||
    cargo.toLowerCase().includes('banana') ||
    cargo.toLowerCase().includes('food') ||
    cargo.toLowerCase().includes('perishable');

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
    speed: 35,
    rpm: 1450,
    fuelRate: 31.2,
    reeferTemp: -4.2,
    compressorStatus: 'ACTIVE',
    gear: 'D',
    steerDeg: 0,
    articulationDeg: 0,
    blinker: 'OFF', // 'OFF' | 'LEFT' | 'RIGHT'
    blinkOn: false,
    navStatus: 'AUTOPILOT: CRUISING NORTHBOUND CORRIDOR',
    nextLightState: 'GREEN',
    nextLightDist: 0,
    nextLightLabel: 'MIDWAY CROSSING',
    progress: 0,
    lapCount: 1,
    cutoffTimer: Math.max(0, Math.ceil(remainingSeconds)), // Synchronized Gate Appointment Countdown
    health: Math.round(initialHealth)
  });

  // Right-Click 360 Orbit Camera Ref
  const camOrbitRef = useRef({
    isRightDown: false,
    lastX: 0,
    lastY: 0,
    yawOffset: 0.35,
    pitchOffset: 2.5,
    zoomDist: 28
  });

  const switchCameraMode = (modeId) => {
    cameraModeRef.current = modeId;
    setCameraMode(modeId);
  };

  const toggleSimSpeed = () => {
    const next = simSpeedRef.current === 1 ? 2 : 1;
    simSpeedRef.current = next;
    setSimSpeed(next);
  };

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
    scene.fog = new THREE.FogExp2(skyHex, 0.0012);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    );
    camera.position.set(18, 14, 52);
    const camLookTarget = new THREE.Vector3(10, 3.2, 20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.05);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.25);
    dirLight.position.set(90, 170, 70);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ==========================================
    // 2. CLOSED-CIRCUIT INDUSTRIAL CORRIDOR GEOMETRY
    // ==========================================
    // Closed Rectangular Loop with Smoothly Chamfered Corners:
    // Leg 1 (Northbound Highway): X = 10, Z = +30 -> -410
    //Leg 2 (Westbound Coastal Bypass): Z = -420, X = 0 -> -510
    // Leg 3 (Southbound Port Terminal Approach): X = -520, Z = -430 -> +20
    // Leg 4 (Eastbound Return Connector): Z = +30, X = -510 -> 0

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
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3800, 3800), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Origin Depot Yard (Central Cold Storage / Panabo Facility)
    const yardAsphalt = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), asphaltMat);
    yardAsphalt.rotation.x = -Math.PI / 2;
    yardAsphalt.position.set(0, 0.01, 35);
    scene.add(yardAsphalt);

    const warehouseBuilding = new THREE.Mesh(new THREE.BoxGeometry(76, 18, 18), brickMat);
    warehouseBuilding.position.set(0, 9, 76);
    scene.add(warehouseBuilding);

    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(78, 1.4, 19), concreteMat);
    roofTrim.position.set(0, 18.2, 76);
    scene.add(roofTrim);

    const doorMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    [-22, -7, 7, 22].forEach((dx) => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(8.5, 10, 0.6), doorMat);
      door.position.set(dx, 5, 66.8);
      scene.add(door);
    });

    // --- LEG 1: NORTHBOUND HIGHWAY (X = 0, Z = +50 to -450) ---
    const seg1Shoulder = new THREE.Mesh(new THREE.PlaneGeometry(48, 500), shoulderMat);
    seg1Shoulder.rotation.x = -Math.PI / 2;
    seg1Shoulder.position.set(0, 0.015, -200);
    scene.add(seg1Shoulder);

    const seg1Asphalt = new THREE.Mesh(new THREE.PlaneGeometry(42, 500), asphaltMat);
    seg1Asphalt.rotation.x = -Math.PI / 2;
    seg1Asphalt.position.set(0, 0.02, -200);
    scene.add(seg1Asphalt);

    [-0.35, 0.35].forEach((yx) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 420), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(yx, 0.04, -195);
      scene.add(line);
    });

    // --- LEG 2: WESTBOUND COASTAL BYPASS (Z = -420, X = +25 to -545) ---
    const seg2Shoulder = new THREE.Mesh(new THREE.PlaneGeometry(580, 48), shoulderMat);
    seg2Shoulder.rotation.x = -Math.PI / 2;
    seg2Shoulder.position.set(-260, 0.016, -420);
    scene.add(seg2Shoulder);

    const seg2Asphalt = new THREE.Mesh(new THREE.PlaneGeometry(580, 42), asphaltMat);
    seg2Asphalt.rotation.x = -Math.PI / 2;
    seg2Asphalt.position.set(-260, 0.022, -420);
    scene.add(seg2Asphalt);

    [-0.35, 0.35].forEach((yz) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(480, 0.25), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-260, 0.042, -420 + yz);
      scene.add(line);
    });

    // --- LEG 3: SOUTHBOUND PORT CORRIDOR (X = -520, Z = -445 to +55) ---
    const seg3Shoulder = new THREE.Mesh(new THREE.PlaneGeometry(48, 500), shoulderMat);
    seg3Shoulder.rotation.x = -Math.PI / 2;
    seg3Shoulder.position.set(-520, 0.015, -195);
    scene.add(seg3Shoulder);

    const seg3Asphalt = new THREE.Mesh(new THREE.PlaneGeometry(42, 500), asphaltMat);
    seg3Asphalt.rotation.x = -Math.PI / 2;
    seg3Asphalt.position.set(-520, 0.02, -195);
    scene.add(seg3Asphalt);

    [-0.35, 0.35].forEach((yx) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 420), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-520 + yx, 0.04, -195);
      scene.add(line);
    });

    // --- LEG 4: EASTBOUND DEPOT RETURN CONNECTOR (Z = +30, X = -545 to +25) ---
    const seg4Shoulder = new THREE.Mesh(new THREE.PlaneGeometry(580, 48), shoulderMat);
    seg4Shoulder.rotation.x = -Math.PI / 2;
    seg4Shoulder.position.set(-260, 0.016, 30);
    scene.add(seg4Shoulder);

    const seg4Asphalt = new THREE.Mesh(new THREE.PlaneGeometry(580, 42), asphaltMat);
    seg4Asphalt.rotation.x = -Math.PI / 2;
    seg4Asphalt.position.set(-260, 0.022, 30);
    scene.add(seg4Asphalt);

    [-0.35, 0.35].forEach((yz) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(480, 0.25), yellowLineMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-260, 0.042, 30 + yz);
      scene.add(line);
    });

    // Davao Port Terminal Gate-In Complex (Along Leg 3 at X = -520, Z = -200)
    const portYard = new THREE.Mesh(new THREE.PlaneGeometry(95, 110), asphaltMat);
    portYard.rotation.x = -Math.PI / 2;
    portYard.position.set(-565, 0.025, -200);
    scene.add(portYard);

    const craneMat = new THREE.MeshLambertMaterial({ color: 0xeab308 });
    [-24, 24].forEach((cz) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 34, 2.4), craneMat);
      leg.position.set(-565, 17, -200 + cz);
      scene.add(leg);
    });
    const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 56), craneMat);
    craneBeam.position.set(-565, 33, -200);
    scene.add(craneBeam);

    // ==========================================
    // 3. TRAFFIC LIGHT GANTRIES AT INTERSECTIONS
    // ==========================================
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const trafficLights = [];

    const createGantry = (x, z, rotY, stopX, stopZ, legIndex, cycleOffset, label) => {
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
        legIndex,
        stopX,
        stopZ,
        cycleOffset,
        state: 'GREEN',
        redBulbs,
        yellowBulbs,
        greenBulbs
      });
    };

    // Signal 1: Mid-Highway Crossing on Leg 0 (Northbound)
    createGantry(22, -195, 0, 10.0, -175, 0, 0.0, 'MIDWAY INDUSTRIAL CROSSING');
    // Signal 2: Coastal Bypass Intersection on Leg 0 (Before Left Turn)
    createGantry(22, -405, 0, 10.0, -378, 0, 6.0, 'COASTAL BYPASS JUNCTION');
    // Signal 3: Port Terminal Approach Signal on Leg 2 (Before Left Turn into Port Corridor)
    createGantry(-505, -442, Math.PI / 2, -478, -410.0, 2, 12.0, 'PORT TERMINAL GATEWAY');

    // ==========================================
    // 4. BALANCED SCENERY: GREEN BUFFER VERGE & INDUSTRIAL WAREHOUSES
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

    let sceneryIdx = 0;
    for (let z = -35; z > -365; z -= 52) {
      spawnTreeCluster(-34, z);
      spawnTreeCluster(-46, z - 18);
      spawnIndustrialDepot(42, z, 0, sceneryIdx++);
    }

    const coastalVergeStrip = new THREE.Mesh(new THREE.PlaneGeometry(460, 40), coastalVergeMat);
    coastalVergeStrip.rotation.x = -Math.PI / 2;
    coastalVergeStrip.position.set(-260, 0.005, -375);
    scene.add(coastalVergeStrip);

    for (let x = -55; x > -455; x -= 52) {
      spawnTreeCluster(x, -382);
      spawnTreeCluster(x - 16, -368);
      spawnIndustrialDepot(x, -462, Math.PI / 2, sceneryIdx++);
    }

    for (let z = -355; z < -35; z += 56) {
      spawnTreeCluster(-482, z);
      if (Math.abs(z - -200) > 70) {
        spawnIndustrialDepot(-562, z, 0, sceneryIdx++);
      }
    }

    // ==========================================
    // 5. ARTICULATED TRACTOR CAB & BLUE REEFER TRAILER
    // ==========================================
    const cabGroup = new THREE.Group();
    cabGroup.position.set(10, 0, 10);
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

    // Physical Amber Turn Signal LEDs on Cab & Trailer
    const leftBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x332200 });
    const rightBlinkerMat = new THREE.MeshBasicMaterial({ color: 0x332200 });
    const blinkerGeo = new THREE.BoxGeometry(0.45, 0.35, 0.45);

    const flBlinker = new THREE.Mesh(blinkerGeo, leftBlinkerMat);
    flBlinker.position.set(-1.92, 2.3, -4.05);
    cabTiltGroup.add(flBlinker);

    const rlBlinker = new THREE.Mesh(blinkerGeo, leftBlinkerMat);
    rlBlinker.position.set(-1.65, 1.35, 4.35);
    cabTiltGroup.add(rlBlinker);

    const leftBlinkerLight = new THREE.PointLight(0xf59e0b, 0, 12);
    leftBlinkerLight.position.set(-2.3, 2.4, -3.8);
    cabTiltGroup.add(leftBlinkerLight);

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

    // BLUE REFRIGERATED TRAILER (Pre-Hitched for Digital Twin Operation)
    const trailerGroup = new THREE.Group();
    trailerGroup.position.set(10, 0, 12.4);
    const trailerTiltGroup = new THREE.Group();
    trailerGroup.add(trailerTiltGroup);
    scene.add(trailerGroup);

    const trailerBox = new THREE.Mesh(new THREE.BoxGeometry(4.3, 5.2, 17.5), blueTrailerMat);
    trailerBox.position.set(0, 4.1, 8.2);
    trailerTiltGroup.add(trailerBox);

    const reeferUnit = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 0.9), whiteCabMat);
    reeferUnit.position.set(0, 4.2, -0.8);
    trailerTiltGroup.add(reeferUnit);

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

    // Rain Particles
    const rainCount = 1500;
    const rainGeo = new THREE.BufferGeometry();
    const rainPositions = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount * 3; i += 3) {
      rainPositions[i] = (Math.random() - 0.5) * 160;
      rainPositions[i + 1] = Math.random() * 55;
      rainPositions[i + 2] = (Math.random() - 0.5) * 160;
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
    // 5B. DPWH OVERHEAD GANTRY, AMBIENT PHILIPPINE TRAFFIC & WEATHER PEDESTRIANS
    // ==========================================
    // 1. DPWH Overhead Highway Signage Gantry (60m before Coastal Bypass Intersection at Z = -340)
    const dpwhGroup = new THREE.Group();
    dpwhGroup.position.set(0, 0, -340);

    [-22, 22].forEach((px) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 16, 10), poleMat);
      post.position.set(px, 8, 0);
      dpwhGroup.add(post);
    });

    const trussBeam = new THREE.Mesh(new THREE.BoxGeometry(45, 0.8, 0.8), poleMat);
    trussBeam.position.set(0, 15.2, 0);
    dpwhGroup.add(trussBeam);

    // Canvas Texture for DPWH Directional Board
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 1024;
    signCanvas.height = 192;
    const sCtx = signCanvas.getContext('2d');
    sCtx.fillStyle = '#0f5132'; // DPWH Highway Green
    sCtx.fillRect(0, 0, 1024, 192);
    sCtx.strokeStyle = '#ffffff';
    sCtx.lineWidth = 8;
    sCtx.strokeRect(10, 10, 1004, 172);
    sCtx.fillStyle = '#ffffff';
    sCtx.font = 'bold 38px monospace';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('[ ⮌ CENTRAL COLD STORAGE | DAVAO PORT TERMINAL ➔ ]', 512, 96);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(32, 4.6, 0.4),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signBoard.position.set(0, 13.8, 0);
    dpwhGroup.add(signBoard);
    scene.add(dpwhGroup);

    // 2. Low-Poly Philippine Ambient Traffic (Oncoming Lanes + Red-Light Stopping)
    const ambientVehicles = [];

    // 2A. Philippine Stainless Jeepney (Oncoming Southbound on Leg 1: X = -10, moving +Z)
    const jeepneyGroup = new THREE.Group();
    const stainlessMat = new THREE.MeshLambertMaterial({ color: 0xd1d5db });
    const fiestaRedMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const fiestaYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const jeepBody = new THREE.Mesh(new THREE.BoxGeometry(3.1, 2.5, 8.2), stainlessMat);
    jeepBody.position.y = 1.6;
    jeepneyGroup.add(jeepBody);
    const jeepHood = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.5, 2.2), stainlessMat);
    jeepHood.position.set(0, 1.2, 4.8);
    jeepneyGroup.add(jeepHood);
    const stripeL = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 8.3), fiestaRedMat);
    stripeL.position.set(0, 2.3, 0);
    jeepneyGroup.add(stripeL);
    const jeepRoof = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.25, 7.6), fiestaYellowMat);
    jeepRoof.position.set(0, 2.95, -0.2);
    jeepneyGroup.add(jeepRoof);
    jeepneyGroup.position.set(-10, 0, -340);
    scene.add(jeepneyGroup);
    ambientVehicles.push({
      mesh: jeepneyGroup,
      axis: 'Z',
      dir: 1, // Moving +Z (Southbound in X = -10 RHS lane)
      baseSpeed: 22,
      minBound: -390,
      maxBound: 10,
      stopCoord: -205, // Stops before Midway Crossing when trafficLights[0] is RED
      lightIdx: 0
    });

    // 2B. White Ambulance with Red/Blue Flashing Beacons (Oncoming Eastbound on Leg 2: Z = -410, moving +X)
    const ambGroup = new THREE.Group();
    const ambBody = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 3.2, 7.6),
      new THREE.MeshLambertMaterial({ color: 0xffffff })
    );
    ambBody.position.y = 2.0;
    ambGroup.add(ambBody);
    const ambCross = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.45, 2.4), fiestaRedMat);
    ambCross.position.set(0, 2.2, 0);
    ambGroup.add(ambCross);
    const redBeaconMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const blueBeaconMat = new THREE.MeshBasicMaterial({ color: 0x0088ff });
    const redBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.45), redBeaconMat);
    redBeacon.position.set(-0.7, 3.75, 2.8);
    ambGroup.add(redBeacon);
    const blueBeacon = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.45), blueBeaconMat);
    blueBeacon.position.set(0.7, 3.75, 2.8);
    ambGroup.add(blueBeacon);
    ambGroup.rotation.y = Math.PI / 2;
    ambGroup.position.set(-380, 0, -410);
    scene.add(ambGroup);
    ambientVehicles.push({
      mesh: ambGroup,
      axis: 'X',
      dir: 1, // Moving +X (Eastbound in Z = -410 RHS lane)
      baseSpeed: 26,
      minBound: -490,
      maxBound: -25,
      stopCoord: -55,
      lightIdx: 1,
      isAmbulance: true,
      redBeaconMat,
      blueBeaconMat
    });

    // 2C. 2 Commuter Sedans in Oncoming Lanes
    const sedanColors = [0x0284c7, 0x10b981];
    [
      { x: -10, z: -110, axis: 'Z', dir: 1, minBound: -390, maxBound: 10, stopCoord: -205, lightIdx: 0, rotY: 0 },
      { x: -530, z: -310, axis: 'Z', dir: -1, minBound: -390, maxBound: 5, stopCoord: -365, lightIdx: 2, rotY: Math.PI }
    ].forEach((cfg, idx) => {
      const sedan = new THREE.Group();
      const sBody = new THREE.Mesh(
        new THREE.BoxGeometry(2.9, 1.4, 6.2),
        new THREE.MeshLambertMaterial({ color: sedanColors[idx] })
      );
      sBody.position.y = 1.1;
      sedan.add(sBody);
      const sCabin = new THREE.Mesh(
        new THREE.BoxGeometry(2.5, 1.1, 3.2),
        new THREE.MeshLambertMaterial({ color: 0x1e293b })
      );
      sCabin.position.set(0, 2.1, -0.3);
      sedan.add(sCabin);
      sedan.position.set(cfg.x, 0, cfg.z);
      sedan.rotation.y = cfg.rotY;
      scene.add(sedan);
      ambientVehicles.push({
        mesh: sedan,
        ...cfg,
        baseSpeed: 24
      });
    });

    // 3. Weather-Reactive Pedestrians ("Fade in Rain")
    const pedestrianMaterials = [];
    const pedestrians = [];
    const pedConfigs = [
      { x: 24, baseZ: 38, walkRange: 14, speed: 1.8, phase: 0.0 },
      { x: -16, baseZ: 48, walkRange: 10, speed: 1.5, phase: 1.3 },
      { x: 24, baseZ: -95, walkRange: 18, speed: 2.0, phase: 2.1 },
      { x: 24, baseZ: -250, walkRange: 16, speed: 1.7, phase: 3.4 },
      { x: -24, baseZ: -170, walkRange: 15, speed: 1.6, phase: 0.8 }
    ];
    const shirtPalette = [0x38bdf8, 0xfacc15, 0x2ecc71, 0xf97316, 0xa855f7];

    pedConfigs.forEach((pc, idx) => {
      const pedGroup = new THREE.Group();
      const torsoMat = new THREE.MeshLambertMaterial({
        color: shirtPalette[idx % shirtPalette.length],
        transparent: true,
        opacity: isCyc || isDet ? 0.0 : 1.0
      });
      const headMat = new THREE.MeshLambertMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: isCyc || isDet ? 0.0 : 1.0
      });
      pedestrianMaterials.push(torsoMat, headMat);

      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.48, 1.7, 8), torsoMat);
      torso.position.y = 1.15;
      pedGroup.add(torso);

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 8, 8), headMat);
      head.position.y = 2.35;
      pedGroup.add(head);

      pedGroup.position.set(pc.x, 0, pc.baseZ);
      pedGroup.visible = !(isCyc || isDet);
      scene.add(pedGroup);
      pedestrians.push({ group: pedGroup, ...pc });
    });
    let pedOpacity = isCyc || isDet ? 0.0 : 1.0;

    // ==========================================
    // 6. CLOSED-CIRCUIT AUTONOMOUS WAYPOINT GRAPH (PHILIPPINE RHS TRAFFIC)
    // ==========================================
    // Every segment and 90° left turn sweeps cleanly across the intersection into the
    // outer Right-Hand Side (RHS) lane relative to the double yellow centerline:
    // - Leg 1 Northbound (-Z): X = +10 (East of X = 0 centerline)
    // - Leg 2 Westbound (-X):  Z = -430 (North of Z = -420 centerline)
    // - Leg 3 Southbound (+Z): X = -530 (West of X = -520 centerline)
    // - Leg 4 Eastbound (+X):  Z = +40 (South of Z = +30 centerline)
    const waypoints = [
      { x: 10, z: -395, leg: 0, turnAfter: 'LEFT', label: 'NORTHBOUND INDUSTRIAL CORRIDOR (RHS)' },
      { x: -18, z: -430, leg: 1, turnAfter: 'OFF', label: 'JUNCTION 1: SWEEPING LEFT INTO NORTHERN RHS LANE' },
      { x: -495, z: -430, leg: 2, turnAfter: 'LEFT', label: 'WESTBOUND COASTAL PORT BYPASS (RHS)' },
      { x: -530, z: -392, leg: 3, turnAfter: 'OFF', label: 'JUNCTION 2: SWEEPING LEFT TO PORT APPROACH (RHS)' },
      { x: -530, z: 5, leg: 4, turnAfter: 'LEFT', label: 'DAVAO PORT TERMINAL GATEWAY CORRIDOR (RHS)' },
      { x: -492, z: 40, leg: 5, turnAfter: 'OFF', label: 'SOUTH TERMINAL RHS TURNAROUND' },
      { x: -18, z: 40, leg: 6, turnAfter: 'LEFT', label: 'EASTBOUND DEPOT CONNECTOR (RHS)' },
      { x: 10, z: 5, leg: 7, turnAfter: 'OFF', label: 'ORIGIN COLD STORAGE APPROACH (RHS)' }
    ];

    const autoState = {
      wpIndex: 0,
      speedKmh: 35,
      targetSpeedKmh: 35,
      cabHeading: 0,
      trailerHeading: 0,
      steerAngleDeg: 0,
      rollAngleDeg: 0,
      blinker: 'OFF',
      lapCount: 1,
      cutoffTimer: Math.max(0, Number(remainingSeconds) || 1420)
    };

    // Normalize angle difference to [-PI, PI]
    const normalizeAngle = (angle) => {
      let a = angle;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      return a;
    };

    // ==========================================
    // 7. CAMERA HOTKEYS ([1]-[4]) & RIGHT-CLICK ORBIT CONTROLS
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
        -4,
        Math.min(22, camOrbitRef.current.pitchOffset + dy * 0.08)
      );
    };
    const onMouseUp = (e) => {
      if (e.button === 2) camOrbitRef.current.isRightDown = false;
    };
    const onWheel = (e) => {
      camOrbitRef.current.zoomDist = Math.max(
        14,
        Math.min(55, camOrbitRef.current.zoomDist + e.deltaY * 0.025)
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
    // 8. 60FPS AUTONOMOUS KINEMATICS & DIGITAL TWIN LOOP
    // ==========================================
    const clock = new THREE.Clock();
    let animId;
    let hudAccum = 0;
    let simElapsed = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const rawDt = Math.min(clock.getDelta(), 0.05);
      const dt = rawDt * simSpeedRef.current;
      simElapsed += dt;
      autoState.cutoffTimer = Math.max(0, autoState.cutoffTimer - dt);

      // 1. Live Weather Sky, Fog & Rain Sync
      const curW = weatherRef.current;
      const cyc = curW === 'CYCLONE IMMINENT';
      const det = curW === 'DETERIORATING';
      const targetSky = cyc ? 0x1a2634 : det ? 0x4a5d6e : 0x74b9ff;
      scene.background.lerp(new THREE.Color(targetSky), rawDt * 1.8);
      scene.fog.color.lerp(new THREE.Color(targetSky), rawDt * 1.8);
      rainMat.opacity = THREE.MathUtils.lerp(
        rainMat.opacity,
        cyc ? 0.65 : det ? 0.35 : 0.0,
        rawDt * 2.0
      );

      if (rainMat.opacity > 0.01) {
        rainSystem.position.copy(cabGroup.position);
        const rPos = rainSystem.geometry.attributes.position;
        for (let i = 1; i < rPos.count * 3; i += 3) {
          rPos.array[i] -= 50 * dt;
          if (rPos.array[i] < 0) rPos.array[i] = 55;
        }
        rPos.needsUpdate = true;
      }

      // 2. Update Traffic Light Cycles (9s GREEN -> 3s YELLOW -> 6s RED)
      trafficLights.forEach((tl) => {
        const cycleTime = (simElapsed + tl.cycleOffset) % 18;
        if (cycleTime < 9) {
          tl.state = 'GREEN';
        } else if (cycleTime < 12) {
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

      // 3. Waypoint Progression & Traffic Signal Stop-Line Detection
      const targetWp = waypoints[autoState.wpIndex];
      const dx = targetWp.x - cabGroup.position.x;
      const dz = targetWp.z - cabGroup.position.z;
      const distToWp = Math.hypot(dx, dz);

      if (distToWp < 11) {
        autoState.wpIndex = (autoState.wpIndex + 1) % waypoints.length;
        if (autoState.wpIndex === 0) {
          autoState.lapCount += 1;
        }
      }

      const activeWp = waypoints[autoState.wpIndex];
      const toWpX = activeWp.x - cabGroup.position.x;
      const toWpZ = activeWp.z - cabGroup.position.z;
      const distToActiveWp = Math.hypot(toWpX, toWpZ);

      // Detect upcoming traffic light on current leg
      let upcomingLight = null;
      let stopDist = Infinity;

      trafficLights.forEach((tl) => {
        if (tl.legIndex === autoState.wpIndex) {
          // Calculate signed distance ahead of cab to the white stop line
          const forwardX = -Math.sin(autoState.cabHeading);
          const forwardZ = -Math.cos(autoState.cabHeading);
          const relX = tl.stopX - cabGroup.position.x;
          const relZ = tl.stopZ - cabGroup.position.z;
          const projDist = relX * forwardX + relZ * forwardZ;

          if (projDist > -2 && projDist < stopDist) {
            stopDist = projDist;
            upcomingLight = tl;
          }
        }
      });

      // Determine Target Cruising / Braking Speed
      let desiredSpeed = 35; // ~35 km/h cruising speed
      let navBanner = `AUTOPILOT: ${activeWp.label}`;

      // Smoothly slow down to 22 km/h when entering a 90-degree intersection turn
      if (activeWp.leg % 2 === 1 || distToActiveWp < 28) {
        desiredSpeed = 23;
      }

      // Traffic Light Braking Logic
      if (upcomingLight && (upcomingLight.state === 'RED' || upcomingLight.state === 'YELLOW')) {
        if (stopDist > 1.5 && stopDist < 48) {
          // Smooth proportional deceleration to stop cleanly at the white stop line
          const decelFactor = Math.max(0, (stopDist - 4.5) / 38);
          desiredSpeed = Math.min(desiredSpeed, decelFactor * 30);
          if (stopDist < 7.5) desiredSpeed = 0;
          navBanner = `SIGNAL HOLD: ${upcomingLight.state} AT ${upcomingLight.label} (${Math.max(
            0,
            Math.round(stopDist)
          )}m)`;
        }
      }

      // Smooth acceleration / deceleration
      const accelRate = desiredSpeed < autoState.speedKmh ? 4.2 : 2.0;
      autoState.speedKmh = THREE.MathUtils.lerp(autoState.speedKmh, desiredSpeed, accelRate * dt);
      if (autoState.speedKmh < 0.3 && desiredSpeed === 0) autoState.speedKmh = 0;

      // 4. Pure-Pursuit Steering & Kinematics
      const desiredHeading = Math.atan2(-toWpX, -toWpZ);
      const headingError = normalizeAngle(desiredHeading - autoState.cabHeading);

      const targetSteerDeg = THREE.MathUtils.clamp(
        THREE.MathUtils.radToDeg(headingError) * 1.15,
        -34,
        34
      );
      autoState.steerAngleDeg = THREE.MathUtils.lerp(
        autoState.steerAngleDeg,
        targetSteerDeg,
        6.0 * dt
      );

      const wheelSteerRad = THREE.MathUtils.degToRad(autoState.steerAngleDeg * 0.75);
      frontLeftWheel.rotation.y = wheelSteerRad;
      frontRightWheel.rotation.y = wheelSteerRad;

      const moveStep = autoState.speedKmh * 0.62 * dt;
      if (moveStep > 0.0001) {
        const turnRate = (autoState.steerAngleDeg / 34) * (autoState.speedKmh / 20) * 1.12;
        autoState.cabHeading = normalizeAngle(autoState.cabHeading + turnRate * dt);

        cabGroup.position.x -= Math.sin(autoState.cabHeading) * moveStep;
        cabGroup.position.z -= Math.cos(autoState.cabHeading) * moveStep;
        cabGroup.rotation.y = autoState.cabHeading;

        // Fifth-Wheel Kinematic Trailer Follow
        const fifthWheelX = cabGroup.position.x + Math.sin(autoState.cabHeading) * 2.4;
        const fifthWheelZ = cabGroup.position.z + Math.cos(autoState.cabHeading) * 2.4;
        trailerGroup.position.set(fifthWheelX, 0, fifthWheelZ);

        const trailerWheelbase = 13.5;
        const angleDiff = normalizeAngle(autoState.cabHeading - autoState.trailerHeading);
        autoState.trailerHeading = normalizeAngle(
          autoState.trailerHeading + (moveStep / trailerWheelbase) * Math.sin(angleDiff)
        );
        trailerGroup.rotation.y = autoState.trailerHeading;

        // Subtle realistic cab/trailer suspension roll in curves
        const targetRoll = -turnRate * (autoState.speedKmh / 35) * 4.5;
        autoState.rollAngleDeg = THREE.MathUtils.lerp(autoState.rollAngleDeg, targetRoll, 4.0 * dt);
        cabTiltGroup.rotation.z = THREE.MathUtils.degToRad(autoState.rollAngleDeg * 0.65);
        trailerTiltGroup.rotation.z = THREE.MathUtils.degToRad(autoState.rollAngleDeg);
      }

      // 5. Automated Turn Signals (Activate 3 Seconds Prior to Turn, Cancel on Straight)
      const speedMetersPerSec = Math.max(3, autoState.speedKmh * 0.62);
      const secondsToWaypoint = distToActiveWp / speedMetersPerSec;

      if (activeWp.turnAfter !== 'OFF' && secondsToWaypoint <= 3.4) {
        autoState.blinker = activeWp.turnAfter;
      } else if (Math.abs(autoState.steerAngleDeg) > 6) {
        autoState.blinker = autoState.steerAngleDeg > 0 ? 'LEFT' : 'RIGHT';
      } else {
        autoState.blinker = 'OFF';
      }

      // 2Hz Turn Signal Flash on Cab & Trailer LEDs
      const blinkWave = Math.floor(simElapsed * 4) % 2 === 0;
      const leftActive = autoState.blinker === 'LEFT' && blinkWave;
      const rightActive = autoState.blinker === 'RIGHT' && blinkWave;

      leftBlinkerMat.color.setHex(leftActive ? 0xf59e0b : 0x332200);
      leftBlinkerLight.intensity = leftActive ? 2.2 : 0;

      rightBlinkerMat.color.setHex(rightActive ? 0xf59e0b : 0x332200);
      rightBlinkerLight.intensity = rightActive ? 2.2 : 0;

     // 6. Animate Ambient Philippine Traffic & Red-Light Stopping
      const emergencyStrobe = Math.floor(simElapsed * 8) % 2 === 0;
      ambientVehicles.forEach((av) => {
        if (av.isAmbulance) {
          av.redBeaconMat.color.setHex(emergencyStrobe ? 0xff1e1e : 0x330505);
          av.blueBeaconMat.color.setHex(!emergencyStrobe ? 0x38bdf8 : 0x051533);
        }

        const linkedLight = trafficLights[av.lightIdx];
        let vSpeed = av.baseSpeed;
        const posCoord = av.axis === 'Z' ? av.mesh.position.z : av.mesh.position.x;
        const distToStop = (av.stopCoord - posCoord) * av.dir;

        if (
          linkedLight &&
          (linkedLight.state === 'RED' || linkedLight.state === 'YELLOW') &&
          distToStop > 0 &&
          distToStop < 28
        ) {
          vSpeed = distToStop < 5 ? 0 : av.baseSpeed * (distToStop / 28);
        }

        if (av.axis === 'Z') {
          av.mesh.position.z += av.dir * vSpeed * dt;
          if (av.dir > 0 && av.mesh.position.z > av.maxBound) av.mesh.position.z = av.minBound;
          if (av.dir < 0 && av.mesh.position.z < av.minBound) av.mesh.position.z = av.maxBound;
        } else {
          av.mesh.position.x += av.dir * vSpeed * dt;
          if (av.dir > 0 && av.mesh.position.x > av.maxBound) av.mesh.position.x = av.minBound;
          if (av.dir < 0 && av.mesh.position.x < av.minBound) av.mesh.position.x = av.maxBound;
        }
      });

      // 7. Weather-Reactive Pedestrians ("Fade in Rain" over ~2s & Disable Draw Calls at 0)
      const targetPedOpacity = curW === 'NOMINAL' ? 1.0 : 0.0;
      pedOpacity = THREE.MathUtils.lerp(pedOpacity, targetPedOpacity, rawDt * 1.2);
      if (Math.abs(pedOpacity - targetPedOpacity) < 0.01) pedOpacity = targetPedOpacity;

      pedestrianMaterials.forEach((mat) => {
        mat.opacity = pedOpacity;
      });

      pedestrians.forEach((ped) => {
        if (pedOpacity <= 0.02) {
          ped.group.visible = false;
        } else {
          ped.group.visible = true;
          ped.group.position.z =
            ped.baseZ + Math.sin(simElapsed * ped.speed + ped.phase) * ped.walkRange;
          ped.group.position.y = Math.abs(Math.sin(simElapsed * 6 + ped.phase)) * 0.12;
        }
      });

      // ==========================================
      // 9. MULTI-CAMERA DIRECTOR ([1] CHASE, [2] IN-CAB, [3] CCTV, [4] ORBIT)
      // ==========================================
      const mode = cameraModeRef.current;
      const orb = camOrbitRef.current;

      // Hide solid cab shell & windshield in In-Cab POV so geometry never blocks the lens
      const isInCab = mode === 2 || mode === 'CAB';
      cabBox.visible = !isInCab;
      windshield.visible = !isInCab;
      roofSpoiler.visible = !isInCab;

      if (mode === 1) {
        // [1] Drone Chase Camera
        const followAngle =
          autoState.trailerHeading * 0.65 + autoState.cabHeading * 0.35 + (orb.isRightDown ? orb.yawOffset : 0.22);
        const camDist = 28;
        const camHeight = 13.5;

        const targetX = cabGroup.position.x + Math.sin(followAngle) * camDist;
        const targetZ = cabGroup.position.z + Math.cos(followAngle) * camDist;

        camera.position.lerp(new THREE.Vector3(targetX, camHeight, targetZ), 6.0 * rawDt);
        camLookTarget.lerp(
          new THREE.Vector3(cabGroup.position.x, 3.5, cabGroup.position.z),
          8.0 * rawDt
        );
        camera.lookAt(camLookTarget);
      } else if (isInCab) {
        // [2] In-Cab First-Person Perspective (Philippine Left-Hand Drive: X = -0.8, Y = 3.75, Z = -3.6)
        const forwardX = -Math.sin(autoState.cabHeading);
        const forwardZ = -Math.cos(autoState.cabHeading);
        const rightX = Math.cos(autoState.cabHeading);
        const rightZ = -Math.sin(autoState.cabHeading);

        // Local offset (-0.8m left driver seat, +3.6m forward toward windshield, 3.75m eye height)
        const cabCamX = cabGroup.position.x + rightX * -0.8 + forwardX * 3.6;
        const cabCamZ = cabGroup.position.z + rightZ * -0.8 + forwardZ * 3.6;

        camera.position.set(cabCamX, 3.75, cabCamZ);
        camLookTarget.set(
          cabCamX + forwardX * 55,
          3.45,
          cabCamZ + forwardZ * 55
        );
        camera.lookAt(camLookTarget);
      } else if (mode === 3) {
        // [3] Roadside CCTV Surveillance Angle (Auto-selects nearest junction/corridor camera)
        let cctvPos = new THREE.Vector3(26, 16, -355);
        if (cabGroup.position.x < -220 && cabGroup.position.z < -260) {
          cctvPos.set(-475, 17, -445);
        } else if (cabGroup.position.x < -350 && cabGroup.position.z >= -260) {
          cctvPos.set(-548, 16, -155);
        } else if (cabGroup.position.z > -120) {
          cctvPos.set(28, 15, -45);
        }
        camera.position.lerp(cctvPos, 5.0 * rawDt);
        camLookTarget.lerp(
          new THREE.Vector3(cabGroup.position.x, 3.2, cabGroup.position.z),
          10.0 * rawDt
        );
        camera.lookAt(camLookTarget);
      } else {
        // [4] Free 360° Orbit Camera (Right-Click Drag + Scroll Zoom)
        const totalAngle = autoState.cabHeading + orb.yawOffset;
        const dist = orb.zoomDist;
        const height = Math.max(3.0, 12.0 + orb.pitchOffset);

        const targetX = cabGroup.position.x + Math.sin(totalAngle) * dist;
        const targetZ = cabGroup.position.z + Math.cos(totalAngle) * dist;

        camera.position.lerp(new THREE.Vector3(targetX, height, targetZ), 8.0 * rawDt);
        camLookTarget.lerp(
          new THREE.Vector3(cabGroup.position.x, 3.2, cabGroup.position.z),
          10.0 * rawDt
        );
        camera.lookAt(camLookTarget);
      }

      // ==========================================
      // 10. 10HZ INDUSTRIAL IoT TELEMATICS HUD SYNC
      // ==========================================
      hudAccum += rawDt;
      if (hudAccum > 0.1) {
        hudAccum = 0;

        const speedRounded = Math.round(autoState.speedKmh);
        const rpm =
          speedRounded === 0
            ? 680 + Math.round(Math.sin(simElapsed * 3) * 15)
            : Math.round(1120 + (autoState.speedKmh / 35) * 360 + Math.sin(simElapsed * 5) * 18);

        const fuelRate =
          speedRounded === 0
            ? 3.8
            : Number((26.4 + (autoState.speedKmh / 35) * 5.2 + (weightKg / 25000) * 2.1).toFixed(1));

        const reeferTemp = isPerishable
          ? Number((-4.2 + Math.sin(simElapsed * 0.4) * 0.1).toFixed(1))
          : 18.5;

        const articulationDeg = Math.round(
          THREE.MathUtils.radToDeg(
            Math.abs(normalizeAngle(autoState.cabHeading - autoState.trailerHeading))
          )
        );

        const routeProgress = Math.min(
          100,
          Math.round(((autoState.wpIndex + (1 - Math.min(1, distToActiveWp / 420))) / waypoints.length) * 100)
        );

        setHud({
          speed: speedRounded,
          rpm,
          fuelRate,
          reeferTemp,
          compressorStatus: isPerishable ? 'ACTIVE (MODULATING)' : 'STANDBY (AMBIENT)',
          gear: speedRounded === 0 ? 'IDLE' : 'D',
          steerDeg: Math.round(autoState.steerAngleDeg),
          articulationDeg,
          blinker: autoState.blinker,
          blinkOn: blinkWave,
          navStatus: navBanner,
          nextLightState: upcomingLight ? upcomingLight.state : 'GREEN',
          nextLightDist: upcomingLight ? Math.max(0, Math.round(stopDist)) : 0,
          nextLightLabel: upcomingLight ? upcomingLight.label : 'CORRIDOR CLEAR',
          progress: routeProgress,
          lapCount: autoState.lapCount,
          cutoffTimer: Math.ceil(autoState.cutoffTimer),
          health: Math.round(initialHealth)
        });
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
  }, [weightKg, initialHealth, isPerishable]);

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
      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />

      {/* TOP CENTER PHASE PILL & PORT CUT-OFF WINDOW */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(14px)',
          border: '1px solid rgba(56, 189, 248, 0.28)',
          borderRadius: 999,
          padding: '8px 20px',
          color: '#f1f5f9',
          zIndex: 10020,
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.45)'
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#2ecc71',
            boxShadow: '0 0 8px #2ecc71'
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
          ORIGIN HAUL: DEPOT ➔ PORT TERMINAL
        </span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#cbd5e1' }}>
          PORT CUT-OFF:{' '}
          <strong style={{ color: '#2ecc71' }}>{formatTimer(hud.cutoffTimer)}</strong>
        </span>
      </div>

      {/* LEFT PANEL: INDUSTRIAL IoT COLD-CHAIN & FLEET TELEMATICS */}
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
          width: 330,
          color: '#fff',
          zIndex: 10020,
          boxShadow: '0 16px 40px rgba(0, 0, 0, 0.5)'
        }}
      >
        {/* Header */}
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
            📡 DIGITAL TWIN TELEMATICS
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
            AUTONOMOUS
          </span>
        </div>

        {/* Cargo Title & Weight / TEU Specs */}
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
          {Number(weightKg).toLocaleString()} KG • {teuCount} TEU •{' '}
          <strong style={{ color: liveWeather === 'NOMINAL' ? '#2ecc71' : '#f1c40f' }}>
            {liveWeather}
          </strong>
        </div>

        {/* Cold Chain Monitor Box */}
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
            <span
              style={{
                fontSize: 10,
                color: '#94a3b8',
                fontWeight: 700,
                letterSpacing: 0.5
              }}
            >
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
              <div style={{ fontSize: 9, color: '#64748b' }}>INTERNAL REEFER TEMP</div>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: '#38bdf8' }}>
                {hud.reeferTemp > 0 ? `+${hud.reeferTemp}` : hud.reeferTemp}°C
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: '#64748b' }}>COMPRESSOR CYCLING</div>
              <div style={{ fontSize: 11, fontWeight: 'bold', color: '#e2e8f0' }}>
                {hud.compressorStatus}
              </div>
            </div>
          </div>
        </div>

        {/* Vehicle Telemetry Grid */}
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
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>ENGINE RPM</div>
            <div
              style={{
                fontSize: 13,
                fontFamily: "'Space Mono', monospace",
                fontWeight: 'bold',
                color: '#f1f5f9',
                marginTop: 2
              }}
            >
              {hud.rpm.toLocaleString()}
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 8,
              padding: '8px'
            }}
          >
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700 }}>CRUISE SPD</div>
            <div
              style={{
                fontSize: 13,
                fontFamily: "'Space Mono', monospace",
                fontWeight: 'bold',
                color: '#38bdf8',
                marginTop: 2
              }}
            >
              {hud.speed} km/h
            </div>
          </div>

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
              {hud.fuelRate} L/100
            </div>
          </div>
        </div>

        {/* Traffic Signal Telemetry */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 10.5,
            color: '#cbd5e1',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: 10,
            marginBottom: 10
          }}
        >
          <span>NEXT SIGNAL INTERLOCK:</span>
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
            {hud.nextLightState}{' '}
            {hud.nextLightDist > 0 && hud.nextLightDist < 120 ? `(${hud.nextLightDist}m)` : ''}
          </strong>
        </div>

        {/* Compliance Badges */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 6,
            fontFamily: "'Space Mono', monospace",
            fontSize: 9.5,
            color: '#94a3b8',
            background: 'rgba(130, 160, 255, 0.06)',
            border: '1px solid rgba(130, 160, 255, 0.18)',
            borderRadius: 6,
            padding: '6px 8px',
            marginBottom: 12
          }}
        >
          <span style={{ color: '#2ecc71', fontWeight: 'bold' }}>[GRADE A CONTAINER]</span>
          <span>•</span>
          <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>[LASHING: SECURED]</span>
        </div>

        {/* Complete Haul -> Vessel Stage CTA */}
        <button
          type="button"
          onClick={() =>
            onComplete &&
            onComplete({
              success: true,
              finalHealth: 100
            })
          }
          style={{
            width: '100%',
            background: '#2ecc71',
            color: '#060911',
            border: 'none',
            padding: '10px 14px',
            borderRadius: 8,
            fontFamily: "'Space Mono', monospace",
            fontSize: 11.5,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 0.4,
            boxShadow: '0 4px 14px rgba(46, 204, 113, 0.35)',
            transition: 'all 0.2s ease'
          }}
        >
          COMPLETE HAUL ➔ VESSEL STAGE
        </button>
      </div>

      {/* TOP RIGHT: MULTI-CAMERA DIRECTOR ([1]-[4]), SPEED TOGGLE & EXIT */}
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
          {/* 1x / 2x Simulation Speed Toggle */}
          <button
            type="button"
            onClick={toggleSimSpeed}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              background:
                simSpeed === 2 ? 'rgba(56, 189, 248, 0.2)' : 'rgba(10, 14, 23, 0.88)',
              backdropFilter: 'blur(12px)',
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
            onClick={onExit}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 10,
              background: 'rgba(10, 14, 23, 0.88)',
              backdropFilter: 'blur(12px)',
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

        {/* Multi-Camera Director Pill Bar */}
        <div
          style={{
            display: 'flex',
            gap: 6,
            background: 'rgba(10, 14, 23, 0.88)',
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
                  background: active ? 'rgba(56, 189, 248, 0.18)' : 'transparent',
                  border: `1px solid ${active ? '#38bdf8' : 'transparent'}`,
                  color: active ? '#38bdf8' : '#94a3b8',
                  borderRadius: 8,
                  padding: '6px 10px',
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  fontWeight: 'bold',
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

      {/* BOTTOM CENTER: COMPACT AUTONOMOUS TELEMETRY & SIGNAL CLUSTER */}
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
        {/* Active Waypoint / Signal Status Breadcrumb */}
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
          {hud.navStatus}
        </div>

        {/* Main Bottom Instrument Cluster */}
        <div
          style={{
            background: 'rgba(10, 14, 23, 0.9)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 16,
            padding: '10px 22px',
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            boxShadow: '0 12px 32px rgba(0, 0, 0, 0.5)'
          }}
        >
          {/* Left Turn Indicator */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background:
                hud.blinker === 'LEFT' && hud.blinkOn
                  ? 'rgba(245, 158, 11, 0.25)'
                  : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                hud.blinker === 'LEFT' && hud.blinkOn
                  ? '#f59e0b'
                  : 'rgba(255, 255, 255, 0.08)'
              }`,
              color: hud.blinker === 'LEFT' && hud.blinkOn ? '#f59e0b' : '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Space Mono', monospace",
              fontSize: 15
            }}
          >
            ◄
          </div>

          {/* Gear Indicator (D / IDLE) */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 3 }}>
              DRIVE STATE
            </div>
            <div
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                fontWeight: 'bold',
                background:
                  hud.gear === 'IDLE'
                    ? 'rgba(241, 196, 15, 0.16)'
                    : 'rgba(46, 204, 113, 0.16)',
                border: `1px solid ${hud.gear === 'IDLE' ? '#f1c40f' : '#2ecc71'}`,
                color: hud.gear === 'IDLE' ? '#f1c40f' : '#2ecc71'
              }}
            >
              {hud.gear}
            </div>
          </div>

          {/* Digital Speedometer */}
          <div style={{ width: 95, textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 4 }}>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 25,
                  fontWeight: 'bold',
                  color: '#38bdf8',
                  lineHeight: 1
                }}
              >
                {hud.speed}
              </span>
              <span
                style={{
                  fontFamily: "'Space Mono', monospace",
                  fontSize: 10,
                  color: '#94a3b8'
                }}
              >
                km/h
              </span>
            </div>
          </div>

          {/* Steering & Fifth-Wheel Articulation Readout */}
          <div
            style={{
              borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
              borderRight: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '0 16px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 3 }}>
              STEER / FIFTH-WHEEL
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                color: '#e2e8f0',
                fontWeight: 'bold'
              }}
            >
              {hud.steerDeg}° / {hud.articulationDeg}°
            </div>
          </div>

          {/* Signal Interlock Status */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, marginBottom: 3 }}>
              SIGNAL STATUS
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 12,
                fontWeight: 'bold',
                color:
                  hud.nextLightState === 'RED'
                    ? '#ef4444'
                    : hud.nextLightState === 'YELLOW'
                    ? '#f1c40f'
                    : '#2ecc71'
              }}
            >
              {hud.nextLightState}
            </div>
          </div>

          {/* Right Turn Indicator */}
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background:
                hud.blinker === 'RIGHT' && hud.blinkOn
                  ? 'rgba(245, 158, 11, 0.25)'
                  : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                hud.blinker === 'RIGHT' && hud.blinkOn
                  ? '#f59e0b'
                  : 'rgba(255, 255, 255, 0.08)'
              }`,
              color: hud.blinker === 'RIGHT' && hud.blinkOn ? '#f59e0b' : '#475569',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Space Mono', monospace",
              fontSize: 15
            }}
          >
            ►
          </div>
        </div>
      </div>
    </div>
  );
};

export default TruckHaul3D;