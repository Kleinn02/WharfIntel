// src/pages/WeatherHUD.jsx
import React, { useState, useEffect, useRef } from 'react';
import './Simulation.css';

const WeatherHUD = ({ onWeatherUpdate, syncTrigger }) => {
  const [weatherData, setWeatherData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [timeUntilShift, setTimeUntilShift] = useState("0:00");
  
  // 🔥 Holds the absolute timestamp of when the weather will change
  const nextShiftTimeRef = useRef(null);

  // 🔥 EVENT DRIVEN: Instantly fetch when Admin triggers a WS update!
  useEffect(() => {
    fetchWeather();
  }, [syncTrigger]);

  const fetchWeather = async () => {
    try {
      const res = await fetch('http://localhost:8000/api/analytics/weather');
      if (res.ok) {
        const data = await res.json();
        setWeatherData(data);
        
        // Save the exact expiration time globally
        nextShiftTimeRef.current = new Date(data.next_shift_time).getTime();
        
        if (onWeatherUpdate) onWeatherUpdate(data.current.state); 
      }
    } catch (e) {
      console.error("Weather telemetry offline", e);
    }
  };

  // 🔥 SERVER-AUTHORITATIVE COUNTDOWN CLOCK
  useEffect(() => {
    const updateTimer = () => {
      if (!nextShiftTimeRef.current) return;
      
      const now = Date.now();
      const diff = nextShiftTimeRef.current - now;
      
      // If timer hits zero, auto-fetch to get the next state
      if (diff <= 0) {
        setTimeUntilShift("0:00");
        fetchWeather();
        return;
      }
      
      // Calculate MM:SS regardless of how high the minutes go
      const totalSecondsLeft = Math.floor(diff / 1000);
      const m = Math.floor(totalSecondsLeft / 60);
      const s = totalSecondsLeft % 60;
      
      setTimeUntilShift(`${m}:${s.toString().padStart(2, '0')}`);
    };

    const timerId = setInterval(updateTimer, 1000);
    return () => clearInterval(timerId);
  }, []);

  if (!weatherData) return null;
  const { current, forecast } = weatherData;

  return (
    <>
      <div className="weather-hud-pill" onClick={() => setIsModalOpen(true)}>
        <span className="radar-ping" style={{ backgroundColor: current.color, boxShadow: `0 0 10px ${current.color}` }}></span>
        <span style={{ color: current.color, fontWeight: 'bold', minWidth: '70px' }}>{current.state}</span>
        <span style={{ color: 'var(--text-secondary)' }}>| RISK: {(current.risk_percent * 100).toFixed(0)}%</span>
        
        {/* 🔥 The Server-Authoritative Timer */}
        <div className="weather-timer-box">⏱ {timeUntilShift}</div>
      </div>

      {/* 🔽 EXPANDS ON CLICK: Centered Tactical Modal */}
      {isModalOpen && (
        <div className="modal-overlay" style={{ zIndex: 11000 }} onClick={() => setIsModalOpen(false)}>
          <div className="weather-modal" onClick={e => e.stopPropagation()}>
            
            <button className="dossier-close" onClick={() => setIsModalOpen(false)}>✕</button>

            <div className="weather-modal-header" style={{ borderBottomColor: current.color }}>
              <h2 style={{ color: current.color }}>{current.state}</h2>
              <span className="risk-badge" style={{ color: current.color, borderColor: current.color }}>
                RISK: {(current.risk_percent * 100).toFixed(0)}%
              </span>
            </div>

            <div className="weather-metrics" style={{ borderLeftColor: current.color, borderLeft: '3px solid', paddingLeft: '12px', marginBottom: '25px', marginTop: '20px' }}>
              <div className="metric">
                <span className="label">BAROMETRIC PRESSURE</span>
                <span className="value">{current.pressure} hPa</span>
              </div>
              <div className="metric">
                <span className="label">ANOMALY RISK</span>
                <span className="value" style={{ color: current.color, fontWeight: 'bold' }}>
                  {(current.risk_percent * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div className="weather-forecast">
              <span className="forecast-title">TACTICAL FORECAST (15 MIN INTERVALS)</span>
              <div className="forecast-grid">
                {forecast.map((f, idx) => (
                  <div key={idx} className="forecast-item" style={{ borderTopColor: f.data.color }}>
                    <span className="time">{f.time}</span>
                    <span className="risk" style={{ color: f.data.color }}>
                      {(f.data.risk_percent * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* STOCHASTIC THREAT MATRIX LEGEND */}
            <div className="weather-legend">
              <span className="forecast-title" style={{ color: '#82a0ff' }}>STOCHASTIC THREAT MATRIX</span>
              <p className="legend-desc">Climate shifts dynamically every 5 real-world minutes. Cargo deployed during high-risk windows may trigger mandatory Tactical Assessments.</p>
              
              <div className="legend-item">
                <span style={{ color: '#2ecc71' }}>NOMINAL (5%)</span>
                <p>Clear skies. Minimal probability of encountering navigational hazards.</p>
              </div>
              <div className="legend-item">
                <span style={{ color: '#f1c40f' }}>DETERIORATING (35%)</span>
                <p>Moderate storm risk. High probability of severe voyage delays.</p>
              </div>
              <div className="legend-item">
                <span style={{ color: '#e74c3c' }}>CYCLONE (85%)</span>
                <p>Severe weather active. Deploying logistics is highly dangerous.</p>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </>
  );
};

export default WeatherHUD;