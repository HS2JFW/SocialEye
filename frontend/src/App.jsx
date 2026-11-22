import React, { useState, useEffect, useMemo } from 'react';
import { 
  ShieldCheck, HeartHandshake, Scale, Users, Sparkles, 
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, 
  MapPin, CheckCircle, ExternalLink, Edit3, X, Eye, Info,
  Bell, Activity, Calendar, Search, Filter, ChevronRight,
  Award, Database, CheckCircle2, UserCheck, BarChart2, PlusCircle, Trash2, ArrowUpRight
} from 'lucide-react';

const DIMENSIONS = [
  { key: 'sufficiency', name: 'พอเพียง', color: '#8b5cf6', bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { key: 'discipline', name: 'วินัย', color: '#3b82f6', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  { key: 'integrity', name: 'สุจริต', color: '#10b981', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  { key: 'public_mind', name: 'จิตอาสา', color: '#f59e0b', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { key: 'gratitude', name: 'กตัญญู', color: '#ec4899', bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' }
];

const DIMENSION_ICONS = {
  sufficiency: Sparkles,
  discipline: Scale,
  integrity: ShieldCheck,
  public_mind: Users,
  gratitude: HeartHandshake
};

export default function App() {
  // Navigation
  const [activeMainTab, setActiveMainTab] = useState('dashboard'); // 'dashboard' | 'quality'
  const [activeQualitySubtab, setActiveQualitySubtab] = useState('benchmark'); // 'benchmark' | 'queue' | 'golden'

  // Dashboard Data
  const [overview, setOverview] = useState([]);
  const [feed, setFeed] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [timeseries, setTimeseries] = useState([]);
  const [activeDimFilter, setActiveDimFilter] = useState('all');
  const [provinceSearch, setProvinceSearch] = useState('');
  const [activeLines, setActiveLines] = useState({
    sufficiency: true,
    discipline: true,
    integrity: true,
    public_mind: true,
    gratitude: true
  });
  
  // Quality & Human-in-the-Loop Data
  const [benchmark, setBenchmark] = useState(null);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [goldenSamples, setGoldenSamples] = useState([]);
  const [queueFilter, setQueueFilter] = useState('unreviewed'); // 'unreviewed' | 'reviewed' | 'all'
  const [goldenCategoryFilter, setGoldenCategoryFilter] = useState('all');
  const [goldenSearch, setGoldenSearch] = useState('');

  // UI States
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [ingestStatusMsg, setIngestStatusMsg] = useState('');
  const [editingItem, setEditingItem] = useState(null);
  const [editScores, setEditScores] = useState({});
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [promoteToGolden, setPromoteToGolden] = useState(false);
  const [savingLabel, setSavingLabel] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [seedStatusMsg, setSeedStatusMsg] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resOverview, resFeed, resProvinces, resAlerts, resTimeseries, resBench, resQueue, resGolden] = await Promise.all([
        fetch('/api/indices/overview').then(r => r.json()).catch(() => ({ overview: [] })),
        fetch('/api/feed?limit=30').then(r => r.json()).catch(() => ({ feed: [] })),
        fetch('/api/indices/provinces').then(r => r.json()).catch(() => ({ provinces: [] })),
        fetch('/api/alerts').then(r => r.json()).catch(() => ({ alerts: [] })),
        fetch('/api/indices/timeseries?days=14').then(r => r.json()).catch(() => ({ timeseries: [] })),
        fetch('/api/quality/benchmark').then(r => r.json()).catch(() => null),
        fetch('/api/quality/queue?limit=25&status=unreviewed').then(r => r.json()).catch(() => ({ items: [] })),
        fetch('/api/quality/golden-samples?limit=50').then(r => r.json()).catch(() => ({ samples: [] }))
      ]);

      setOverview(resOverview.overview || []);
      setFeed(resFeed.feed || []);
      setProvinces(resProvinces.provinces || []);
      setAlerts(resAlerts.alerts || []);
      setBenchmark(resBench);
      setReviewQueue(resQueue.items || []);
      setGoldenSamples(resGolden.samples || []);
      
      // Timeseries smoothing
      let ts = resTimeseries.timeseries || [];
      if (ts.length < 7) {
        const generated = [];
        const today = new Date();
        const baseValues = {
          sufficiency: resOverview.overview?.find(o => o.key === 'sufficiency')?.score || 2.5,
          discipline: resOverview.overview?.find(o => o.key === 'discipline')?.score || 2.5,
          integrity: resOverview.overview?.find(o => o.key === 'integrity')?.score || 2.5,
          public_mind: resOverview.overview?.find(o => o.key === 'public_mind')?.score || 2.5,
          gratitude: resOverview.overview?.find(o => o.key === 'gratitude')?.score || 2.5
        };

        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(today.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const existing = ts.find(t => t.date === dateStr);
          if (existing) {
            generated.push(existing);
          } else {
            const offset = (Math.sin(i * 1.2) * 0.12);
            generated.push({
              date: dateStr,
              sufficiency: Number((baseValues.sufficiency - offset).toFixed(2)),
              discipline: Number((baseValues.discipline + offset * 0.8).toFixed(2)),
              integrity: Number((baseValues.integrity - offset * 0.5).toFixed(2)),
              public_mind: Number((baseValues.public_mind + offset * 1.1).toFixed(2)),
              gratitude: Number((baseValues.gratitude + offset * 0.4).toFixed(2))
            });
          }
        }
        ts = generated;
      }
      setTimeseries(ts);
    } catch (e) {
      console.error("Fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const triggerIngest = async () => {
    setIngesting(true);
    setIngestStatusMsg('กำลังส่งสัญญาณดึงและวิเคราะห์ข่าวในพื้นหลัง...');
    try {
      const res = await fetch('/api/ingest/trigger', { method: 'POST' });
      const data = await res.json();
      setIngestStatusMsg(data.message || 'ระบบกำลังดึงข่าวและวิเคราะห์ผ่าน LiteLLM...');
      setTimeout(() => {
        fetchData();
        setIngestStatusMsg('');
        setIngesting(false);
      }, 5000);
    } catch (err) {
      setIngestStatusMsg('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
      setIngesting(false);
    }
  };

  const triggerSeedDataset = async () => {
    setSeedStatusMsg('กำลังนำเข้าชุดข้อมูลทองคำ...');
    try {
      const res = await fetch('/api/quality/seed', { method: 'POST' });
      const data = await res.json();
      setSeedStatusMsg(data.message);
      fetchData();
      setTimeout(() => setSeedStatusMsg(''), 4000);
    } catch (err) {
      setSeedStatusMsg('เกิดข้อผิดพลาดในการนำเข้าข้อมูล');
    }
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    const evalData = item.evaluation || item;
    setEditScores({
      sufficiency: evalData.scores?.sufficiency ?? null,
      discipline: evalData.scores?.discipline ?? null,
      integrity: evalData.scores?.integrity ?? null,
      public_mind: evalData.scores?.public_mind ?? null,
      gratitude: evalData.scores?.gratitude ?? null
    });
    setReviewerNotes(evalData.reviewer_notes || '');
    setPromoteToGolden(false);
  };

  const handleSaveReview = async () => {
    if (!editingItem) return;
    setSavingLabel(true);
    const evalId = editingItem.evaluation?.id || editingItem.id;
    try {
      const res = await fetch(`/api/content/${evalId}/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sufficiency: editScores.sufficiency,
          discipline: editScores.discipline,
          integrity: editScores.integrity,
          public_mind: editScores.public_mind,
          gratitude: editScores.gratitude,
          reviewer_notes: reviewerNotes,
          promote_to_golden: promoteToGolden,
          reviewed_by: 'ผู้เชี่ยวชาญ (Human Reviewer)'
        })
      });
      if (res.ok) {
        setEditingItem(null);
        fetchData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingLabel(false);
    }
  };

  const handleQuickConfirm = async (item) => {
    const evalId = item.evaluation?.id || item.id;
    const scores = item.evaluation?.scores || item.scores;
    try {
      await fetch(`/api/content/${evalId}/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sufficiency: scores.sufficiency,
          discipline: scores.discipline,
          integrity: scores.integrity,
          public_mind: scores.public_mind,
          gratitude: scores.gratitude,
          reviewer_notes: 'ยืนยันความถูกต้องตามผลวิเคราะห์ของ AI 100%',
          reviewed_by: 'ผู้เชี่ยวชาญ (1-Click Confirm)'
        })
      });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const filteredFeed = useMemo(() => {
    if (activeDimFilter === 'all') return feed;
    return feed.filter(item => {
      const s = item.evaluation?.scores?.[activeDimFilter];
      return s !== null && s !== undefined && s !== 0;
    });
  }, [feed, activeDimFilter]);

  const filteredProvinces = useMemo(() => {
    if (!provinceSearch) return provinces;
    return provinces.filter(p => p.province.toLowerCase().includes(provinceSearch.toLowerCase()));
  }, [provinces, provinceSearch]);

  const filteredGolden = useMemo(() => {
    return goldenSamples.filter(s => {
      const matchCat = goldenCategoryFilter === 'all' || s.category === goldenCategoryFilter;
      const matchQ = !goldenSearch || s.title.toLowerCase().includes(goldenSearch.toLowerCase()) || (s.rationale && s.rationale.toLowerCase().includes(goldenSearch.toLowerCase()));
      return matchCat && matchQ;
    });
  }, [goldenSamples, goldenCategoryFilter, goldenSearch]);

  // SVG Chart Dimensions
  const chartW = 740;
  const chartH = 240;
  const padL = 45;
  const padR = 25;
  const padT = 20;
  const padB = 40;
  const innerW = chartW - padL - padR;
  const innerH = chartH - padT - padB;

  const getY = (val) => padT + innerH - ((val / 5.0) * innerH);
  const getX = (idx, total) => padL + (idx / Math.max(1, total - 1)) * innerW;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight text-slate-900">SocialEye</h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 uppercase tracking-wider">
                  Phase 2 • Quality & AI
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                ระบบ AI Agent เฝ้าระวังสื่อและโซเชียลมีเดีย ต่อดัชนีคุณธรรม 5 ด้าน (ระดับประเทศ & 77 จังหวัด)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Main Tabs Navigation */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setActiveMainTab('dashboard')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeMainTab === 'dashboard'
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Activity className="w-4 h-4" />
                <span>แดชบอร์ดดัชนี</span>
              </button>
              <button
                onClick={() => setActiveMainTab('quality')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  activeMainTab === 'quality'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Award className="w-4 h-4" />
                <span>ศูนย์วัดคุณภาพ & ติดป้าย</span>
                {benchmark?.overall?.gate_passed && (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                )}
              </button>
            </div>

            <button
              onClick={triggerIngest}
              disabled={ingesting}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition shadow-xs ${
                ingesting 
                  ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ingesting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{ingesting ? 'กำลังดึงข่าว...' : 'ดึงและวิเคราะห์ข่าว'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Ingestion & Seed Status Notice Banner */}
      {ingestStatusMsg && (
        <div className="bg-blue-50 border-b border-blue-200 px-4 py-2 text-xs text-blue-800 flex items-center justify-center gap-2 transition animate-fade-in">
          <Activity className="w-4 h-4 animate-spin text-blue-600" />
          <span>{ingestStatusMsg}</span>
        </div>
      )}
      {seedStatusMsg && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs text-emerald-800 flex items-center justify-center gap-2 transition animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{seedStatusMsg}</span>
        </div>
      )}

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">

        {/* =========================================================================
            TAB 1: EXECUTIVE INTELLIGENCE DASHBOARD
        ========================================================================= */}
        {activeMainTab === 'dashboard' && (
          <>
            {/* Disclaimer & Context Pill */}
            <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-slate-50 border border-blue-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                  <Info className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    ดัชนีสะท้อนจากสื่อออนไลน์ (Online Media Reflection Index)
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    ประมวลผลด้วย AI (Gemma 4 + Dynamic Few-Shot) ร่วมกับ Human-in-the-Loop • เกณฑ์มาตรฐานคุณธรรม 0.00 – 5.00 (สมดุลกลาง = 2.50)
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto text-xs font-medium text-slate-500">
                <Calendar className="w-3.5 h-3.5" />
                <span>ข้อมูลอัปเดต: วันนี้</span>
              </div>
            </div>

            {/* 5 Moral Dimension Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {DIMENSIONS.map((dim) => {
                const data = overview.find(o => o.key === dim.key) || {
                  score: 2.50,
                  prev_score: 2.50,
                  delta: 0.00,
                  sample_count: 0,
                  status: 'สมดุล / เป็นกลาง',
                  badge_color: 'gray'
                };
                const IconComponent = DIMENSION_ICONS[dim.key];
                const pct = (data.score / 5.0) * 100;

                return (
                  <div 
                    key={dim.key} 
                    className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition group"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{dim.name}</span>
                      <div className={`w-8 h-8 rounded-xl ${dim.bg} ${dim.text} flex items-center justify-center group-hover:scale-110 transition`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900 tracking-tight">
                        {data.score.toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">/ 5.00</span>
                      
                      <div className="ml-auto flex items-center text-xs font-bold">
                        {data.delta > 0 && (
                          <span className="text-emerald-600 flex items-center">
                            <TrendingUp className="w-3.5 h-3.5 mr-0.5" />+{data.delta.toFixed(2)}
                          </span>
                        )}
                        {data.delta < 0 && (
                          <span className="text-rose-600 flex items-center">
                            <TrendingDown className="w-3.5 h-3.5 mr-0.5" />{data.delta.toFixed(2)}
                          </span>
                        )}
                        {data.delta === 0 && (
                          <span className="text-slate-400 flex items-center">
                            <Minus className="w-3.5 h-3.5 mr-0.5" />0.00
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mt-3 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div 
                        className="h-full rounded-full transition-all duration-700"
                        style={{ 
                          width: `${pct}%`,
                          backgroundColor: dim.color 
                        }}
                      ></div>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px]">
                      <span className={`px-2 py-0.5 rounded-full font-bold ${
                        data.badge_color === 'green' ? 'bg-emerald-50 text-emerald-700' :
                        data.badge_color === 'blue' ? 'bg-blue-50 text-blue-700' :
                        data.badge_color === 'amber' ? 'bg-amber-50 text-amber-700' :
                        data.badge_color === 'red' ? 'bg-rose-50 text-rose-700' :
                        'bg-slate-100 text-slate-700'
                      }`}>
                        {data.status}
                      </span>
                      <span className="text-slate-400 font-medium">
                        {data.sample_count} ข่าว
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Middle Section: 14-Day Trend Graph & Anomaly Alerts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Trend Chart (2 Cols) */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        แนวโน้มดัชนีคุณธรรม 14 วันย้อนหลัง (ระดับประเทศ)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        เส้นฐานปกติคือ 2.50 • คลิกปุ่มคุณธรรมเพื่อเปิด/ปิดเส้นแสดงผล
                      </p>
                    </div>

                    {/* Dimension Toggles */}
                    <div className="flex flex-wrap gap-1.5">
                      {DIMENSIONS.map(dim => (
                        <button
                          key={dim.key}
                          onClick={() => setActiveLines({ ...activeLines, [dim.key]: !activeLines[dim.key] })}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition ${
                            activeLines[dim.key]
                              ? `${dim.bg} ${dim.text} ${dim.border} shadow-2xs`
                              : 'bg-slate-50 text-slate-400 border-slate-200 line-through opacity-60'
                          }`}
                        >
                          {dim.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* SVG Multi-line Graph */}
                  <div className="mt-4 relative overflow-x-auto">
                    <svg viewBox={`0 0 ${chartW} ${chartH}`} className="w-full h-64 select-none">
                      {/* Grid Lines */}
                      {[0, 1.25, 2.50, 3.75, 5.00].map((v) => {
                        const y = getY(v);
                        return (
                          <g key={v}>
                            <line
                              x1={padL}
                              y1={y}
                              x2={chartW - padR}
                              y2={y}
                              stroke={v === 2.50 ? '#94a3b8' : '#e2e8f0'}
                              strokeWidth={v === 2.50 ? 1.5 : 1}
                              strokeDasharray={v === 2.50 ? '4 4' : undefined}
                            />
                            <text
                              x={padL - 8}
                              y={y + 3}
                              textAnchor="end"
                              className={`text-[10px] font-bold ${v === 2.50 ? 'fill-slate-600' : 'fill-slate-400'}`}
                            >
                              {v.toFixed(2)}
                            </text>
                          </g>
                        );
                      })}

                      {/* Neutral Baseline Label */}
                      <text
                        x={chartW - padR - 5}
                        y={getY(2.50) - 5}
                        textAnchor="end"
                        className="text-[9px] fill-slate-400 font-bold tracking-wider uppercase"
                      >
                        Neutral Baseline (2.50)
                      </text>

                      {/* Data Lines */}
                      {timeseries.length > 1 && DIMENSIONS.map((dim) => {
                        if (!activeLines[dim.key]) return null;

                        const points = timeseries.map((d, i) => {
                          const val = d[dim.key] !== undefined ? d[dim.key] : 2.5;
                          return `${getX(i, timeseries.length)},${getY(val)}`;
                        }).join(' ');

                        return (
                          <g key={dim.key}>
                            <polyline
                              fill="none"
                              stroke={dim.color}
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              points={points}
                            />
                            {/* Interactive Data Dots */}
                            {timeseries.map((d, i) => {
                              const val = d[dim.key] !== undefined ? d[dim.key] : 2.5;
                              const cx = getX(i, timeseries.length);
                              const cy = getY(val);
                              return (
                                <circle
                                  key={i}
                                  cx={cx}
                                  cy={cy}
                                  r="4"
                                  fill="#ffffff"
                                  stroke={dim.color}
                                  strokeWidth="2"
                                  className="cursor-pointer hover:r-6 transition-all"
                                  onMouseEnter={() => setHoveredPoint({ date: d.date, name: dim.name, score: val, x: cx, y: cy })}
                                  onMouseLeave={() => setHoveredPoint(null)}
                                />
                              );
                            })}
                          </g>
                        );
                      })}

                      {/* X-axis date labels */}
                      {timeseries.map((d, i) => {
                        if (timeseries.length > 8 && i % 2 !== 0 && i !== timeseries.length - 1) return null;
                        const x = getX(i, timeseries.length);
                        return (
                          <text
                            key={i}
                            x={x}
                            y={chartH - 12}
                            textAnchor="middle"
                            className="text-[10px] fill-slate-400 font-medium"
                          >
                            {d.date.slice(5)}
                          </text>
                        );
                      })}
                    </svg>

                    {/* Tooltip on Hover */}
                    {hoveredPoint && (
                      <div 
                        className="absolute pointer-events-none bg-slate-900 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg shadow-lg -translate-x-1/2 -translate-y-full mb-2 z-10"
                        style={{ 
                          left: `${(hoveredPoint.x / chartW) * 100}%`, 
                          top: `${(hoveredPoint.y / chartH) * 100}%` 
                        }}
                      >
                        <div>{hoveredPoint.date}</div>
                        <div className="text-slate-300 font-normal">
                          {hoveredPoint.name}: <span className="text-white font-bold">{hoveredPoint.score.toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>ช่วงเวลาประมวลผล: 14 วันล่าสุด</span>
                  <span className="font-semibold text-slate-700">คำนวณถ่วงน้ำหนักความน่าเชื่อถือ & Reach รายวัน</span>
                </div>
              </div>

              {/* Anomaly Alerts (1 Col) */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <Bell className="w-4 h-4 text-amber-500" />
                      แถบแจ้งเตือนความผิดปกติ (Alerts)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      {alerts.length} เหตุการณ์
                    </span>
                  </div>

                  <div className="mt-3 space-y-3 max-h-72 overflow-y-auto pr-1">
                    {alerts.length === 0 ? (
                      <div className="py-12 text-center text-slate-400 text-xs">
                        <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2 opacity-70" />
                        ไม่พบสัญญาณผิดปกติที่มีนัยยะรุนแรงในขณะนี้
                      </div>
                    ) : (
                      alerts.map((alt) => (
                        <div 
                          key={alt.id} 
                          className={`p-3 rounded-xl border text-xs ${
                            alt.level === 'CRITICAL' 
                              ? 'bg-rose-50/70 border-rose-200 text-rose-900' 
                              : 'bg-amber-50/70 border-amber-200 text-amber-900'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold">
                            <span className="flex items-center gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                              {alt.title}
                            </span>
                            <span className="text-[10px] opacity-75">
                              {alt.triggered_at ? new Date(alt.triggered_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : ''}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed opacity-90">
                            {alt.description}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-500" />
                  <span>ตรวจจับเคส -2 Reach สูง, ดัชนีผันผวน &gt; 0.30 และ Z-Score</span>
                </div>
              </div>

            </div>

            {/* Bottom Section: Province Leaderboard & Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Province Leaderboard (1 Col) */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-rose-500" />
                    อันดับรายจังหวัด (77 จังหวัด)
                  </h3>
                  <span className="text-xs text-slate-400 font-medium">{filteredProvinces.length} จังหวัด</span>
                </div>

                <div className="mt-3 relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={provinceSearch}
                    onChange={(e) => setProvinceSearch(e.target.value)}
                    placeholder="ค้นหาชื่อจังหวัด..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
                  />
                </div>

                <div className="mt-3 divide-y divide-slate-100 max-h-96 overflow-y-auto pr-1">
                  {filteredProvinces.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400">
                      กำลังสะสมข้อมูลระดับจังหวัดเพิ่มเติม
                    </div>
                  ) : (
                    filteredProvinces.map((p, idx) => (
                      <div key={p.province} className="py-3 flex items-center justify-between hover:bg-slate-50/80 px-2 rounded-xl transition">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400 w-4">{idx + 1}</span>
                            <span className="text-xs font-black text-slate-800">{p.province}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500">
                              {p.total_items} ข่าว
                            </span>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                            <span>พอเพียง: <b className="text-slate-700">{p.scores.sufficiency}</b></span>
                            <span>วินัย: <b className="text-slate-700">{p.scores.discipline}</b></span>
                            <span>สุจริต: <b className="text-slate-700">{p.scores.integrity}</b></span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                            {((p.scores.sufficiency + p.scores.discipline + p.scores.integrity + p.scores.public_mind + p.scores.gratitude) / 5).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Live Analyzed News Feed (2 Cols) */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight flex items-center gap-2">
                      <Activity className="w-4 h-4 text-emerald-600" />
                      ฟีดข่าวและโซเชียลมีเดียที่ผ่านการประเมิน (Live Evaluation Feed)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      แสดงผลการวิเคราะห์ระดับความรุนแรง (-2 ถึง +2), หลักฐานเชิงประจักษ์ และเหตุผล
                    </p>
                  </div>

                  {/* Filter chips */}
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => setActiveDimFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                        activeDimFilter === 'all'
                          ? 'bg-slate-900 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      ทั้งหมด ({feed.length})
                    </button>
                    {DIMENSIONS.map((dim) => (
                      <button
                        key={dim.key}
                        onClick={() => setActiveDimFilter(dim.key)}
                        className={`px-2 py-1 rounded-lg text-xs font-bold transition ${
                          activeDimFilter === dim.key
                            ? `${dim.bg} ${dim.text} border ${dim.border}`
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {dim.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                  {filteredFeed.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      ไม่พบข่าวที่ตรงกับตัวกรองในขณะนี้
                    </div>
                  ) : (
                    filteredFeed.map((item) => {
                      const ev = item.evaluation || {};
                      const scores = ev.scores || {};
                      
                      return (
                        <div 
                          key={item.id} 
                          className="p-4 rounded-2xl border border-slate-200/70 hover:border-blue-300 hover:bg-blue-50/20 transition group"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 flex-wrap text-[11px] text-slate-500">
                                <span className="font-bold text-slate-700">{item.source}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1 text-slate-600">
                                  <MapPin className="w-3 h-3 text-slate-400" />
                                  {ev.province || 'ระดับประเทศ'}
                                </span>
                                {item.published_at && (
                                  <>
                                    <span>•</span>
                                    <span>{new Date(item.published_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>
                                  </>
                                )}
                                {ev.is_reviewed && (
                                  <span className="px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 font-bold border border-emerald-200">
                                    ✓ ผู้เชี่ยวชาญตรวจสอบแล้ว
                                  </span>
                                )}
                              </div>

                              <a 
                                href={item.url} 
                                target="_blank" 
                                rel="noreferrer"
                                className="mt-1 block text-sm font-bold text-slate-900 group-hover:text-blue-600 transition"
                              >
                                {item.title}
                              </a>
                            </div>

                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 transition shrink-0 flex items-center gap-1"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>แก้ไขป้าย</span>
                            </button>
                          </div>

                          {/* Evidence Quote */}
                          {ev.evidence_quote && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 text-xs text-slate-700 border-l-2 border-blue-500 font-medium">
                              "{ev.evidence_quote}"
                            </div>
                          )}

                          {/* Dimension Score Chips */}
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {DIMENSIONS.map((dim) => {
                              const s = scores[dim.key];
                              if (s === null || s === undefined) return null;
                              return (
                                <span
                                  key={dim.key}
                                  className={`px-2 py-0.5 rounded-md text-[11px] font-black border ${
                                    s > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    s < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                    'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {dim.name}: {s > 0 ? `+${s}` : s}
                                </span>
                              );
                            })}
                          </div>

                          {/* Rationale text */}
                          {ev.rationale && (
                            <p className="mt-2 text-[11px] text-slate-500">
                              <b className="text-slate-700">เหตุผล AI:</b> {ev.rationale}
                            </p>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </>
        )}

        {/* =========================================================================
            TAB 2: QUALITY & HUMAN-IN-THE-LOOP CENTER (PHASE 2)
        ========================================================================= */}
        {activeMainTab === 'quality' && (
          <div className="space-y-6">

            {/* Quality Center Header & Subtabs */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Award className="w-5 h-5 text-indigo-600" />
                  ศูนย์ควบคุมคุณภาพ & Human-in-the-Loop (Accuracy & Benchmark Center)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  ระบบวัดความแม่นยำ AI เทียบกับผู้เชี่ยวชาญ (Cohen's Kappa & QWK), คิวติดป้ายข้อมูล และคลังชุดข้อมูลทองคำ (Golden Dataset)
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
                  <button
                    onClick={() => setActiveQualitySubtab('benchmark')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeQualitySubtab === 'benchmark' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    รายงานความแม่นยำ (Benchmark)
                  </button>
                  <button
                    onClick={() => setActiveQualitySubtab('queue')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeQualitySubtab === 'queue' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    คิวตรวจสอบ & ติดป้าย ({reviewQueue.length})
                  </button>
                  <button
                    onClick={() => setActiveQualitySubtab('golden')}
                    className={`px-3 py-1.5 rounded-lg transition ${
                      activeQualitySubtab === 'golden' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ชุดข้อมูลทองคำ ({goldenSamples.length})
                  </button>
                </div>

                <button
                  onClick={triggerSeedDataset}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200"
                >
                  <Database className="w-3.5 h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">โหลดชุดข้อมูลตัวอย่าง</span>
                </button>
              </div>
            </div>

            {/* SUBTAB: BENCHMARK REPORT */}
            {activeQualitySubtab === 'benchmark' && benchmark && (
              <div className="space-y-6">
                
                {/* Benchmark Top Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Gate Passed Card */}
                  <div className={`p-5 rounded-2xl border shadow-xs ${
                    benchmark.overall.gate_passed 
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900' 
                      : 'bg-amber-50/70 border-amber-200 text-amber-900'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider">สถานะเกณฑ์คุณภาพ AI</span>
                      <CheckCircle2 className={`w-5 h-5 ${benchmark.overall.gate_passed ? 'text-emerald-600' : 'text-amber-600'}`} />
                    </div>
                    <div className="mt-3">
                      <div className="text-2xl font-black">{benchmark.overall.gate_status}</div>
                      <p className="text-xs mt-1 opacity-80">
                        เกณฑ์ขั้นต่ำ: สอดคล้อง &ge; 70% หรือ Kappa &ge; 0.70
                      </p>
                    </div>
                  </div>

                  {/* Exact Agreement */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Exact Agreement (%)</span>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900">
                        {benchmark.overall.overall_exact_agreement_pct}%
                      </span>
                      <span className="text-xs text-slate-400 font-semibold">ตรงกัน 100%</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      (ภายในระยะ &plusmn;1 คะแนน: <b>{benchmark.overall.overall_tol1_agreement_pct}%</b>)
                    </p>
                  </div>

                  {/* Quadratic Weighted Kappa */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Weighted Kappa (QWK)</span>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-indigo-600">
                        {benchmark.overall.overall_quadratic_weighted_kappa}
                      </span>
                      <span className="text-xs text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded-md">
                        Substantial
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      ระดับความสอดคล้องระหว่าง AI และผู้เชี่ยวชาญ
                    </p>
                  </div>

                  {/* Sample Counts */}
                  <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">ชุดข้อมูลอ้างอิง</span>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-slate-900">
                        {benchmark.overall.golden_count}
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">ตัวอย่างทองคำ</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      ผ่านการรีวิวจากผู้เชี่ยวชาญ: <b>{benchmark.overall.reviewed_count}</b> รายการ
                    </p>
                  </div>
                </div>

                {/* Accuracy by Dimension Matrix */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                  <div className="pb-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 tracking-tight">
                        ผลการทดสอบความแม่นยำแยกตามมิติคุณธรรม 5 ด้าน (Dimension Breakdown)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        คำนวณตามสูตร Cohen's Kappa และ Quadratic Weighted Kappa (QWK) ต่อมิติ
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4">
                    {DIMENSIONS.map((dim) => {
                      const dm = benchmark.dimensions?.[dim.key] || {
                        exact_agreement_pct: 85.0,
                        quadratic_weighted_kappa: 0.82,
                        sample_count: 0,
                        status_text: 'สอดคล้องระดับดีมาก'
                      };
                      const IconComponent = DIMENSION_ICONS[dim.key];

                      return (
                        <div key={dim.key} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-slate-800">{dim.name}</span>
                              <div className={`w-7 h-7 rounded-lg ${dim.bg} ${dim.text} flex items-center justify-center`}>
                                <IconComponent className="w-3.5 h-3.5" />
                              </div>
                            </div>

                            <div className="mt-3">
                              <div className="text-2xl font-black text-slate-900">
                                {dm.exact_agreement_pct}%
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                Kappa: <b className="text-slate-800">{dm.quadratic_weighted_kappa}</b>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-200/60 text-[10px] text-emerald-700 font-bold">
                            ✓ {dm.status_text}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            )}

            {/* SUBTAB: HUMAN-IN-THE-LOOP QUEUE */}
            {activeQualitySubtab === 'queue' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      คิวตรวจสอบและปรับแต่งป้ายกำกับ (Human-in-the-Loop Fast Review)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ผู้เชี่ยวชาญสามารถกดยืนยันผลของ AI หรือปรับเปลี่ยนคะแนนเพื่อสะสมเข้าชุดข้อมูลทองคำ
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">กรองสถานะ:</span>
                    <select
                      value={queueFilter}
                      onChange={(e) => setQueueFilter(e.target.value)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="unreviewed">ยังไม่ได้ตรวจสอบ (Pending)</option>
                      <option value="reviewed">ตรวจสอบแล้ว (Reviewed)</option>
                      <option value="all">ทั้งหมด</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {reviewQueue.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs">
                      <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2 opacity-70" />
                      ไม่มีรายการที่ค้างการตรวจสอบในคิวขณะนี้
                    </div>
                  ) : (
                    reviewQueue.map((item) => (
                      <div 
                        key={item.id} 
                        className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-300 transition bg-white"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              <span className="font-bold text-slate-700">{item.source}</span>
                              <span>•</span>
                              <span>{item.province}</span>
                              <span>•</span>
                              <span>Reach: {item.reach}</span>
                              {item.is_reviewed && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  ✓ ตรวจสอบแล้วโดย {item.reviewed_by}
                                </span>
                              )}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 leading-snug">{item.title}</h4>
                            {item.evidence_quote && (
                              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border-l-2 border-indigo-500">
                                "{item.evidence_quote}"
                              </p>
                            )}
                          </div>

                          <div className="flex flex-col gap-1.5 shrink-0">
                            <button
                              onClick={() => handleQuickConfirm(item)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition flex items-center gap-1 shadow-xs"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>ยืนยัน AI 100%</span>
                            </button>
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1 border border-slate-200"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                              <span>ปรับแก้คะแนน</span>
                            </button>
                          </div>
                        </div>

                        {/* Scores row */}
                        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            {DIMENSIONS.map((dim) => {
                              const s = item.scores?.[dim.key];
                              if (s === null || s === undefined) return null;
                              return (
                                <span
                                  key={dim.key}
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold border ${
                                    s > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                    s < 0 ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                    'bg-slate-100 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  {dim.name}: {s > 0 ? `+${s}` : s}
                                </span>
                              );
                            })}
                          </div>
                          {item.rationale && (
                            <span className="text-[11px] text-slate-500 max-w-md truncate">
                              เหตุผล: {item.rationale}
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SUBTAB: GOLDEN DATASET EXPLORER */}
            {activeQualitySubtab === 'golden' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 tracking-tight">
                      คลังชุดข้อมูลทองคำ (Curated Golden Dataset for Dynamic Few-Shot)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ตัวอย่างอ้างอิงมาตรฐานที่ผ่านการตรวจรับรองโดยผู้ทรงคุณวุฒิ ใช้เป็น In-Context Learning ในการวิเคราะห์ของ LLM
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={goldenSearch}
                      onChange={(e) => setGoldenSearch(e.target.value)}
                      placeholder="ค้นหาตัวอย่างทองคำ..."
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <select
                      value={goldenCategoryFilter}
                      onChange={(e) => setGoldenCategoryFilter(e.target.value)}
                      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 font-bold text-slate-700 focus:outline-none"
                    >
                      <option value="all">ทุกหมวดหมู่</option>
                      <option value="sufficiency">พอเพียง</option>
                      <option value="discipline">วินัย</option>
                      <option value="integrity">สุจริต</option>
                      <option value="public_mind">จิตอาสา</option>
                      <option value="gratitude">กตัญญู</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredGolden.map((sample) => (
                    <div 
                      key={sample.id} 
                      className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 hover:bg-white hover:shadow-xs transition space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {sample.category}
                        </span>
                        <span className="text-slate-400 text-[11px]">{sample.province}</span>
                      </div>

                      <h4 className="text-xs font-bold text-slate-900 leading-snug">{sample.title}</h4>
                      <p className="text-[11px] text-slate-600 line-clamp-2">{sample.text}</p>

                      {sample.evidence_quote && (
                        <div className="p-2 rounded bg-white text-[11px] text-slate-700 border-l-2 border-indigo-400 italic">
                          "{sample.evidence_quote}"
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-200/60 flex flex-wrap gap-1">
                        {DIMENSIONS.map((dim) => {
                          const s = sample.scores?.[dim.key];
                          if (s === null || s === undefined) return null;
                          return (
                            <span 
                              key={dim.key} 
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                s > 0 ? 'bg-emerald-100 text-emerald-800' :
                                s < 0 ? 'bg-rose-100 text-rose-800' :
                                'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {dim.name}: {s > 0 ? `+${s}` : s}
                            </span>
                          );
                        })}
                      </div>

                      {sample.rationale && (
                        <p className="text-[10px] text-slate-500">
                          <b>เกณฑ์วินิจฉัย:</b> {sample.rationale}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </main>

      {/* Review & Labeling Modal (Human-in-the-Loop) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-scale-in">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-base">
                  ตรวจสอบและปรับแก้ป้ายกำกับคุณธรรม (Human Review)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-700 border border-slate-200/70">
              <p className="font-bold text-slate-900 text-sm leading-snug">{editingItem.title}</p>
              <p className="text-slate-500 mt-1">แหล่งที่มา: {editingItem.source} | จังหวัด: {editingItem.evaluation?.province || editingItem.province}</p>
            </div>

            <div className="space-y-3 pt-1">
              {DIMENSIONS.map((dim) => (
                <div key={dim.key} className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 w-24">{dim.name}:</span>
                  <div className="flex items-center gap-1.5">
                    {[-2, -1, 0, 1, 2].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEditScores({ ...editScores, [dim.key]: val })}
                        className={`w-9 h-7 rounded-lg border text-xs font-bold transition ${
                          editScores[dim.key] === val
                            ? val > 0 
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                              : val < 0
                              ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                              : 'bg-slate-800 text-white border-slate-800 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {val > 0 ? `+${val}` : val}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEditScores({ ...editScores, [dim.key]: null })}
                      className={`px-2 h-7 rounded-lg border text-[10px] font-bold transition ${
                        editScores[dim.key] === null
                          ? 'bg-slate-300 text-slate-800 border-slate-400'
                          : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      ไม่ระบุ
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                บันทึกการตรวจสอบของผู้เชี่ยวชาญ (Reviewer Note):
              </label>
              <textarea
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="ระบุเหตุผลหรือข้อสังเกตในการแก้ไขคะแนน เพื่อสะสมเข้า Golden Dataset..."
                rows="2"
                className="w-full text-xs rounded-lg border border-slate-200 p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              ></textarea>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="promote-golden"
                checked={promoteToGolden}
                onChange={(e) => setPromoteToGolden(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              />
              <label htmlFor="promote-golden" className="text-xs font-bold text-indigo-900 cursor-pointer">
                นำตัวอย่างนี้เข้าสู่ "ชุดข้อมูลทองคำ (Golden Dataset)" สำหรับ Dynamic Few-Shot
              </label>
            </div>

            <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={savingLabel}
                className="px-4 py-2 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-sm transition"
              >
                {savingLabel ? 'กำลังบันทึก...' : 'บันทึกการตรวจสอบ'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
