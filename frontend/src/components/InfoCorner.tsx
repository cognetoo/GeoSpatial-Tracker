import React from 'react';
import { CityIntelligence } from '../types';

interface InfoProps {
  cityId: string;
  data: CityIntelligence | null; // Typed strictly to match types.ts
}

export const InfoCorner: React.FC<InfoProps> = ({ cityId, data }) => {
  // If the backend hasn't pushed data for this city yet, don't render
  if (!data) return null;

  return (
    <div className="info-corner">
      <div className="intelligence-label">LOCAL INTELLIGENCE: {cityId.toUpperCase()}</div>
      
      {/* Weather Section */}
      <div className="weather-grid">
        <div className="weather-item">
          <span>TEMP</span><b>{data.weather.temp}</b>
        </div>
        <div className="weather-item">
          <span>COND</span><b>{data.weather.condition}</b>
        </div>
        <div className="weather-item">
          <span>VISIBILITY</span><b>{data.weather.visibility}</b>
        </div>
        <div className="weather-item">
          <span>WIND</span><b>{data.weather.wind}</b>
        </div>
      </div>

      {/* News Ticker */}
      <div className="news-ticker">
        <div className="ticker-content">
          {data.news.map((n: string, i: number) => (
            <span key={i} className="news-item"> // {n.toUpperCase()} </span>
          ))}
        </div>
      </div>

      <style>{`
        .info-corner {
          position: absolute; bottom: 30px; right: 20px; z-index: 1000;
          background: rgba(5, 15, 35, 0.88); border: 1px solid #1a3a5c;
          padding: 15px; border-radius: 8px; width: 320px;
          backdrop-filter: blur(12px); font-family: 'Space Mono', monospace;
          box-shadow: 0 0 25px rgba(0, 212, 255, 0.15);
        }
        .intelligence-label {
          font-size: 9px; color: #00ff9d; letter-spacing: 0.15em;
          margin-bottom: 12px; border-bottom: 1px solid rgba(0, 255, 157, 0.3);
          padding-bottom: 4px;
        }
        .weather-grid {
          display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
          margin-bottom: 18px;
        }
        .weather-item { display: flex; flex-direction: column; }
        .weather-item span { font-size: 7px; color: #4d7f99; letter-spacing: 0.05em; }
        .weather-item b { font-size: 11px; color: #fff; margin-top: 2px; }
        
        .news-ticker {
          background: rgba(0,0,0,0.4); padding: 6px; overflow: hidden;
          border-left: 2px solid #00ff9d; white-space: nowrap;
          position: relative;
        }
        .ticker-content {
          display: inline-block; animation: ticker 30s linear infinite;
          padding-left: 100%;
        }
        .news-item { font-size: 10px; color: #7db8d8; margin-right: 50px; font-weight: 500; }
        
        @keyframes ticker {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-200%); }
        }
      `}</style>
    </div>
  );
};