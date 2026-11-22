import React, { useState, useMemo } from 'react';
import { 
  THAILAND_VIEWBOX, 
  THAILAND_PROVINCES, 
  PROVINCE_ID_TO_THAI 
} from '../data/thailandMapData';
import { DIMENSIONS } from '../App';

export default function ThailandSvgMap({
  provincesData = [],
  selectedDimension = 'overall',
  selectedRegion = 'ทั้งหมด',
  viewMode = 'provinces', // 'provinces' | 'regions'
  selectedProvince = null,
  onProvinceSelect = () => {},
  onRegionSelect = () => {}
}) {
  const [hoveredProvince, setHoveredProvince] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  // Map of province name -> API data
  const dataMap = useMemo(() => {
    const map = {};
    for (const p of provincesData) {
      if (p.province) {
        map[p.province.trim()] = p;
      }
    }
    return map;
  }, [provincesData]);

  // Determine score value for color fill
  const getProvinceScore = (nameTh) => {
    const data = dataMap[nameTh];
    if (!data || data.total_items === 0) return null;
    if (selectedDimension === 'overall') {
      return data.overall_score ?? 2.50;
    }
    return data.scores?.[selectedDimension] ?? 2.50;
  };

  const getFillColor = (nameTh, isHovered, isSelected) => {
    const score = getProvinceScore(nameTh);
    
    if (isSelected) return '#4f46e5'; // Deep Indigo for selected
    if (isHovered) return '#2563eb'; // Bright Blue on hover

    if (score === null) {
      return '#e2e8f0'; // Neutral Slate for 0 news
    }

    if (score >= 3.5) return '#10b981'; // Emerald
    if (score >= 2.6) return '#3b82f6'; // Blue
    if (score >= 2.4) return '#64748b'; // Slate (Neutral 2.5)
    if (score >= 2.0) return '#f59e0b'; // Amber
    return '#f43f5e'; // Rose
  };

  const handleMouseMove = (e, prov) => {
    const svgRect = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (svgRect) {
      setTooltipPos({
        x: e.clientX - svgRect.left,
        y: e.clientY - svgRect.top
      });
    }
    setHoveredProvince(prov);
  };

  const handleMouseLeave = () => {
    setHoveredProvince(null);
  };

  const hoveredData = hoveredProvince ? dataMap[hoveredProvince.nameTh] : null;
  const hoveredScore = hoveredProvince ? getProvinceScore(hoveredProvince.nameTh) : null;

  return (
    <div className="relative w-full flex items-center justify-center select-none py-2 overflow-visible">
      
      {/* 3D Map SVG */}
      <svg
        viewBox={THAILAND_VIEWBOX}
        className="w-full max-h-[720px] transition-all duration-300 drop-shadow-xl"
        style={{ overflow: 'visible' }}
      >
        <defs>
          {/* 3D Floor Shadow */}
          <filter id="thailand3dFloorShadow" x="-20%" y="-10%" width="150%" height="150%">
            <feDropShadow dx="4" dy="18" stdDeviation="12" floodColor="#0f172a" floodOpacity="0.35" />
          </filter>

          {/* Hover Glow */}
          <filter id="hoverGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#3b82f6" floodOpacity="0.75" />
          </filter>

          {/* Ambient Lighting Gradient */}
          <linearGradient id="mapAmbientLight" x1="0%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0.10" />
          </linearGradient>
        </defs>

        {/* Base Layer: Floor Shadow & Background Silhouette */}
        <g filter="url(#thailand3dFloorShadow)">
          {THAILAND_PROVINCES.map((prov) => (
            <path
              key={`shadow-${prov.id}`}
              d={prov.path}
              fill="#cbd5e1"
              stroke="none"
            />
          ))}
        </g>

        {/* Interactive Province Paths */}
        <g>
          {THAILAND_PROVINCES.map((prov) => {
            const isHovered = hoveredProvince?.id === prov.id;
            const isSelected = selectedProvince?.province === prov.nameTh;
            const fillColor = getFillColor(prov.nameTh, isHovered, isSelected);

            return (
              <path
                key={prov.id}
                id={`prov-${prov.id}`}
                d={prov.path}
                fill={fillColor}
                stroke="#ffffff"
                strokeWidth={isHovered || isSelected ? "2.5" : "0.75"}
                strokeLinejoin="round"
                strokeLinecap="round"
                className="cursor-pointer transition-all duration-150 hover:brightness-110 active:scale-[0.99]"
                filter={isHovered ? "url(#hoverGlow)" : undefined}
                onMouseMove={(e) => handleMouseMove(e, prov)}
                onMouseLeave={handleMouseLeave}
                onClick={() => {
                  const pData = dataMap[prov.nameTh] || {
                    province: prov.nameTh,
                    overall_score: 2.50,
                    scores: { sufficiency: 2.5, discipline: 2.5, integrity: 2.5, public_mind: 2.5, gratitude: 2.5 },
                    total_items: 0,
                    status: 'ข้อมูลเบื้องต้น'
                  };
                  onProvinceSelect(pData);
                }}
              />
            );
          })}
        </g>

        {/* Ambient Top Light Overlay */}
        <g pointerEvents="none">
          {THAILAND_PROVINCES.map((prov) => (
            <path
              key={`overlay-${prov.id}`}
              d={prov.path}
              fill="url(#mapAmbientLight)"
              stroke="none"
            />
          ))}
        </g>
      </svg>

      {/* Floating 3D Tooltip */}
      {hoveredProvince && (
        <div
          className="absolute pointer-events-none z-30 bg-slate-900/95 backdrop-blur text-white p-3 rounded-2xl shadow-2xl border border-slate-700/80 -translate-x-1/2 -translate-y-full mb-4 min-w-[210px] animate-fade-in"
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`
          }}
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
            <div>
              <span className="text-sm font-black text-white block">
                จ.{hoveredProvince.nameTh}
              </span>
              <span className="text-[10px] text-slate-400">
                {hoveredProvince.nameEn}
              </span>
            </div>
            
            <span className={`px-2 py-0.5 rounded-lg text-xs font-black border ${
              hoveredScore === null ? 'bg-slate-800 text-slate-300 border-slate-700' :
              hoveredScore >= 3.5 ? 'bg-emerald-950 text-emerald-400 border-emerald-800' :
              hoveredScore >= 2.6 ? 'bg-blue-950 text-blue-400 border-blue-800' :
              hoveredScore >= 2.4 ? 'bg-slate-800 text-slate-300 border-slate-700' :
              hoveredScore >= 2.0 ? 'bg-amber-950 text-amber-400 border-amber-800' :
              'bg-rose-950 text-rose-400 border-rose-800'
            }`}>
              {hoveredScore !== null ? hoveredScore.toFixed(2) : '2.50 (กลาง)'}
            </span>
          </div>

          <div className="mt-2 text-[11px] space-y-1">
            <div className="flex justify-between text-slate-300">
              <span>ข่าวในพื้นที่:</span>
              <b className="text-white">{hoveredData?.total_items || 0} ข่าว</b>
            </div>
            <div className="flex justify-between text-slate-300">
              <span>สถานะข้อมูล:</span>
              <span className={hoveredData?.total_items >= 5 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                {hoveredData?.total_items >= 5 ? '✓ ข้อมูลเพียงพอ' : 'ข้อมูลเบื้องต้น'}
              </span>
            </div>
          </div>

          <div className="mt-2 pt-1.5 border-t border-slate-800 text-[10px] text-blue-400 text-center font-bold">
            คลิกเพื่อดูสรุปคุณธรรมเจาะลึก 5 มิติ &gt;
          </div>
        </div>
      )}

    </div>
  );
}
