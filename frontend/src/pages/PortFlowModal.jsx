// frontend/src/pages/PortFlowModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import './PortFlowModal.css';

const TICKETS = [
  {
    id: 1,
    code: 'TKT-01',
    subLabel: 'TMS / Gate Ops',
    title: 'Gate-In & SOLAS VGM'
  },
  {
    id: 2,
    code: 'TKT-02',
    subLabel: 'PCS / EDI Exchange',
    title: 'Trade Documentation'
  },
  {
    id: 3,
    code: 'TKT-03',
    subLabel: 'BOC / Border Security',
    title: 'X-Ray Portal Scan'
  },
  {
    id: 4,
    code: 'TKT-04',
    subLabel: 'WMS Min-Heap Dispatch',
    title: 'TOS Yard Queue'
  },
  {
    id: 5,
    code: 'TKT-05',
    subLabel: 'PMS / Bay Allocation',
    title: 'Berth & Stowage Plan'
  }
];

const TOUR_STEPS = [
  {
    step: 1,
    title: 'Header & Manifest Strip',
    position: 'pos-step-1',
    explanation:
      'Monitors active shipment identity, documentary trade terms (Incoterms 2020), and cargo cold-chain integrity across port gates.'
  },
  {
    step: 2,
    title: '5-Ticket PCS/TOS Stepper Bar',
    position: 'pos-step-2',
    explanation:
      'Simulates the statutory chain of custody across port terminal systems (TMS Gate Ops → PCS EDI Docs → Customs NII X-Ray → TOS Yard Queue → PMS Berth Stowage).'
  },
  {
    step: 3,
    title: 'Operational Workspace',
    position: 'pos-step-3',
    explanation:
      'Where operators inspect live weighbridge sensors, verify statutory trade manifests, run density scans, and audit binary min-heap priority queues.'
  },
  {
    step: 4,
    title: 'Interlock Sign-Off Action Button',
    position: 'pos-step-4',
    explanation:
      'Digitally signs off on the regulatory interlock (SOLAS Chapter VI, UCP 600, BOC NII) and dispatches the consignment to the next terminal phase.'
  }
];

const resolveHsCode = (cargoName = '', category = '') => {
  const c = cargoName.toLowerCase();
  const cat = category.toLowerCase();
  if (c.includes('banana') || c.includes('cavendish')) {
    return {
      code: '0803.90.00',
      desc: 'Fresh Cavendish Bananas (Musa acuminata) — Export Grade A'
    };
  }
  if (
    c.includes('mango') ||
    c.includes('pineapple') ||
    c.includes('durian') ||
    cat.includes('perishable')
  ) {
    return {
      code: '0804.50.20',
      desc: 'Tropical Perishable Horticultural Produce — Cold Chain Regulated'
    };
  }
  if (cat.includes('electronic') || c.includes('chip') || c.includes('semiconductor')) {
    return {
      code: '8542.31.00',
      desc: 'Electronic Integrated Circuits & Microassemblies'
    };
  }
  return {
    code: '7208.51.00',
    desc: 'Industrial Bulk Commodities & Standardized Intermodal Freight'
  };
};

// Crisp Inline Institutional SVG Icons
const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ShieldIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const FileTextIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </svg>
);

const ScanIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <line x1="7" y1="12" x2="17" y2="12" />
  </svg>
);

const LayersIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2" />
    <polyline points="2 17 12 22 22 17" />
    <polyline points="2 12 12 17 22 12" />
  </svg>
);

const AnchorIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="5" r="3" />
    <line x1="12" y1="22" x2="12" y2="8" />
    <path d="M5 12H2a10 10 0 0 0 20 0h-3" />
  </svg>
);

