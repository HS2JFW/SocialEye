import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, HeartHandshake, Scale, Users, Sparkles, 
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, 
  MapPin, CheckCircle, ExternalLink, Edit3, X, Eye, Info
} from 'lucide-react';

const DIMENSION_ICONS = {
  sufficiency: Sparkles,
  discipline: Scale,
  integrity: ShieldCheck,
  public_mind: Users,
  gratitude: HeartHandshake
};

const DIMENSION_NAMES = {
  sufficiency: "พอเพียง",
  discipline: "วินัย",
  integrity: "สุจริต",
  public_mind: "จิตอาสา",
  gratitude: "กตัญญู"
};

export default function App() {
  const [overview, setOverview] = useState([]);
  const [feed, setFeed] = useState([]);
  const [provinces, setProvinces] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [activeTab, setActiveTab] = useState('feed'); // feed, provinces, alerts, rubric
  const [loading, setLoading] = useState(true);
  const [ingesting, setIngesting] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editScores, setEditScores] = useState({});
  const [reviewerNotes, setReviewerNotes] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [resOverview, resFeed, resProvinces, resAlerts] = await Promise.all([
        fetch('/api/indices/overview').then(r => r.json()).catch(() => ({ overview: [] })),
        fetch('/api/feed?limit=30').then(r => r.json()).catch(() => ({ feed: [] })),
        fetch('/api/indices/provinces').then(r => r.json()).catch(() => ({ provinces: [] })),
        fetch('/api/alerts').then(r => r.json()).catch(() => ({ alerts: [] }))
      ]);

      setOverview(resOverview.overview || []);
      setFeed(resFeed.feed || []);
      setProvinces(resProvinces.provinces || []);
      setAlerts(resAlerts.alerts || []);
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
    try {
      await fetch('/api/ingest/trigger', { method: 'POST' });
      await fetchData();
    } catch (e) {
      alert("เกิดข้อผิดพลาดในการดึงข้อมูล: " + e.message);
    } finally {
      setIngesting(false);
    }
  };

  const handleOpenReview = (item) => {
    setEditingItem(item);
    setEditScores({
      sufficiency: item.evaluation.scores.sufficiency ?? 0,
      discipline: item.evaluation.scores.discipline ?? 0,
      integrity: item.evaluation.scores.integrity ?? 0,
      public_mind: item.evaluation.scores.public_mind ?? 0,
      gratitude: item.evaluation.scores.gratitude ?? 0,
    });
    setReviewerNotes('');
  };

  const handleSaveReview = async () => {
    if (!editingItem) return;
    setSavingLabel(true);
    try {
      const res = await fetch(`/api/content/${editingItem.evaluation.id}/label`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editScores,
          reviewer_notes: reviewerNotes,
          reviewed_by: 'ผู้เชี่ยวชาญ / Analyst'
        })
      });
      if (res.ok) {
        setEditingItem(null);
        await fetchData();
      } else {
        alert("บันทึกไม่สำเร็จ");
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setSavingLabel(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 3.5) return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (score >= 2.6) return 'text-blue-700 bg-blue-50 border-blue-200';
    if (score >= 2.4) return 'text-slate-700 bg-slate-50 border-slate-200';
    if (score >= 1.5) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-rose-700 bg-rose-50 border-rose-200';
  };

  const getPolarityBadge = (val, dimName) => {
    if (val === null || val === undefined) return null;
    let color = 'bg-slate-100 text-slate-600 border-slate-200';
    let text = `${dimName} (0)`;
    if (val > 0) {
      color = val === 2 ? 'bg-emerald-100 text-emerald-800 border-emerald-300 font-semibold' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
      text = `${dimName} (+${val})`;
    } else if (val < 0) {
      color = val === -2 ? 'bg-rose-100 text-rose-800 border-rose-300 font-semibold' : 'bg-rose-50 text-rose-700 border-rose-200';
      text = `${dimName} (${val})`;
    }
    return (
      <span key={dimName} className={`text-xs px-2.5 py-1 rounded-full border inline-flex items-center gap-1 ${color}`}>
        {text}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 pb-16">
      {/* Top Banner Notice */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-xs md:text-sm text-amber-900 flex items-center justify-between">
        <div className="max-w-7xl mx-auto flex items-center gap-2">
          <Info className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <span>
            <strong>ข้อชี้แจง:</strong> ดัชนีที่แสดงในระบบนี้คือ <strong>"ดัชนีสะท้อนจากสื่อออนไลน์"</strong> (Online Media Reflection Index) จากการวิเคราะห์ข่าวสารและโซเชียล ไม่ใช่ดัชนีคุณธรรมทางการของศูนย์คุณธรรม
          </span>
        </div>
      </div>

      {/* Main Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Eye className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 tracking-tight">SocialEye</h1>
                <span className="text-[11px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  v1.0 Production
                </span>
              </div>
              <p className="text-xs text-slate-500">
                ระบบ AI Agent เฝ้าระวังสื่อต่อดัชนีคุณธรรม 5 ด้าน (พอเพียง • วินัย • สุจริต • จิตอาสา • กตัญญู)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden md:inline-flex text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 border border-slate-200 items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              LLM: gemma-4-31b-it
            </span>
            <button
              onClick={fetchData}
              disabled={loading}
              className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 transition"
              title="รีเฟรชข้อมูล"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={triggerIngest}
              disabled={ingesting}
              className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-medium shadow-sm transition flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${ingesting ? 'animate-spin' : ''}`} />
              {ingesting ? 'AI กำลังวิเคราะห์...' : 'ดึงและวิเคราะห์ข่าวทันที'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 space-y-6">
        
        {/* 5 Moral Dimensions Score Cards */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              ดัชนีคุณธรรม 5 ด้าน (ระดับประเทศ สเกล 0.00 – 5.00)
            </h2>
            <span className="text-xs text-slate-500">2.50 = ระดับสมดุล/เป็นกลาง</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
            {overview.map((item) => {
              const IconComponent = DIMENSION_ICONS[item.key] || ShieldCheck;
              const isPositiveDelta = item.delta > 0;
              const isNegativeDelta = item.delta < 0;

              return (
                <div 
                  key={item.key} 
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:shadow-md transition flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <span className="font-semibold text-slate-900 text-base">{item.name}</span>
                    </div>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${getScoreColor(item.score)}`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="mt-3.5">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-extrabold text-slate-900 tracking-tight">
                        {item.score.toFixed(2)}
                      </span>
                      <span className="text-xs text-slate-400 font-normal">/ 5.00</span>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${
                          item.score >= 3.0 ? 'bg-emerald-500' :
                          item.score >= 2.4 ? 'bg-blue-500' :
                          item.score >= 1.5 ? 'bg-amber-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${(item.score / 5.0) * 100}%` }}
                      ></div>
                    </div>

                    <div className="flex items-center justify-between text-xs mt-2.5 pt-2 border-t border-slate-100">
                      <span className="text-slate-500 text-[11px]">{item.sample_count} ข่าววิเคราะห์</span>
                      <span className={`inline-flex items-center gap-0.5 font-medium text-[11px] ${
                        isPositiveDelta ? 'text-emerald-600' : isNegativeDelta ? 'text-rose-600' : 'text-slate-400'
                      }`}>
                        {isPositiveDelta && <TrendingUp className="w-3 h-3" />}
                        {isNegativeDelta && <TrendingDown className="w-3 h-3" />}
                        {!isPositiveDelta && !isNegativeDelta && <Minus className="w-3 h-3" />}
                        {item.delta > 0 ? `+${item.delta.toFixed(2)}` : item.delta.toFixed(2)} เทียบเมื่อวาน
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tab Controls */}
        <div className="border-b border-slate-200 flex gap-4 text-sm font-medium">
          <button
            onClick={() => setActiveTab('feed')}
            className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'feed' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>กระแสข่าวและผลประเมิน</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-200 text-slate-700">
              {feed.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('provinces')}
            className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'provinces' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>คะแนนรายจังหวัด</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-200 text-slate-700">
              {provinces.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'alerts' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>การแจ้งเตือนความผิดปกติ</span>
            {alerts.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] bg-rose-100 text-rose-700 font-bold">
                {alerts.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('rubric')}
            className={`pb-3 px-1 border-b-2 transition flex items-center gap-2 ${
              activeTab === 'rubric' 
                ? 'border-blue-600 text-blue-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>เกณฑ์การประเมิน (Rubric)</span>
          </button>
        </div>

        {/* Tab 1: Live Feed & AI Evaluations */}
        {activeTab === 'feed' && (
          <div className="space-y-3">
            {feed.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
                <Info className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <p className="font-medium">ยังไม่มีข้อมูลข่าวที่ถูกประเมิน</p>
                <p className="text-xs text-slate-400 mt-1">กดปุ่ม "ดึงและวิเคราะห์ข่าวทันที" เพื่อเริ่มประเมินรอบแรก</p>
              </div>
            ) : (
              feed.map((item) => (
                <div 
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm hover:border-slate-300 transition"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-blue-600 px-2 py-0.5 rounded bg-blue-50 border border-blue-100">
                        {item.source}
                      </span>
                      <span className="flex items-center gap-1 text-slate-600">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {item.evaluation.province}
                      </span>
                      <span>•</span>
                      <span>{new Date(item.published_at).toLocaleString('th-TH')}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.evaluation.is_reviewed && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium inline-flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" /> ผ่านการตรวจทานแล้ว
                        </span>
                      )}
                      <button
                        onClick={() => handleOpenReview(item)}
                        className="text-xs px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition inline-flex items-center gap-1"
                      >
                        <Edit3 className="w-3 h-3" /> แก้ไขป้าย / Review
                      </button>
                    </div>
                  </div>

                  <h3 className="font-semibold text-slate-900 text-base hover:text-blue-600 transition">
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5">
                      {item.title}
                      <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    </a>
                  </h3>

                  {/* Moral dimension tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    <span className="text-xs text-slate-500 font-medium mr-1">ผลประเมินคุณธรรม:</span>
                    {getPolarityBadge(item.evaluation.scores.sufficiency, "พอเพียง")}
                    {getPolarityBadge(item.evaluation.scores.discipline, "วินัย")}
                    {getPolarityBadge(item.evaluation.scores.integrity, "สุจริต")}
                    {getPolarityBadge(item.evaluation.scores.public_mind, "จิตอาสา")}
                    {getPolarityBadge(item.evaluation.scores.gratitude, "กตัญญู")}
                  </div>

                  {/* Evidence quote */}
                  {item.evaluation.evidence_quote && (
                    <blockquote className="mt-2.5 text-xs text-slate-700 bg-slate-50 border-l-2 border-blue-500 px-3 py-1.5 rounded-r italic">
                      "{item.evaluation.evidence_quote}"
                    </blockquote>
                  )}

                  {/* AI Rationale */}
                  {item.evaluation.rationale && (
                    <div className="mt-2 text-xs text-slate-500">
                      <strong>เหตุผลของ AI:</strong> {item.evaluation.rationale}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 2: Province Rankings */}
        {activeTab === 'provinces' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-900">คะแนนคุณธรรมรายจังหวัด</h3>
                <p className="text-xs text-slate-500">ประมวลผลตามสถานที่เกิดเหตุที่ปรากฏในเนื้อหาข่าว</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">จังหวัด</th>
                    <th className="px-3 py-3">จำนวนข่าว</th>
                    <th className="px-3 py-3">พอเพียง</th>
                    <th className="px-3 py-3">วินัย</th>
                    <th className="px-3 py-3">สุจริต</th>
                    <th className="px-3 py-3">จิตอาสา</th>
                    <th className="px-3 py-3">กตัญญู</th>
                    <th className="px-3 py-3">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {provinces.length === 0 ? (
                    <tr>
                      <td colSpan="8" className="px-4 py-8 text-center text-slate-500">
                        ยังไม่มีข้อมูลแยกรายจังหวัดเพียงพอ
                      </td>
                    </tr>
                  ) : (
                    provinces.map((p, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-900">{p.province}</td>
                        <td className="px-3 py-3 text-slate-600">{p.total_items} ชิ้น</td>
                        <td className="px-3 py-3 font-medium">{p.scores.sufficiency.toFixed(2)}</td>
                        <td className="px-3 py-3 font-medium">{p.scores.discipline.toFixed(2)}</td>
                        <td className="px-3 py-3 font-medium">{p.scores.integrity.toFixed(2)}</td>
                        <td className="px-3 py-3 font-medium">{p.scores.public_mind.toFixed(2)}</td>
                        <td className="px-3 py-3 font-medium">{p.scores.gratitude.toFixed(2)}</td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] ${
                            p.total_items >= 5 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'
                          }`}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Alerts */}
        {activeTab === 'alerts' && (
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500">
                <CheckCircle className="w-8 h-8 mx-auto text-emerald-500 mb-2" />
                <p className="font-medium">สถานการณ์ปกติ ไม่มีเหตุการณ์เตือนภัยคุณธรรม</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="bg-white rounded-xl border-l-4 border-rose-500 border-slate-200 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-rose-100 text-rose-800">
                      {alert.level}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(alert.triggered_at).toLocaleString('th-TH')}
                    </span>
                  </div>
                  <h4 className="font-semibold text-slate-900 mt-1">{alert.title}</h4>
                  <p className="text-xs text-slate-600 mt-1 whitespace-pre-line">{alert.description}</p>
                </div>
              ))
            )}
          </div>
        )}

        {/* Tab 4: Rubric */}
        {activeTab === 'rubric' && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4 text-sm text-slate-700">
            <h3 className="text-lg font-bold text-slate-900">กรอบการประเมินคุณธรรม 5 ด้าน</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <h4 className="font-semibold text-blue-900">1. พอเพียง (Sufficiency)</h4>
                <p className="text-xs text-slate-600 mt-1">ดำรงชีวิตพอประมาณ มีเหตุผล มีภูมิคุ้มกัน ไม่โลภ ไม่สร้างหนี้เกินตัว ซื่อตรงต่ออาชีพ</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <h4 className="font-semibold text-blue-900">2. วินัย (Discipline)</h4>
                <p className="text-xs text-slate-600 mt-1">เคารพกฎหมาย กติกา ระเบียบสังคม จรรยาบรรณวิชาชีพ ความรับผิดชอบต่อหน้าที่พลเมือง</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <h4 className="font-semibold text-blue-900">3. สุจริต (Integrity)</h4>
                <p className="text-xs text-slate-600 mt-1">ซื่อสัตย์ ยึดมั่นความถูกต้อง ไม่ทุจริตคอร์รัปชัน ไม่รับสินบน ต่อต้านการคดโกง</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <h4 className="font-semibold text-blue-900">4. จิตอาสา (Public Mind)</h4>
                <p className="text-xs text-slate-600 mt-1">เสียสละเพื่อส่วนรวม ช่วยเหลือผู้ยากไร้ บำเพ็ญสาธารณประโยชน์ อนุรักษ์ธรรมชาติ</p>
              </div>
              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50 md:col-span-2">
                <h4 className="font-semibold text-blue-900">5. กตัญญู (Gratitude)</h4>
                <p className="text-xs text-slate-600 mt-1">สำนึกรู้คุณและตอบแทนบุญคุณต่อบิดามารดา ผู้มีพระคุณ ชุมชน องค์กร และผืนแผ่นดินไทย</p>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200">
              <h4 className="font-semibold text-slate-900">การแปลงสเกลคะแนนดัชนี (0.00 – 5.00)</h4>
              <p className="text-xs text-slate-600 mt-1">
                คะแนนรายชิ้นประเมินระดับ -2 ถึง +2 จากนั้นนำมาหาค่าเฉลี่ยถ่วงน้ำหนัก (Reach × Confidence) แล้วแปลงด้วยสูตร:
                <code className="mx-2 px-2 py-0.5 bg-slate-100 rounded text-blue-700 font-mono">Score = ((x̄ + 2) / 4) * 5.00</code>
                โดย <strong>2.50 = ระดับเป็นกลาง (Neutral)</strong>
              </p>
            </div>
          </div>
        )}

      </main>

      {/* Human Review Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" />
                ตรวจสอบและแก้ไขคะแนนประเมิน (Human-in-the-loop)
              </h3>
              <button 
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-700">
              <p className="font-semibold text-slate-900">{editingItem.title}</p>
              <p className="text-slate-500 mt-1">แหล่งที่มา: {editingItem.source} | จังหวัด: {editingItem.evaluation.province}</p>
            </div>

            <div className="space-y-3">
              {['sufficiency', 'discipline', 'integrity', 'public_mind', 'gratitude'].map((dim) => (
                <div key={dim} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 w-24">{DIMENSION_NAMES[dim]}:</span>
                  <div className="flex items-center gap-1.5">
                    {[-2, -1, 0, 1, 2].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setEditScores({ ...editScores, [dim]: val })}
                        className={`w-9 h-7 rounded border text-xs font-semibold transition ${
                          editScores[dim] === val
                            ? val > 0 
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : val < 0
                              ? 'bg-rose-600 text-white border-rose-600'
                              : 'bg-slate-700 text-white border-slate-700'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {val > 0 ? `+${val}` : val}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                บันทึกการตรวจสอบของผู้เชี่ยวชาญ (Reviewer Note):
              </label>
              <textarea
                value={reviewerNotes}
                onChange={(e) => setReviewerNotes(e.target.value)}
                placeholder="ระบุเหตุผลหรือข้อสังเกตในการแก้ไขคะแนน..."
                rows="2"
                className="w-full text-xs rounded-lg border border-slate-300 p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              ></textarea>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSaveReview}
                disabled={savingLabel}
                className="px-4 py-2 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-sm transition"
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
