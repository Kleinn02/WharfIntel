 // TopHUD.jsx
import React from 'react';
import './Simulation.css'; // <-- Add this import!

const TopHUD = ({ resources }) => {
  return (
    <div className="stats-hud">
      <div className="stat-item">
        <span className="label">CREDITS:</span>
        <span className="value money">${resources.money.toLocaleString()}</span>
      </div>
      <div className="stat-item">
        <span className="label">PORT REP:</span>
        <div className="rep-bar-container">
          <div className="rep-bar-fill" style={{ width: `${resources.reputation}%` }}></div>
        </div>
      </div>
    </div>
  );
};

export default TopHUD;