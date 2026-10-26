// frontend/src/pages/PortTerminal3D.jsx
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const CAMERA_MODES = [
  { id: 1, key: '1', label: 'ORBIT' },
  { id: 2, key: '2', label: 'CABIN' },
  { id: 3, key: '3', label: 'STACKER' },
  { id: 4, key: '4', label: 'BRIDGE' }
];

const PortTerminal3D = ({
  shipment = {},
  initialHealth = 100,
  weatherState = 'NOMINAL',
  stowageSlot = 'BAY 04 • ROW 02 • TIER 82',
  onComplete,
  onExit
}) => {
  const mountRef = useRef(null);

  const cargoName = shipment.cargo || 'Cavendish Bananas';
  const weightKg = Number(shipment.weightKg) || 15000;
  const destination = shipment.destination || 'Singapore';
  const category = shipment.category || 'Perishable (Food)';
  const shipId = shipment.id || 'TRK-49';

  const catLower = category.toLowerCase();
  const isElectronics = catLower.includes('electronic');
  const isRawMaterials = catLower.includes('raw');
  const isPerishable =
    !isElectronics &&
    !isRawMaterials &&
    (catLower.includes('perishable') ||
      cargoName.toLowerCase().includes('banana') ||
      cargoName.toLowerCase().includes('food'));

  const teuCount = Math.max(
    1,
    Number(shipment.teu_count) || Number(shipment.teuCount) || Math.ceil(weightKg / 25000)
  );
  const payloadPerTeu = Math.round(weightKg / teuCount);
  const tareWeightPerTeu = isPerishable ? 3080 : 2250;
  const verifiedGrossMass = payloadPerTeu + tareWeightPerTeu;

  const [cameraMode, setCameraMode] = useState(1);
  const cameraModeRef = useRef(1);

  const [liveWeather, setLiveWeather] = useState(weatherState || 'NOMINAL');
  const weatherRef = useRef(weatherState || 'NOMINAL');

  const hasTriggeredCompleteRef = useRef(false);

  const [hud, setHud] = useState({
    phaseCode: 'PHASE A',
    phaseTitle: 'YARD APRON TRANSFER • REACH STACKER HOIST',
    progressPct: 0,
    elapsedSec: '0.0',
    craneStatus: 'SPREADER STANDBY',
    twistlockState: 'UNLOCKED (APPROACH)',
    trolleyOffsetM: '0.0',
    hoistHeightM: '16.5',
    reeferStatus: isPerishable ? 'AUX BUS INTERFACE READY (-4.2°C)' : 'AMBIENT DRY (N/A)',
    isComplete: false,
    isDeparting: false,
    autoHandoverSec: 5
  });

  const orbitRef = useRef({
    isRightDown: false,
    lastX: 0,
    lastY: 0,
    yaw: 0.65,
    pitch: 0.35,
    distance: 68
  });

  useEffect(() => {
    if (weatherState) {
      weatherRef.current = weatherState;
      setLiveWeather(weatherState);
    }
  }, [weatherState]);

  const switchCamera = (id) => {
    cameraModeRef.current = id;
    setCameraMode(id);
  };

  const handleLaunchSeaTransit = () => {
    if (hasTriggeredCompleteRef.current) return;
    hasTriggeredCompleteRef.current = true;
    if (onComplete) {
      onComplete({
        success: true,
        finalHealth: Math.round(initialHealth),
        stage: 'OCEAN_DEPARTURE_READY',
        stowageSlot
      });
    }
  };

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // =========================================================================
    // 1. SCENE, SKY, FOG & RENDERER
    // =========================================================================
    const scene = new THREE.Scene();
    const initW = weatherRef.current;
    const isCyc = initW === 'CYCLONE IMMINENT';
    const isDet = initW === 'DETERIORATING';

    const skyColorHex = isCyc ? 0x16202c : isDet ? 0x3b4d5e : 0x0f172a;
    scene.background = new THREE.Color(skyColorHex);
    scene.fog = new THREE.FogExp2(skyColorHex, 0.0022);

    const camera = new THREE.PerspectiveCamera(
      52,
      container.clientWidth / container.clientHeight,
      0.1,
      1500
    );
    camera.position.set(48, 28, 52);
    const camLookTarget = new THREE.Vector3(0, 8, -10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e293b, 1.15);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfffbeb, 1.35);
    sunLight.position.set(85, 140, 90);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const apronPointLight = new THREE.PointLight(0x38bdf8, 1.2, 95);
    apronPointLight.position.set(0, 26, -8);
    scene.add(apronPointLight);

    // =========================================================================
    // 2. WHARF APRON (Y = 0, 300x300) & SEA BASIN (Y = -1.5)
    // =========================================================================
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0x334155 });
    const darkAsphaltMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });
    const safetyYellowMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const railSteelMat = new THREE.MeshLambertMaterial({ color: 0x94a3b8 });
    const seaWaterMat = new THREE.MeshLambertMaterial({ color: 0x093145 });

    // Concrete Quay Deck (Z = 0 to +300, width 300)
    const quayDeck = new THREE.Mesh(new THREE.BoxGeometry(300, 4, 300), concreteMat);
    quayDeck.position.set(0, -2, 150);
    quayDeck.receiveShadow = true;
    scene.add(quayDeck);

    // Transfer Lane Asphalt Strip on Quay Apron
    const transferLane = new THREE.Mesh(new THREE.PlaneGeometry(300, 34), darkAsphaltMat);
    transferLane.rotation.x = -Math.PI / 2;
    transferLane.position.set(0, 0.02, 22);
    scene.add(transferLane);

    // Quay Edge Coping & Yellow Safety Bollards at Z = 2
    const edgeBeam = new THREE.Mesh(new THREE.BoxGeometry(300, 0.5, 1.6), safetyYellowMat);
    edgeBeam.position.set(0, 0.25, 0.8);
    scene.add(edgeBeam);

    for (let bx = -120; bx <= 120; bx += 16) {
      const bollard = new THREE.Mesh(
        new THREE.CylinderGeometry(0.45, 0.55, 1.4, 10),
        safetyYellowMat
      );
      bollard.position.set(bx, 0.7, 2.2);
      scene.add(bollard);
    }

    // Dual STS Crane Rail Tracks (Z = 6 and Z = 24)
    [6, 24].forEach((rz) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(280, 0.22, 0.45), railSteelMat);
      rail.position.set(0, 0.11, rz);
      scene.add(rail);
    });

    // Deep-Water Sea Basin (Y = -1.5, Z < 0)
    const seaBasin = new THREE.Mesh(new THREE.PlaneGeometry(900, 600), seaWaterMat);
    seaBasin.rotation.x = -Math.PI / 2;
    seaBasin.position.set(0, -1.5, -300);
    scene.add(seaBasin);

    // =========================================================================
    // 3. MOORED FEEDER VESSEL (MV WHARF-ALPHA) AT BERTH 02 WEST (Z = -22)
    // =========================================================================
    const shipGroup = new THREE.Group();
    shipGroup.position.set(0, -1.5, -22);
    scene.add(shipGroup);

    const navyHullMat = new THREE.MeshLambertMaterial({ color: 0x0f172a });
    const redBootMat = new THREE.MeshLambertMaterial({ color: 0x991b1b });
    const deckGreyMat = new THREE.MeshLambertMaterial({ color: 0x475569 });
    const whiteSuperMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const bridgeGlassMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Lower Red Antifouling Hull
    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(118, 3.2, 22), redBootMat);
    lowerHull.position.set(0, 1.4, 0);
    shipGroup.add(lowerHull);

    // Upper Dark Navy Hull
    const upperHull = new THREE.Mesh(new THREE.BoxGeometry(122, 5.2, 24), navyHullMat);
    upperHull.position.set(0, 5.4, 0);
    shipGroup.add(upperHull);

    // Raised Forecastle Bow (Left / -X)
    const bowBlock = new THREE.Mesh(new THREE.BoxGeometry(18, 3.2, 23.5), navyHullMat);
    bowBlock.position.set(-55, 9.2, 0);
    shipGroup.add(bowBlock);

    // Main Cargo Deck & Cell Guide Coamings
    const cargoDeck = new THREE.Mesh(new THREE.BoxGeometry(92, 0.6, 21.5), deckGreyMat);
    cargoDeck.position.set(-2, 8.2, 0);
    shipGroup.add(cargoDeck);

    // Aft Bridge Superstructure (Right / +X)
    const bridgeTower = new THREE.Mesh(new THREE.BoxGeometry(16, 15, 20), whiteSuperMat);
    bridgeTower.position.set(46, 15.5, 0);
    shipGroup.add(bridgeTower);

    const bridgeHelm = new THREE.Mesh(new THREE.BoxGeometry(17.5, 3.2, 22), whiteSuperMat);
    bridgeHelm.position.set(45.5, 23.5, 0);
    shipGroup.add(bridgeHelm);

    const bridgeWindows = new THREE.Mesh(new THREE.BoxGeometry(17.7, 1.3, 21.2), bridgeGlassMat);
    bridgeWindows.position.set(45.3, 23.6, 0);
    shipGroup.add(bridgeWindows);

    // Twin Exhaust Funnels & Dynamic Diesel Exhaust Plumes
    const exhaustPlumes = [];
    const exhaustMat = new THREE.MeshBasicMaterial({
      color: 0x64748b,
      transparent: true,
      opacity: 0.0
    });

    [-4.5, 4.5].forEach((fz) => {
      const funnel = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 1.7, 5.5, 10),
        new THREE.MeshLambertMaterial({ color: 0xeab308 })
      );
      funnel.position.set(50, 26.5, fz);
      shipGroup.add(funnel);

      for (let pIdx = 0; pIdx < 3; pIdx++) {
        const plume = new THREE.Mesh(
          new THREE.CylinderGeometry(1.1 + pIdx * 0.65, 0.8 + pIdx * 0.4, 2.6, 8),
          exhaustMat
        );
        plume.position.set(50 + pIdx * 1.4, 30.2 + pIdx * 2.4, fz);
        shipGroup.add(plume);
        exhaustPlumes.push({ mesh: plume, baseY: 30.2 + pIdx * 2.4, baseX: 50 + pIdx * 1.4, phase: pIdx * 1.3 });
      }
    });

    // Procedural Stern Propeller Wake Foam Plane (Grows & pulses during Phase D Departure)
    const wakeMat = new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      transparent: true,
      opacity: 0.0
    });
    const sternWakeMesh = new THREE.Mesh(new THREE.PlaneGeometry(36, 15), wakeMat);
    sternWakeMesh.rotation.x = -Math.PI / 2;
    sternWakeMesh.position.set(76, 0.15, 0);
    shipGroup.add(sternWakeMesh);

    // Pre-Loaded Deck Containers on MV Wharf-Alpha (Leaving Bay 04 at X = 0, Z = -22 open)
    const isoColors = [0x0284c7, 0xd97706, 0x059669, 0x991b1b, 0x4f46e5];
    [-28, -14, 14, 28].forEach((bx, bIdx) => {
      [-6.5, 0, 6.5].forEach((rz, rIdx) => {
        for (let tier = 0; tier < 2; tier++) {
          const cMat = new THREE.MeshLambertMaterial({
            color: isoColors[(bIdx + rIdx + tier) % isoColors.length]
          });
          const cMesh = new THREE.Mesh(new THREE.BoxGeometry(11.5, 3.2, 3.2), cMat);
          cMesh.position.set(bx, 10.1 + tier * 3.25, rz);
          shipGroup.add(cMesh);
        }
      });
    });

    // Base Tier under Target Bay 04 (X = 0, Z = 0 local => Z = -22 world)
    const bay04Base = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 3.2, 3.2),
      new THREE.MeshLambertMaterial({ color: 0x0284c7 })
    );
    bay04Base.position.set(0, 10.1, 0);
    shipGroup.add(bay04Base);

    // Target Bay 04 • Row 02 • Tier 82 Highlight Wireframe Slot
    const targetSlotWire = new THREE.Mesh(
      new THREE.BoxGeometry(11.8, 3.35, 3.35),
      new THREE.MeshBasicMaterial({ color: 0x2ecc71, wireframe: true })
    );
    // World Y = -1.5 + 13.35 = 11.85, World Z = -22
    targetSlotWire.position.set(0, 13.35, 0);
    shipGroup.add(targetSlotWire);

    // =========================================================================
    // 4. YARD CONTAINER STACKS & REEFER POWER RACKS (Z = +48 to +85)
    // =========================================================================
    for (let sx = -75; sx <= -20; sx += 16) {
      for (let sz = 52; sz <= 74; sz += 10) {
        const tiers = 2 + ((Math.abs(sx + sz)) % 2);
        for (let t = 0; t < tiers; t++) {
          const mat = new THREE.MeshLambertMaterial({
            color: isoColors[(Math.abs(sx) + t) % isoColors.length]
          });
          const box = new THREE.Mesh(new THREE.BoxGeometry(12, 3.2, 3.2), mat);
          box.position.set(sx, 1.6 + t * 3.25, sz);
          scene.add(box);
        }
      }
    }

    // Dedicated Reefer Staging Area (White 20ft Refrigerated Containers + 440V Racks)
    const reeferWhiteMat = new THREE.MeshLambertMaterial({ color: 0xf8fafc });
    const rackBlueMat = new THREE.MeshLambertMaterial({ color: 0x0284c7 });
    for (let rx = 24; rx <= 72; rx += 16) {
      for (let t = 0; t < 2; t++) {
        const rBox = new THREE.Mesh(new THREE.BoxGeometry(12, 3.2, 3.2), reeferWhiteMat);
        rBox.position.set(rx, 1.6 + t * 3.25, 56);
        scene.add(rBox);
      }
      const powerRack = new THREE.Mesh(new THREE.BoxGeometry(2.2, 6.5, 1.2), rackBlueMat);
      powerRack.position.set(rx - 7.2, 3.25, 56);
      scene.add(powerRack);
    }

    // =========================================================================
    // 5. SHIP-TO-SHORE (STS) GANTRY QUAY CRANE (STRADDLING Z = 6 & Z = 24)
    // =========================================================================
    const craneYellowMat = new THREE.MeshLambertMaterial({ color: 0xeab308 });
    const craneDarkMat = new THREE.MeshLambertMaterial({ color: 0x1e293b });

    const craneGroup = new THREE.Group();
    craneGroup.position.set(0, 0, 0);
    scene.add(craneGroup);

    // 4 Portal Legs straddling Z = 6 (Waterside) and Z = 24 (Landside) at X = -9 and X = +9
    [-9, 9].forEach((lx) => {
      [6, 24].forEach((lz) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.8, 30, 1.8), craneYellowMat);
        leg.position.set(lx, 15, lz);
        craneGroup.add(leg);
      });

      // Cross Portal Beams
      const portalCross = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 20), craneYellowMat);
      portalCross.position.set(lx, 12, 15);
      craneGroup.add(portalCross);

      // Upper Boom Support Side Girders (Extending from Z = +32 out over water to Z = -34)
      const boomBeam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 68), craneYellowMat);
      boomBeam.position.set(lx, 29.5, -1);
      craneGroup.add(boomBeam);

      // Apex A-Frame Tower
      const apexPillar = new THREE.Mesh(new THREE.BoxGeometry(1.5, 13, 1.5), craneYellowMat);
      apexPillar.position.set(lx, 36, 15);
      craneGroup.add(apexPillar);
    });

    // Top Cross Girders
    [-28, 6, 15, 24].forEach((gz) => {
      const crossGirder = new THREE.Mesh(new THREE.BoxGeometry(20, 1.6, 1.6), craneYellowMat);
      crossGirder.position.set(0, 29.5, gz);
      craneGroup.add(crossGirder);
    });

    // Machinery House at Landside Top
    const machineryHouse = new THREE.Mesh(new THREE.BoxGeometry(14, 4.5, 9), craneDarkMat);
    machineryHouse.position.set(0, 32.5, 25);
    craneGroup.add(machineryHouse);

    // Motorized Trolley Group (Translates along Z from +15 landside to -22 over vessel)
    const trolleyGroup = new THREE.Group();
    trolleyGroup.position.set(0, 28.2, 15);
    scene.add(trolleyGroup);

    const trolleyCarriage = new THREE.Mesh(new THREE.BoxGeometry(13, 1.2, 5.2), craneDarkMat);
    trolleyGroup.add(trolleyCarriage);

    // Operator Cabin suspended beneath Trolley
    const operatorCabin = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.8, 3.4), reeferWhiteMat);
    operatorCabin.position.set(5.2, -1.8, 0);
    trolleyGroup.add(operatorCabin);

    // Spreader Assembly & 4 Hoist Cables
    const spreaderGroup = new THREE.Group();
    spreaderGroup.position.set(0, 18.0, 15);
    scene.add(spreaderGroup);

    const spreaderBeam = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.85, 3.2), craneYellowMat);
    spreaderGroup.add(spreaderBeam);

    // 4 Corner Twistlock Status Beacons on Spreader
    const twistlockMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    [
      [-5.4, -1.3],
      [5.4, -1.3],
      [-5.4, 1.3],
      [5.4, 1.3]
    ].forEach(([cx, cz]) => {
      const lockLight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), twistlockMat);
      lockLight.position.set(cx, -0.45, cz);
      spreaderGroup.add(lockLight);
    });

    // 4 Dynamic Hoist Cables connecting Trolley to Spreader
    const cableMat = new THREE.MeshBasicMaterial({ color: 0xcbd5e1 });
    const hoistCables = [];
    [
      [-4.8, -1.1],
      [4.8, -1.1],
      [-4.8, 1.1],
      [4.8, 1.1]
    ].forEach(([cx, cz]) => {
      const cableMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), cableMat);
      cableMesh.position.set(cx, 23, 15 + cz);
      scene.add(cableMesh);
      hoistCables.push({ mesh: cableMesh, ox: cx, oz: cz });
    });

    // =========================================================================
    // 6. INBOUND DELIVERY TRUCK, KALMAR REACH STACKER & TARGET CONTAINER
    // =========================================================================
    // Delivery Truck staged on Transfer Lane (X = -14, Z = 32)
    const truckGroup = new THREE.Group();
    truckGroup.position.set(-14, 0, 32);
    scene.add(truckGroup);

    const truckCab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 4.0, 3.2), reeferWhiteMat);
    truckCab.position.set(-7.5, 2.2, 0);
    truckGroup.add(truckCab);

    const truckBed = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.8, 3.1), craneDarkMat);
    truckBed.position.set(0, 1.1, 0);
    truckGroup.add(truckBed);

    // Yellow Kalmar Reach Stacker / Heavy Forklift (Moves from Z = 41 to Z = 22)
    const stackerGroup = new THREE.Group();
    stackerGroup.position.set(0, 0, 39);
    scene.add(stackerGroup);

    const stackerBody = new THREE.Mesh(new THREE.BoxGeometry(4.6, 3.2, 7.5), craneYellowMat);
    stackerBody.position.set(0, 1.8, 0);
    stackerGroup.add(stackerBody);

    const stackerCab = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.5, 3.0), craneDarkMat);
    stackerCab.position.set(0, 4.4, -0.5);
    stackerGroup.add(stackerCab);

    const stackerBoom = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 11.5), craneYellowMat);
    stackerBoom.position.set(0, 5.2, -3.5);
    stackerBoom.rotation.x = 0.22;
    stackerGroup.add(stackerBoom);

    // THE ACTIVE TARGET ISO CONTAINER (Styled dynamically by Goods Category)
    const targetContainerGroup = new THREE.Group();
    targetContainerGroup.position.set(0, 3.2, 32);
    scene.add(targetContainerGroup);

    // Perishable = White Reefer (0xf8fafc), Electronics = Deep Navy (0x1e3a8a), Raw Materials = Emerald Green (0x059669)
    const containerPrimaryHex = isPerishable
      ? 0xf8fafc
      : isElectronics
      ? 0x1e3a8a
      : 0x059669;
    const containerStripeHex = isPerishable
      ? 0x38bdf8
      : isElectronics
      ? 0x60a5fa
      : 0xfacc15;

    const activeContainerMat = new THREE.MeshLambertMaterial({
      color: containerPrimaryHex
    });
    const activeContainerMesh = new THREE.Mesh(
      new THREE.BoxGeometry(11.5, 3.2, 3.2),
      activeContainerMat
    );
    targetContainerGroup.add(activeContainerMesh);

    const accentStripe = new THREE.Mesh(
      new THREE.BoxGeometry(11.55, 0.45, 3.26),
      new THREE.MeshBasicMaterial({ color: containerStripeHex })
    );
    accentStripe.position.set(0, 0.9, 0);
    targetContainerGroup.add(accentStripe);

    // =========================================================================
    // 7. INTERACTIVE CAMERA HOTKEYS & ORBIT MOUSE LISTENERS
    // =========================================================================
    const onKeyDown = (e) => {
      if (e.key === '1') switchCamera(1);
      if (e.key === '2') switchCamera(2);
      if (e.key === '3') switchCamera(3);
      if (e.key === '4') switchCamera(4);
    };

    const onContextMenu = (e) => e.preventDefault();
    const onMouseDown = (e) => {
      if (e.button === 2 || e.button === 0) {
        orbitRef.current.isRightDown = true;
        orbitRef.current.lastX = e.clientX;
        orbitRef.current.lastY = e.clientY;
      }
    };
    const onMouseMove = (e) => {
      if (!orbitRef.current.isRightDown) return;
      const dx = e.clientX - orbitRef.current.lastX;
      const dy = e.clientY - orbitRef.current.lastY;
      orbitRef.current.lastX = e.clientX;
      orbitRef.current.lastY = e.clientY;
      orbitRef.current.yaw -= dx * 0.006;
      orbitRef.current.pitch = Math.max(0.12, Math.min(1.35, orbitRef.current.pitch + dy * 0.006));
    };
    const onMouseUp = () => {
      orbitRef.current.isRightDown = false;
    };
    const onWheel = (e) => {
      orbitRef.current.distance = Math.max(
        28,
        Math.min(125, orbitRef.current.distance + e.deltaY * 0.04)
      );
    };

    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('mousedown', onMouseDown);
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

    // =========================================================================
    // 8. 60FPS 4-PHASE LOADING & AUTOMATED HARBOR DEPARTURE LOOP (0.0s – 16.0s)
    // =========================================================================
    const clock = new THREE.Clock();
    let animId;
    let elapsed = 0;
    let hudTimer = 0;

    const smoothstep = (min, max, value) => {
      const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
      return x * x * (3 - 2 * x);
    };

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      elapsed = Math.min(16.2, elapsed + dt);

      // Subtle vessel buoyancy heave in the berth
      shipGroup.position.y = -1.5 + Math.sin(elapsed * 1.6) * 0.12;
      shipGroup.rotation.z = Math.sin(elapsed * 1.1) * 0.004;

      let containerX = 0;
      let containerY = 3.2;
      let containerZ = 32;

      let trolleyZ = 15;
      let spreaderY = 18.0;

      let phaseCode = 'PHASE A';
      let phaseTitle = 'YARD APRON TRANSFER • REACH STACKER HOIST';
      let craneStatus = 'SPREADER POSITIONING';
      let twistlockState = 'UNLOCKED (APPROACH)';

      const countdownSec = Math.max(0, Math.ceil(16.0 - elapsed));

      // -----------------------------------------------------------------------
      // PHASE A (0.0s – 4.0s): Reach Stacker transfers container from Z=32 to Z=15 under STS Gantry
      // -----------------------------------------------------------------------
      if (elapsed <= 4.0) {
        const pA = smoothstep(0.3, 3.6, elapsed);
        const liftArc = Math.sin(pA * Math.PI) * 1.8;

        containerZ = THREE.MathUtils.lerp(32, 15, pA);
        containerY = THREE.MathUtils.lerp(3.2, 1.65, pA) + liftArc;

        // Reach stacker drives forward with the container and backs clear at 3.6s
        const stackerRetreat = elapsed > 3.5 ? smoothstep(3.5, 4.0, elapsed) * 6 : 0;
        stackerGroup.position.z = containerZ + 7.2 + stackerRetreat;

        // STS Spreader lowers from Y=18 down to Y=3.75 above Z=15
        trolleyZ = 15;
        spreaderY = THREE.MathUtils.lerp(18.0, 3.75, smoothstep(1.2, 3.9, elapsed));
        twistlockMat.color.setHex(0xfacc15);
      }
      // -----------------------------------------------------------------------
      // PHASE B (4.0s – 8.5s): STS Gantry Crane Hoist (+Y), Trolley Traverse (-Z), Lower to Bay 04
      // -----------------------------------------------------------------------
      else if (elapsed <= 8.5) {
        phaseCode = 'PHASE B';
        phaseTitle = 'STS GANTRY HOIST & TROLLEY TRANSLATION TO BAY 04';
        craneStatus = 'HOIST ACTIVE / SPREADER LOCKED';
        twistlockState = 'LOCKED (SOLAS VGM VERIFIED)';
        twistlockMat.color.setHex(0x2ecc71);

        // Keep reach stacker parked safely clear
        stackerGroup.position.z = 29;

        if (elapsed <= 5.4) {
          // Sub-step B1 (4.0s – 5.4s): Vertical hoist from Y=1.65 to Y=21.5 at Z=15
          const pHoist = smoothstep(4.0, 5.4, elapsed);
          trolleyZ = 15;
          containerZ = 15;
          containerY = THREE.MathUtils.lerp(1.65, 21.5, pHoist);
          spreaderY = containerY + 2.05;
        } else if (elapsed <= 7.2) {
          // Sub-step B2 (5.4s – 7.2s): Horizontal trolley translation from Z=15 to Z=-22 over vessel
          const pTrav = smoothstep(5.4, 7.2, elapsed);
          trolleyZ = THREE.MathUtils.lerp(15, -22, pTrav);
          containerZ = trolleyZ;
          containerY = 21.5;
          spreaderY = containerY + 2.05;
        } else {
          // Sub-step B3 (7.2s – 8.5s): Lower container into Bay 04 • Row 02 • Tier 82 (Y=11.85, Z=-22)
          const pLower = smoothstep(7.2, 8.5, elapsed);
          trolleyZ = -22;
          containerZ = -22;
          containerY = THREE.MathUtils.lerp(21.5, 11.85, pLower);
          spreaderY = containerY + 2.05;
        }
      }
      // -----------------------------------------------------------------------
      // PHASE C (8.5s – 11.0s): Twistlock Release, Cell Guide Lock & Spreader Retraction
      // -----------------------------------------------------------------------
      else if (elapsed <= 11.0) {
        phaseCode = 'PHASE C';
        phaseTitle = 'STOWAGE COMPLETE • SECURING CELL GUIDES';
        craneStatus = 'CELL GUIDES LOCKED • SPREADER RETRACTING';
        twistlockState = 'RELEASED (STOWAGE CONFIRMED)';
        twistlockMat.color.setHex(0x38bdf8);

        trolleyZ = -22;
        containerX = shipGroup.position.x;
        containerZ = shipGroup.position.z;
        containerY = shipGroup.position.y + 13.35;

        const pRetract = smoothstep(8.6, 10.8, elapsed);
        spreaderY = THREE.MathUtils.lerp(13.9, 25.5, pRetract);
      }
      // -----------------------------------------------------------------------
      // PHASE D (11.0s – 16.0s): Automated Harbor Departure & Undocking to Open Sea
      // -----------------------------------------------------------------------
      else {
        phaseCode = 'PHASE D';
        phaseTitle = `MOORING RELEASED • UNDERWAY TO OPEN SEA LANE (AUTONOMOUS TRANSIT IN ${countdownSec}s)`;
        craneStatus = 'BOOM PARKED • VESSEL UNDERWAY';
        twistlockState = 'STOWED ABOARD MV WHARF-ALPHA';
        twistlockMat.color.setHex(0x2ecc71);

        // Retract trolley back toward quay edge while spreader stays high
        const pPark = smoothstep(11.0, 14.0, elapsed);
        trolleyZ = THREE.MathUtils.lerp(-22, -6, pPark);
        spreaderY = 25.5;

        // Smoothly accelerate MV Wharf-Alpha forward (-X bow direction) & ease outward (-Z) into channel
        const pDepart = smoothstep(11.0, 16.0, elapsed);
        shipGroup.position.x = THREE.MathUtils.lerp(0, -68, pDepart);
        shipGroup.position.z = THREE.MathUtils.lerp(-22, -34, pDepart);
        shipGroup.rotation.y = THREE.MathUtils.lerp(0, -0.06, Math.sin(pDepart * Math.PI));

        // Lock target container inside Bay 04 aboard the departing vessel
        containerX = shipGroup.position.x;
        containerY = shipGroup.position.y + 13.35;
        containerZ = shipGroup.position.z;

        // Hide green wireframe guide once vessel departs
        targetSlotWire.visible = false;

        // Animate growing & pulsing white propeller wake foam at stern
        wakeMat.opacity = THREE.MathUtils.lerp(0.0, 0.72, Math.min(1, (elapsed - 11.0) / 1.2));
        const wakeScaleX = 1.0 + pDepart * 1.8 + Math.sin(elapsed * 9) * 0.08;
        const wakeScaleZ = 1.0 + Math.cos(elapsed * 7) * 0.08;
        sternWakeMesh.scale.set(wakeScaleX, wakeScaleZ, 1);

        // Elevate & pulse dark diesel exhaust plumes from twin funnels
        exhaustMat.opacity = THREE.MathUtils.lerp(0.0, 0.42, Math.min(1, (elapsed - 11.0) / 1.0));
        exhaustPlumes.forEach((ep) => {
          const cycle = ((elapsed * 2.2 + ep.phase) % 3.0) / 3.0;
          ep.mesh.position.y = ep.baseY + cycle * 6.5;
          ep.mesh.position.x = ep.baseX + cycle * 4.2;
          const s = 1.0 + cycle * 0.9;
          ep.mesh.scale.set(s, 1.0 + cycle * 0.5, s);
        });

        // Zero-click automated handover at 15.8s
        if (elapsed >= 15.8 && !hasTriggeredCompleteRef.current) {
          handleLaunchSeaTransit();
        }
      }

      // Apply computed transforms to Container, Trolley, Spreader & 4 Hoist Cables
      targetContainerGroup.position.set(containerX, containerY, containerZ);
      targetContainerGroup.rotation.y = shipGroup.rotation.y;
      trolleyGroup.position.set(0, 28.2, trolleyZ);
      spreaderGroup.position.set(0, spreaderY, trolleyZ);

      const cableTopY = 28.2;
      const cableLen = Math.max(0.5, cableTopY - spreaderY);
      const cableMidY = spreaderY + cableLen / 2;

      hoistCables.forEach((hc) => {
        hc.mesh.scale.set(1, cableLen, 1);
        hc.mesh.position.set(hc.ox, cableMidY, trolleyZ + hc.oz);
      });

      // =======================================================================
      // 9. 4-MODE CAMERA DIRECTOR + PHASE D DEPARTURE TRACKING CAMERA
      // =======================================================================
      const mode = cameraModeRef.current;
      if (elapsed > 11.0 && mode === 1 && !orbitRef.current.isRightDown) {
        // Phase D Cinematic Departure Camera tracking alongside MV Wharf-Alpha
        const depCamPos = new THREE.Vector3(
          shipGroup.position.x - 42,
          22.0,
          shipGroup.position.z + 44
        );
        camera.position.lerp(depCamPos, 3.5 * dt);
        camLookTarget.lerp(
          new THREE.Vector3(shipGroup.position.x + 8, 10.5, shipGroup.position.z),
          5.0 * dt
        );
        camera.lookAt(camLookTarget);
      } else if (mode === 1) {
        // [1] Quayside Isometric Orbit
        const orb = orbitRef.current;
        const slowAutoYaw = orb.isRightDown ? orb.yaw : orb.yaw + Math.sin(elapsed * 0.25) * 0.14;
        const cx = Math.sin(slowAutoYaw) * Math.cos(orb.pitch) * orb.distance;
        const cy = Math.sin(orb.pitch) * orb.distance + 6;
        const cz = Math.cos(slowAutoYaw) * Math.cos(orb.pitch) * orb.distance - 4;

        camera.position.lerp(new THREE.Vector3(cx, cy, cz), 6.0 * dt);
        camLookTarget.lerp(
          new THREE.Vector3(
            containerX * 0.5,
            Math.max(6, containerY * 0.55),
            containerZ * 0.45
          ),
          6.0 * dt
        );
        camera.lookAt(camLookTarget);
      } else if (mode === 2) {
        // [2] High-Altitude STS Crane Cabin POV looking straight down at Spreader & Container
        camera.position.lerp(new THREE.Vector3(4.8, 26.2, trolleyZ + 2.5), 8.0 * dt);
        camLookTarget.lerp(new THREE.Vector3(containerX, containerY, containerZ), 10.0 * dt);
        camera.lookAt(camLookTarget);
      } else if (mode === 3) {
        // [3] Ground-Level Yard Reach Stacker Transfer View
        camera.position.lerp(new THREE.Vector3(-24, 7.5, 36), 6.0 * dt);
        camLookTarget.lerp(new THREE.Vector3(containerX, containerY + 1.0, containerZ), 8.0 * dt);
        camera.lookAt(camLookTarget);
      } else {
        // [4] Vessel Navigation Bridge Wing POV looking forward at Bay 04
        camera.position.lerp(
          new THREE.Vector3(shipGroup.position.x + 37, 23.5, shipGroup.position.z + 8),
          6.0 * dt
        );
        camLookTarget.lerp(new THREE.Vector3(containerX, containerY, containerZ), 8.0 * dt);
        camera.lookAt(camLookTarget);
      }

      // =======================================================================
      // 10. 10HZ REACT HUD SYNC
      // =======================================================================
      hudTimer += dt;
      if (hudTimer >= 0.1) {
        hudTimer = 0;
        const pct = Math.min(100, Math.round((elapsed / 15.8) * 100));
        setHud({
          phaseCode,
          phaseTitle,
          progressPct: pct,
          elapsedSec: Math.min(16.0, elapsed).toFixed(1),
          craneStatus,
          twistlockState,
          trolleyOffsetM: Math.abs(trolleyZ - 15).toFixed(1),
          hoistHeightM: spreaderY.toFixed(1),
          reeferStatus: isPerishable
            ? elapsed >= 8.5
              ? 'SHIPBOARD AUX GRID COUPLED (-4.2°C)'
              : 'AUX BUS INTERFACE READY (-4.2°C)'
            : isElectronics
            ? 'SEALED DRY CLIMATE (+22.0°C)'
            : 'STANDARD BULK TRIM (VERIFIED)',
          isComplete: elapsed >= 8.5,
          isDeparting: elapsed > 11.0,
          autoHandoverSec: countdownSec
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      container.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      container.removeEventListener('wheel', onWheel);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
    };
  }, [isPerishable]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10012,
        background: '#060a13',
        fontFamily: "'Inter', sans-serif",
        color: '#f8fafc',
        userSelect: 'none'
      }}
    >
      <div ref={mountRef} style={{ width: '100vw', height: '100vh' }} />

      {/* TOP CENTER TELEMETRY PILL */}
      <div
        style={{
          position: 'absolute',
          top: 18,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          background: 'rgba(11, 17, 32, 0.9)',
          backdropFilter: 'blur(14px)',
          border: `1px solid ${
            hud.isComplete ? 'rgba(46, 204, 113, 0.5)' : 'rgba(56, 189, 248, 0.35)'
          }`,
          borderRadius: 12,
          padding: '9px 20px',
          zIndex: 10025,
          boxShadow: '0 14px 34px rgba(0, 0, 0, 0.55)',
          whiteSpace: 'nowrap'
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: hud.isComplete ? '#2ecc71' : '#38bdf8',
            boxShadow: `0 0 10px ${hud.isComplete ? '#2ecc71' : '#38bdf8'}`
          }}
        />
        <span
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            color: hud.isComplete ? '#2ecc71' : '#38bdf8'
          }}
        >
          {hud.phaseCode}: {hud.phaseTitle}
        </span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#cbd5e1' }}>
          SLOT: <strong style={{ color: '#facc15' }}>BAY 04-02-82</strong>
        </span>
        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: '#cbd5e1' }}>
          CYCLE: <strong style={{ color: '#2ecc71' }}>{hud.progressPct}%</strong>
        </span>
      </div>

      {/* LEFT TELEMATICS PANEL: BERTH ALLOCATION, STS CRANE & REEFER POWER */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          left: 20,
          width: 340,
          background: 'rgba(11, 17, 32, 0.9)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.09)',
          borderRadius: 14,
          padding: '16px 18px',
          zIndex: 10025,
          boxShadow: '0 20px 45px rgba(0, 0, 0, 0.6)'
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
              fontFamily: "'Space Mono', monospace",
              fontSize: 10.5,
              fontWeight: 700,
              color: '#38bdf8',
              letterSpacing: 0.6
            }}
          >
            🏗️ STS GANTRY CRANE #03 // BERTH 02
          </span>
          <span
            style={{
              fontFamily: "'Space Mono', monospace",
              fontSize: 9.5,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 4,
              background: hud.isComplete
                ? 'rgba(46, 204, 113, 0.16)'
                : 'rgba(56, 189, 248, 0.16)',
              color: hud.isComplete ? '#2ecc71' : '#38bdf8',
              border: `1px solid ${
                hud.isComplete ? 'rgba(46, 204, 113, 0.4)' : 'rgba(56, 189, 248, 0.4)'
              }`
            }}
          >
            {hud.isComplete ? 'STOWED' : 'HOISTING'}
          </span>
        </div>

        <div
          style={{
            fontSize: 15,
            fontWeight: 700,
            textTransform: 'uppercase',
            marginBottom: 3
          }}
        >
          {cargoName}
        </div>
        <div
          style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            color: '#94a3b8',
            marginBottom: 12
          }}
        >
          {shipId} • NET {weightKg.toLocaleString()} KG ({teuCount} TEU) • VGM{' '}
          {(verifiedGrossMass * teuCount).toLocaleString()} KG • POD:{' '}
          <strong style={{ color: '#2ecc71' }}>{destination.toUpperCase()}</strong>
        </div>

        {/* Berth & Stowage Telemetry Box */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: 10,
            padding: '10px 12px',
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontSize: 11.5
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>Feeder Vessel</span>
            <strong style={{ fontFamily: "'Space Mono', monospace", color: '#38bdf8' }}>
              MV WHARF-ALPHA
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>Target Cell Guide</span>
            <strong style={{ fontFamily: "'Space Mono', monospace", color: '#facc15' }}>
              {stowageSlot}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>STS Crane Status</span>
            <strong style={{ fontFamily: "'Space Mono', monospace", color: '#2ecc71' }}>
              {hud.craneStatus}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>Spreader Twistlocks</span>
            <strong style={{ fontFamily: "'Space Mono', monospace", color: '#e2e8f0' }}>
              {hud.twistlockState}
            </strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>Reefer Power Status</span>
            <strong style={{ fontFamily: "'Space Mono', monospace", color: '#38bdf8' }}>
              {hud.reeferStatus}
            </strong>
          </div>
        </div>

        {/* Crane Kinematics Metrics */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 12
          }}
        >
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 8,
              padding: '8px 10px'
            }}
          >
            <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 700 }}>
              TROLLEY OUTREACH
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: '#38bdf8',
                marginTop: 2
              }}
            >
              {hud.trolleyOffsetM} m
            </div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 8,
              padding: '8px 10px'
            }}
          >
            <div style={{ fontSize: 9.5, color: '#64748b', fontWeight: 700 }}>
              SPREADER ELEVATION
            </div>
            <div
              style={{
                fontFamily: "'Space Mono', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: '#facc15',
                marginTop: 2
              }}
            >
              +{hud.hoistHeightM} m
            </div>
          </div>
        </div>

        {/* Primary Completion / Auto-Handover Countdown Action Button */}
        <button
          type="button"
          onClick={handleLaunchSeaTransit}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 8,
            border: 'none',
            background: hud.isComplete ? '#2ecc71' : '#38bdf8',
            color: '#060a13',
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
            letterSpacing: 0.4,
            boxShadow: hud.isComplete
              ? '0 0 20px rgba(46, 204, 113, 0.45)'
              : '0 4px 14px rgba(56, 189, 248, 0.3)',
            transition: 'all 0.2s ease'
          }}
        >
          {hud.isDeparting
            ? `DEPARTING HARBOR (AUTO-HANDOVER IN ${hud.autoHandoverSec}s)`
            : '[UNDOCK VESSEL ➔ LAUNCH SEA TRANSIT]'}
        </button>
      </div>

      {/* TOP RIGHT CONTROLS: [⏩ SKIP TO SEA TRANSIT], EXIT & 4-MODE CAMERA DIRECTOR */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-end',
          gap: 10,
          zIndex: 10025
        }}
      >
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleLaunchSeaTransit}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 9,
              background: 'rgba(46, 204, 113, 0.16)',
              border: '1px solid #2ecc71',
              color: '#2ecc71',
              fontFamily: "'Space Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            [⏩ SKIP TO SEA TRANSIT]
          </button>

          {onExit && (
            <button
              type="button"
              onClick={onExit}
              style={{
                height: 36,
                padding: '0 13px',
                borderRadius: 9,
                background: 'rgba(11, 17, 32, 0.9)',
                border: '1px solid rgba(239, 68, 68, 0.45)',
                color: '#ef4444',
                fontFamily: "'Space Mono', monospace",
                fontSize: 11,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              [✕ COMMAND MAP]
            </button>
          )}
        </div>

        {/* 2x2 Matrix Camera Director Grid */}
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
                onClick={() => switchCamera(cam.id)}
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
    </div>
  );
};

export default PortTerminal3D;