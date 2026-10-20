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
    health: Math.round(initialHealth),
    progress: 0,
    timeLeft: 90,
    strikes: 0,
    governorTimer: 0,
    nextLightState: 'GREEN',
    nextLightDist: 0,
    stage: 'HITCH', // 'HITCH' -> 'HAUL' -> 'DELIVERED' | 'CRASHED'
    status: 'ACTIVE',
    failReason: '',
    warning: 'REVERSE [S] INTO THE BLUE TRAILER TO HITCH CARGO (OR PRESS [H] TO AUTO-HITCH)'
  });

  const [cameraFlash, setCameraFlash] = useState(false);
  const [decisionPrompt, setDecisionPrompt] = useState(null);
  const decisionActiveRef = useRef(null);

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
    cabHeading: 0,        // Tractor Head orientation
    trailerHeading: 0,    // Blue Trailer orientation (lags behind cab!)
    rollAngle: 0,
    health: Number(initialHealth) || 100,
    timeLeft: 90,         // 90-second Port Gate Slot Countdown once hitched
    strikes: 0,           // 3 Red Light Violations = Contract Terminated
    governorTimer: 0,     // 8-second 30 km/h speed limiter penalty
    violationAlertTimer: 0,
    isHitched: false,
    isFinished: false,
    isCrashed: false,
    cameraShake: 0,
    maxSpeedCap: 40,      // 🔥 Capped at 40 km/h for smooth, controllable handling!
    weightFactor: 0.7 + (Number(weightKg || 2500) / 5000) * 0.75,
    targetPortZ: -1350,   // Longer 4-Lane Highway to Port!
    decision1Done: false,
    decision2Done: false
  });

  const ROLLOVER_LIMIT = 38;

  const setActiveDecision = (promptObj) => {
    decisionActiveRef.current = promptObj;
    setDecisionPrompt(promptObj);
  };

  const handleDecisionChoice = (option) => {
    const s = simRef.current;
    const cur = decisionActiveRef.current;
    if (!cur || s.isCrashed || s.isFinished) return;

    if (cur.id === 'WEIGH_STATION') {
      if (option === 1) {
        s.speed = 18;
        s.throttle = 18;
      } else {
        s.health = Math.max(10, s.health - 6);
        s.speed = Math.min(s.maxSpeedCap, s.speed + 12);
      }
    } else if (cur.id === 'ROUTE_FORK') {
      if (option === 1) {
        // Inner Fast Freight Lane
        s.steerAngle = 12;
      } else {
        // Outer Wide Coastal Lane
        s.steerAngle = -12;
        s.rollAngle *= 0.3;
      }
    }
    setActiveDecision(null);
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
    scene.fog = new THREE.FogExp2(skyHex, 0.0014);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.5,
      1600
    );
    camera.position.set(7, 12, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x334155, 1.0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffbeb, 1.25);
    dirLight.position.set(80, 150, 50);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ==========================================
    // 2. GROUND, WAREHOUSE DOCK & 4-LANE DIVIDED HIGHWAY
    // ==========================================
    const grassMat = new THREE.MeshLambertMaterial({ color: 0x2d4c1e });
    const asphaltMat = new THREE.MeshLambertMaterial({ color: 0x26292e });
    const shoulderMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const brickMat = new THREE.MeshLambertMaterial({ color: 0x7c3f2c });
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0x64748b });
    const yellowLineMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const whiteLineMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });

    // World Ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), grassMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.1;
    scene.add(ground);

    // Warehouse Yard Asphalt (Spacious so gate never hits truck!)
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

    // 4 Roll-Up Loading Dock Doors
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

    // Adjacent Parked Grey Trailer in Bay 4
    const parkedTrailer = new THREE.Mesh(
      new THREE.BoxGeometry(4.4, 5.2, 16.5),
      new THREE.MeshLambertMaterial({ color: 0x94a3b8 })
    );
    parkedTrailer.position.set(21, 3.8, 46);
    scene.add(parkedTrailer);

    // 🔥 4-LANE DIVIDED HIGHWAY (Width: 44m, Length: 1,500m)
    // Lanes: X = -15 (Oncoming Outer), X = -5.5 (Oncoming Inner) | X = +5.5 (Player Fast Lane), X = +15 (Player Freight Lane)
    const highwayShoulder = new THREE.Mesh(new THREE.PlaneGeometry(48, 1500), shoulderMat);
    highwayShoulder.rotation.x = -Math.PI / 2;
    highwayShoulder.position.set(0, 0.015, -720);
    scene.add(highwayShoulder);

    const highwayAsphalt = new THREE.Mesh(new THREE.PlaneGeometry(42, 1500), asphaltMat);
    highwayAsphalt.rotation.x = -Math.PI / 2;
    highwayAsphalt.position.set(0, 0.02, -720);
    scene.add(highwayAsphalt);

    // Double Yellow Center Divider Line (Separates Northbound & Southbound 2x2 Lanes)
    [-0.35, 0.35].forEach((yx) => {
      const centerLine = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 1450), yellowLineMat);
      centerLine.rotation.x = -Math.PI / 2;
      centerLine.position.set(yx, 0.04, -720);
      scene.add(centerLine);
    });

    // Dashed White Lane Dividers for all 4 Lanes (at X = -10.2 and X = +10.2)
    for (let z = -30; z > -1340; z -= 20) {
      [-10.2, 10.2].forEach((lx) => {
        const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 8), whiteLineMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(lx, 0.04, z);
        scene.add(dash);
      });
    }

    // ==========================================
    // 3. INTERSECTIONS WITH LEFT/RIGHT ROUTES & 3D TRAFFIC LIGHTS
    // ==========================================
    const intersectionZList = [-340, -720, -1080];
    const trafficLights = [];
    const crossCars = [];
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });

    intersectionZList.forEach((iz, idx) => {
      // Cross-Street Road extending 500m Left & Right!
      const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(520, 32), asphaltMat);
      crossRoad.rotation.x = -Math.PI / 2;
      crossRoad.position.set(0, 0.025, iz);
      scene.add(crossRoad);

      // Cross-Street Center Yellow Line
      const crossYellow = new THREE.Mesh(new THREE.PlaneGeometry(520, 0.35), yellowLineMat);
      crossYellow.rotation.x = -Math.PI / 2;
      crossYellow.position.set(0, 0.045, iz);
      scene.add(crossYellow);

      // White Stop Line on Player's Northbound Side (Z = iz + 18)
      const stopLine = new THREE.Mesh(new THREE.PlaneGeometry(20.5, 1.2), whiteLineMat);
      stopLine.rotation.x = -Math.PI / 2;
      stopLine.position.set(10.2, 0.05, iz + 18);
      scene.add(stopLine);

      // Overhead Traffic Light Gantry Pole on Right Side of Intersection
      const gantryGroup = new THREE.Group();
      gantryGroup.position.set(22, 0, iz - 16);

      const vPole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 15, 10), poleMat);
      vPole.position.y = 7.5;
      gantryGroup.add(vPole);

      const hArm = new THREE.Mesh(new THREE.BoxGeometry(22, 0.45, 0.45), poleMat);
      hArm.position.set(-11, 14.2, 0);
      gantryGroup.add(hArm);

      // 2 Signal Heads (One over each of the player's 2 lanes: X = +5.5 and X = +15)
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

      trafficLights.push({
        z: iz,
        stopZ: iz + 18,
        cycleOffset: idx * 6.5, // Staggered timing
        state: 'GREEN',
        violated: false,
        redBulbs,
        yellowBulbs,
        greenBulbs
      });

      // Spawn Cross-Traffic Vehicles on Left/Right Intersections
      [-1, 1].forEach((dir) => {
        const cCar = new THREE.Group();
        cCar.position.set(dir * -65, 0, iz + (dir > 0 ? 6 : -6));
        cCar.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        const cBody = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 2.8, 8.5),
          new THREE.MeshLambertMaterial({ color: dir > 0 ? 0xf59e0b : 0xec4899 })
        );
        cBody.position.y = 1.6;
        cCar.add(cBody);
        scene.add(cCar);

        crossCars.push({
          mesh: cCar,
          intersectionIdx: idx,
          dir,
          speed: 26,
          baseZ: iz + (dir > 0 ? 6 : -6),
          cooldown: 0
        });
      });
    });

    // Roadside City Buildings & Trees outside the 4-Lane Highway
    const bldgMat1 = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const bldgMat2 = new THREE.MeshLambertMaterial({ color: 0x6b4435 });
    const treeMat = new THREE.MeshLambertMaterial({ color: 0x1e3f20 });

    for (let z = -60; z > -1300; z -= 60) {
      // Skip placing buildings right in the middle of the Left/Right Cross-Streets
      if (intersectionZList.some((iz) => Math.abs(z - iz) < 35)) continue;

      [-38, 38].forEach((bx, i) => {
        if ((Math.abs(z) + i) % 2 === 0) {
          const h = 18 + (Math.abs(z) % 18);
          const bldg = new THREE.Mesh(
            new THREE.BoxGeometry(18, h, 28),
            i === 0 ? bldgMat1 : bldgMat2
          );
          bldg.position.set(bx, h / 2, z);
          scene.add(bldg);
        } else {
          const tree = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 7), treeMat);
          tree.position.set(bx, 7, z);
          scene.add(tree);
        }
      });
    }

    // ==========================================
    // 4. PORT TERMINAL DROP-OFF YARD (AT Z = -1350)
    // ==========================================
    const portYard = new THREE.Mesh(new THREE.PlaneGeometry(110, 100), asphaltMat);
    portYard.rotation.x = -Math.PI / 2;
    portYard.position.set(0, 0.03, simRef.current.targetPortZ);
    scene.add(portYard);

    const dropZoneGroup = new THREE.Group();
    dropZoneGroup.position.set(10, 0.06, simRef.current.targetPortZ);
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
    [-12, 32].forEach((cx) => {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(2.4, 34, 2.4), craneMat);
      leg.position.set(cx, 17, simRef.current.targetPortZ - 28);
      scene.add(leg);
    });
    const craneBeam = new THREE.Mesh(new THREE.BoxGeometry(52, 2.6, 3.2), craneMat);
    craneBeam.position.set(10, 33, simRef.current.targetPortZ - 28);
    scene.add(craneBeam);

    // ==========================================
    // 5. ARTICULATED TRACTOR CAB (HEAD) & BLUE TRAILER (BODY)
    // ==========================================
    const cabGroup = new THREE.Group();
    cabGroup.position.set(7, 0, 22); // Starts in front of Bay 3
    const cabTiltGroup = new THREE.Group();
    cabGroup.add(cabTiltGroup);
    scene.add(cabGroup);

    const whiteCabMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const chassisMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const windshieldMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const blueTrailerMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });

    // Tractor Chassis & Fifth-Wheel Kingpin Plate (at Z = +2.4 behind cab center)
    const frameMesh = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 8.8), chassisMat);
    frameMesh.position.set(0, 1.1, 0);
    cabTiltGroup.add(frameMesh);

    const hitchPlate = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 12), chassisMat);
    hitchPlate.position.set(0, 1.65, 2.4);
    cabTiltGroup.add(hitchPlate);

    // White Boxy Tractor Head
    const cabBox = new THREE.Mesh(new THREE.BoxGeometry(3.8, 4.4, 4.2), whiteCabMat);
    cabBox.position.set(0, 3.5, -2.0);
    cabTiltGroup.add(cabBox);

    const roofSpoiler = new THREE.Mesh(new THREE.BoxGeometry(3.7, 0.9, 2.6), whiteCabMat);
    roofSpoiler.position.set(0, 6.0, -1.6);
    cabTiltGroup.add(roofSpoiler);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.4, 0.2), windshieldMat);
    windshield.position.set(0, 4.1, -4.05);
    cabTiltGroup.add(windshield);

    // Steerable Front Wheels + Rear Drive Wheels
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

    // BLUE REFRIGERATED TRAILER (Pivots around its own Kingpin at local Z = 0!)
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

    [11, 13.2, 15.4].forEach((twz) => {
      [-1.95, 1.95].forEach((twx) => {
        const tw = new THREE.Mesh(wheelGeo, chassisMat);
        tw.position.set(twx, 0.85, twz);
        trailerTiltGroup.add(tw);
      });
    });

    // Green Hitch Target Ring
    const hitchRing = new THREE.Mesh(
      new THREE.RingGeometry(1.7, 2.4, 24),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide })
    );
    hitchRing.rotation.x = -Math.PI / 2;
    hitchRing.position.set(7, 0.12, 44);
    scene.add(hitchRing);

    // ==========================================
    // 6. 4-LANE HIGHWAY TRAFFIC CARS & RAIN
    // ==========================================
    const trafficCars = [];
    const carColors = [0xd97706, 0x059669, 0x2563eb, 0xdc2626, 0x7c3aed];
    const laneConfigs = [
      { laneX: -15.0, z: -180, speed: 24, dir: 1 },   // Oncoming Outer Lane
      { laneX: -5.5, z: -420, speed: 28, dir: 1 },    // Oncoming Inner Lane
      { laneX: 15.0, z: -260, speed: 15, dir: -1 },   // Player Slow Freight Lane
      { laneX: 5.5, z: -560, speed: 20, dir: -1 },    // Player Fast Overtaking Lane
      { laneX: -15.0, z: -780, speed: 25, dir: 1 },
      { laneX: 15.0, z: -890, speed: 16, dir: -1 },
      { laneX: -5.5, z: -1050, speed: 27, dir: 1 },
      { laneX: 5.5, z: -1180, speed: 18, dir: -1 }
    ];

    laneConfigs.forEach((ts, i) => {
      const car = new THREE.Group();
      car.position.set(ts.laneX, 0, ts.z);
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(3.2, 2.2, 7.2),
        new THREE.MeshLambertMaterial({ color: carColors[i % carColors.length] })
      );
      body.position.y = 1.4;
      car.add(body);
      scene.add(car);
      trafficCars.push({ mesh: car, vx: ts.speed * ts.dir, cooldown: 0 });
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
    // 7. KEYBOARD & RIGHT-CLICK ORBIT CAMERA CONTROLS
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
    // 8. 60FPS REAL ARTICULATED TRUCK & TRAFFIC LIGHT LOOP
    // ==========================================
    const clock = new THREE.Clock();
    let animId;
    let hudTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const rawDt = Math.min(clock.getDelta(), 0.05);
      const timeScale = decisionActiveRef.current ? 0.15 : 1.0;
      const dt = rawDt * timeScale;
      const elapsed = clock.getElapsedTime();
      const s = simRef.current;

      // Live Weather Lerp
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
          rPos.array[i] -= 50 * rawDt;
          if (rPos.array[i] < 0) rPos.array[i] = 50;
        }
        rPos.needsUpdate = true;
      }

      // ==========================================
      // UPDATE 3D TRAFFIC LIGHT CYCLES (8s GREEN -> 3s YELLOW -> 7s RED)
      // ==========================================
      trafficLights.forEach((tl, idx) => {
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
        // Count down timers when hitched
        if (s.isHitched) {
          s.timeLeft = Math.max(0, s.timeLeft - dt);
          if (s.timeLeft <= 0) {
            s.isCrashed = true;
            setActiveDecision(null);
            setHud((prev) => ({
              ...prev,
              status: 'CRASHED',
              timeLeft: 0,
              failReason:
                'PORT GATE SLOT EXPIRED (00:00)! The container vessel departed Davao Port without your shipment.'
            }));
          }
        }
        if (s.governorTimer > 0) s.governorTimer = Math.max(0, s.governorTimer - rawDt);
        if (s.violationAlertTimer > 0) s.violationAlertTimer = Math.max(0, s.violationAlertTimer - rawDt);

        // Effective Top Speed (20 km/h if Red-Light Governor Penalty is active!)
        const activeMaxSpeed = s.governorTimer > 0 ? 20 : s.maxSpeedCap;

        // 1. THROTTLE, REVERSE & SPACEBAR AIR BRAKES
        if (keysRef.current.space) {
          s.throttle = THREE.MathUtils.lerp(s.throttle, 0, 5.0 * dt);
          s.speed = THREE.MathUtils.lerp(s.speed, 0, 4.2 * dt);
          s.rollAngle *= Math.pow(0.25, dt);
        } else {
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

        // 2. REAL TRACTOR-TRAILER ARTICULATION ("HEAD TURNS FIRST, BODY FOLLOWS!")
        const steerRate = 65;
        if (keysRef.current.a) {
          s.steerAngle = Math.min(38, s.steerAngle + steerRate * dt);
        } else if (keysRef.current.d) {
          s.steerAngle = Math.max(-38, s.steerAngle - steerRate * dt);
        } else {
          s.steerAngle *= Math.pow(0.14, dt);
        }

        // Visually turn the front wheels on the tractor cab!
        const wheelSteerRad = THREE.MathUtils.degToRad(s.steerAngle * 0.75);
        frontLeftWheel.rotation.y = wheelSteerRad;
        frontRightWheel.rotation.y = wheelSteerRad;

        const moveStep = s.speed * 0.65 * dt;
        // Tractor Head has a short 5.5m wheelbase -> turns sharply and immediately!
        const cabTurnRate = (s.steerAngle / 38) * (s.speed / 19) * 1.25;
        s.cabHeading += cabTurnRate * dt;

        // Clamp max cab-to-trailer articulation angle to 65 degrees (prevents impossible 180 folding)
        if (s.isHitched) {
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
            hitchRing.visible = false;
          }
        } else {
          // Fifth-Wheel Kingpin Position on the back of the Tractor Cab
          const fifthWheelX = cabGroup.position.x + Math.sin(s.cabHeading) * 2.4;
          const fifthWheelZ = cabGroup.position.z + Math.cos(s.cabHeading) * 2.4;
          trailerGroup.position.set(fifthWheelX, 0, fifthWheelZ);

          // True Trailer Wheelbase Kinematics: d(theta_trailer) = (ds / L_trailer) * sin(theta_cab - theta_trailer)
          // Because L_trailer = 13.5m (long!), the head turns first and the blue trailer body smoothly trails behind!
          const trailerWheelbase = 13.5;
          const angleDiff = s.cabHeading - s.trailerHeading;
          s.trailerHeading += (moveStep / trailerWheelbase) * Math.sin(angleDiff);
          trailerGroup.rotation.y = s.trailerHeading;
        }

        // 4. CENTRIFUGAL ROLLOVER / TILT PHYSICS (Tuned for 40 km/h stability)
        const wetRoadMultiplier = cyc ? 1.3 : det ? 1.15 : 1.0;
        const targetRoll =
          cabTurnRate * (Math.abs(s.speed) / 40) * 12 * s.weightFactor * wetRoadMultiplier;
        s.rollAngle = THREE.MathUtils.lerp(s.rollAngle, targetRoll, 3.5 * dt);

        cabTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle * 0.65);
        trailerTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);

        if (Math.abs(s.rollAngle) >= ROLLOVER_LIMIT) {
          s.isCrashed = true;
          s.health = 0;
          setActiveDecision(null);
          setHud((prev) => ({
            ...prev,
            status: 'CRASHED',
            health: 0,
            rollDeg: Math.round(Math.abs(s.rollAngle)),
            failReason: 'TRAILER ROLLED OVER! Took a highway turn too fast for cargo weight.'
          }));
        }

        // ==========================================
        // 5. RED LIGHT VIOLATION DETECTION & PENALTIES
        // ==========================================
        if (s.isHitched) {
          trafficLights.forEach((tl) => {
            // Check if truck crosses the white stop line (between Z = stopZ and Z = tl.z) while light is RED
            if (
              !tl.violated &&
              cabGroup.position.z < tl.stopZ &&
              cabGroup.position.z > tl.z - 5 &&
              tl.state === 'RED' &&
              s.speed > 5
            ) {
              tl.violated = true;
              s.strikes += 1;
              s.health = Math.max(0, s.health - 10); // -10% Cargo Integrity from intersection hazard
              s.governorTimer = 8.0;                 // 8-second 30 km/h speed limiter penalty
              s.violationAlertTimer = 4.0;
              s.cameraShake = 1.5;

              // Trigger Red-Light Camera Flash on Screen
              setCameraFlash(true);
              setTimeout(() => setCameraFlash(false), 180);

              if (s.strikes >= 3 || s.health <= 0) {
                s.isCrashed = true;
                setActiveDecision(null);
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

          // Cross-Traffic Cars move across Left/Right Intersections when Player's Light is RED!
          crossCars.forEach((cc) => {
            if (cc.cooldown > 0) cc.cooldown = Math.max(0, cc.cooldown - rawDt);
            const parentLight = trafficLights[cc.intersectionIdx];

            if (parentLight.state === 'RED') {
              cc.mesh.position.x += cc.dir * cc.speed * dt;
              if (cc.dir > 0 && cc.mesh.position.x > 90) cc.mesh.position.x = -90;
              if (cc.dir < 0 && cc.mesh.position.x < -90) cc.mesh.position.x = 90;
            }

            // Check T-Bone Collision with Cross-Traffic
            const dx = cabGroup.position.x - cc.mesh.position.x;
            const dz = cabGroup.position.z - cc.mesh.position.z;
            if (Math.abs(dx) < 5.0 && Math.abs(dz) < 4.5 && cc.cooldown <= 0) {
              cc.cooldown = 1.5;
              s.health = Math.max(0, s.health - 25);
              s.speed = -6;
              s.throttle = 0;
              s.cameraShake = 2.2;
              s.rollAngle += (dx >= 0 ? -1 : 1) * 20;

              if (s.health <= 0) {
                s.isCrashed = true;
                setActiveDecision(null);
                setHud((prev) => ({
                  ...prev,
                  status: 'CRASHED',
                  health: 0,
                  failReason: 'INTERSECTION T-BONE COLLISION! Crashed into cross-street traffic.'
                }));
              }
            }
          });

          // 6. MID-HIGHWAY TACTICAL DECISIONS
          const prog = Math.max(0, (41 - cabGroup.position.z) / (41 - s.targetPortZ));

          if (prog > 0.22 && !s.decision1Done) {
            s.decision1Done = true;
            setActiveDecision({
              id: 'WEIGH_STATION',
              title: '⚖️ DPWH HIGHWAY WEIGH STATION AHEAD',
              desc: `Officers flagging your ${Number(weightKg).toLocaleString()} kg ${cargo} haul!`,
              opt1: '[1] Pull Into Weigh Scale (Slow to 18 km/h, 0% Damage)',
              opt2: '[2] Bypass on Shoulder (+12 km/h Boost, -6% Bump Damage)'
            });
          }

          if (prog > 0.58 && !s.decision2Done) {
            s.decision2Done = true;
            setActiveDecision({
              id: 'ROUTE_FORK',
              title: '🛣️ 4-LANE HIGHWAY APPROACH: SELECT LANE',
              desc: 'Heavy port congestion ahead near the coastal intersection!',
              opt1: '[1] Inner Fast Overtaking Lane (Direct Path, Watch Traffic Lights)',
              opt2: '[2] Outer Freight Lane (Wider Turning Radius, +Stability)'
            });
          }

          // 7. 4-LANE HIGHWAY TRAFFIC MOVEMENT & COLLISION
          trafficCars.forEach((tc) => {
            if (tc.cooldown > 0) tc.cooldown = Math.max(0, tc.cooldown - rawDt);
            tc.mesh.position.z += tc.vx * dt;
            if (tc.mesh.position.z > -30) tc.mesh.position.z = -1300;
            if (tc.mesh.position.z < -1310) tc.mesh.position.z = -40;

            const dx = cabGroup.position.x - tc.mesh.position.x;
            const dz = cabGroup.position.z - tc.mesh.position.z;
            if (Math.abs(dx) < 3.5 && Math.abs(dz) < 6.2 && tc.cooldown <= 0) {
              tc.cooldown = 1.5;
              s.health = Math.max(0, s.health - 20);
              s.speed = -8;
              s.throttle = 0;
              s.cameraShake = 1.8;
              s.rollAngle += (dx >= 0 ? -1 : 1) * 16;

              if (s.health <= 0) {
                s.isCrashed = true;
                setActiveDecision(null);
                setHud((prev) => ({
                  ...prev,
                  status: 'CRASHED',
                  health: 0,
                  failReason: 'HIGHWAY COLLISION! Cargo container damaged beyond export limits.'
                }));
              }
            }
          });

          // 8. CHECK PORT TERMINAL DROP-OFF COMPLETION
          if (cabGroup.position.z <= s.targetPortZ + 14) {
            s.isFinished = true;
            setActiveDecision(null);
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
        s.rollAngle += (flipTarget - s.rollAngle) * 3.0 * rawDt;
        cabTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        trailerTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
      }

      // ==========================================
      // 9. CAMERA ANCHORED TO SHOW HEAD TURNING BEFORE TRAILER!
      // ==========================================
      const orb = camOrbitRef.current;
      // Anchor camera angle primarily to trailerHeading when hitched so when cab turns, you SEE the white head swing out!
      const baseFollowAngle = s.isHitched
        ? s.trailerHeading * 0.72 + s.cabHeading * 0.28
        : s.cabHeading;
      const totalCamAngle = baseFollowAngle + orb.yawOffset;
      const camDist = orb.zoomDist + (s.isHitched ? 4 : 0);
      const camHeight = Math.max(2.5, (s.isHitched ? 12.5 : 10.5) + orb.pitchOffset);

      const targetCamX = cabGroup.position.x + Math.sin(totalCamAngle) * camDist;
      const targetCamZ = cabGroup.position.z + Math.cos(totalCamAngle) * camDist;

      camera.position.x += (targetCamX - camera.position.x) * 10 * rawDt;
      camera.position.z += (targetCamZ - camera.position.z) * 10 * rawDt;
      camera.position.y += (camHeight - camera.position.y) * 8 * rawDt;

      if (s.cameraShake > 0) {
        camera.position.x += (Math.random() - 0.5) * s.cameraShake * 2;
        camera.position.y += (Math.random() - 0.5) * s.cameraShake * 2;
        s.cameraShake = Math.max(0, s.cameraShake - 3.5 * rawDt);
      }

      camera.lookAt(cabGroup.position.x, 3.2, cabGroup.position.z);

      // Update React HUD at 10Hz
      hudTimer += rawDt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        const absRoll = Math.round(Math.abs(s.rollAngle));
        const articulationDeg = Math.round(
          THREE.MathUtils.radToDeg(Math.abs(s.cabHeading - s.trailerHeading))
        );
        const rawProg = s.isHitched
          ? Math.min(
              100,
              Math.max(0, Math.round(((41 - cabGroup.position.z) / (41 - s.targetPortZ)) * 100))
            )
          : 0;

        // Find upcoming Traffic Light ahead of truck
        let upcomingLight = null;
        for (let i = 0; i < trafficLights.length; i++) {
          if (cabGroup.position.z > trafficLights[i].z - 8) {
            upcomingLight = trafficLights[i];
            break;
          }
        }
        const nextLightState = upcomingLight ? upcomingLight.state : 'CLEAR';
        const nextLightDist = upcomingLight
          ? Math.max(0, Math.round(cabGroup.position.z - upcomingLight.stopZ))
          : 0;

        let warnMsg = '';
        if (!s.isHitched) {
          warnMsg = '🅿️ STEP 1: REVERSE [S] INTO THE BLUE TRAILER TO HITCH (OR PRESS [H])';
        } else if (s.violationAlertTimer > 0) {
          warnMsg =
            '🚨 RED LIGHT VIOLATION! -10% INTEGRITY & SPEED LOCKED TO 20 KM/H FOR 8s!';
        } else if (absRoll >= 26) {
          warnMsg = '🚨 TRAILER TIPPING! HOLD [SPACE] TO BRAKE OR EASE STEERING!';
        } else if (upcomingLight && nextLightDist < 95 && nextLightState === 'RED') {
          warnMsg = `🛑 RED TRAFFIC LIGHT IN ${nextLightDist}m — HOLD [SPACE] TO STOP AT WHITE LINE!`;
        } else if (upcomingLight && nextLightDist < 95 && nextLightState === 'YELLOW') {
          warnMsg = `⚠️ YELLOW LIGHT AHEAD (${nextLightDist}m) — PREPARE TO BRAKE [SPACE]!`;
        } else {
          warnMsg = '🛣️ 4-LANE HIGHWAY: OBEY TRAFFIC SIGNALS & DELIVER BEFORE TIMER EXPIRES';
        }

        setHud((prev) => ({
          ...prev,
          speed: Math.round(s.speed),
          steerDeg: Math.round(s.steerAngle),
          articulationDeg,
          rollDeg: absRoll,
          health: Math.round(s.health),
          progress: rawProg,
          timeLeft: Math.ceil(s.timeLeft),
          strikes: s.strikes,
          governorTimer: Math.ceil(s.governorTimer),
          nextLightState,
          nextLightDist,
          stage: s.isHitched ? 'HAUL' : 'HITCH',
          warning: warnMsg
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

  const rollColor =
    hud.rollDeg >= 26 ? '#ef4444' : hud.rollDeg >= 16 ? '#f59e0b' : '#2ecc71';

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
        fontFamily: "'Space Mono', monospace",
        userSelect: 'none'
      }}
    >
      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />

      {/* RED-LIGHT CAMERA ENFORCEMENT FLASH OVERLAY */}
      {cameraFlash && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(239, 68, 68, 0.45)',
            pointerEvents: 'none',
            zIndex: 10010
          }}
        />
      )}

      {/* TOP LEFT: TRUCK, TIMER & TRAFFIC ENFORCEMENT TELEMETRY */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          background: 'rgba(10, 14, 23, 0.88)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(46, 204, 113, 0.35)',
          borderRadius: 12,
          padding: '14px 18px',
          width: 305,
          color: '#fff'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#2ecc71', fontWeight: 'bold' }}>🚛 3D INLAND FREIGHT HAUL</span>
          <span style={{ fontSize: 11, background: 'rgba(46,204,113,0.15)', color: '#2ecc71', padding: '2px 8px', borderRadius: 4 }}>
            {Number(weightKg).toLocaleString()} KG
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 4, textTransform: 'uppercase' }}>
          {cargo}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10 }}>
          ORIGIN: <strong style={{ color: '#cbd5e1' }}>{originHub}</strong> •{' '}
          <strong style={{ color: liveWeather === 'NOMINAL' ? '#2ecc71' : '#f59e0b' }}>{liveWeather}</strong>
        </div>

        {/* ⏱️ PORT SLOT COUNTDOWN TIMER BOX */}
        <div
          style={{
            background: hud.timeLeft <= 20 && hud.stage === 'HAUL' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.04)',
            border: `1px solid ${hud.timeLeft <= 20 && hud.stage === 'HAUL' ? '#ef4444' : 'rgba(130, 160, 255, 0.2)'}`,
            borderRadius: 8,
            padding: '8px 12px',
            marginBottom: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 10, color: '#94a3b8' }}>⏱ PORT SLOT TIMER</span>
          <span
            style={{
              fontSize: 16,
              fontWeight: 'bold',
              color: hud.stage === 'HITCH' ? '#facc15' : hud.timeLeft <= 20 ? '#ef4444' : '#38bdf8'
            }}
          >
            {hud.stage === 'HITCH' ? 'STANDBY' : formatTimer(hud.timeLeft)}
          </span>
        </div>

        {/* Cargo Integrity */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          <span>CARGO INTEGRITY</span>
          <span style={{ color: hud.health < 50 ? '#ef4444' : '#2ecc71', fontWeight: 'bold' }}>{hud.health}%</span>
        </div>
        <div style={{ width: '100%', height: 7, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: `${hud.health}%`, height: '100%', background: hud.health < 50 ? '#ef4444' : '#2ecc71', transition: 'width 0.2s' }} />
        </div>

        {/* Port Terminal Distance */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          <span>DAVAO PORT TERMINAL</span>
          <span style={{ color: '#38bdf8', fontWeight: 'bold' }}>{hud.progress}%</span>
        </div>
        <div style={{ width: '100%', height: 7, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <div style={{ width: `${hud.progress}%`, height: '100%', background: '#38bdf8', transition: 'width 0.2s' }} />
        </div>

        {/* Traffic Light & LTO Strikes Status Row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#cbd5e1', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
          <span>
            NEXT SIGNAL:{' '}
            <strong
              style={{
                color:
                  hud.nextLightState === 'RED'
                    ? '#ef4444'
                    : hud.nextLightState === 'YELLOW'
                    ? '#facc15'
                    : '#2ecc71'
              }}
            >
              {hud.nextLightState === 'CLEAR' ? 'CLEAR' : `${hud.nextLightState} (${hud.nextLightDist}m)`}
            </strong>
          </span>
          <span>
            VIOLATIONS: <strong style={{ color: hud.strikes > 0 ? '#ef4444' : '#94a3b8' }}>{hud.strikes}/3</strong>
          </span>
        </div>

        {hud.governorTimer > 0 && (
          <div
            style={{
              marginTop: 8,
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid #ef4444',
              color: '#ff7675',
              fontSize: 10,
              padding: '4px 8px',
              borderRadius: 6,
              textAlign: 'center',
              fontWeight: 'bold'
            }}
          >
            🚨 SPEED LIMITER PENALTY: MAX 20 KM/H ({hud.governorTimer}s)
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
              color: '#000',
              border: 'none',
              padding: '7px',
              borderRadius: 6,
              fontWeight: 'bold',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: 'inherit'
            }}
          >
            🔗 AUTO-HITCH TRAILER [H]
          </button>
        )}
      </div>

      {/* TOP CENTER: TRAILER STABILITY & KINGPIN ARTICULATION HUD */}
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
          minWidth: 390
        }}
      >
        <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1 }}>
          TRAILER TILT ANGLE (ROLLOVER LIMIT: {ROLLOVER_LIMIT}°)
        </div>
        <div style={{ fontSize: 23, fontWeight: 'bold', color: rollColor, margin: '2px 0' }}>
          {hud.rollDeg}° / {ROLLOVER_LIMIT}°
        </div>
        <div style={{ width: '100%', height: 8, background: '#1e293b', borderRadius: 4, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ width: `${Math.min(100, (hud.rollDeg / ROLLOVER_LIMIT) * 100)}%`, height: '100%', background: rollColor, transition: 'width 0.1s' }} />
        </div>
        <div style={{ fontSize: 11, color: '#cbd5e1' }}>
          CAB-TO-TRAILER PIVOT: <strong>{hud.articulationDeg}°</strong> •{' '}
          <strong>{hud.stage === 'HITCH' ? 'UNCOUPLED' : 'FIFTH-WHEEL LOCKED'}</strong>
        </div>
        {hud.warning && (
          <div
            style={{
              marginTop: 5,
              fontSize: 10,
              color: hud.warning.includes('RED') || hud.warning.includes('TIPPING') ? '#ef4444' : '#facc15',
              fontWeight: 'bold'
            }}
          >
            {hud.warning}
          </div>
        )}
      </div>

      {/* TOP RIGHT: CONTROLS & EXIT BUTTON */}
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
        <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>TRUCK CONTROLS</div>
        <div><strong style={{ color: '#2ecc71' }}>[W / S]</strong> Drive / Reverse into Trailer</div>
        <div><strong style={{ color: '#2ecc71' }}>[SPACE]</strong> Hold for Air Brakes (Stop at Red!)</div>
        <div><strong style={{ color: '#2ecc71' }}>[A / D]</strong> Steer Tractor Head</div>
        <div><strong style={{ color: '#f1c40f' }}>[H]</strong> Instant Trailer Hitch</div>
        <div><strong style={{ color: '#38bdf8' }}>[RIGHT-CLICK]</strong> Hold & Drag 360° Cam</div>

        <button
          onClick={onExit}
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
          ✕ EXIT TO MAP
        </button>
      </div>

      {/* MID-HIGHWAY TACTICAL DECISION BANNER */}
      {decisionPrompt && hud.status === 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            top: 145,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(10, 15, 28, 0.92)',
            border: '2px solid #f1c40f',
            borderRadius: 12,
            padding: '12px 20px',
            width: 520,
            color: '#fff'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#f1c40f', fontWeight: 'bold', fontSize: 13 }}>{decisionPrompt.title}</span>
            <span style={{ fontSize: 10, color: '#f1c40f' }}>⏱ SLOW-MO ACTIVE</span>
          </div>
          <p style={{ margin: '0 0 10px 0', fontSize: 11, color: '#cbd5e1' }}>{decisionPrompt.desc}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => handleDecisionChoice(1)}
              style={{
                flex: 1,
                background: 'rgba(46, 204, 113, 0.18)',
                border: '1px solid #2ecc71',
                color: '#2ecc71',
                padding: '8px',
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
                padding: '8px',
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

      {/* BOTTOM CENTER: SPEED BAR IN KM/H */}
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
            marginBottom: 4
          }}
        >
          <span>{hud.speed < 0 ? 'Reverse (R)' : 'Gear (D)'}</span>
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
              width: `${Math.min(100, Math.max(0, (Math.abs(hud.speed) / 40) * 100))}%`,
              height: '100%',
              background: hud.governorTimer > 0 ? '#ef4444' : hud.speed < 0 ? '#f59e0b' : '#2ecc71',
              transition: 'width 0.1s'
            }}
          />
        </div>
      </div>

      {/* COMPLETION / CRASH MODAL */}
      {hud.status !== 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(5, 8, 17, 0.8)',
            backdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: `2px solid ${hud.status === 'DELIVERED' ? '#2ecc71' : '#ef4444'}`,
              borderRadius: 16,
              padding: '32px 40px',
              textAlign: 'center',
              maxWidth: 440,
              color: '#fff'
            }}
          >
            <h2 style={{ margin: '0 0 12px 0', color: hud.status === 'DELIVERED' ? '#2ecc71' : '#ef4444' }}>
              {hud.status === 'DELIVERED' ? '✅ PORT TERMINAL GATE-IN COMPLETE' : '💥 FREIGHT HAUL FAILED'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              {hud.status === 'DELIVERED'
                ? `Container hauled from ${originHub} to Davao Port Terminal with ${formatTimer(hud.timeLeft)} remaining! Cargo Integrity: ${hud.health}%.`
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
              LOAD ONTO SEA VESSEL (RETURN TO MAP)
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TruckHaul3D;