const PortFlowModal = ({
  shipment = {},
  initialHealth = 100,
  weatherState = 'NOMINAL',
  onComplete,
  onClose
}) => {
  // Consignment Metadata
  const cargoName = shipment.cargo || 'Cavendish Bananas';
  const weightKg = Number(shipment.weightKg) || 15000;
  const destination = shipment.destination || 'Singapore';
  const category = shipment.category || 'Perishable (Food)';
  const incoterm = shipment.incoterm || 'CIF';
  const shipId = shipment.id || 'TRK-49';

  // Restore cleared tickets across [✕ HOLD AT GATE] re-entry
  const [activeStep, setActiveStep] = useState(() => {
    const saved = localStorage.getItem(`wharf_portflow_step_${shipId}`);
    return saved ? Number(saved) : 1;
  });

  const [completedSteps, setCompletedSteps] = useState(() => {
    try {
      const saved = localStorage.getItem(`wharf_portflow_done_${shipId}`);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isProcessing, setIsProcessing] = useState(false);

  // Interactive Spotlight Walkthrough State (0 = Inactive, 1..4 = Active Step)
  const [tourStep, setTourStep] = useState(0);

  // Dismiss Tour on Esc Key
  useEffect(() => {
    if (!tourStep) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setTourStep(0);
      } else if (e.key === 'ArrowRight' && tourStep < 4) {
        setTourStep((prev) => prev + 1);
      } else if (e.key === 'ArrowLeft' && tourStep > 1) {
        setTourStep((prev) => prev - 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tourStep]);

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
  const vgmCompliant = payloadPerTeu <= 25000;

  // Ticket #1 State
  const [selectedYardZone, setSelectedYardZone] = useState(
    isPerishable ? 'REEFER_YARD' : 'DRY_CY'
  );

  // Ticket #2 State
  const [activeDocTab, setActiveDocTab] = useState('EBL');
  const [inspectedDocs, setInspectedDocs] = useState({
    EBL: true,
    BOC: false,
    PACKING: false,
    COO: false
  });

  // Ticket #3 State (Automatically restored if TKT-03 was already cleared)
  const [xrayProgress, setXrayProgress] = useState(() =>
    completedSteps.includes(3) ? 100 : 0
  );
  const [isScanningXray, setIsScanningXray] = useState(false);
  const [xrayCompleted, setXrayCompleted] = useState(() =>
    completedSteps.includes(3)
  );

  // Ticket #4 State
  const [selectedEquipment, setSelectedEquipment] = useState(
    isPerishable ? 'REEFER_FORKLIFT' : 'REACH_STACKER'
  );

  // Ticket #5 State
  const [selectedStowageSlot, setSelectedStowageSlot] = useState(
    isPerishable
      ? 'BAY 04 • ROW 02 • TIER 82'
      : 'BAY 12 • ROW 04 • TIER 84'
  );

  const hsInfo = useMemo(() => resolveHsCode(cargoName, category), [cargoName, category]);

  // Ticket #4 Weighted Min-Heap Priority Breakdown
  // Formula: Priority Score = (Perishability * 0.5) + (Wait Time * 0.3) + (Demurrage * 0.2)
  const heapMetrics = useMemo(() => {
    const perishabilityRaw = isPerishable ? 96 : 52;
    const waitTimeRaw = 75;
    const demurrageRaw = weightKg >= 15000 ? 85 : 70;

    const weightedPerishability = Number((perishabilityRaw * 0.5).toFixed(1));
    const weightedWaitTime = Number((waitTimeRaw * 0.3).toFixed(1));
    const weightedDemurrage = Number((demurrageRaw * 0.2).toFixed(1));
    const totalScore = Number(
      (weightedPerishability + weightedWaitTime + weightedDemurrage).toFixed(1)
    );

    const queueList = [
      {
        rank: 'PRIORITY 1 [ROOT]',
        id: shipId,
        cargo: cargoName,
        equipment: isPerishable ? 'Reefer Forklift #04' : 'Kalmar Reach Stacker #02',
        score: totalScore,
        isCurrent: true
      },
      {
        rank: 'PRIORITY 2',
        id: 'TRK-42',
        cargo: 'Robusta Coffee Beans',
        equipment: 'Kalmar Reach Stacker #01',
        score: 68.4,
        isCurrent: false
      },
      {
        rank: 'PRIORITY 3',
        id: 'TRK-38',
        cargo: 'Refined Coconut Oil',
        equipment: 'Kalmar Reach Stacker #03',
        score: 61.0,
        isCurrent: false
      }
    ];

    return {
      perishabilityRaw,
      waitTimeRaw,
      demurrageRaw,
      weightedPerishability,
      weightedWaitTime,
      weightedDemurrage,
      totalScore,
      queueList
    };
  }, [isPerishable, weightKg, shipId, cargoName]);

  const selectDocumentTab = (docKey) => {
    setActiveDocTab(docKey);
    setInspectedDocs((prev) => ({ ...prev, [docKey]: true }));
  };

  // Step Progression Handlers
  const completeStep = (stepNumber, nextStepNumber) => {
    setIsProcessing(true);
    setTimeout(() => {
      setIsProcessing(false);
      setCompletedSteps((prev) => {
        const nextDone = prev.includes(stepNumber) ? prev : [...prev, stepNumber];
        localStorage.setItem(`wharf_portflow_done_${shipId}`, JSON.stringify(nextDone));
        return nextDone;
      });

      if (nextStepNumber) {
        setActiveStep(nextStepNumber);
        localStorage.setItem(`wharf_portflow_step_${shipId}`, nextStepNumber.toString());
      }
    }, 280);
  };

  const triggerXrayInspection = () => {
    if (isScanningXray || xrayCompleted) return;
    setIsScanningXray(true);
    setXrayProgress(0);
  };

  useEffect(() => {
    if (!isScanningXray) return;
    const timer = setInterval(() => {
      setXrayProgress((prev) => {
        if (prev >= 100) {
          clearInterval(timer);
          setIsScanningXray(false);
          setXrayCompleted(true);
          setCompletedSteps((c) => {
            const nextDone = c.includes(3) ? c : [...c, 3];
            localStorage.setItem(`wharf_portflow_done_${shipId}`, JSON.stringify(nextDone));
            return nextDone;
          });
          return 100;
        }
        return prev + 4;
      });
    }, 40);
    return () => clearInterval(timer);
  }, [isScanningXray]);

  const handleFinalApproval = () => {
    setIsProcessing(true);
    setCompletedSteps((prev) => (prev.includes(5) ? prev : [...prev, 5]));
    setTimeout(() => {
      setIsProcessing(false);
      if (onComplete) {
        onComplete({
          success: true,
          finalHealth: Math.round(initialHealth),
          stage: 'QUAYSIDE_CRANE_LOADING',
          stowageSlot: selectedStowageSlot,
          yardZone: selectedYardZone,
          equipment: selectedEquipment
        });
      }
    }, 340);
  };

  const DOCUMENT_MANIFESTS = {
    EBL: {
      refCode: 'DOC-01 // UCP 600 ART. 19/20',
      title: 'Electronic Bill of Lading (eB/L)',
      authority: 'WharfIntel Ocean Carrier Line • Cryptographic EDI Hash Verified',
      rows: [
        { label: 'B/L Reference Number', value: `WI-DVO-${shipId.replace('TRK-', '')}8820` },
        { label: 'Consignor / Shipper', value: 'Mindanao Agro-Industrial Exporters Inc.' },
        { label: 'Consignee', value: `To the Order of ${destination} Port Authority` },
        { label: 'Governing Incoterm', value: `${incoterm} (Incoterms 2020)` },
        {
          label: 'Container & Seal ID',
          value: `${teuCount}x20' ${isPerishable ? 'Reefer' : 'Dry'} • Seal #PH-${shipId}99`
        },
        { label: 'Carrier Notation', value: 'CLEAN ON BOARD — APPARENT GOOD ORDER' }
      ]
    },
    BOC: {
      refCode: 'DOC-02 // BOC SAD-E2M',
      title: 'BOC Customs Export Declaration',
      authority: 'Republic of the Philippines • Bureau of Customs (Port of Davao)',
      rows: [
        { label: 'Export Entry Number', value: `E2M-2026-DVO-00${shipId.replace('TRK-', '')}` },
        { label: 'AHTN / HS Tariff Code', value: hsInfo.code },
        { label: 'Commodity Classification', value: hsInfo.desc },
        { label: 'Assessed Export Duty', value: 'PHP 0.00 (Zero-Rated Export)' },
        { label: 'Selectivity Channel', value: 'GREEN LANE (Authorized Economic Operator)' },
        { label: 'Customs Disposition', value: 'AUTHORITY TO LOAD (ATL) ISSUED' }
      ]
    },
    PACKING: {
      refCode: 'DOC-03 // SOLAS VGM CERT',
      title: 'Commercial Packing List & Weight Certificate',
      authority: 'Panabo Consolidation Terminal • Calibrated Weighbridge #02',
      rows: [
        { label: 'Total Net Cargo Weight', value: `${weightKg.toLocaleString()} kg` },
        {
          label: 'Container Tare Weight',
          value: `${(tareWeightPerTeu * teuCount).toLocaleString()} kg (${teuCount} TEU)`
        },
        {
          label: 'Verified Gross Mass (VGM)',
          value: `${(verifiedGrossMass * teuCount).toLocaleString()} kg (SOLAS Method 1)`
        },
        {
          label: 'Payload vs. Crane Limit',
          value: `${payloadPerTeu.toLocaleString()} kg / 25,000 kg Max`
        },
        {
          label: 'Package Count & Type',
          value: `${Math.round(weightKg / 13.5).toLocaleString()} Export Cartons (Palletized)`
        },
        {
          label: 'Thermal Setpoint',
          value: isPerishable
            ? '-4.2°C Continuous Cold Chain'
            : isElectronics
            ? '+22.0°C Sealed Dry Climate Control'
            : 'Ambient Dry Standard Bulk Trim'
        }
      ]
    },
    COO: {
      refCode: 'DOC-04 // ASEAN ATIGA FORM D',
      title: 'Certificate of Origin (ASEAN Form D)',
      authority: 'Department of Trade & Industry (DTI) • ASEAN Single Window',
      rows: [
        { label: 'Country of Origin', value: 'PHILIPPINES (Davao Region XI)' },
        { label: 'Destination Market', value: destination.toUpperCase() },
        { label: 'Origin Criterion', value: 'WO (Wholly Obtained within PH)' },
        { label: 'Preferential Tariff Rate', value: '0.0% Import Duty (ATIGA Concession)' },
        {
          label: 'Phytosanitary Certificate',
          value: isPerishable ? 'BPI-PHYTO-2026 CLEARED' : 'EXEMPT (Non-Biological)'
        },
        { label: 'ASW Digital Status', value: 'AUTHENTICATED & TRANSMITTED' }
      ]
    }
  };

  const activeTourConfig = tourStep > 0 ? TOUR_STEPS[tourStep - 1] : null;

  return (
    <div className="pf-modal-overlay">
      <div className={`pf-modal-shell ${tourStep > 0 ? 'pf-tour-mode' : ''}`}>
        {/* INTERACTIVE SPOTLIGHT WALKTHROUGH BACKDROP & TOOLTIP */}
        {tourStep > 0 && activeTourConfig && (
          <>
            <div
              className="pf-tour-backdrop"
              onClick={() => setTourStep(0)}
              aria-label="Dismiss Walkthrough"
            />
            <div
              className={`pf-tour-tooltip ${activeTourConfig.position}`}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pf-tour-tooltip-top">
                <span className="pf-tour-step-pill pf-mono">
                  STEP {activeTourConfig.step} OF 4 // WALKTHROUGH
                </span>
                <button
                  type="button"
                  className="pf-tour-skip-btn pf-mono"
                  onClick={() => setTourStep(0)}
                >
                  [✕ Skip Tour]
                </button>
              </div>
              <h4 className="pf-tour-tooltip-title">{activeTourConfig.title}</h4>
              <p className="pf-tour-tooltip-desc">{activeTourConfig.explanation}</p>
              <div className="pf-tour-tooltip-actions">
                <div className="pf-tour-dots">
                  {TOUR_STEPS.map((s) => (
                    <span
                      key={s.step}
                      className={`pf-tour-dot ${tourStep === s.step ? 'is-active' : ''}`}
                      onClick={() => setTourStep(s.step)}
                    />
                  ))}
                </div>
                <div className="pf-tour-nav-btns">
                  <button
                    type="button"
                    className="pf-tour-nav-btn pf-mono"
                    disabled={tourStep === 1}
                    onClick={() => setTourStep((prev) => Math.max(1, prev - 1))}
                  >
                    [← Prev]
                  </button>
                  {tourStep < 4 ? (
                    <button
                      type="button"
                      className="pf-tour-nav-btn pf-tour-nav-primary pf-mono"
                      onClick={() => setTourStep((prev) => Math.min(4, prev + 1))}
                    >
                      [Next →]
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="pf-tour-nav-btn pf-tour-nav-finish pf-mono"
                      onClick={() => setTourStep(0)}
                    >
                      [✓ Finish Tour]
                    </button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* INSTITUTIONAL TOP HEADER (Locked flex-shrink: 0) */}
        <header className={`pf-header ${tourStep === 1 ? 'pf-spotlight-active' : ''}`}>
          <div className="pf-header-brand">
            <div className="pf-status-indicator">
              <span className="pf-status-dot" />
              <span className="pf-status-label">
                PORT COMMUNITY SYSTEM // TERMINAL OPERATING SYSTEM
              </span>
            </div>
            <h1>Davao International Container Terminal / Quayside Clearance</h1>
          </div>

          <div className="pf-header-controls">
            <div className="pf-manifest-strip">
              <div className="pf-strip-item">
                <span className="pf-strip-label">ORDER</span>
                <span className="pf-strip-val pf-mono">{shipId}</span>
              </div>
              <div className="pf-strip-divider" />
              <div className="pf-strip-item">
                <span className="pf-strip-label">COMMODITY</span>
                <span className="pf-strip-val">{cargoName}</span>
              </div>
              <div className="pf-strip-divider" />
              <div className="pf-strip-item">
                <span className="pf-strip-label">INCOTERM</span>
                <span className="pf-strip-val pf-mono pf-amber">{incoterm} 2020</span>
              </div>
              <div className="pf-strip-divider" />
              <div className="pf-strip-item">
                <span className="pf-strip-label">INTEGRITY</span>
                <span className="pf-strip-val pf-mono pf-emerald">
                  {Math.round(initialHealth)}%
                </span>
              </div>
            </div>

            <button
              type="button"
              className={`pf-walkthrough-btn pf-mono ${tourStep > 0 ? 'is-active' : ''}`}
              onClick={() => setTourStep(tourStep > 0 ? 0 : 1)}
            >
              (?) WALKTHROUGH
            </button>

            {onClose && (
              <button type="button" className="pf-hold-btn pf-mono" onClick={onClose}>
                [✕ HOLD AT GATE]
              </button>
            )}
          </div>
        </header>

        {/* 5-STAGE OPERATIONAL STEPPER (Locked flex-shrink: 0) */}
        <nav
          className={`pf-stepper ${tourStep === 2 ? 'pf-spotlight-active' : ''}`}
          aria-label="Clearance Tickets"
        >
          {TICKETS.map((t) => {
            const isDone = completedSteps.includes(t.id);
            const isCurrent = activeStep === t.id;
            const isUnlocked =
              isDone || t.id === 1 || completedSteps.includes(t.id - 1);

            return (
              <button
                key={t.id}
                type="button"
                disabled={!isUnlocked}
                className={`pf-step-item ${isCurrent ? 'is-active' : ''} ${
                  isDone ? 'is-completed' : ''
                }`}
                onClick={() => {
                  if (isUnlocked) {
                    setActiveStep(t.id);
                    localStorage.setItem(`wharf_portflow_step_${shipId}`, t.id.toString());
                  }
                }}
              >
                <div className="pf-step-meta">
                  <span className="pf-step-code pf-mono">{t.code}</span>
                  <span className="pf-step-badge pf-mono">
                    {isDone ? (
                      <>
                        <CheckIcon /> CLEARED
                      </>
                    ) : isCurrent ? (
                      'ACTIVE'
                    ) : (
                      'PENDING'
                    )}
                  </span>
                </div>
                <div className="pf-step-name">{t.title}</div>
                <div className="pf-step-sub">{t.subLabel}</div>
              </button>
            );
          })}
        </nav>

        {/* WORKSPACE BODY (Zero-Scroll Flex Container) */}
        <main className="pf-workspace">
          {/* =========================================================
              TICKET #1: GATE-IN APPOINTMENT & SOLAS VGM
             ========================================================= */}
          {activeStep === 1 && (
            <section className="pf-stage">
              <div className="pf-stage-bar">
                <div className="pf-stage-title-group">
                  <span className="pf-stage-kicker pf-mono">
                    TKT-01 // TMS &amp; GATE OPERATIONS
                  </span>
                  <h2>Gate-In Appointment &amp; SOLAS VGM Verification</h2>
                </div>
                <div className="pf-pill pf-pill-emerald pf-mono">
                  <ShieldIcon /> VGM VERIFIED (&le; 25,000 KG/TEU)
                </div>
              </div>

              <div
                className={`pf-columns ${
                  tourStep === 3 ? 'pf-spotlight-active' : ''
                }`}
              >
                {/* Left Card: Optical OCR Gate Table */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">
                      Optical OCR Gate &amp; Weighbridge Telemetry
                    </span>
                    <span className="pf-panel-tag pf-mono">LANE #02 INBOUND</span>
                  </div>

                  <div className="pf-table">
                    <div className="pf-table-row">
                      <span className="pf-table-label">Tractor Chassis ID</span>
                      <span className="pf-table-val pf-mono">{shipId} (8x4 Prime Mover)</span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Driver E-Pass &amp; RFID Check</span>
                      <span className="pf-table-val pf-mono pf-emerald">
                        AUTHENTICATED (BIO-RFID)
                      </span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Gate Appointment Status</span>
                      <span className="pf-table-val pf-mono pf-cyan">
                        ON-TIME SLOT (0h DEMURRAGE)
                      </span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Container Configuration</span>
                      <span className="pf-table-val pf-mono">
                        {teuCount} TEU ({isPerishable ? "20' ISO Reefer" : "20' ISO Dry Standard"})
                      </span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Net Payload per Container</span>
                      <span className="pf-table-val pf-mono">
                        {payloadPerTeu.toLocaleString()} kg / 25,000 kg Limit
                      </span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Verified Gross Mass (SOLAS VGM)</span>
                      <span
                        className={`pf-table-val pf-mono ${
                          vgmCompliant ? 'pf-emerald' : 'pf-crimson'
                        }`}
                      >
                        {verifiedGrossMass.toLocaleString()} kg / TEU [COMPLIANT]
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Card: Interactive Yard Zone Allocation */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">Terminal Yard Zone Allocation</span>
                    <span className="pf-panel-tag pf-mono">WMS ROUTING</span>
                  </div>
                  <p className="pf-panel-description">
                    Assign the inbound container to the appropriate terminal stacking block based on thermal preservation and vessel cut-off schedule:
                  </p>

                  <div className="pf-radio-group">
                    <label
                      className={`pf-radio-card ${
                        selectedYardZone === 'REEFER_YARD' ? 'is-selected' : ''
                      }`}
                      onClick={() => setSelectedYardZone('REEFER_YARD')}
                    >
                      <div className="pf-radio-top">
                        <div className="pf-radio-title-row">
                          <span className="pf-radio-indicator" />
                          <strong>Reefer Yard Block R-02</strong>
                        </div>
                        {isPerishable && (
                          <span className="pf-badge-recommended pf-mono">[RECOMMENDED]</span>
                        )}
                      </div>
                      <p>
                        Equipped with 440V 3-phase cold-storage shore power hookups and continuous -4.2°C IoT temperature telemetry for perishable exports.
                      </p>
                    </label>

                    <label
                      className={`pf-radio-card ${
                        selectedYardZone === 'DRY_CY' ? 'is-selected' : ''
                      }`}
                      onClick={() => setSelectedYardZone('DRY_CY')}
                    >
                      <div className="pf-radio-top">
                        <div className="pf-radio-title-row">
                          <span className="pf-radio-indicator" />
                          <strong>Dry Container Yard Block CY-04</strong>
                        </div>
                        {!isPerishable && (
                          <span className="pf-badge-recommended pf-mono">[RECOMMENDED]</span>
                        )}
                      </div>
                      <p>
                        Standard ambient intermodal stacking bay serviced by rubber-tired gantry (RTG) cranes for general dry cargo.
                      </p>
                    </label>

                    <label
                      className={`pf-radio-card ${
                        selectedYardZone === 'QUAYSIDE_APRON' ? 'is-selected' : ''
                      }`}
                      onClick={() => setSelectedYardZone('QUAYSIDE_APRON')}
                    >
                      <div className="pf-radio-top">
                        <div className="pf-radio-title-row">
                          <span className="pf-radio-indicator" />
                          <strong>Direct Quayside Apron</strong>
                        </div>
                      </div>
                      <p>
                        Hot-stow express lane bypassing yard dwell time for immediate ship-to-shore (STS) gantry crane loading.
                      </p>
                    </label>
                  </div>
                </div>
              </div>

              <footer className="pf-footer">
                <div className="pf-footer-meta">
                  <span className="pf-mono">SOLAS REG VI/2:</span> Weighbridge calibration certificate logged to terminal ledger.
                </div>
                <button
                  type="button"
                  className={`pf-action-btn ${
                    tourStep === 4 ? 'pf-spotlight-active' : ''
                  }`}
                  disabled={isProcessing}
                  onClick={() => completeStep(1, 2)}
                >
                  {isProcessing ? 'LOGGING GATE-IN...' : '[VERIFY GATE-IN & WEIGHBRIDGE →]'}
                </button>
              </footer>
            </section>
          )}

          {/* =========================================================
              TICKET #2: TRADE DOCUMENTATION & EDI EXCHANGE
             ========================================================= */}
          {activeStep === 2 && (
            <section className="pf-stage">
              <div className="pf-stage-bar">
                <div className="pf-stage-title-group">
                  <span className="pf-stage-kicker pf-mono">
                    TKT-02 // PCS &amp; EDI DOCUMENT EXCHANGE
                  </span>
                  <h2>Statutory Export Trade Documentation &amp; eB/L Verification</h2>
                </div>
                <div className="pf-pill pf-pill-cyan pf-mono">
                  <FileTextIcon /> {Object.values(inspectedDocs).filter(Boolean).length} OF 4 DOCS REVIEWED
                </div>
              </div>

              <div
                className={`pf-columns ${
                  tourStep === 3 ? 'pf-spotlight-active' : ''
                }`}
              >
                {/* Left Card: 4 Statutory Documents Sub-Tab Inspector */}
                <div className="pf-panel">
                  <div className="pf-subtabs">
                    <button
                      type="button"
                      className={`pf-subtab ${activeDocTab === 'EBL' ? 'is-active' : ''}`}
                      onClick={() => selectDocumentTab('EBL')}
                    >
                      <span>1. Electronic B/L</span>
                      {inspectedDocs.EBL && <CheckIcon />}
                    </button>
                    <button
                      type="button"
                      className={`pf-subtab ${activeDocTab === 'BOC' ? 'is-active' : ''}`}
                      onClick={() => selectDocumentTab('BOC')}
                    >
                      <span>2. BOC Export Decl.</span>
                      {inspectedDocs.BOC && <CheckIcon />}
                    </button>
                    <button
                      type="button"
                      className={`pf-subtab ${activeDocTab === 'PACKING' ? 'is-active' : ''}`}
                      onClick={() => selectDocumentTab('PACKING')}
                    >
                      <span>3. Packing List</span>
                      {inspectedDocs.PACKING && <CheckIcon />}
                    </button>
                    <button
                      type="button"
                      className={`pf-subtab ${activeDocTab === 'COO' ? 'is-active' : ''}`}
                      onClick={() => selectDocumentTab('COO')}
                    >
                      <span>4. ASEAN Form D</span>
                      {inspectedDocs.COO && <CheckIcon />}
                    </button>
                  </div>

                  <div className="pf-manifest-canvas">
                    <div className="pf-manifest-top">
                      <div>
                        <span className="pf-manifest-code pf-mono">
                          {DOCUMENT_MANIFESTS[activeDocTab].refCode}
                        </span>
                        <h3>{DOCUMENT_MANIFESTS[activeDocTab].title}</h3>
                        <p className="pf-manifest-authority">
                          {DOCUMENT_MANIFESTS[activeDocTab].authority}
                        </p>
                      </div>
                    </div>

                    <div className="pf-table">
                      {DOCUMENT_MANIFESTS[activeDocTab].rows.map((r, idx) => (
                        <div className="pf-table-row" key={idx}>
                          <span className="pf-table-label">{r.label}</span>
                          <span className="pf-table-val pf-mono">{r.value}</span>
                        </div>
                      ))}
                    </div>

                    <div className="pf-official-stamp pf-mono">
                      [BOC EXPORT CLEARANCE GRANTED • SEAL VERIFIED]
                    </div>
                  </div>
                </div>

                {/* Right Card: Pedagogical Legal Functions of the Bill of Lading */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">
                      Three Statutory Functions of the Bill of Lading
                    </span>
                    <span className="pf-panel-tag pf-mono">UCP 600 ART. 20</span>
                  </div>
                  <p className="pf-panel-description">
                    In international maritime trade and documentary credit operations, the Ocean Bill of Lading serves three binding legal roles:
                  </p>

                  <div className="pf-legal-list">
                    <div className="pf-legal-item">
                      <span className="pf-legal-index pf-mono">01</span>
                      <div className="pf-legal-content">
                        <strong>Official Receipt of Goods</strong>
                        <p>
                          Confirms the carrier received <strong>{cargoName} ({weightKg.toLocaleString()} kg)</strong> in apparent good order and condition, issuing a <em>Clean on Board</em> notation required by banks.
                        </p>
                      </div>
                    </div>

                    <div className="pf-legal-item">
                      <span className="pf-legal-index pf-mono">02</span>
                      <div className="pf-legal-content">
                        <strong>Evidence of the Contract of Carriage ({incoterm})</strong>
                        <p>
                          Establishes the terms of transport, freight obligations, and risk transfer boundary under <strong>Incoterm 2020 {incoterm}</strong> and the Hague-Visby Rules.
                        </p>
                      </div>
                    </div>

                    <div className="pf-legal-item">
                      <span className="pf-legal-index pf-mono">03</span>
                      <div className="pf-legal-content">
                        <strong>Negotiable Document of Title</strong>
                        <p>
                          Conveys constructive legal possession of the cargo while at sea, allowing transfer of ownership to the consignee in <strong>{destination}</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <footer className="pf-footer">
                <div className="pf-footer-meta">
                  <span className="pf-mono">UN/EDIFACT:</span> CUSDEC &amp; IFTMIN electronic manifests synchronized with Bureau of Customs.
                </div>
                <button
                  type="button"
                  className={`pf-action-btn ${
                    tourStep === 4 ? 'pf-spotlight-active' : ''
                  }`}
                  disabled={isProcessing}
                  onClick={() => {
                    setInspectedDocs({ EBL: true, BOC: true, PACKING: true, COO: true });
                    completeStep(2, 3);
                  }}
                >
                  {isProcessing ? 'TRANSMITTING EDI...' : '[VALIDATE EDI & ISSUE BILL OF LADING →]'}
                </button>
              </footer>
            </section>
          )}

          {/* =========================================================
              TICKET #3: BORDER SECURITY & X-RAY PORTAL
             ========================================================= */}
          {activeStep === 3 && (
            <section className="pf-stage">
              <div className="pf-stage-bar">
                <div className="pf-stage-title-group">
                  <span className="pf-stage-kicker pf-mono">
                    TKT-03 // BOC BORDER SECURITY &amp; QUARANTINE
                  </span>
                  <h2>Non-Intrusive Container X-Ray Portal Inspection</h2>
                </div>
                <div
                  className={`pf-pill pf-mono ${
                    xrayCompleted ? 'pf-pill-emerald' : 'pf-pill-amber'
                  }`}
                >
                  <ScanIcon />{' '}
                  {xrayCompleted
                    ? 'SCAN COMPLETE (100%)'
                    : isScanningXray
                    ? `SCANNING (${xrayProgress}%)`
                    : 'SCAN REQUIRED'}
                </div>
              </div>

              <div
                className={`pf-columns ${
                  tourStep === 3 ? 'pf-spotlight-active' : ''
                }`}
              >
                {/* Left Card: 2D Container Silhouette & CSS X-Ray Sweep */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">High-Energy Radiographic Container Bay</span>
                    <span className="pf-panel-tag pf-mono">{xrayProgress}% COMPLETE</span>
                  </div>

                  <div className="pf-xray-bay">
                    {isScanningXray && <div className="pf-xray-sweep-beam" />}
                    <div className="pf-xray-silhouette">
                      <div className="pf-xray-top-meta pf-mono">
                        <span>ISO {teuCount}x20&apos; {isPerishable ? 'REEFER' : 'DRY'} SILHOUETTE</span>
                        <span>HS CODE: {hsInfo.code}</span>
                      </div>

                      <div className="pf-xray-cargo-grid">
                        {[1, 2, 3, 4, 5, 6].map((bayIdx) => {
                          const isBayCleared = xrayProgress >= bayIdx * 16;
                          return (
                            <div
                              key={bayIdx}
                              className={`pf-xray-cell ${isBayCleared ? 'is-cleared' : ''}`}
                            >
                              <span className="pf-mono">BAY 0{bayIdx}</span>
                              <small className="pf-mono">
                                {isBayCleared ? 'DENSITY OK' : 'UNSCANNED'}
                              </small>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="pf-progress-track">
                    <div
                      className="pf-progress-bar"
                      style={{ width: `${xrayProgress}%` }}
                    />
                  </div>

                  <div className="pf-xray-controls">
                    <button
                      type="button"
                      className="pf-secondary-btn pf-mono"
                      disabled={isScanningXray || xrayCompleted}
                      onClick={triggerXrayInspection}
                    >
                      {xrayCompleted
                        ? '[✓ RADIOGRAPHIC SCAN COMPLETED]'
                        : isScanningXray
                        ? `EXECUTING X-RAY SWEEP (${xrayProgress}%)...`
                        : '[EXECUTE X-RAY INSPECTION SCAN]'}
                    </button>
                  </div>
                </div>

                {/* Right Card: Border Security & Quarantine Telemetry */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">Border Security &amp; Quarantine Readout</span>
                    <span className="pf-panel-tag pf-mono">BOC / BPI</span>
                  </div>

                  <div className="pf-metric-cards">
                    <div className="pf-metric-box">
                      <span className="pf-metric-label">Scan Integrity</span>
                      <strong className="pf-metric-val pf-mono pf-cyan">
                        {xrayProgress}% VERIFIED
                      </strong>
                    </div>
                    <div className="pf-metric-box">
                      <span className="pf-metric-label">Density Anomalies</span>
                      <strong className="pf-metric-val pf-mono pf-emerald">
                        0 DETECTED
                      </strong>
                    </div>
                    <div className="pf-metric-box">
                      <span className="pf-metric-label">Phytosanitary Quarantine</span>
                      <strong className="pf-metric-val pf-mono pf-emerald">
                        PASSED
                      </strong>
                    </div>
                  </div>

                  <div className="pf-table">
                    <div className="pf-table-row">
                      <span className="pf-table-label">Harmonized System (HS) Code</span>
                      <span className="pf-table-val pf-mono pf-cyan">{hsInfo.code}</span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Declared Commodity</span>
                      <span className="pf-table-val">{hsInfo.desc}</span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Radiation Portal Monitor</span>
                      <span className="pf-table-val pf-mono pf-emerald">0.08 µSv/h (NORMAL)</span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Customs Anti-Smuggling Status</span>
                      <span className="pf-table-val pf-mono pf-emerald">
                        {xrayCompleted ? 'CLEARED FOR LOADING' : 'AWAITING SCAN'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <footer className="pf-footer">
                <div className="pf-footer-meta">
                  <span className="pf-mono">BORDER CONTROL:</span> Container must reach 100% radiographic verification before yard dispatch.
                </div>
                <button
                  type="button"
                  className={`pf-action-btn ${
                    tourStep === 4 ? 'pf-spotlight-active' : ''
                  }`}
                  disabled={!xrayCompleted || isProcessing}
                  onClick={() => completeStep(3, 4)}
                >
                  {xrayCompleted
                    ? '[PROCEED TO TOS YARD QUEUE →]'
                    : '[COMPLETE X-RAY SCAN TO UNLOCK]'}
                </button>
              </footer>
            </section>
          )}

          {/* =========================================================
              TICKET #4: TOS YARD QUEUE & MIN-HEAP PRIORITY
             ========================================================= */}
          {activeStep === 4 && (
            <section className="pf-stage">
              <div className="pf-stage-bar">
                <div className="pf-stage-title-group">
                  <span className="pf-stage-kicker pf-mono">
                    TKT-04 // WMS &amp; TOS ALGORITHMIC DISPATCH
                  </span>
                  <h2>Yard Handling Equipment &amp; Binary Min-Heap Priority Queue</h2>
                </div>
                <div className="pf-pill pf-pill-emerald pf-mono">
                  <LayersIcon /> PRIORITY 1 // SCORE {heapMetrics.totalScore} / 100
                </div>
              </div>

              <div
                className={`pf-columns ${
                  tourStep === 3 ? 'pf-spotlight-active' : ''
                }`}
              >
                {/* Left Card: Cargo-Adaptive Equipment Assignment */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">Yard Handling Equipment Assignment</span>
                    <span className="pf-panel-tag pf-mono">TOS FLEET</span>
                  </div>
                  <p className="pf-panel-description">
                    Select the terminal prime mover to transfer container <strong>{shipId}</strong> from yard storage to the quayside gantry apron:
                  </p>

                  <div className="pf-radio-group">
                    <label
                      className={`pf-radio-card ${
                        selectedEquipment === 'REEFER_FORKLIFT' ? 'is-selected' : ''
                      }`}
                      onClick={() => setSelectedEquipment('REEFER_FORKLIFT')}
                    >
                      <div className="pf-radio-top">
                        <div className="pf-radio-title-row">
                          <span className="pf-radio-indicator" />
                          <strong>Heavy-Duty Terminal Forklift (Reefer Specialist)</strong>
                        </div>
                        {isPerishable && (
                          <span className="pf-badge-recommended pf-mono">[RECOMMENDED]</span>
                        )}
                      </div>
                      <p>
                        Equipped with cold-chain auxiliary cable detachment tools and mobile genset telemetry to prevent thermal excursion during transfer.
                      </p>
                    </label>

                    <label
                      className={`pf-radio-card ${
                        selectedEquipment === 'REACH_STACKER' ? 'is-selected' : ''
                      }`}
                      onClick={() => setSelectedEquipment('REACH_STACKER')}
                    >
                      <div className="pf-radio-top">
                        <div className="pf-radio-title-row">
                          <span className="pf-radio-indicator" />
                          <strong>Kalmar Gloria 45-Ton Reach Stacker</strong>
                        </div>
                        {!isPerishable && (
                          <span className="pf-badge-recommended pf-mono">[RECOMMENDED]</span>
                        )}
                      </div>
                      <p>
                        Heavy intermodal handler with top-lift telescopic spreader twistlocks for high-speed dry container stacking.
                      </p>
                    </label>
                  </div>
                </div>

                {/* Right Card: Binary Min-Heap Priority Formula & Breakdown */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">Binary Min-Heap Priority Breakdown</span>
                    <span className="pf-panel-tag pf-mono">HEAPQ ENGINE</span>
                  </div>

                  <div className="pf-formula-box pf-mono">
                    Priority Score = (Perishability &times; 0.5) + (Wait Time &times; 0.3) + (Demurrage &times; 0.2)
                  </div>

                  <div className="pf-metric-cards">
                    <div className="pf-metric-box">
                      <span className="pf-metric-label">Perishability (&times;0.5)</span>
                      <strong className="pf-metric-val pf-mono pf-cyan">
                        {heapMetrics.weightedPerishability} pts
                      </strong>
                    </div>
                    <div className="pf-metric-box">
                      <span className="pf-metric-label">Wait Time (&times;0.3)</span>
                      <strong className="pf-metric-val pf-mono">
                        {heapMetrics.weightedWaitTime} pts
                      </strong>
                    </div>
                    <div className="pf-metric-box">
                      <span className="pf-metric-label">Demurrage (&times;0.2)</span>
                      <strong className="pf-metric-val pf-mono pf-amber">
                        {heapMetrics.weightedDemurrage} pts
                      </strong>
                    </div>
                  </div>

                  <div className="pf-heap-list">
                    {heapMetrics.queueList.map((item) => (
                      <div
                        key={item.id}
                        className={`pf-heap-item ${item.isCurrent ? 'is-root' : ''}`}
                      >
                        <div className="pf-heap-left">
                          <span className="pf-heap-rank pf-mono">{item.rank}</span>
                          <span className="pf-heap-desc">
                            <strong className="pf-mono">{item.id}</strong> &bull; {item.cargo}
                          </span>
                        </div>
                        <span className="pf-heap-score pf-mono">{item.score} / 100</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <footer className="pf-footer">
                <div className="pf-footer-meta">
                  <span className="pf-mono">QUEUE DISPATCH:</span> Consignment <strong>{shipId}</strong> ranked #1 at root of terminal dispatch heap.
                </div>
                <button
                  type="button"
                  className={`pf-action-btn ${
                    tourStep === 4 ? 'pf-spotlight-active' : ''
                  }`}
                  disabled={isProcessing}
                  onClick={() => completeStep(4, 5)}
                >
                  {isProcessing
                    ? 'DISPATCHING EQUIPMENT...'
                    : '[DISPATCH EQUIPMENT TO QUAYSIDE →]'}
                </button>
              </footer>
            </section>
          )}

          {/* =========================================================
              TICKET #5: BERTH ALLOCATION & STOWAGE PLAN
             ========================================================= */}
          {activeStep === 5 && (
            <section className="pf-stage">
              <div className="pf-stage-bar">
                <div className="pf-stage-title-group">
                  <span className="pf-stage-kicker pf-mono">
                    TKT-05 // PMS BERTH &amp; VESSEL STOWAGE
                  </span>
                  <h2>Berth Confirmation &amp; Bay-Row-Tier Vessel Stowage Plan</h2>
                </div>
                <div className="pf-pill pf-pill-emerald pf-mono">
                  <AnchorIcon /> OUTBOUND MANIFEST READY
                </div>
              </div>

              <div
                className={`pf-columns ${
                  tourStep === 3 ? 'pf-spotlight-active' : ''
                }`}
              >
                {/* Left Card: Mooring Berth Confirmation */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">
                      Mooring Berth &amp; Quayside Crane Allocation
                    </span>
                    <span className="pf-panel-tag pf-mono">BERTH 02 WEST</span>
                  </div>

                  <div className="pf-table">
                    <div className="pf-table-row">
                      <span className="pf-table-label">Assigned Mooring Berth</span>
                      <span className="pf-table-val pf-mono">Berth 02, Quayside West</span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Berthed Feeder Vessel</span>
                      <span className="pf-table-val pf-mono pf-cyan">
                        MV WHARF-ALPHA (IMO 9842110)
                      </span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Quayside Gantry Crane</span>
                      <span className="pf-table-val pf-mono">STS Gantry Crane #03</span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Port of Discharge (POD)</span>
                      <span className="pf-table-val pf-mono pf-emerald">
                        {destination.toUpperCase()}
                      </span>
                    </div>
                    <div className="pf-table-row">
                      <span className="pf-table-label">Vessel Stability &amp; Trim</span>
                      <span className="pf-table-val pf-mono pf-emerald">
                        VERIFIED (GM +1.85m OPTIMAL)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right Card: Bay-Row-Tier Vessel Stowage Coordinate */}
                <div className="pf-panel">
                  <div className="pf-panel-header">
                    <span className="pf-panel-title">Bay-Row-Tier Vessel Stowage Plan</span>
                    <span className="pf-panel-tag pf-mono">ISO STOWAGE</span>
                  </div>
                  <p className="pf-panel-description">
                    Confirm the shipboard cell guide slot aboard <em>MV WHARF-ALPHA</em> prior to crane hoist:
                  </p>

                  <div className="pf-radio-group">
                    <label
                      className={`pf-radio-card ${
                        selectedStowageSlot === 'BAY 04 • ROW 02 • TIER 82'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() => setSelectedStowageSlot('BAY 04 • ROW 02 • TIER 82')}
                    >
                      <div className="pf-radio-top">
                        <div className="pf-radio-title-row">
                          <span className="pf-radio-indicator" />
                          <strong className="pf-mono">BAY 04 • ROW 02 • TIER 82</strong>
                        </div>
                        {isPerishable && (
                          <span className="pf-badge-recommended pf-mono">[RECOMMENDED]</span>
                        )}
                      </div>
                      <p>
                        On-deck reefer plug bay wired to the shipboard auxiliary generator grid with verified stability trim and low amidships roll acceleration.
                      </p>
                    </label>

                    <label
                      className={`pf-radio-card ${
                        selectedStowageSlot === 'BAY 12 • ROW 04 • TIER 84'
                          ? 'is-selected'
                          : ''
                      }`}
                      onClick={() => setSelectedStowageSlot('BAY 12 • ROW 04 • TIER 84')}
                    >
                      <div className="pf-radio-top">
                        <div className="pf-radio-title-row">
                          <span className="pf-radio-indicator" />
                          <strong className="pf-mono">BAY 12 • ROW 04 • TIER 84</strong>
                        </div>
                        {!isPerishable && (
                          <span className="pf-badge-recommended pf-mono">[RECOMMENDED]</span>
                        )}
                      </div>
                      <p>
                        Main deck intermodal cell guide slot secured with automatic twistlocks for standard dry freight.
                      </p>
                    </label>
                  </div>
                </div>
              </div>

              <footer className="pf-footer">
                <div className="pf-footer-meta">
                  <span className="pf-mono">PORT AUTHORITY CLEARANCE:</span> All 5 PCS/TOS tickets verified. Vessel cleared for departure.
                </div>
                <button
                  type="button"
                  className={`pf-action-btn pf-action-btn-emerald ${
                    tourStep === 4 ? 'pf-spotlight-active' : ''
                  }`}
                  disabled={isProcessing}
                  onClick={handleFinalApproval}
                >
                  {isProcessing
                    ? 'AUTHORIZING CRANE HOIST...'
                    : '[APPROVE STOWAGE & LAUNCH 3D CRANE LOADING →]'}
                </button>
              </footer>
            </section>
          )}
        </main>
      </div>
    </div>
  );
};

export default PortFlowModal;