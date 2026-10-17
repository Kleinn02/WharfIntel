// VesselHelm3D.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const VesselHelm3D = ({
  mode = 'PUSH',          // 'PUSH', 'RETREAT', 'REROUTE', or 'MANUAL'
  cargo = 'Container Cargo',
  weightKg = 3500,
  initialHealth = 100,
  onComplete,
  onSwitchToQuiz
}) => {
  const mountRef = useRef(null);

  // --- HUD & TELEMETRY STATE ---
  const [hud, setHud] = useState({
    speed: 20,
    targetThrottle: 25,
    rudder: 0,
    rollDeg: 0,
    health: initialHealth,
    progress: 0,
    status: 'ACTIVE', // 'ACTIVE' | 'CAPSIZED' | 'SUNK' | 'CLEARED'
    failReason: '',
    warning: ''
  });

  // --- LIVE DECISION-MAKING EVENT STATE ---
  const [decisionPrompt, setDecisionPrompt] = useState(null);
  const [ballastActive, setBallastActive] = useState(false);

  // Refs for real-time 60FPS loop access
  const keysRef = useRef({ w: false, s: false, a: false, d: false });
  const simRef = useRef({
    speed: 22,
    throttle: 28,
    rudderAngle: 0,      // -35 to +35 deg
    yawRate: 0,          // angular velocity (heavy momentum)
    heading: 0,          // ship rotation Y
    rollAngle: 0,        // tilt angle in degrees (42+ = CAPSIZE!)
    rollVelocity: 0,
    health: initialHealth,
    distance: 0,
    targetDistance: 950, // Distance to clear the hazard sector
    isCapsized: false,
    isFinished: false,
    ballastStabilizer: 1.0,
    maxSpeedCap: 60,
    decisionTriggered1: false,
    decisionTriggered2: false
  });

  // Weight Factor: 1,500kg = 0.85x tilt | 5,000kg = 1.45x tilt (much easier to topple!)
  const weightFactor = 0.65 + (Number(weightKg || 3500) / 5000) * 0.8;
  const CAPSIZE_DEG = 42;

  // --- HANDLE MID-MANEUVER TACTICAL DECISIONS ---
  const handleDecisionChoice = (option) => {
    const s = simRef.current;
    if (!decisionPrompt || s.isCapsized || s.isFinished) return;

    if (decisionPrompt.id === 'CROSSING_VESSEL') {
      if (option === 1) {
        // Emergency Reverse / Yield
        s.throttle = -15;
        s.rollVelocity *= 0.3;
      } else if (option === 2) {
        // Overclock Engines to beat bow
        s.throttle = s.maxSpeedCap;
        s.speed = Math.min(s.maxSpeedCap, s.speed + 12);
      }
    } else if (decisionPrompt.id === 'CARGO_SHIFT') {
      if (option === 1) {
        // Flood Counter-Ballast: High stability, lower top speed
        s.ballastStabilizer = 0.55;
        s.maxSpeedCap = 42;
        s.throttle = Math.min(s.throttle, 42);
        setBallastActive(true);
      } else if (option === 2) {
        // Jettison Outer Container: -10% Cargo Health, instant roll reset
        s.health = Math.max(5, s.health - 10);
        s.rollAngle *= 0.25;
        s.rollVelocity = 0;
        s.ballastStabilizer = 0.75;
      }
    }
    setDecisionPrompt(null);
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // ==========================================
    // 1. THREE.JS SCENE, SKY & CAMERA (ROBLOX STYLE)
    // ==========================================
    const scene = new THREE.Scene();
    const isStormy = mode === 'PUSH';
    const skyColor = isStormy ? 0x2c4a63 : 0x6ab7e8;
    scene.background = new THREE.Color(skyColor);
    scene.fog = new THREE.FogExp2(skyColor, 0.0018);

    const camera = new THREE.PerspectiveCamera(
      55,
      container.clientWidth / container.clientHeight,
      0.5,
      1200
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Crisp Sunlight + Hemisphere Lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x1e6091, isStormy ? 0.75 : 1.0);
    scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffdf5, isStormy ? 0.9 : 1.3);
    dirLight.position.set(80, 140, 60);
    dirLight.castShadow = true;
    scene.add(dirLight);

    // ==========================================
    // 2. 3D OCEAN SURFACE WITH DYNAMIC WAVES
    // ==========================================
    const waterGeo = new THREE.PlaneGeometry(2400, 2400, 90, 90);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhongMaterial({
      color: isStormy ? 0x165b8a : 0x228be6,
      emissive: 0x072540,
      specular: 0x99d6ff,
      shininess: 75,
      flatShading: true
    });
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    scene.add(waterMesh);

    // ==========================================
    // 3. BUILD PLAYER VESSEL (MATCHING YOUTUBE SCREENSHOT)
    // ==========================================
    const playerGroup = new THREE.Group(); // Moves & Yaws
    const hullTiltGroup = new THREE.Group(); // Rolls (Heels/Capsizes) & Pitches
    playerGroup.add(hullTiltGroup);
    scene.add(playerGroup);

    const redHullMat = new THREE.MeshLambertMaterial({ color: 0xa62626 });
    const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf1f5f9 });
    const woodDeckMat = new THREE.MeshLambertMaterial({ color: 0xbfa084 });
    const darkBollardMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const glassMat = new THREE.MeshLambertMaterial({ color: 0x1e3a5f });

    // Lower Red Anti-Fouling Hull
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(5.6, 2.0, 28), redHullMat);
    lowerHull.position.set(0, 0.2, 0);
    hullTiltGroup.add(lowerHull);

    // Bow Wedge (Pointed Front like screenshot)
    const bowGeo = new THREE.ConeGeometry(4.0, 8, 4);
    bowGeo.rotateX(-Math.PI / 2);
    bowGeo.rotateZ(Math.PI / 4);
    const bowMesh = new THREE.Mesh(bowGeo, whiteMat);
    bowMesh.scale.set(1, 0.65, 1);
    bowMesh.position.set(0, 1.5, -17.5);
    hullTiltGroup.add(bowMesh);

    // White Upper Hull Side Walls (Creates recessed wooden deck)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.8, 28), whiteMat);
    leftWall.position.set(-2.6, 1.9, 0);
    hullTiltGroup.add(leftWall);

    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.8, 28), whiteMat);
    rightWall.position.set(2.6, 1.9, 0);
    hullTiltGroup.add(rightWall);

    // Wooden Foredeck (Matching screenshot)
    const woodDeck = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.3, 27.5), woodDeckMat);
    woodDeck.position.set(0, 1.25, 0);
    hullTiltGroup.add(woodDeck);

    // 4 Black Foredeck Hatches/Bollards (Exact detail from screenshot)
    [-8.5, -11.5].forEach((zPos) => {
      [-1.7, 1.7].forEach((xPos) => {
        const bollard = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.35, 1.4), darkBollardMat);
        bollard.position.set(xPos, 1.55, zPos);
        hullTiltGroup.add(bollard);
      });
    });

    // Long White Bridge Superstructure (Matching screenshot)
    const cabinMain = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.6, 15.5), whiteMat);
    cabinMain.position.set(0, 2.7, 3.2);
    hullTiltGroup.add(cabinMain);

    const cabinRoof = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.35, 16.2), whiteMat);
    cabinRoof.position.set(0, 4.1, 3.0);
    hullTiltGroup.add(cabinRoof);

    // Bridge Front Window
    const bridgeWin = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.2), glassMat);
    bridgeWin.position.set(0, 3.1, -4.5);
    hullTiltGroup.add(bridgeWin);

    // Cargo Containers Stacked by Weight (Visualizes high center of gravity)
    const containerRows = Math.max(1, Math.round(Number(weightKg || 3500) / 1500));
    const containerColors = [0xe67e22, 0x2980b9, 0x27ae60];
    for (let r = 0; r < containerRows; r++) {
      const cMesh = new THREE.Mesh(
        new THREE.BoxGeometry(3.6, 1.4, 5.5),
        new THREE.MeshLambertMaterial({ color: containerColors[r % containerColors.length] })
      );
      cMesh.position.set(0, 4.9 + r * 1.45, 6.5);
      hullTiltGroup.add(cMesh);
    }

    // White Foam Wake Trail behind player ship
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
    // 4. HELPER: BUILD CROSSING STEAMER SHIP (LIKE SCREENSHOT)
    // ==========================================
    const createSteamerObstacle = (x, z, moveDirX) => {
      const steamer = new THREE.Group();
      steamer.position.set(x, 0, z);
      steamer.rotation.y = moveDirX > 0 ? Math.PI / 2 : -Math.PI / 2;

      // Red lower + White upper hull
      const sRed = new THREE.Mesh(new THREE.BoxGeometry(7.5, 2.5, 34), redHullMat);
      sRed.position.y = 0.6;
      steamer.add(sRed);

      const sWhite = new THREE.Mesh(new THREE.BoxGeometry(7.8, 3.2, 35), whiteMat);
      sWhite.position.y = 3.2;
      steamer.add(sWhite);

      // Superstructure & Bridge
      const sBridge = new THREE.Mesh(new THREE.BoxGeometry(6.4, 3.2, 20), whiteMat);
      sBridge.position.set(0, 6.2, 2);
      steamer.add(sBridge);

      // Two Yellow Funnels / Smokestacks (Just like the ship in your screenshot)
      const funnelMat = new THREE.MeshLambertMaterial({ color: 0xf1c40f });
      [0, 5.5].forEach((fz) => {
        const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 4.2, 12), funnelMat);
        funnel.position.set(0, 9.5, fz);
        steamer.add(funnel);
      });

      // Foredeck Mast & Lifeboats
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 11, 8), darkBollardMat);
      mast.position.set(0, 9, -11);
      steamer.add(mast);

      [-2.1, 2.1].forEach((lx) => {
        const lifeboat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.9, 4.2), darkBollardMat);
        lifeboat.position.set(lx, 5.2, -11);
        steamer.add(lifeboat);
      });

      scene.add(steamer);
      return {
        mesh: steamer,
        type: 'STEAMER',
        radius: 15,
        vx: moveDirX * 14,
        hit: false
      };
    };

    // ==========================================
    // 5. SPAWN OBSTACLES & FINISH GATE IN CORRIDOR
    // ==========================================
    const obstacles = [];
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x475569, flatShading: true });
    const buoyMat = new THREE.MeshLambertMaterial({ color: 0xef4444 });

    // Spawn Crossing Steamers (like screenshot) at intervals
    obstacles.push(createSteamerObstacle(-45, -180, 1));   // Crosses Left -> Right
    obstacles.push(createSteamerObstacle(55, -420, -1));   // Crosses Right -> Left
    obstacles.push(createSteamerObstacle(-50, -680, 1));   // Crosses Left -> Right

    // Spawn Sea Rocks / Reef Islands & Hazard Buoys along the path
    const hazardPositions = [
      { x: 6, z: -110, r: 7, type: 'ROCK' },
      { x: -18, z: -250, r: 9, type: 'ROCK' },
      { x: 16, z: -310, r: 8, type: 'ROCK' },
      { x: -4, z: -490, r: 10, type: 'ROCK' },
      { x: -24, z: -580, r: 8, type: 'ROCK' },
      { x: 18, z: -610, r: 9, type: 'ROCK' },
      { x: 0, z: -760, r: 11, type: 'ROCK' },
      { x: -16, z: -840, r: 8, type: 'ROCK' },
      { x: 15, z: -860, r: 8, type: 'ROCK' }
    ];

    hazardPositions.forEach((h) => {
      const rockGroup = new THREE.Group();
      rockGroup.position.set(h.x, 0, h.z);

      const mainRock = new THREE.Mesh(new THREE.DodecahedronGeometry(h.r, 1), rockMat);
      mainRock.scale.set(1.2, 0.75, 1.1);
      mainRock.position.y = 1.5;
      rockGroup.add(mainRock);

      // Warning Beacon on top of reef
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 4, 8), buoyMat);
      beacon.position.y = h.r * 0.75 + 2;
      rockGroup.add(beacon);

      scene.add(rockGroup);
      obstacles.push({
        mesh: rockGroup,
        type: 'ROCK',
        radius: h.r + 2.5,
        vx: 0,
        hit: false
      });
    });

    // Safe Sector Finish Line Gate
    const gateGroup = new THREE.Group();
    gateGroup.position.set(0, 0, -simRef.current.targetDistance);
    const pillarMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
    [-45, 45].forEach((px) => {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 35, 12), pillarMat);
      pillar.position.set(px, 15, 0);
      gateGroup.add(pillar);
    });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(92, 2.5, 2.5), pillarMat);
    banner.position.set(0, 32, 0);
    gateGroup.add(banner);
    scene.add(gateGroup);

    // ==========================================
    // 6. KEYBOARD CONTROLS & RESIZE LISTENERS
    // ==========================================
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keysRef.current.w = true;
      if (k === 's' || e.key === 'ArrowDown') keysRef.current.s = true;
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.a = true;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.d = true;
      if (e.key === '1') handleDecisionChoice(1);
      if (e.key === '2') handleDecisionChoice(2);
    };

    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || e.key === 'ArrowUp') keysRef.current.w = false;
      if (k === 's' || e.key === 'ArrowDown') keysRef.current.s = false;
      if (k === 'a' || e.key === 'ArrowLeft') keysRef.current.a = false;
      if (k === 'd' || e.key === 'ArrowRight') keysRef.current.d = false;
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
    // 7. 60FPS PHYSICS & CAPSIZE ENGINE LOOP
    // ==========================================
    let clock = new THREE.Clock();
    let animId;
    let hudTimer = 0;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.getElapsedTime();
      const s = simRef.current;

      // Animate 3D Ocean Waves
      const posAttr = waterGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const waveY =
          Math.sin(vx * 0.04 + elapsed * 1.8) * (isStormy ? 0.85 : 0.4) +
          Math.cos(vz * 0.03 + elapsed * 1.4) * (isStormy ? 0.65 : 0.3);
        posAttr.setY(i, waveY);
      }
      posAttr.needsUpdate = true;

      if (!s.isCapsized && !s.isFinished) {
        // 1. THROTTLE & HEAVY ENGINE INERTIA
        if (keysRef.current.w) s.throttle = Math.min(s.maxSpeedCap, s.throttle + 22 * dt);
        if (keysRef.current.s) s.throttle = Math.max(-20, s.throttle - 26 * dt);
        s.speed += (s.throttle - s.speed) * 1.4 * dt;

        // 2. RUDDER & DELAYED ANGULAR MOMENTUM
        const rudderSpeed = 48;
        if (keysRef.current.a) {
          s.rudderAngle = Math.min(35, s.rudderAngle + rudderSpeed * dt);
        } else if (keysRef.current.d) {
          s.rudderAngle = Math.max(-35, s.rudderAngle - rudderSpeed * dt);
        } else {
          // Rudder slowly returns toward center when keys are released
          s.rudderAngle *= Math.pow(0.25, dt);
        }

        // Ship turn rate builds with momentum (harder to stop swinging once started!)
        const effectiveSpeedFactor = Math.max(0.2, Math.abs(s.speed) / 35) * (s.speed >= 0 ? 1 : -0.6);
        const targetYawRate = (s.rudderAngle / 35) * 0.68 * effectiveSpeedFactor;
        s.yawRate += (targetYawRate - s.yawRate) * (1.8 / weightFactor) * dt;
        s.heading += s.yawRate * dt;

        // 3. CENTRIFUGAL HEEL / TOPPLE PHYSICS CALCULATION
        // Turning fast with heavy cargo creates outward roll torque!
        const speedRatio = Math.abs(s.speed) / 32;
        const centrifugalRollTorque =
          s.yawRate * speedRatio * 78 * weightFactor * s.ballastStabilizer;

        // Ocean cross-swell torque
        const swellTorque = Math.sin(elapsed * 2.1) * (isStormy ? 9.5 : 3.5);

        // Restoring buoyancy force tries to pull ship upright (unless near capsize!)
        const restoringForce = -s.rollAngle * 2.4;
        const rollAccel = centrifugalRollTorque + swellTorque + restoringForce - s.rollVelocity * 1.65;

        s.rollVelocity += rollAccel * dt;
        s.rollAngle += s.rollVelocity * dt * 12;

        // 4. CHECK FOR CAPSIZE (TOPPLE OVER AT 42+ DEGREES)
        if (Math.abs(s.rollAngle) >= CAPSIZE_DEG) {
          s.isCapsized = true;
          s.health = 0;
          setDecisionPrompt(null);
          setHud((prev) => ({
            ...prev,
            status: 'CAPSIZED',
            health: 0,
            rollDeg: Math.round(Math.abs(s.rollAngle)),
            failReason: 'VESSEL CAPSIZED! Turned too sharply at high speed for cargo weight.'
          }));
        }

        // 5. MOVE PLAYER VESSEL IN 3D SPACE
        const forwardStep = s.speed * 0.65 * dt;
        playerGroup.position.x -= Math.sin(s.heading) * forwardStep;
        playerGroup.position.z -= Math.cos(s.heading) * forwardStep;
        playerGroup.rotation.y = s.heading;

        // Apply Heel (Roll) and Wave Pitch to the Hull
        hullTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        hullTiltGroup.rotation.x = Math.sin(elapsed * 2.5) * 0.025;
        hullTiltGroup.position.y = Math.sin(elapsed * 2.2) * 0.2;

        // Keep water centered near player
        waterMesh.position.z = playerGroup.position.z;

        // 6. TRIGGER MID-VOYAGE TACTICAL DECISIONS
        const currentProgress = Math.abs(playerGroup.position.z) / s.targetDistance;
        s.distance = Math.abs(playerGroup.position.z);

        if (currentProgress > 0.14 && !s.decisionTriggered1) {
          s.decisionTriggered1 = true;
          setDecisionPrompt({
            id: 'CROSSING_VESSEL',
            title: '⚠️ TRAFFIC ALERT: STEAMER CROSSING BOW',
            desc: 'Heavy passenger steamer crossing your shipping lane ahead! Sharp high-speed turns risk capsizing.',
            opt1: '[1] Emergency Reverse Thrusters (Safe Yield)',
            opt2: '[2] Full Ahead & Thread the Needle (High Tilt Risk)'
          });
        }

        if (currentProgress > 0.52 && !s.decisionTriggered2) {
          s.decisionTriggered2 = true;
          setDecisionPrompt({
            id: 'CARGO_SHIFT',
            title: '🚨 STABILITY ALARM: HEAVY CARGO SHIFTING',
            desc: `Your ${Number(weightKg).toLocaleString()} kg load is amplifying roll angles during turns!`,
            opt1: '[1] Flood Counter-Ballast (+45% Stability, Max Speed 42)',
            opt2: '[2] Jettison Top Container (-10% Cargo Health, Instant Balance)'
          });
        }

        // 7. OBSTACLE MOVEMENT & COLLISION DETECTION
        obstacles.forEach((obs) => {
          if (obs.vx !== 0) {
            obs.mesh.position.x += obs.vx * dt;
            if (obs.mesh.position.x > 85) obs.vx = -Math.abs(obs.vx);
            if (obs.mesh.position.x < -85) obs.vx = Math.abs(obs.vx);
            obs.mesh.rotation.y = obs.vx > 0 ? Math.PI / 2 : -Math.abs(Math.PI / 2);
          }

          if (!obs.hit) {
            const dx = playerGroup.position.x - obs.mesh.position.x;
            const dz = playerGroup.position.z - obs.mesh.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);

            if (dist < obs.radius + 3.2) {
              obs.hit = true;
              const dmg = obs.type === 'STEAMER' ? 35 : 25;
              s.health = Math.max(0, s.health - dmg);
              // Collision violently knocks the ship sideways (can cause capsize!)
              const knockDir = dx >= 0 ? -1 : 1;
              s.rollAngle += knockDir * 22;
              s.speed *= 0.35;

              if (s.health <= 0) {
                s.isCapsized = true;
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

        // 8. CHECK IF SAFE SECTOR GATE REACHED
        if (playerGroup.position.z <= -s.targetDistance) {
          s.isFinished = true;
          setDecisionPrompt(null);
          setHud((prev) => ({
            ...prev,
            status: 'CLEARED',
            progress: 100,
            health: Math.round(s.health)
          }));
        }
      } else if (s.isCapsized) {
        // SINKING & CAPSIZING ANIMATION (Just like the YouTube video!)
        const targetFlip = s.rollAngle >= 0 ? 115 : -115;
        s.rollAngle += (targetFlip - s.rollAngle) * 2.2 * dt;
        hullTiltGroup.rotation.z = THREE.MathUtils.degToRad(s.rollAngle);
        hullTiltGroup.rotation.x += 0.12 * dt; // Bow dips under water
        hullTiltGroup.position.y -= 1.8 * dt;  // Slowly sinks into the sea
        s.speed *= 0.95;
      }

      // ==========================================
      // 8. OVER-THE-SHOULDER 3D CHASE CAMERA (LIKE SCREENSHOT)
      // ==========================================
      const camDistance = 30;
      const camHeight = 14.5;
      const targetCamX = playerGroup.position.x + Math.sin(s.heading) * camDistance;
      const targetCamZ = playerGroup.position.z + Math.cos(s.heading) * camDistance;

      camera.position.x += (targetCamX - camera.position.x) * 6 * dt;
      camera.position.z += (targetCamZ - camera.position.z) * 6 * dt;
      camera.position.y += (camHeight - camera.position.y) * 5 * dt;
      camera.lookAt(
        playerGroup.position.x - Math.sin(s.heading) * 16,
        2.0,
        playerGroup.position.z - Math.cos(s.heading) * 16
      );

      // Update React HUD at 10Hz for smooth performance
      hudTimer += dt;
      if (hudTimer > 0.1) {
        hudTimer = 0;
        const absRoll = Math.round(Math.abs(s.rollAngle));
        let warnMsg = '';
        if (absRoll >= 28) {
          warnMsg = '🚨 CRITICAL TILT! COUNTER-STEER OR DROP SPEED (S) NOW!';
        } else if (absRoll >= 18) {
          warnMsg = '⚠️ HEAVY HEEL ANGLE — EASE OFF RUDDER';
        }

        setHud((prev) => ({
          ...prev,
          speed: Math.round(s.speed),
          targetThrottle: Math.round(s.throttle),
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
          width: 280,
          color: '#fff'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 12, color: '#82a0ff', fontWeight: 'bold' }}>⚓ 3D HELM CONTROL</span>
          <span style={{ fontSize: 11, background: 'rgba(130,160,255,0.15)', padding: '2px 8px', borderRadius: 4 }}>
            {Number(weightKg).toLocaleString()} KG
          </span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 'bold', marginBottom: 10, textTransform: 'uppercase' }}>
          {cargo}
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
          <span>SAFE SECTOR DISTANCE</span>
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
          padding: '12px 28px',
          textAlign: 'center',
          minWidth: 360,
          boxShadow: hud.rollDeg >= 25 ? '0 0 25px rgba(239, 68, 68, 0.5)' : '0 8px 25px rgba(0,0,0,0.4)'
        }}
      >
        <div style={{ fontSize: 11, color: '#94a3b8', letterSpacing: 1 }}>
          HULL TILT ANGLE (CAPSIZE LIMIT: {CAPSIZE_DEG}°)
        </div>
        <div style={{ fontSize: 24, fontWeight: 'bold', color: rollColor, margin: '4px 0' }}>
          {hud.rollDeg}° / {CAPSIZE_DEG}°
        </div>

        {/* Visual Tilt Meter */}
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
          <div style={{ marginTop: 6, fontSize: 11, color: '#ef4444', fontWeight: 'bold' }}>
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
        <div><strong style={{ color: '#82a0ff' }}>[W / S]</strong> Throttle / Reverse Brakes</div>
        <div><strong style={{ color: '#82a0ff' }}>[A / D]</strong> Turn Rudder (Watch Tilt!)</div>
        <div><strong style={{ color: '#f1c40f' }}>[1 / 2]</strong> Tactical Radio Decisions</div>

        {onSwitchToQuiz && (
          <button
            onClick={onSwitchToQuiz}
            style={{
              marginTop: 10,
              width: '100%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#94a3b8',
              padding: '6px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              fontSize: 10,
              fontFamily: 'inherit'
            }}
          >
            Switch to Legacy Quiz Mode
          </button>
        )}
      </div>

      {/* MID-SCREEN POPUP: REAL-TIME DECISION MAKING */}
      {decisionPrompt && hud.status === 'ACTIVE' && (
        <div
          style={{
            position: 'absolute',
            top: 155,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(15, 23, 42, 0.95)',
            border: '2px solid #f1c40f',
            borderRadius: 12,
            padding: '16px 24px',
            width: 500,
            color: '#fff',
            boxShadow: '0 15px 40px rgba(0,0,0,0.6)'
          }}
        >
          <div style={{ color: '#f1c40f', fontWeight: 'bold', fontSize: 14, marginBottom: 6 }}>
            {decisionPrompt.title}
          </div>
          <p style={{ margin: '0 0 12px 0', fontSize: 12, color: '#cbd5e1', fontFamily: 'Inter, sans-serif' }}>
            {decisionPrompt.desc}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => handleDecisionChoice(1)}
              style={{
                flex: 1,
                background: 'rgba(46, 204, 113, 0.15)',
                border: '1px solid #2ecc71',
                color: '#2ecc71',
                padding: '10px',
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
                background: 'rgba(241, 196, 15, 0.15)',
                border: '1px solid #f1c40f',
                color: '#f1c40f',
                padding: '10px',
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

      {/* BOTTOM CENTER: ROBLOX-STYLE SPEED BAR (MATCHING SCREENSHOT) */}
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
          <span>Speed</span>
          <span>{hud.speed}</span>
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
              width: `${Math.min(100, Math.max(0, (Math.abs(hud.speed) / 60) * 100))}%`,
              height: '100%',
              background: hud.speed < 0 ? '#ef4444' : '#eab308',
              transition: 'width 0.1s'
            }}
          />
        </div>
      </div>

      {/* END-OF-MANEUVER OVERLAY (CAPSIZED / SUNK / SECTOR CLEARED) */}
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
                ? '✅ SAFE SECTOR REACHED'
                : hud.status === 'CAPSIZED'
                ? '⚠️ VESSEL CAPSIZED!'
                : '💥 HULL DESTROYED'}
            </h2>
            <p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
              {hud.status === 'CLEARED'
                ? `You successfully calculated your turns and navigated the maritime hazard corridor! Remaining Cargo Integrity: ${hud.health}%.`
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