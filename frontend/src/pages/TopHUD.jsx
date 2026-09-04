import React from 'react';
import './Simulation.css'; 

// 🔥 ELITE RANKING SYSTEM DEFINITION
const RANKS = [
  { max: 100, title: 'ROOKIE', color: '#94a3b8' },
  { max: 250, title: 'OPERATOR', color: '#2ecc71' },
  { max: 500, title: 'CAPTAIN', color: '#3498db' },
  { max: 1000, title: 'MASTER', color: '#9b59b6' },
  { max: Infinity, title: 'GRANDMASTER', color: '#f1c40f' }
];

const TopHUD = ({ resources }) => {
  // Calculate current rank tier
  const currentRep = resources.reputation;
  let currentRank = RANKS[0];
  
  for (let i = 0; i < RANKS.length; i++) {
    if (currentRep < RANKS[i].max) {
      currentRank = RANKS[i];
      break;
    }
  }

  // Display formatting
  const isMaxRank = currentRank.title === 'GRANDMASTER';
  const displayRep = isMaxRank ? currentRep : `${currentRep} / ${currentRank.max}`;

  return (
    <div className="stats-hud">
      <div className="stat-item">
        <span className="label">CREDITS:</span>
        <span className="value money">${resources.money.toLocaleString()}</span>
      </div>
      
      {/* 🔥 NEW RANKING UI */}
      <div className="stat-item" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
        <span className="label">RANK:</span>
        <span style={{ 
          color: currentRank.color, 
          fontWeight: 'bold', 
          fontFamily: 'var(--font-mono)',
          textShadow: `0 0 10px ${currentRank.color}40`,
          letterSpacing: '1px'
        }}>
          {currentRank.title}
        </span>
      </div>
      
      <div className="stat-item" style={{ borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '20px' }}>
        <span className="label">REP:</span>
        <span style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontFamily: 'var(--font-mono)' }}>
          {displayRep}
        </span>
      </div>
    </div>
  );
};

export default TopHUD;