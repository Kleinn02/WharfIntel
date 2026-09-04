import React, { useState, useEffect, useRef } from 'react';

// --- WEATHER SVGS ---
const SunIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#f1c40f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
    <line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
  </svg>
);

const CloudIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"></path>
  </svg>
);

const RainIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#3498db" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 13v8"></path><path d="M8 13v8"></path><path d="M12 15v8"></path>
    <path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"></path>
  </svg>
);

const ThunderIcon = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"></path>
    <polyline points="13 11 9 17 15 17 11 23"></polyline>
  </svg>
);

const WindArrow = ({ degree }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#82a0ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: `rotate(${degree}deg)` }}>
    <line x1="12" y1="19" x2="12" y2="5"></line>
    <polyline points="5 12 12 5 19 12"></polyline>
  </svg>
);

// --- WMO CODE PARSER ---
const getWeatherDetails = (code) => {
  if (code === 0) return { icon: SunIcon, text: "Clear Skies" };
  if (code >= 1 && code <= 3) return { icon: CloudIcon, text: "Partly Cloudy" };
  if (code >= 51 && code <= 67) return { icon: RainIcon, text: "Rain Showers" };
  if (code >= 80 && code <= 82) return { icon: RainIcon, text: "Heavy Rain" };
  if (code >= 95) return { icon: ThunderIcon, text: "Thunderstorm" };
  return { icon: CloudIcon, text: "Overcast" };
};

const getDayName = (dateString, index) => {
  if (index === 0) return "Today";
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { weekday: 'short' });
};

const LiveWeatherWidget = () => {
  const [data, setData] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const hoverTimeoutRef = useRef(null); // Used to delay the closing animation

  useEffect(() => {
    const fetchRealWeather = async () => {
      try {
        // 🔥 NEW API URL: Added daily forecast parameters (max/min temp, wind, weathercode)
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=6.9534&longitude=126.2166&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,winddirection_10m_dominant&timezone=auto');
        if (res.ok) setData(await res.json());
      } catch (err) {
        console.error("Weather API failed", err);
      }
    };
    fetchRealWeather();
    const interval = setInterval(fetchRealWeather, 300000); 
    return () => clearInterval(interval);
  }, []);

  const handleMouseLeave = () => {
    // Delay closing by 3 seconds so it doesn't snap shut instantly
    hoverTimeoutRef.current = setTimeout(() => setIsOpen(false), 3000);
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
  };

  if (!data) return null;

  const current = data.current_weather;
  const daily = data.daily;
  const { icon: CurrentIcon, text: currentCondition } = getWeatherDetails(current.weathercode);

  return (
    <div 
      className={`os-weather-widget ${isOpen ? 'open' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* COMPACT VIEW (Always Visible) */}
      <div className="widget-compact-header" onClick={() => setIsOpen(!isOpen)}>
        <CurrentIcon />
        <div className="widget-main-temp">
          <h2>{Math.round(current.temperature)}°</h2>
        </div>
        <div className="widget-meta">
          <span className="condition">{currentCondition}</span>
          <span className="location">Local Sector</span>
        </div>
      </div>

      {/* EXPANDED VIEW (7-Day Forecast & Wind Data) */}
      <div className="widget-expanded-body">
        <div className="forecast-scroll-container">
          {daily.time.map((dateStr, index) => {
            const { icon: DayIcon } = getWeatherDetails(daily.weathercode[index]);
            return (
              <div key={index} className="forecast-day-column">
                <span className="f-wind-speed">{Math.round(daily.windspeed_10m_max[index])} km/h</span>
                <WindArrow degree={daily.winddirection_10m_dominant[index]} />
                <span className="f-day-name">{getDayName(dateStr, index)}</span>
                <div className="f-icon-wrapper"><DayIcon /></div>
                <div className="f-temps">
                  <span className="high">{Math.round(daily.temperature_2m_max[index])}°</span>
                  <span className="low">{Math.round(daily.temperature_2m_min[index])}°</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LiveWeatherWidget;