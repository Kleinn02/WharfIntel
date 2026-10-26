// frontend/src/pages/VoyageDebriefModal.jsx
import React, { useState, useMemo } from 'react';
import './VoyageDebriefModal.css';

const resolveDestinationMeta = (destination = 'Singapore') => {
  const d = destination.toLowerCase();
  if (d.includes('singapore')) {
    return { code: 'SGSIN', terminal: 'PSA Tuas Mega Port // Berth 04 Inbound Gate', country: 'SINGAPORE' };
  }
  if (d.includes('klang') || d.includes('malaysia')) {
    return { code: 'MYPKG', terminal: 'Northport Container Terminal // Berth 08 West', country: 'MALAYSIA' };
  }
  if (d.includes('ho chi minh') || d.includes('vietnam')) {
    return { code: 'VNSGN', terminal: 'Cat Lai International Terminal // Berth 02', country: 'VIETNAM' };
  }
  if (d.includes('bangkok') || d.includes('thailand')) {
    return { code: 'THBKK', terminal: 'PAT Bangkok Modern Terminal // East Quay', country: 'THAILAND' };
  }
  if (d.includes('sihanoukville') || d.includes('cambodia')) {
    return { code: 'KHKOS', terminal: 'Sihanoukville Autonomous Port // Container Pier', country: 'CAMBODIA' };
  }
  if (d.includes('vientiane') || d.includes('laos')) {
    return { code: 'LAVTE', terminal: 'Thanaleng Dry Port // Intermodal Rail Gate', country: 'LAOS' };
  }
  if (d.includes('jakarta') || d.includes('indonesia')) {
    return { code: 'IDJKT', terminal: 'Tanjung Priok JICT // Berth 05 North', country: 'INDONESIA' };
  }
  if (d.includes('muara') || d.includes('brunei')) {
    return { code: 'BNMUA', terminal: 'Muara Container Terminal // Berth 01', country: 'BRUNEI' };
  }
  if (d.includes('yangon') || d.includes('myanmar')) {
    return { code: 'MMRGN', terminal: 'Myanmar Industrial Port // Ahlone Wharf', country: 'MYANMAR' };
  }
  if (d.includes('dili') || d.includes('timor')) {
    return { code: 'TLDIL', terminal: 'Tibar Bay Deepwater Port // Berth 01', country: 'TIMOR-LESTE' };
  }
  if (d.includes('manila')) {
    return { code: 'PHMNL', terminal: 'Manila International Container Terminal // Berth 06', country: 'PHILIPPINES' };
  }
  if (d.includes('cebu')) {
    return { code: 'PHCEB', terminal: 'Cebu International Port // Berth 03', country: 'PHILIPPINES' };
  }
  if (d.includes('batangas')) {
    return { code: 'PHBTG', terminal: 'Batangas Container Terminal // Phase II', country: 'PHILIPPINES' };
  }
  return { code: 'PHDVO', terminal: `${destination} // International Container Berth 02`, country: destination.toUpperCase() };
};

const VoyageDebriefModal = ({
  shipment = {},
  initialHealth = 100,
  finalHealth = 100,
  weatherState = 'NOMINAL',
  onDischargeComplete,
  onClose
}) => {
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [logCopied, setLogCopied] = useState(false);

  const shipId = shipment.id || 'TRK-49';
  const cargoName = shipment.cargo || 'Cavendish Bananas';
  const category = shipment.category || 'Perishable (Food)';
  const destination = shipment.destination || 'Singapore';
  const incoterm = shipment.incoterm || 'CIF';
  const weightKg = Number(shipment.weightKg) || 15000;
  const teuCount = Math.max(
    1,
    Number(shipment.teu_count) || Number(shipment.teuCount) || Math.ceil(weightKg / 25000)
  );

  const catLower = category.toLowerCase();
  const isElectronics = catLower.includes('electronic');
  const isRawMaterials = catLower.includes('raw');
  const isPerishable =
    !isElectronics &&
    !isRawMaterials &&
    (catLower.includes('perishable') ||
      cargoName.toLowerCase().includes('banana') ||
      cargoName.toLowerCase().includes('food'));

  const destMeta = useMemo(() => resolveDestinationMeta(destination), [destination]);

  const analytics = useMemo(() => {
    const startH = Math.min(100, Math.max(0, Number(initialHealth) || 100));
    const endH = Math.min(100, Math.max(0, Number(finalHealth) || 100));

    // Card 1: Cold Chain & Perishable Quality Audit
    const minTemp = isPerishable ? '-4.4°C' : isElectronics ? '+21.6°C' : '+23.8°C';
    const maxTemp = isPerishable ? '-3.8°C' : isElectronics ? '+22.4°C' : '+25.2°C';
    const meanTemp = isPerishable ? '-4.1°C' : isElectronics ? '+22.0°C' : '+24.5°C';
    const spoilageLossPct = endH >= 90 ? 0.0 : Number(((90 - endH) * 0.45).toFixed(1));
    const spoilageLabel =
      spoilageLossPct === 0
        ? '0.0% Commercial Loss (Grade A Intact)'
        : `${spoilageLossPct}% Fractional Thermal Loss`;

    // Card 2: Machine Learning ETA vs. Actual Transit Time Audit
    const durationMs = Number(shipment.duration) || 3600000;
    const simulatedHours = Math.max(18, Math.round(durationMs / (1000 * 60 * 12)));
    const rfPredictedHours = simulatedHours;
    const varianceMinutes = weatherState === 'CYCLONE IMMINENT' ? 38 : weatherState === 'DETERIORATING' ? 19 : -42;
    const actualTotalMinutes = rfPredictedHours * 60 + varianceMinutes;
    const actualHoursPart = Math.floor(actualTotalMinutes / 60);
    const actualMinsPart = Math.abs(actualTotalMinutes % 60);

    const modelAccuracy =
      weatherState === 'CYCLONE IMMINENT'
        ? '96.4%'
        : weatherState === 'DETERIORATING'
        ? '97.6%'
        : '98.2%';

    const varianceFormatted = `${varianceMinutes > 0 ? `+${varianceMinutes}` : varianceMinutes} min (${modelAccuracy} Model Accuracy)`;

    const climateImpactNote =
      weatherState === 'CYCLONE IMMINENT'
        ? 'Severe low-pressure cyclone front (960 hPa) induced 1.4m swells; A* and ballast trim mitigated structural loss.'
        : weatherState === 'DETERIORATING'
        ? 'Moderate monsoon trough (998 hPa) generated 0.8m cross-swells; autopilot held 15.0 kts course.'
        : 'Nominal trade wind corridor (1013 hPa, 0.4m swell) enabled optimal early arrival ahead of berth cut-off.';

    // Card 3: Fuel Consumption & Decarbonization Efficiency
    const transitDays = Math.max(1.2, Number((rfPredictedHours / 24).toFixed(2)));
    const fuelRateMtPerDay = 14.5;
    const totalFuelBurnedMt = Number((transitDays * fuelRateMtPerDay).toFixed(1));
    const avgSogKnots =
      weatherState === 'CYCLONE IMMINENT'
        ? '14.3 kts'
        : weatherState === 'DETERIORATING'
        ? '14.8 kts'
        : '15.2 kts';

    // Card 4: Academic LMS Competency Assessment & Grade Scoring
    // Formula: (Cargo Health * 0.4) + (VGM Compliance Score * 0.2) + (ETA Accuracy Score * 0.2) + (Demurrage Avoidance * 0.2)
    const vgmScore = 100;
    const etaAccuracyScore = parseFloat(modelAccuracy);
    const demurrageAvoidanceScore = 100;

    const weightedHealth = Number((endH * 0.4).toFixed(1));
    const weightedVgm = Number((vgmScore * 0.2).toFixed(1));
    const weightedEta = Number((etaAccuracyScore * 0.2).toFixed(1));
    const weightedDemurrage = Number((demurrageAvoidanceScore * 0.2).toFixed(1));
    const totalLmsScore = Number(
      (weightedHealth + weightedVgm + weightedEta + weightedDemurrage).toFixed(1)
    );

    const gradeRating =
      totalLmsScore >= 90
        ? 'GRADE A: DISTINCTION (COMPETENCY VERIFIED)'
        : totalLmsScore >= 80
        ? 'GRADE B: MERIT (COMPETENCY VERIFIED)'
        : 'GRADE C: STANDARD PASS';

    return {
      startH,
      endH,
      minTemp,
      maxTemp,
      meanTemp,
      spoilageLossPct,
      spoilageLabel,
      rfPredictedFormatted: `${rfPredictedHours}h 00m`,
      actualTransitFormatted: `${actualHoursPart}h ${String(actualMinsPart).padStart(2, '0')}m`,
      varianceFormatted,
      climateImpactNote,
      totalFuelBurnedMt,
      avgSogKnots,
      weightedHealth,
      weightedVgm,
      weightedEta,
      weightedDemurrage,
      totalLmsScore,
      gradeRating
    };
  }, [initialHealth, finalHealth, isPerishable, isElectronics, shipment.duration, weatherState]);

  const handleExportSummary = () => {
    const summaryText = [
      `WHARFINTEL DIGITAL TWIN // VOYAGE DEBRIEF LOG`,
      `Order ID: ${shipId} | Commodity: ${cargoName} (${weightKg.toLocaleString()} kg / ${teuCount} TEU)`,
      `Destination: ${destination} (${destMeta.code}) | Incoterm: ${incoterm} 2020`,
      `Final Cargo Integrity: ${analytics.endH}% (${analytics.spoilageLabel})`,
      `RF Predicted ETA: ${analytics.rfPredictedFormatted} | Actual: ${analytics.actualTransitFormatted} | ${analytics.varianceFormatted}`,
      `Total MGO/HFO Burned: ${analytics.totalFuelBurnedMt} MT | Avg SOG: ${analytics.avgSogKnots} | Demurrage: $0`,
      `LMS Competency Score: ${analytics.totalLmsScore} / 100 — ${analytics.gradeRating}`
    ].join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(summaryText).catch(() => {});
    }
    setLogCopied(true);
    setTimeout(() => setLogCopied(false), 2500);
  };

  const handleFinalize = () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    setTimeout(() => {
      if (onDischargeComplete) {
        onDischargeComplete(shipment);
      }
    }, 300);
  };

  return (
    <div className="vd-modal-overlay">
      <div className="vd-modal-shell">
        {/* INSTITUTIONAL TOP HEADER STRIP */}
        <header className="vd-header">
          <div className="vd-header-brand">
            <div className="vd-status-row">
              <span className="vd-status-dot" />
              <span className="vd-status-kicker vd-mono">
                PHASE D // PORT OF DISCHARGE (POD) &bull; {destMeta.terminal.toUpperCase()}
              </span>
            </div>
            <h1>Port of Discharge Arrival &amp; Operational Performance Debrief</h1>
          </div>

          <div className="vd-header-controls">
            <div className="vd-manifest-strip">
              <div className="vd-strip-item">
                <span className="vd-strip-label">ORDER</span>
                <span className="vd-strip-val vd-mono vd-cyan">{shipId}</span>
              </div>
              <div className="vd-strip-divider" />
              <div className="vd-strip-item">
                <span className="vd-strip-label">CONSIGNMENT</span>
                <span className="vd-strip-val">{cargoName}</span>
              </div>
              <div className="vd-strip-divider" />
              <div className="vd-strip-item">
                <span className="vd-strip-label">INCOTERM</span>
                <span className="vd-strip-val vd-mono vd-amber">{incoterm} 2020</span>
              </div>
              <div className="vd-strip-divider" />
              <div className="vd-strip-item">
                <span className="vd-strip-label">DESTINATION</span>
                <span className="vd-strip-val vd-mono vd-emerald">
                  {destMeta.code} // {destMeta.country}
                </span>
              </div>
            </div>

            {onClose && (
              <button type="button" className="vd-close-btn vd-mono" onClick={onClose}>
                [✕ MAP VIEW]
              </button>
            )}
          </div>
        </header>

        {/* ZERO-SCROLL 2x2 ANALYTICAL WORKSPACE */}
        <main className="vd-workspace">
          <div className="vd-grid-2x2">
            {/* CARD 1: COLD CHAIN & PERISHABLE QUALITY AUDIT */}
            <section className="vd-card">
              <div className="vd-card-header">
                <span className="vd-card-title">1. Cold Chain &amp; Cargo Quality Audit</span>
                <span className="vd-card-tag vd-mono">
                  {isPerishable ? 'ISO REEFER LOG' : 'CONTAINER TELEMETRY'}
                </span>
              </div>

              <div className="vd-health-banner">
                <div className="vd-health-top">
                  <span>Initial vs. Final Consignment Integrity</span>
                  <strong className="vd-mono vd-emerald">
                    {analytics.startH}% &rarr; {analytics.endH}%
                  </strong>
                </div>
                <div className="vd-progress-track">
                  <div
                    className="vd-progress-fill"
                    style={{ width: `${analytics.endH}%` }}
                  />
                </div>
              </div>

              <div className="vd-metric-strip">
                <div className="vd-mini-box">
                  <span className="vd-mini-label">MIN LOGGED</span>
                  <strong className="vd-mini-val vd-mono vd-cyan">{analytics.minTemp}</strong>
                </div>
                <div className="vd-mini-box">
                  <span className="vd-mini-label">MAX LOGGED</span>
                  <strong className="vd-mini-val vd-mono vd-cyan">{analytics.maxTemp}</strong>
                </div>
                <div className="vd-mini-box">
                  <span className="vd-mini-label">MEAN SETPOINT</span>
                  <strong className="vd-mini-val vd-mono vd-emerald">{analytics.meanTemp}</strong>
                </div>
              </div>

              <div className="vd-table">
                <div className="vd-table-row">
                  <span className="vd-table-label">Evaluated Spoilage Index</span>
                  <span className="vd-table-val vd-mono vd-emerald">
                    {analytics.spoilageLabel}
                  </span>
                </div>
                <div className="vd-table-row">
                  <span className="vd-table-label">Gross Payload / TEU Allocation</span>
                  <span className="vd-table-val vd-mono">
                    {weightKg.toLocaleString()} kg ({teuCount} TEU)
                  </span>
                </div>
              </div>
            </section>

            {/* CARD 2: MACHINE LEARNING ETA VS. ACTUAL TRANSIT TIME AUDIT */}
            <section className="vd-card">
              <div className="vd-card-header">
                <span className="vd-card-title">
                  2. Machine Learning ETA vs. Actual Transit Audit
                </span>
                <span className="vd-card-tag vd-mono">RANDOM FOREST REGRESSOR</span>
              </div>

              <div className="vd-table">
                <div className="vd-table-row">
                  <span className="vd-table-label">Random Forest Predicted ETA</span>
                  <span className="vd-table-val vd-mono vd-cyan">
                    {analytics.rfPredictedFormatted}
                  </span>
                </div>
                <div className="vd-table-row">
                  <span className="vd-table-label">Actual Telemetry Transit Time</span>
                  <span className="vd-table-val vd-mono">
                    {analytics.actualTransitFormatted}
                  </span>
                </div>
                <div className="vd-table-row">
                  <span className="vd-table-label">Absolute Telemetry Variance</span>
                  <span className="vd-table-val vd-mono vd-emerald">
                    Variance: {analytics.varianceFormatted}
                  </span>
                </div>
              </div>

              <div className="vd-advisory-box">
                <span className="vd-advisory-kicker vd-mono">
                  MACRO-CLIMATE TRAJECTORY IMPACT ({weatherState}):
                </span>
                <p>{analytics.climateImpactNote}</p>
              </div>
            </section>

            {/* CARD 3: FUEL CONSUMPTION & DECARBONIZATION EFFICIENCY */}
            <section className="vd-card">
              <div className="vd-card-header">
                <span className="vd-card-title">
                  3. Fuel Consumption &amp; Decarbonization Efficiency
                </span>
                <span className="vd-card-tag vd-mono">IMO MARPOL ANNEX VI</span>
              </div>

              <div className="vd-metric-strip">
                <div className="vd-mini-box">
                  <span className="vd-mini-label">TOTAL MGO/HFO BURNED</span>
                  <strong className="vd-mini-val vd-mono vd-cyan">
                    {analytics.totalFuelBurnedMt} MT
                  </strong>
                </div>
                <div className="vd-mini-box">
                  <span className="vd-mini-label">AVERAGE SOG</span>
                  <strong className="vd-mini-val vd-mono">{analytics.avgSogKnots}</strong>
                </div>
                <div className="vd-mini-box">
                  <span className="vd-mini-label">DEMURRAGE AVOIDED</span>
                  <strong className="vd-mini-val vd-mono vd-emerald">$0 PENALTY</strong>
                </div>
              </div>

              <div className="vd-table">
                <div className="vd-table-row">
                  <span className="vd-table-label">Propulsion Burn Rate</span>
                  <span className="vd-table-val vd-mono">14.5 MT/Day (Eco-Feeder Profile)</span>
                </div>
                <div className="vd-table-row">
                  <span className="vd-table-label">Berth Window Compliance</span>
                  <span className="vd-table-val vd-mono vd-emerald">
                    ON-TIME ARRIVAL WITHIN CUT-OFF
                  </span>
                </div>
                <div className="vd-table-row">
                  <span className="vd-table-label">A* Corridor Optimization</span>
                  <span className="vd-table-val vd-mono vd-cyan">
                    OPTIMAL ARCHIPELAGIC SEA LANE
                  </span>
                </div>
              </div>
            </section>

            {/* CARD 4: ACADEMIC LMS COMPETENCY ASSESSMENT & GRADE SCORING */}
            <section className="vd-card">
              <div className="vd-card-header">
                <span className="vd-card-title">
                  4. Academic LMS Competency &amp; Grade Scoring
                </span>
                <span className="vd-card-tag vd-mono">SCORE: {analytics.totalLmsScore} / 100</span>
              </div>

              <div className="vd-formula-bar vd-mono">
                Score = (Health &times; 0.4) + (VGM &times; 0.2) + (ETA Acc &times; 0.2) + (Demurrage &times; 0.2)
              </div>

              <div className="vd-score-grid">
                <div className="vd-score-pill">
                  <span>Cargo Health (&times;0.4)</span>
                  <strong className="vd-mono vd-cyan">{analytics.weightedHealth} pts</strong>
                </div>
                <div className="vd-score-pill">
                  <span>SOLAS VGM (&times;0.2)</span>
                  <strong className="vd-mono vd-emerald">{analytics.weightedVgm} pts</strong>
                </div>
                <div className="vd-score-pill">
                  <span>ETA Accuracy (&times;0.2)</span>
                  <strong className="vd-mono vd-cyan">{analytics.weightedEta} pts</strong>
                </div>
                <div className="vd-score-pill">
                  <span>Zero Demurrage (&times;0.2)</span>
                  <strong className="vd-mono vd-emerald">{analytics.weightedDemurrage} pts</strong>
                </div>
              </div>

              <div className="vd-grade-footer">
                <div className="vd-grade-badge vd-mono">{analytics.gradeRating}</div>
                <button
                  type="button"
                  className="vd-export-btn vd-mono"
                  onClick={handleExportSummary}
                >
                  {logCopied ? '[✓ LOG COPIED]' : '[🖨️ EXPORT LOG]'}
                </button>
              </div>
            </section>
          </div>
        </main>

        {/* INSTITUTIONAL FOOTER BAR */}
        <footer className="vd-footer">
          <div className="vd-footer-meta">
            <span className="vd-mono">IMO FAL CONVENTION:</span> Inward cargo declaration and bill of lading surrendered to customs authority.
          </div>
          <button
            type="button"
            className="vd-discharge-btn vd-mono"
            disabled={isFinalizing}
            onClick={handleFinalize}
          >
            {isFinalizing
              ? 'FINALIZING DISCHARGE & LEDGER...'
              : '[DISCHARGE CARGO & FINALIZE SHIPMENT →]'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default VoyageDebriefModal;