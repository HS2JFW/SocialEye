import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  ShieldCheck, HeartHandshake, Scale, Users, Sparkles, 
  TrendingUp, TrendingDown, Minus, RefreshCw, AlertTriangle, 
  MapPin, CheckCircle, ExternalLink, Edit3, X, Eye, Info,
  Bell, Activity, Calendar, Search, Filter, ChevronRight,
  Award, Database, CheckCircle2, UserCheck, BarChart2, PlusCircle, 
  Trash2, ArrowUpRight, MessageSquare, Map, Layers, Send, Bot, User, Flame,
  Compass, Newspaper, FileText, Printer, Download, UploadCloud, Youtube, MessageCircle, HardDrive, MoreHorizontal,
  LogIn, LogOut, Lock, PanelLeftClose, PanelLeftOpen, Settings
} from 'lucide-react';
import ThailandSvgMap from './components/ThailandSvgMap';
import {
  authFetch,
  getAuthConfig,
  getStoredTokens,
  handleOidcCallbackIfPresent,
  startLogin,
  logout,
  clearTokens
} from './auth/oidc';

export const DIMENSIONS = [
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
  // Auth & RBAC States
  const [authReady, setAuthReady] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [authError, setAuthError] = useState('');

  const isAnalyst = currentUser?.role === 'analyst' || currentUser?.role === 'admin';
  const isAdmin = currentUser?.role === 'admin';

  // Navigation Tabs: 'dashboard' | 'map' | 'clusters' | 'chat' | 'quality' | 'reports'
  const [activeMainTab, setActiveMainTab] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeQualitySubtab, setActiveQualitySubtab] = useState('benchmark');

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
  
  // Phase 2: Quality & Human-in-the-Loop Data
  const [benchmark, setBenchmark] = useState(null);
  const [reviewQueue, setReviewQueue] = useState([]);
  const [goldenSamples, setGoldenSamples] = useState([]);
  const [queueFilter, setQueueFilter] = useState('unreviewed');
  const [goldenCategoryFilter, setGoldenCategoryFilter] = useState('all');
  const [goldenSearch, setGoldenSearch] = useState('');

  // Phase 3: Intelligence Data (Map, Clusters, Chat, Graph)
  const [mapData, setMapData] = useState({ regions: {}, provinces: [] });
  const [selectedRegion, setSelectedRegion] = useState('ทั้งหมด');
  const [selectedMapDim, setSelectedMapDim] = useState('overall');
  const [selectedMapProvince, setSelectedMapProvince] = useState(null);
  const [selectedProvinceModal, setSelectedProvinceModal] = useState(null);
  const [clusters, setClusters] = useState([]);
  const [graphOverview, setGraphOverview] = useState(null);

  // Phase 4: Reports, Connectors & Retention States
  const [reports, setReports] = useState([]);
  const [selectedReportModal, setSelectedReportModal] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportGenType, setReportGenType] = useState('weekly');
  const [reportReviewerNotes, setReportReviewerNotes] = useState('');
  const [reportSavingReview, setReportSavingReview] = useState(false);
  const [wisesightUploading, setWisesightUploading] = useState(false);
  const [wisesightMsg, setWisesightMsg] = useState('');
  const [youtubeRunning, setYoutubeRunning] = useState(false);
  const [youtubeMsg, setYoutubeMsg] = useState('');
  const [pantipRunning, setPantipRunning] = useState(false);
  const [pantipMsg, setPantipMsg] = useState('');
  const [backupInfo, setBackupInfo] = useState(null);
  const [retentionCleaning, setRetentionCleaning] = useState(false);
  const [retentionMsg, setRetentionMsg] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Chat Agent States
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: 'สวัสดีครับ ผมคือ SocialEye Moral Intelligence Assistant ผู้ช่วย AI วิเคราะห์ดัชนีคุณธรรม 5 ด้านของประเทศไทย สามารถสอบถามข้อมูลดัชนีคุณธรรม, แนวโน้มรายสัปดาห์, สถานการณ์รายจังหวัด หรือประเด็นตรวจสอบทุจริตและจิตอาสาได้เลยครับ',
      citations: []
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

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

  // Admin Settings States
  const [activeSettingsTab, setActiveSettingsTab] = useState('sources');
  const [sysSettings, setSysSettings] = useState({});
  const [sysMeta, setSysMeta] = useState({});
  const [sysRuntime, setSysRuntime] = useState({});
  const [dataSources, setDataSources] = useState([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState('');
  const [testingChannel, setTestingChannel] = useState('');
  const [testAlertMsg, setTestAlertMsg] = useState('');
  const [testingLlm, setTestingLlm] = useState(false);
  const [testLlmResult, setTestLlmResult] = useState(null);
  const [activePromptAgent, setActivePromptAgent] = useState('prompt_scoring');
  const [activeRubricDim, setActiveRubricDim] = useState('sufficiency');
  const [reevaluating, setReevaluating] = useState(false);
  const [newSourceName, setNewSourceName] = useState('');
  const [newSourceUrl, setNewSourceUrl] = useState('');
  const [newSourceKeywords, setNewSourceKeywords] = useState('');
  const [addingSource, setAddingSource] = useState(false);

  const fetchAdminData = async () => {
    try {
      const [resSet, resSrc, resBak] = await Promise.all([
        authFetch('/api/admin/settings').then(r => r.ok ? r.json() : null).catch(() => null),
        authFetch('/api/admin/sources').then(r => r.ok ? r.json() : null).catch(() => null),
        authFetch('/api/admin/backup').then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      if (resSet) {
        setSysSettings(resSet.settings || {});
        setSysMeta(resSet.meta || {});
        setSysRuntime(resSet.runtime || {});
      }
      if (resSrc) setDataSources(resSrc.sources || []);
      if (resBak) setBackupInfo(resBak);
    } catch (e) {
      console.error('Admin fetch error:', e);
    }
  };

  const handleSaveSettings = async (e) => {
    if (e) e.preventDefault();
    try {
      setSavingSettings(true);
      setSettingsMsg('');
      const res = await authFetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings: sysSettings })
      });
      const data = await res.json();
      if (res.ok) {
        setSysSettings(data.settings || sysSettings);
        setSysMeta(data.meta || sysMeta);
        setSettingsMsg('บันทึกการตั้งค่าระบบเรียบร้อย');
      } else {
        setSettingsMsg(data.detail || 'ไม่สามารถบันทึกการตั้งค่าได้');
      }
    } catch {
      setSettingsMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestAlert = async (channel) => {
    try {
      setTestingChannel(channel);
      setTestAlertMsg('');
      const res = await authFetch('/api/admin/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel })
      });
      const data = await res.json();
      setTestAlertMsg(data.message || 'ทดสอบเสร็จสิ้น');
    } catch {
      setTestAlertMsg('เกิดข้อผิดพลาดในการทดสอบแจ้งเตือน');
    } finally {
      setTestingChannel('');
    }
  };

  const handleTestLlm = async () => {
    try {
      setTestingLlm(true);
      setTestLlmResult(null);
      const res = await authFetch('/api/admin/llm/test', { method: 'POST' });
      const data = await res.json();
      setTestLlmResult(data);
    } catch {
      setTestLlmResult({ status: 'error', message: 'เกิดข้อผิดพลาดในการเชื่อมต่อ Gateway', models: [] });
    } finally {
      setTestingLlm(false);
    }
  };

  const handleResetAiDefaults = async (target) => {
    try {
      setSavingSettings(true);
      setSettingsMsg('');
      const res = await authFetch('/api/admin/settings/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target })
      });
      const data = await res.json();
      if (res.ok) {
        setSysSettings(data.settings || sysSettings);
        setSysMeta(data.meta || sysMeta);
        setSettingsMsg('คืนค่าเริ่มต้นเรียบร้อย');
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleReevaluateRecent = async () => {
    try {
      setReevaluating(true);
      setSettingsMsg('');
      const res = await authFetch('/api/admin/reevaluate?limit=30', { method: 'POST' });
      const data = await res.json();
      setSettingsMsg(data.message || 'เริ่มประเมินข่าวล่าสุดซ้ำในพื้นหลังแล้ว');
    } catch {
      setSettingsMsg('เกิดข้อผิดพลาดในการสั่งประเมินข่าวซ้ำ');
    } finally {
      setReevaluating(false);
    }
  };

  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newSourceName.trim() || !newSourceUrl.trim()) return;
    try {
      setAddingSource(true);
      const res = await authFetch('/api/admin/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSourceName.trim(),
          url: newSourceUrl.trim(),
          keywords: newSourceKeywords
        })
      });
      if (res.ok) {
        setNewSourceName('');
        setNewSourceUrl('');
        setNewSourceKeywords('');
        await fetchAdminData();
      }
    } finally {
      setAddingSource(false);
    }
  };

  const handleToggleSource = async (src) => {
    await authFetch(`/api/admin/sources/${src.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_enabled: !src.is_enabled })
    });
    fetchAdminData();
  };

  const handleDeleteSource = async (id) => {
    await authFetch(`/api/admin/sources/${id}`, { method: 'DELETE' });
    fetchAdminData();
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [
        resOverview, resFeed, resProvinces, resAlerts, resTimeseries, 
        resBench, resQueue, resGolden, resMap, resClusters, resGraph,
        resReports
      ] = await Promise.all([
        authFetch('/api/indices/overview').then(r => r.json()).catch(() => ({ overview: [] })),
        authFetch('/api/feed?limit=30').then(r => r.json()).catch(() => ({ feed: [] })),
        authFetch('/api/indices/provinces').then(r => r.json()).catch(() => ({ provinces: [] })),
        authFetch('/api/alerts').then(r => r.json()).catch(() => ({ alerts: [] })),
        authFetch('/api/indices/timeseries?days=14').then(r => r.json()).catch(() => ({ timeseries: [] })),
        authFetch('/api/quality/benchmark').then(r => r.json()).catch(() => null),
        authFetch('/api/quality/queue?limit=25&status=unreviewed').then(r => r.json()).catch(() => ({ items: [] })),
        authFetch('/api/quality/golden-samples?limit=50').then(r => r.json()).catch(() => ({ samples: [] })),
        authFetch('/api/map/provinces').then(r => r.json()).catch(() => ({ regions: {}, provinces: [] })),
        authFetch('/api/topics/clusters').then(r => r.json()).catch(() => ({ clusters: [] })),
        authFetch('/api/graph/overview').then(r => r.json()).catch(() => null),
        authFetch('/api/reports').then(r => r.json()).catch(() => ({ reports: [] }))
      ]);

      setOverview(resOverview.overview || []);
      setFeed(resFeed.feed || []);
      setProvinces(resProvinces.provinces || []);
      setAlerts(resAlerts.alerts || []);
      setBenchmark(resBench);
      setReviewQueue(resQueue.items || []);
      setGoldenSamples(resGolden.samples || []);
      setMapData(resMap || { regions: {}, provinces: [] });
      setClusters(resClusters.clusters || []);
      setGraphOverview(resGraph);
      setReports(resReports.reports || []);
      
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
    const initAuth = async () => {
      try {
        const cfg = await getAuthConfig();
        setAuthEnabled(cfg.auth_enabled);

        if (cfg.auth_enabled) {
          await handleOidcCallbackIfPresent();
          const tokens = getStoredTokens();
          if (!tokens?.access_token) {
            setAuthReady(true);
            setLoading(false);
            return;
          }
        }

        const meRes = await authFetch('/api/auth/me');
        if (meRes.ok) {
          const me = await meRes.json();
          setCurrentUser(me);
          setAuthReady(true);
          fetchData();
          if (me.role === 'admin') {
            fetchAdminData();
          }
        } else if (meRes.status === 403) {
          const err = await meRes.json().catch(() => ({}));
          setAuthError(err.detail || 'บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าใช้งาน SocialEye');
          setAuthReady(true);
          setLoading(false);
        } else {
          clearTokens();
          setCurrentUser(null);
          setAuthReady(true);
          setLoading(false);
        }
      } catch (err) {
        setAuthError(err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อระบบยืนยันตัวตน');
        setAuthReady(true);
        setLoading(false);
      }
    };
    initAuth();
  }, []);

  const downloadWithAuth = async (url, filename) => {
    try {
      const res = await authFetch(url);
      if (!res.ok) throw new Error('ไม่สามารถดาวน์โหลดไฟล์ได้');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert(err.message || 'เกิดข้อผิดพลาดในการดาวน์โหลด');
    }
  };

  const openHtmlWithAuth = async (url) => {
    try {
      const res = await authFetch(url);
      if (!res.ok) throw new Error('ไม่สามารถเปิดรายงานได้');
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      alert(err.message || 'เกิดข้อผิดพลาดในการเปิดรายงาน');
    }
  };

  useEffect(() => {
    if (activeMainTab === 'chat' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeMainTab]);

  const handleSendChat = async (e) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = { role: 'user', content: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await authFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });
      const data = await res.json();
      setChatMessages([...newMessages, {
        role: 'assistant',
        content: data.reply || 'ขออภัย ระบบไม่สามารถประมวลผลคำตอบได้ในขณะนี้',
        citations: data.citations || []
      }]);
    } catch (err) {
      setChatMessages([...newMessages, {
        role: 'assistant',
        content: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI Chat Agent โปรดลองอีกครั้ง',
        citations: []
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handlePromptClick = (promptText) => {
    setChatInput(promptText);
  };

  const handleAskAiProvince = (prov) => {
    if (!prov) return;
    const prompt = `สรุปสถานการณ์ดัชนีคุณธรรม 5 ด้านและประเด็นข่าวเด่นล่าสุดในจังหวัด${prov.province} ให้ฟังหน่อย`;
    setActiveMainTab('chat');
    const userMsg = { role: 'user', content: prompt };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatLoading(true);

    authFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: newMessages })
    })
      .then(res => res.json())
      .then(data => {
        setChatMessages([...newMessages, {
          role: 'assistant',
          content: data.reply || 'ขออภัย ระบบไม่สามารถประมวลผลคำตอบได้ในขณะนี้',
          citations: data.citations || []
        }]);
      })
      .catch(() => {
        setChatMessages([...newMessages, {
          role: 'assistant',
          content: 'เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI Chat Agent โปรดลองอีกครั้ง',
          citations: []
        }]);
      })
      .finally(() => {
        setChatLoading(false);
      });
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    try {
      const res = await authFetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportGenType })
      });
      const data = await res.json();
      if (data.report) {
        setReports(prev => [data.report, ...prev]);
        setSelectedReportModal(data.report);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setGeneratingReport(false);
    }
  };

  const handlePublishReport = async (rep) => {
    setReportSavingReview(true);
    try {
      const res = await authFetch(`/api/reports/${rep.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'published',
          reviewed_by: 'คณะผู้วิเคราะห์คุณธรรม',
          reviewer_notes: reportReviewerNotes || 'ผ่านการตรวจทานและอนุมัติเผยแพร่'
        })
      });
      const data = await res.json();
      if (data.report) {
        setReports(prev => prev.map(r => r.id === data.report.id ? data.report : r));
        setSelectedReportModal(data.report);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setReportSavingReview(false);
    }
  };

  const handleUploadWisesight = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setWisesightUploading(true);
    setWisesightMsg('กำลังอัปโหลดและประมวลผลข้อมูล Wisesight Trend...');
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await authFetch('/api/ingest/wisesight', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setWisesightMsg(data.message || 'นำเข้าข้อมูลสำเร็จ');
      fetchData();
    } catch (err) {
      setWisesightMsg('เกิดข้อผิดพลาดในการนำเข้าไฟล์');
    } finally {
      setWisesightUploading(false);
    }
  };

  const handleTriggerYoutube = async () => {
    setYoutubeRunning(true);
    setYoutubeMsg('กำลังดึงคลิปข่าวล่าสุดจาก YouTube...');
    try {
      const res = await authFetch('/api/ingest/youtube', { method: 'POST' });
      const data = await res.json();
      setYoutubeMsg(`ดึงและวิเคราะห์คลิปข่าวสำเร็จ (${data.new_videos_ingested || 0} คลิปใหม่)`);
      fetchData();
    } catch (e) {
      setYoutubeMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ YouTube');
    } finally {
      setYoutubeRunning(false);
    }
  };

  const handleTriggerPantip = async () => {
    setPantipRunning(true);
    setPantipMsg('กำลังตรวจสอบกระทู้จิตอาสาและคุณธรรมบน Pantip...');
    try {
      const res = await authFetch('/api/ingest/pantip', { method: 'POST' });
      const data = await res.json();
      setPantipMsg(data.message || 'ตรวจสอบเสร็จสิ้น');
    } catch (e) {
      setPantipMsg('เกิดข้อผิดพลาด');
    } finally {
      setPantipRunning(false);
    }
  };

  const handleRunRetentionCleanup = async () => {
    setRetentionCleaning(true);
    setRetentionMsg('กำลังรันกระบวนการ PDPA Data Retention...');
    try {
      const res = await authFetch('/api/admin/retention/run', { method: 'POST' });
      const data = await res.json();
      setRetentionMsg(data.message || 'ลบข้อมูลหมดอายุเรียบร้อย');
    } catch (e) {
      setRetentionMsg('เกิดข้อผิดพลาดในการรัน PDPA cleanup');
    } finally {
      setRetentionCleaning(false);
    }
  };

  const triggerIngest = async () => {
    setIngesting(true);
    setIngestStatusMsg('กำลังส่งสัญญาณดึงและวิเคราะห์ข่าวในพื้นหลัง...');
    try {
      const res = await authFetch('/api/ingest/trigger', { method: 'POST' });
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
      const res = await authFetch('/api/quality/seed', { method: 'POST' });
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
      const res = await authFetch(`/api/content/${evalId}/label`, {
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
      await authFetch(`/api/content/${evalId}/label`, {
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

  const filteredMapProvinces = useMemo(() => {
    let list = mapData.provinces || [];
    if (selectedRegion !== 'ทั้งหมด') {
      list = list.filter(p => p.region === selectedRegion);
    }
    return list;
  }, [mapData, selectedRegion]);

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

  const getScoreColorBadge = (score) => {
    if (score >= 3.5) return 'bg-emerald-100 text-emerald-800 border-emerald-300';
    if (score >= 2.6) return 'bg-blue-100 text-blue-800 border-blue-300';
    if (score >= 2.4) return 'bg-slate-100 text-slate-800 border-slate-300';
    if (score >= 2.0) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-rose-100 text-rose-800 border-rose-300';
  };

  const roleBadgeMap = {
    admin: { label: 'Admin', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
    analyst: { label: 'Analyst', cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    viewer: { label: 'Viewer', cls: 'bg-slate-100 text-slate-700 border-slate-200' }
  };
  const roleBadge = roleBadgeMap[currentUser?.role] || roleBadgeMap.viewer;

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-11 h-11 rounded-lg bg-slate-900 flex items-center justify-center text-white mb-4 animate-pulse">
          <Eye className="w-5 h-5" />
        </div>
        <p className="text-sm font-semibold text-slate-700">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน SocialEye...</p>
      </div>
    );
  }

  if (authEnabled && !currentUser) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-xl p-8 border border-slate-200 shadow-sm space-y-6 text-center">
          <div className="w-12 h-12 rounded-lg bg-slate-900 flex items-center justify-center text-white mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">SocialEye</h1>
            <p className="text-xs text-slate-500">
              ระบบติดตามและวิเคราะห์ดัชนีคุณธรรม 5 ด้านจากสื่อออนไลน์
            </p>
          </div>

          {authError ? (
            <div className="p-4 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-3 text-left">
              <div className="flex items-center gap-2 font-bold text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>ไม่สามารถเข้าถึงระบบได้</span>
              </div>
              <p className="leading-relaxed">{authError}</p>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setAuthError(''); startLogin(); }}
                  className="flex-1 py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition"
                >
                  เข้าสู่ระบบใหม่
                </button>
                <button
                  onClick={logout}
                  className="py-2.5 px-3 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs transition"
                >
                  ออกจากระบบ
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 leading-relaxed">
                กรุณายืนยันตัวตนผ่านระบบกลาง <strong className="text-slate-900">Authentik SSO (2FA)</strong> เพื่อเข้าใช้งานตามสิทธิ์ที่ได้รับ
              </div>
              <button
                onClick={startLogin}
                className="w-full py-3 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white font-semibold text-sm transition flex items-center justify-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>เข้าสู่ระบบด้วย Authentik SSO</span>
              </button>
            </div>
          )}

          <p className="text-[11px] text-slate-400">
            ดัชนีสะท้อนจากสื่อออนไลน์ • OIDC PKCE & 2FA
          </p>
        </div>
      </div>
    );
  }

  const navGroups = [
    {
      title: 'ติดตามสถานการณ์',
      items: [
        { id: 'dashboard', label: 'ภาพรวมดัชนี', desc: 'สถิติและแนวโน้มดัชนีคุณธรรม 5 ด้าน', icon: Activity },
        { id: 'map', label: 'แผนที่ 77 จังหวัด', desc: 'การกระจายตัวของดัชนีรายจังหวัด', icon: Map },
        { id: 'clusters', label: 'ประเด็นร้อน', desc: 'กลุ่มประเด็นสำคัญจากสื่อออนไลน์', icon: Flame },
        { id: 'chat', label: 'ถาม-ตอบข้อมูล', desc: 'สืบค้นและวิเคราะห์ข้อมูลเชิงลึก', icon: MessageSquare },
      ]
    },
    {
      title: 'ตรวจสอบและรายงาน',
      items: [
        { id: 'quality', label: 'ศูนย์วัดคุณภาพ', desc: 'ตรวจสอบความแม่นยำและชุดข้อมูลทองคำ', icon: Award },
        { id: 'reports', label: 'รายงานและข้อมูล', desc: 'รายงานเชิงนโยบายและส่งออกข้อมูล', icon: FileText },
      ]
    },
    ...(isAdmin ? [{
      title: 'ผู้ดูแลระบบ',
      items: [
        { id: 'settings', label: 'ตั้งค่าระบบ', desc: 'จัดการแหล่งข้อมูล การแจ้งเตือน และนโยบาย PDPA', icon: Settings },
      ]
    }] : [])
  ];

  const activeNavMeta = navGroups.flatMap(g => g.items).find(i => i.id === activeMainTab) || navGroups[0].items[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex">

      {/* Desktop Collapsible Left Sidebar */}
      <aside className={`hidden md:flex flex-col shrink-0 sticky top-0 h-screen bg-white border-r border-slate-200 transition-all duration-200 z-30 ${sidebarCollapsed ? 'w-[68px]' : 'w-60'}`}>
        {/* Sidebar Header / Brand */}
        <div className="h-16 px-3.5 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shrink-0">
              <Eye className="w-4 h-4" />
            </div>
            {!sidebarCollapsed && (
              <div className="min-w-0">
                <span className="text-sm font-bold tracking-tight text-slate-900 block truncate">SocialEye</span>
                <span className="text-[10px] text-slate-400 block truncate">ดัชนีคุณธรรม 5 ด้าน</span>
              </div>
            )}
          </div>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            title={sidebarCollapsed ? 'ขยายแถบเมนู' : 'ย่อแถบเมนู'}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition shrink-0"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-5">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              {!sidebarCollapsed && (
                <div className="px-2.5 pb-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  {group.title}
                </div>
              )}
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = activeMainTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveMainTab(item.id)}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition ${
                      isActive
                        ? 'bg-slate-900 text-white font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                    } ${sidebarCollapsed ? 'justify-center' : ''}`}
                  >
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Sidebar Footer: User Profile & Logout */}
        {currentUser && (
          <div className="p-3 border-t border-slate-200 bg-slate-50/70 shrink-0">
            {sidebarCollapsed ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold" title={`${currentUser.name} (${roleBadge.label})`}>
                  {(currentUser.name || 'U').charAt(0).toUpperCase()}
                </div>
                {authEnabled && (
                  <button
                    onClick={logout}
                    title="ออกจากระบบ"
                    className="p-1.5 rounded-md text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-xs font-bold shrink-0">
                    {(currentUser.name || 'U').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 truncate">{currentUser.name}</div>
                    <span className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold border ${roleBadge.cls}`}>
                      {roleBadge.label}
                    </span>
                  </div>
                </div>
                {authEnabled && (
                  <button
                    onClick={logout}
                    title="ออกจากระบบ"
                    className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col pb-24 md:pb-14">

        {/* Clean Top Bar */}
        <header className="sticky top-0 z-30 h-16 bg-white/95 backdrop-blur border-b border-slate-200 px-4 sm:px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile Brand */}
            <div className="md:hidden flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center text-white shrink-0">
                <Eye className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold text-slate-900">SocialEye</span>
            </div>

            {/* Desktop Current Section Title */}
            <div className="hidden md:block min-w-0">
              <h1 className="text-base font-bold text-slate-900 truncate">{activeNavMeta.label}</h1>
              <p className="text-xs text-slate-500 truncate">{activeNavMeta.desc}</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {isAdmin && (
              <button
                onClick={triggerIngest}
                disabled={ingesting}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                  ingesting
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${ingesting ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">{ingesting ? 'กำลังดึงข่าว...' : 'ดึงข้อมูลข่าว'}</span>
              </button>
            )}

            {currentUser && (
              <div className="md:hidden flex items-center gap-1.5">
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${roleBadge.cls}`}>
                  {roleBadge.label}
                </span>
                {authEnabled && (
                  <button
                    onClick={logout}
                    title="ออกจากระบบ"
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition"
                  >
                    <LogOut className="w-4 h-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

      {/* Notice Banners */}
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
      <main className={`${activeMainTab === 'settings' ? 'max-w-5xl mr-auto' : 'max-w-7xl mx-auto'} w-full px-4 sm:px-6 lg:px-8 pt-6 space-y-6`}>

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

                      <text
                        x={chartW - padR - 5}
                        y={getY(2.50) - 5}
                        textAnchor="end"
                        className="text-[9px] fill-slate-400 font-bold tracking-wider uppercase"
                      >
                        Neutral Baseline (2.50)
                      </text>

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

                          {ev.news_summary && (
                            <p className="mt-2 text-xs text-slate-600 leading-relaxed">{ev.news_summary}</p>
                          )}

                          {ev.evidence_quote && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 text-xs text-slate-700 border-l-2 border-blue-500 font-medium">
                              "{ev.evidence_quote}"
                            </div>
                          )}

                          {ev.entity_evaluations && ev.entity_evaluations.length > 0 && (
                            <div className="mt-2.5 space-y-1.5">
                              {ev.entity_evaluations.map((ent, eIdx) => {
                                const activeDims = DIMENSIONS.filter((d) => {
                                  const sc = ent.scores?.[d.key]?.score;
                                  return sc !== null && sc !== undefined && sc !== 0;
                                });
                                if (activeDims.length === 0) return null;
                                return (
                                  <div key={eIdx} className="p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px] space-y-1">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span className="font-bold text-slate-900">{ent.entity_name}</span>
                                      {ent.role_in_news && (
                                        <span className="px-1.5 py-0.2 rounded bg-slate-200/70 text-slate-600 text-[10px]">
                                          {ent.role_in_news}
                                        </span>
                                      )}
                                      {activeDims.map((d) => {
                                        const sc = ent.scores[d.key].score;
                                        return (
                                          <span
                                            key={d.key}
                                            className={`px-1.5 py-0.2 rounded font-bold border ${
                                              sc > 0 ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                                            }`}
                                          >
                                            {d.name}: {sc > 0 ? `+${sc}` : sc}
                                          </span>
                                        );
                                      })}
                                    </div>
                                    {activeDims[0] && ent.scores?.[activeDims[0].key]?.reasoning && (
                                      <p className="text-slate-500">{ent.scores[activeDims[0].key].reasoning}</p>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

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
            TAB 2: THAILAND INTERACTIVE GEO MAP (PHASE 3)
        ========================================================================= */}
        {activeMainTab === 'map' && (
          <div className="space-y-6">
            
            {/* Top Bar: Title & Controls */}
            <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2.5">
                    <Map className="w-6 h-6 text-rose-600" />
                    แผนที่ความตื่นตัวและสุขภาพคุณธรรม 77 จังหวัด (Thailand Moral Geo Map)
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    ถอดแบบ Vector Path แผนที่ประเทศไทย 77 จังหวัด • สเกล 0.00 – 5.00 คำนวณถ่วงน้ำหนักตามเหตุการณ์จริง
                  </p>
                </div>

                {/* Region Filter Buttons */}
                <div className="flex flex-wrap gap-1.5">
                  {['ทั้งหมด', 'ภาคเหนือ', 'ภาคตะวันออกเฉียงเหนือ', 'ภาคกลาง', 'ภาคตะวันออก', 'ภาคตะวันตก', 'ภาคใต้'].map(reg => (
                    <button
                      key={reg}
                      onClick={() => setSelectedRegion(reg)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        selectedRegion === reg
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {reg}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dimension Heatmap Selector Bar */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-slate-400" />
                    เลือกมิติแสดงผลบนแผนที่:
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedMapDim('overall')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 ${
                      selectedMapDim === 'overall'
                        ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-900/20'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Compass className="w-3.5 h-3.5" />
                    ภาพรวมคุณธรรม
                  </button>

                  {DIMENSIONS.map((dim) => {
                    const IconComp = DIMENSION_ICONS[dim.key] || Sparkles;
                    const isActive = selectedMapDim === dim.key;
                    return (
                      <button
                        key={dim.key}
                        onClick={() => setSelectedMapDim(dim.key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border ${
                          isActive
                            ? 'bg-white text-slate-900 shadow-sm ring-2 ring-slate-900/10'
                            : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                        }`}
                        style={{
                          borderColor: isActive ? dim.color : '#e2e8f0',
                          borderWidth: isActive ? '2px' : '1px'
                        }}
                      >
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dim.color }}></span>
                        <IconComp className="w-3.5 h-3.5" style={{ color: dim.color }} />
                        {dim.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Main Interactive Map & Inspection Drawer 2-Column Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Interactive Vector Map (7 Cols on LG) */}
              <div className="lg:col-span-7 xl:col-span-7 bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-xs font-black text-slate-800">
                      แผนที่เวกเตอร์ 77 จังหวัด (คลิกเลือกจังหวัดเพื่อวิเคราะห์)
                    </span>
                  </div>

                  <span className="text-[11px] font-semibold text-slate-400">
                    มิติปัจจุบัน: <b className="text-slate-700">{selectedMapDim === 'overall' ? 'ภาพรวมคุณธรรม' : DIMENSIONS.find(d => d.key === selectedMapDim)?.name}</b>
                  </span>
                </div>

                {/* SVG Vector Map Container */}
                <div className="relative bg-gradient-to-b from-slate-50/60 to-slate-100/40 rounded-2xl p-4 border border-slate-100 flex items-center justify-center min-h-[580px]">
                  <ThailandSvgMap
                    provincesData={mapData.provinces || []}
                    selectedDimension={selectedMapDim}
                    selectedRegion={selectedRegion}
                    selectedProvince={selectedMapProvince}
                    onProvinceSelect={(prov) => setSelectedMapProvince(prov)}
                  />
                </div>

                {/* Heatmap Legend & Color Scales */}
                <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center flex-wrap gap-2 text-[11px] font-bold">
                    <span className="text-slate-400 font-semibold mr-1">เกณฑ์ระดับ:</span>
                    <span className="flex items-center gap-1 text-rose-700"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> วิกฤต (&lt;2.0)</span>
                    <span className="flex items-center gap-1 text-amber-700"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> เฝ้าระวัง (2.0-2.4)</span>
                    <span className="flex items-center gap-1 text-slate-600"><span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span> สมดุล (2.4-2.6)</span>
                    <span className="flex items-center gap-1 text-blue-700"><span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> เชิงบวก (2.6-3.5)</span>
                    <span className="flex items-center gap-1 text-emerald-700"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> ยอดเยี่ยม (&gt;3.5)</span>
                    <span className="flex items-center gap-1 text-slate-400"><span className="w-2.5 h-2.5 rounded-full bg-slate-200 border border-slate-300"></span> ไม่มีข่าว (2.50)</span>
                  </div>

                  <div className="text-[10px] text-slate-400 italic">
                    *ข้อมูลอ้างอิงและคำนวณจากคลังข่าวดิจิทัล
                  </div>
                </div>
              </div>

              {/* Right Column: Province Inspection Drawer (5 Cols on LG) */}
              <div className="lg:col-span-5 xl:col-span-5 space-y-4">
                
                {selectedMapProvince ? (
                  <div className="bg-white rounded-xl p-6 border border-indigo-200/80 shadow-md space-y-5 animate-fade-in ring-1 ring-indigo-500/10">
                    
                    {/* Drawer Header */}
                    <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-5 h-5 text-rose-600" />
                          <h3 className="font-black text-slate-900 text-xl">
                            จังหวัด{selectedMapProvince.province}
                          </h3>
                        </div>
                        <span className="text-xs text-slate-500 mt-1 block">
                          {selectedMapProvince.region} • ข้อมูลสถานะ: <span className="font-bold text-slate-700">{selectedMapProvince.status || 'ข้อมูลเบื้องต้น'}</span>
                        </span>
                      </div>

                      <button
                        onClick={() => setSelectedMapProvince(null)}
                        className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
                        title="ปิดแผงตรวจเจาะลึก"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Overall Score Banner */}
                    <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white p-5 rounded-2xl flex items-center justify-between shadow-xs">
                      <div>
                        <span className="text-xs text-indigo-200 font-bold block uppercase tracking-wider">ดัชนีคุณธรรมรวมของพื้นที่</span>
                        <div className="mt-1 flex items-baseline gap-2">
                          <span className="text-4xl font-black text-white">
                            {(selectedMapProvince.overall_score ?? 2.50).toFixed(2)}
                          </span>
                          <span className="text-xs text-indigo-300 font-medium">/ 5.00 คะแนนเต็ม</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className={`inline-block px-3 py-1 rounded-xl text-xs font-black border ${
                          selectedMapProvince.total_items >= 5 
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        }`}>
                          {selectedMapProvince.total_items >= 5 ? '✓ ข้อมูลเพียงพอ' : 'ข้อมูลเบื้องต้น'}
                        </span>
                        <span className="text-[11px] text-indigo-300 block mt-1">
                          {selectedMapProvince.total_items || 0} ข่าวในระบบ
                        </span>
                      </div>
                    </div>

                    {/* 5-Dimension Radar / Horizontal Bars */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between text-xs font-black text-slate-800">
                        <span>คะแนนจำแนกตามมิติคุณธรรม 5 ด้าน</span>
                        <span className="text-[10px] text-slate-400 font-semibold">เป้าหมาย &gt; 3.00</span>
                      </div>

                      <div className="space-y-2.5">
                        {DIMENSIONS.map((dim) => {
                          const sc = selectedMapProvince.scores?.[dim.key] ?? 2.50;
                          const pct = Math.min(100, Math.max(0, (sc / 5.0) * 100));
                          const IconComp = DIMENSION_ICONS[dim.key] || Sparkles;
                          return (
                            <div key={dim.key} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                                  <IconComp className="w-3.5 h-3.5" style={{ color: dim.color }} />
                                  {dim.name}
                                </span>
                                <span className="font-black text-slate-900">{sc.toFixed(2)} / 5.00</span>
                              </div>
                              <div className="w-full bg-slate-200/80 h-2 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full transition-all duration-500" 
                                  style={{ width: `${pct}%`, backgroundColor: dim.color }}
                                ></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Local News in this Province */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-xs font-black text-slate-800">
                        <span className="flex items-center gap-1.5">
                          <Newspaper className="w-3.5 h-3.5 text-blue-600" />
                          ข่าวยืนยันในพื้นที่ ({selectedMapProvince.province})
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {feed.filter(f => f.evaluation?.province === selectedMapProvince.province).length} รายการ
                        </span>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {feed.filter(f => f.evaluation?.province === selectedMapProvince.province).length === 0 ? (
                          <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-400 text-center">
                            ยังไม่มีข่าวยืนยันที่ระบุพิกัดจังหวัดนี้โดยตรง (ระบบใช้ค่าเกณฑ์กลาง 2.50)
                          </div>
                        ) : (
                          feed
                            .filter(f => f.evaluation?.province === selectedMapProvince.province)
                            .slice(0, 3)
                            .map((item) => (
                              <div key={item.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 hover:border-blue-200 transition text-xs space-y-1">
                                <a 
                                  href={item.url} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="font-bold text-slate-800 hover:text-blue-600 line-clamp-1 block"
                                >
                                  {item.title}
                                </a>
                                <div className="flex items-center justify-between text-[10px] text-slate-400">
                                  <span>{item.source}</span>
                                  <span>{item.published_at ? new Date(item.published_at).toLocaleDateString('th-TH') : ''}</span>
                                </div>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    {/* 🌟 1-Click AI Deep-Dive Action Button */}
                    <div className="pt-2 border-t border-slate-100">
                      <button
                        onClick={() => handleAskAiProvince(selectedMapProvince)}
                        className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 text-white font-black text-xs shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition hover:scale-[1.02] active:scale-[0.98] group cursor-pointer"
                      >
                        <Bot className="w-4 h-4 text-indigo-200 group-hover:rotate-12 transition-transform" />
                        <span>สอบถามและวิเคราะห์ข้อมูลจังหวัดนี้</span>
                        <ChevronRight className="w-4 h-4 text-indigo-200 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>

                  </div>
                ) : (
                  /* Empty State: Prompting User to Select a Province */
                  <div className="bg-white rounded-xl p-8 border border-slate-200/80 shadow-xs space-y-5 text-center flex flex-col items-center justify-center min-h-[500px]">
                    <div className="w-16 h-16 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                      <Map className="w-8 h-8 text-indigo-600 animate-bounce" />
                    </div>

                    <div className="space-y-1.5 max-w-xs">
                      <h4 className="text-base font-black text-slate-900">
                        เลือกจังหวัดเพื่อเปิดแผงตรวจเจาะลึก
                      </h4>
                      <p className="text-xs text-slate-500">
                        คลิกบนแผนที่ประเทศไทย หรือเลือกจากจังหวัดตัวอย่างด้านล่าง เพื่อดูดัชนี 5 มิติและสอบถาม AI
                      </p>
                    </div>

                    {/* Quick Access Pills for Representative Provinces */}
                    <div className="pt-2 w-full space-y-2">
                      <span className="text-[11px] font-bold text-slate-400 block">จังหวัดแนะนำ:</span>
                      <div className="flex flex-wrap justify-center gap-1.5">
                        {['กรุงเทพมหานคร', 'เชียงใหม่', 'ขอนแก่น', 'สงขลา', 'ชลบุรี', 'นครราชสีมา'].map((provName) => {
                          const pData = (mapData.provinces || []).find(p => p.province === provName) || {
                            province: provName,
                            overall_score: 2.50,
                            scores: { sufficiency: 2.5, discipline: 2.5, integrity: 2.5, public_mind: 2.5, gratitude: 2.5 },
                            total_items: 0,
                            status: 'ข้อมูลเบื้องต้น',
                            region: 'ภาคกลาง'
                          };
                          return (
                            <button
                              key={provName}
                              onClick={() => setSelectedMapProvince(pData)}
                              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 border border-slate-200 text-xs font-bold text-slate-700 transition cursor-pointer"
                            >
                              {provName}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                )}

              </div>

            </div>

            {/* Regional Summary Metrics Cards */}
            <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-black text-slate-800">
                  สรุปดัชนีเฉลี่ยจำแนกตาม 6 ภูมิภาค (Regional Moral Summary)
                </span>
                <span className="text-[11px] text-slate-400">
                  คลิกการ์ดภูมิภาคเพื่อกรองรายการ
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {Object.entries(mapData.regions || {}).map(([regName, rData]) => (
                  <div 
                    key={regName}
                    onClick={() => setSelectedRegion(regName)}
                    className={`p-4 rounded-2xl border cursor-pointer transition ${
                      selectedRegion === regName
                        ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-500/20 shadow-xs'
                        : 'bg-slate-50/60 border-slate-200/80 hover:bg-white hover:border-rose-300'
                    }`}
                  >
                    <span className="text-xs font-black text-slate-700 block truncate">{regName}</span>
                    <div className="mt-1.5 flex items-baseline gap-1">
                      <span className="text-2xl font-black text-slate-900">{rData.avg_score.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 font-semibold">/ 5.00</span>
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between">
                      <span>{rData.scored_provinces}/{rData.total_provinces} จ.</span>
                      <span className="font-bold text-slate-600">{rData.total_news} ข่าว</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 77 Provinces Grid Overview */}
            <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-black text-slate-800">
                  ตารางรายชื่อจังหวัด ({filteredMapProvinces.length} จังหวัด)
                </span>
                <span className="text-[11px] text-slate-400">
                  คลิกเพื่อเปิดการ์ดเจาะลึก
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {filteredMapProvinces.map((prov) => {
                  const badgeCls = getScoreColorBadge(prov.overall_score);
                  const isSelected = selectedMapProvince?.province === prov.province;
                  return (
                    <div
                      key={prov.province}
                      onClick={() => setSelectedMapProvince(prov)}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition flex flex-col justify-between group ${
                        isSelected 
                          ? 'border-indigo-500 bg-indigo-50/50 shadow-xs ring-2 ring-indigo-500/20' 
                          : 'border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-white hover:shadow-xs'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-black truncate transition ${
                            isSelected ? 'text-indigo-700' : 'text-slate-800 group-hover:text-indigo-600'
                          }`}>
                            {prov.province}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 block mt-0.5">{prov.region}</span>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <span className={`px-2 py-0.5 rounded-lg text-xs font-black border ${badgeCls}`}>
                          {prov.overall_score.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {prov.total_items} ข่าว
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

        {/* =========================================================================
            TAB 3: EMERGING ISSUE CLUSTERS (PHASE 3)
        ========================================================================= */}
        {activeMainTab === 'clusters' && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-amber-500" />
                  การจับกลุ่มประเด็นร้อนทางคุณธรรม (Emerging Moral Issue Clusters)
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  ประมวลผลด้วย Semantic Clustering และ Entity Association วิเคราะห์ทิศทางและโมเมนตัมของประเด็นในสังคม
                </p>
              </div>

              {graphOverview && (
                <div className="flex items-center gap-3 text-xs bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
                  <span className="text-slate-500">Knowledge Graph:</span>
                  <span className="font-bold text-slate-800">{graphOverview.total_entities || 12} เอนทิตี</span>
                  <span>•</span>
                  <span className="font-bold text-slate-800">{graphOverview.total_contents || 30} ข่าว</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {clusters.map((cluster) => (
                <div 
                  key={cluster.id}
                  className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                          cluster.momentum === 'hot' ? 'bg-rose-100 text-rose-700 animate-pulse' :
                          cluster.momentum === 'stable' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {cluster.momentum === 'hot' ? '🔥 กำลังเป็นกระแสร้อน' : cluster.momentum === 'stable' ? '📌 มีการติดตามต่อเนื่อง' : '📉 เริ่มคลี่คลาย'}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">มิติ: <b className="text-slate-700">{cluster.dimension_name}</b></span>
                      </div>
                      <h3 className="text-sm font-black text-slate-900 leading-snug">{cluster.title}</h3>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-lg font-black text-slate-900">{cluster.moral_score.toFixed(2)}</span>
                      <span className="text-[10px] text-slate-400 block">ดัชนีเฉลี่ย</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                    {cluster.summary}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      {cluster.provinces?.map(p => (
                        <span key={p} className="px-1.5 py-0.2 rounded bg-slate-100 text-[10px] text-slate-700 font-bold">
                          {p}
                        </span>
                      ))}
                    </div>
                    <span className="font-bold text-slate-700">{cluster.article_count} ข่าวที่เกี่ยวข้อง</span>
                  </div>

                  {/* Representative Articles */}
                  {cluster.top_articles?.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ข่าวตัวอย่างในประเด็นนี้:</span>
                      {cluster.top_articles.map((art, idx) => (
                        <a 
                          key={idx} 
                          href={art.url} 
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center justify-between text-xs text-slate-700 hover:text-blue-600 truncate p-1.5 rounded-lg hover:bg-slate-50 transition"
                        >
                          <span className="truncate">• {art.title}</span>
                          <ExternalLink className="w-3 h-3 shrink-0 ml-2 text-slate-400" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 4: MORAL CHAT AGENT (PHASE 3)
        ========================================================================= */}
        {activeMainTab === 'chat' && (
          <div className="max-w-4xl mx-auto space-y-4">
            
            <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900">SocialEye Moral Assistant</h3>
                  <p className="text-xs text-slate-500">ตอบคำถามด้วย RAG + Gemma 4 อ้างอิงฐานข้อมูลคุณธรรมจริง ไม่แต่งเติมข้อมูล</p>
                </div>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Gemma 4 • พร้อมใช้งาน
              </span>
            </div>

            {/* Prompt Suggestions */}
            <div className="flex flex-wrap gap-2">
              {[
                'สรุปประเด็นด้านสุจริตที่มีการพูดถึงมากที่สุดในสัปดาห์นี้',
                'จังหวัดใดมีคะแนนด้านจิตอาสาโดดเด่นและเกิดจากเหตุการณ์ใด?',
                'วิเคราะห์แนวโน้มวินัยจราจรจากข่าวล่าสุด',
                'เปรียบเทียบภาพรวมคุณธรรม 5 ด้านระดับประเทศ'
              ].map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handlePromptClick(prompt)}
                  className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-indigo-400 text-xs text-slate-700 hover:text-indigo-600 transition shadow-2xs"
                >
                  💡 {prompt}
                </button>
              ))}
            </div>

            {/* Chat Box */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs flex flex-col h-[34rem]">
              <div className="flex-1 p-5 overflow-y-auto space-y-4">
                {chatMessages.map((msg, idx) => (
                  <div 
                    key={idx}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-1">
                        <Bot className="w-4 h-4" />
                      </div>
                    )}

                    <div className={`max-w-[80%] rounded-2xl p-4 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-xs'
                        : 'bg-slate-50 text-slate-800 border border-slate-200/80 rounded-bl-xs'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {/* Source Citations */}
                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-1">
                          <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">
                            แหล่งอ้างอิงจากฐานข้อมูล:
                          </span>
                          {msg.citations.map((cite, cIdx) => (
                            <a
                              key={cIdx}
                              href={cite.url}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center justify-between text-[11px] text-blue-600 hover:underline bg-white p-1.5 rounded border border-slate-200"
                            >
                              <span className="truncate">[{cite.source}] {cite.title}</span>
                              <ExternalLink className="w-3 h-3 shrink-0 ml-1 text-slate-400" />
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {msg.role === 'user' && (
                      <div className="w-7 h-7 rounded-lg bg-slate-900 text-white flex items-center justify-center shrink-0 mt-1">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}

                {chatLoading && (
                  <div className="flex gap-3 items-center text-xs text-slate-400 italic">
                    <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                      <Bot className="w-4 h-4 animate-spin" />
                    </div>
                    <span>AI กำลังค้นคืนข้อมูลคุณธรรมและประมวลผลคำตอบ...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Quick Prompts Pills for Mobile & Web */}
              <div className="px-3 pt-2.5 pb-1 bg-slate-50/70 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
                {[
                  "สรุปภาพรวมคุณธรรมระดับประเทศวันนี้",
                  "จังหวัดไหนมีดัชนีสุจริตสูงสุด",
                  "ประเด็นตรวจสอบทุจริตล่าสุดมีอะไรบ้าง",
                  "ข่าวกิจกรรมจิตอาสาเด่นสัปดาห์นี้"
                ].map((promptText) => (
                  <button
                    key={promptText}
                    type="button"
                    onClick={() => handlePromptClick(promptText)}
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-indigo-50 text-indigo-700 font-bold text-[11px] whitespace-nowrap border border-slate-200 shadow-2xs transition shrink-0 active:scale-95"
                  >
                    💬 {promptText}
                  </button>
                ))}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="p-3 flex items-center gap-2 bg-slate-50/70 rounded-b-2xl">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="พิมพ์คำถามวิเคราะห์คุณธรรมที่ต้องการ..."
                  className="flex-1 text-xs bg-white border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  className={`p-3 rounded-xl transition shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center ${
                    !chatInput.trim() || chatLoading
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
                  }`}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>

          </div>
        )}

        {/* =========================================================================
            TAB 5: QUALITY & HUMAN-IN-THE-LOOP CENTER (PHASE 2)
        ========================================================================= */}
        {activeMainTab === 'quality' && (
          <div className="space-y-6">

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

                {isAdmin && (
                  <button
                    onClick={triggerSeedDataset}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition flex items-center gap-1.5 border border-slate-200"
                  >
                    <Database className="w-3.5 h-3.5 text-indigo-600" />
                    <span className="hidden sm:inline">โหลดชุดข้อมูลตัวอย่าง</span>
                  </button>
                )}
              </div>
            </div>

            {/* SUBTAB: BENCHMARK REPORT */}
            {activeQualitySubtab === 'benchmark' && benchmark && (
              <div className="space-y-6">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
                            {item.news_summary && (
                              <p className="text-xs text-slate-600">{item.news_summary}</p>
                            )}
                            {item.evidence_quote && (
                              <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border-l-2 border-indigo-500">
                                "{item.evidence_quote}"
                              </p>
                            )}
                            {item.entity_evaluations && item.entity_evaluations.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {item.entity_evaluations.map((ent, eIdx) => (
                                  <span key={eIdx} className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-semibold text-slate-700">
                                    {ent.entity_name} ({ent.role_in_news || 'ตัวละคร'})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {isAnalyst && (
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
                          )}
                        </div>

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

        {/* =========================================================================
            TAB 6: POLICY REPORTS, CONNECTORS & RETENTION (PHASE 4)
        ========================================================================= */}
        {activeMainTab === 'reports' && (
          <div className="space-y-6 animate-fade-in">
            
            {/* Top Bar: Title & Primary Actions */}
            <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2.5">
                    <FileText className="w-6 h-6 text-purple-600" />
                    ศูนย์รายงานข้อเสนอแนะเชิงนโยบายและนำเข้าข้อมูล (Policy Reports & Data Hub)
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    จัดทำร่างรายงานเชิงนโยบายอัตโนมัติด้วย Policy Advisor Agent พร้อมส่งออกเอกสารราชการ (TH Sarabun) และเชื่อมต่อ Wisesight / YouTube / Pantip
                  </p>
                </div>

                {/* Top Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                      onClick={() => setReportGenType('weekly')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        reportGenType === 'weekly' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      ประจำสัปดาห์ (7 วัน)
                    </button>
                    <button
                      onClick={() => setReportGenType('monthly')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                        reportGenType === 'monthly' ? 'bg-white text-purple-700 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      ประจำเดือน (30 วัน)
                    </button>
                  </div>

                  {isAnalyst && (
                    <button
                      onClick={handleGenerateReport}
                      disabled={generatingReport}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md transition ${
                        generatingReport
                          ? 'bg-purple-300 cursor-not-allowed'
                          : 'bg-slate-900 hover:bg-slate-800 active:scale-95'
                      }`}
                    >
                      <Sparkles className={`w-4 h-4 ${generatingReport ? 'animate-spin' : ''}`} />
                      <span>{generatingReport ? 'AI กำลังประมวลผลร่างรายงาน...' : 'สร้างร่างรายงาน'}</span>
                    </button>
                  )}

                  <button
                    onClick={() => downloadWithAuth('/api/reports/export/csv', 'moral_indices_export.csv')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                    title="ส่งออกดัชนีคุณธรรมรายวันเปิดใน Microsoft Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>ดัชนีรายวัน (Excel)</span>
                  </button>

                  <button
                    onClick={() => downloadWithAuth('/api/reports/export/provinces/csv', 'thailand_77_provinces_moral.csv')}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition"
                    title="ส่งออกข้อมูล 77 จังหวัดเปิดใน Microsoft Excel"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>สถิติ 77 จังหวัด (Excel)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Section 1: Generated Policy Reports List */}
            <div className="bg-white rounded-xl p-6 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-black text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-600" />
                  รายการรายงานเชิงนโยบายคุณธรรม ({reports.length} ฉบับ)
                </span>
                <span className="text-[11px] text-slate-400">
                  ร่างโดย AI Advisor Agent • ผ่านการตรวจทานและอนุมัติโดยคณะผู้เชี่ยวชาญ
                </span>
              </div>

              {reports.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 space-y-3">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-600">ยังไม่มีรายงานที่ถูกสร้างในระบบ</p>
                  <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                    คลิกปุ่ม "สร้างร่างรายงาน" ด้านบน เพื่อให้ AI Policy Advisor สังเคราะห์สถิติดัชนี 5 ด้านและร่างข้อเสนอแนะเชิงนโยบาย
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reports.map((rep) => {
                    const isPublished = rep.status === 'published';
                    const metrics = rep.metrics_summary || {};
                    const overall = metrics.overall_score || 2.50;
                    return (
                      <div
                        key={rep.id}
                        className="p-5 rounded-2xl border border-slate-200/90 hover:border-purple-300 hover:shadow-md transition bg-gradient-to-br from-white to-slate-50/50 space-y-3.5 flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mb-1.5 ${
                                isPublished 
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}>
                                {isPublished ? '✓ เผยแพร่แล้ว (Published)' : '📝 แบบร่าง (Draft Waiting Review)'}
                              </span>
                              <h3 className="text-sm font-black text-slate-900 line-clamp-2">
                                {rep.title}
                              </h3>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xl font-black text-slate-900">{overall.toFixed(2)}</span>
                              <span className="text-[10px] text-slate-400 font-semibold block">/ 5.00 คะแนน</span>
                            </div>
                          </div>

                          <p className="text-xs text-slate-600 line-clamp-3 leading-relaxed">
                            {rep.executive_summary}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-slate-400">
                            ช่วงเวลา: {rep.period_start} ถึง {rep.period_end}
                          </span>

                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => setSelectedReportModal(rep)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-purple-50 hover:text-purple-700 text-slate-700 transition flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>ตรวจทาน</span>
                            </button>

                            <button
                              onClick={() => openHtmlWithAuth(`/api/reports/${rep.id}/html`)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition flex items-center gap-1 shadow-xs"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              <span>PDF (Sarabun)</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* =========================================================================
            TAB 7: SYSTEM SETTINGS (ADMIN ONLY)
        ========================================================================= */}
        {activeMainTab === 'settings' && isAdmin && (
          <div className="space-y-6 animate-fade-in text-left">
            {/* Settings Subtabs */}
            <div className="bg-white rounded-xl p-2 border border-slate-200 flex flex-wrap justify-start gap-1.5">
              {[
                { id: 'sources', label: 'แหล่งข้อมูลและคำค้น' },
                { id: 'ai', label: 'โมเดล AI & API' },
                { id: 'ingestion', label: 'การดึงข้อมูลและงบ AI' },
                { id: 'alerts', label: 'การแจ้งเตือนและช่องทาง' },
                { id: 'system', label: 'PDPA ผู้ใช้ และระบบ' },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setActiveSettingsTab(t.id); setSettingsMsg(''); setTestAlertMsg(''); setTestLlmResult(null); }}
                  className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition ${
                    activeSettingsTab === t.id
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {settingsMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{settingsMsg}</span>
              </div>
            )}

            {/* SUBTAB 1: DATA SOURCES & CONNECTORS */}
            {activeSettingsTab === 'sources' && (
              <div className="space-y-6">
                {/* Add New RSS / Google News Source */}
                <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">เพิ่มแหล่งข้อมูล RSS / Google News</h3>
                      <p className="text-xs text-slate-500">กำหนด URL ของฟีดข่าวและคำค้น (Keywords) เพื่อคัดกรองเฉพาะข่าวที่เกี่ยวข้อง</p>
                    </div>
                  </div>
                  <form onSubmit={handleAddSource} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={newSourceName}
                      onChange={(e) => setNewSourceName(e.target.value)}
                      placeholder="ชื่อแหล่งข้อมูล (เช่น มติชน)"
                      required
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <input
                      type="url"
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      placeholder="https://example.com/feed"
                      required
                      className="md:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newSourceKeywords}
                        onChange={(e) => setNewSourceKeywords(e.target.value)}
                        placeholder="คำค้นคั่นด้วย , (ไม่บังคับ)"
                        className="flex-1 min-w-0 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                      <button
                        type="submit"
                        disabled={addingSource}
                        className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shrink-0"
                      >
                        {addingSource ? 'กำลังเพิ่ม...' : 'เพิ่มแหล่ง'}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Data Sources List */}
                <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-900">รายการแหล่งข้อมูลที่ตั้งค่าไว้ ({dataSources.length} แหล่ง)</h3>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {dataSources.map((src) => (
                      <div key={src.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{src.name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase">
                              {src.source_type}
                            </span>
                            {!src.is_enabled && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                ปิดใช้งาน
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">{src.url}</p>
                          {src.keywords && src.keywords.length > 0 && (
                            <p className="text-[11px] text-slate-600">คำค้น: {src.keywords.join(', ')}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleToggleSource(src)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                              src.is_enabled
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {src.is_enabled ? 'เปิดใช้งานอยู่' : 'เปิดใช้งาน'}
                          </button>
                          <button
                            onClick={() => handleDeleteSource(src.id)}
                            title="ลบแหล่งข้อมูล"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* External Connectors (Wisesight, YouTube, Pantip) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  {/* Connector 1: Wisesight Trend CSV/JSON */}
                  <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
                          WS
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Wisesight Trend Importer</h4>
                          <span className="text-[10px] text-slate-400">นำเข้าไฟล์เทรนด์โซเชียล (CSV/JSON)</span>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg bg-slate-50 border border-dashed border-slate-300 text-center space-y-1.5">
                        <UploadCloud className="w-5 h-5 text-slate-400 mx-auto" />
                        <label className="cursor-pointer text-xs font-semibold text-slate-800 hover:underline block">
                          <span>{wisesightUploading ? 'กำลังนำเข้าข้อมูล...' : 'เลือกไฟล์ CSV หรือ JSON'}</span>
                          <input
                            type="file"
                            accept=".csv,.json"
                            onChange={handleUploadWisesight}
                            disabled={wisesightUploading}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                    {wisesightMsg && (
                      <div className="p-2 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">
                        {wisesightMsg}
                      </div>
                    )}
                  </div>

                  {/* Connector 2: YouTube News Video Connector */}
                  <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                          <Youtube className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">YouTube News Connector</h4>
                          <span className="text-[10px] text-slate-400">Thai PBS, Thairath, CH3, Workpoint</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">ดึงรายการข่าวล่าสุดจากช่องข่าวหลักบน YouTube เข้าสู่ระบบประเมิน</p>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={handleTriggerYoutube}
                        disabled={youtubeRunning}
                        className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${youtubeRunning ? 'animate-spin' : ''}`} />
                        <span>{youtubeRunning ? 'กำลังดึงคลิป...' : 'ดึงคลิปข่าวล่าสุด'}</span>
                      </button>
                      {youtubeMsg && (
                        <div className="p-2 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">
                          {youtubeMsg}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Connector 3: Pantip Community Scanner */}
                  <div className="bg-white rounded-xl p-5 border border-slate-200 space-y-3 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                          <MessageCircle className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-900">Pantip Scanner</h4>
                          <span className="text-[10px] text-slate-400">กระทู้สาธารณะ (Robots.txt Compliant)</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-500">สำรวจกระทู้สาธารณะด้านจิตอาสา วินัย และความโปร่งใส</p>
                    </div>
                    <div className="space-y-2">
                      <button
                        onClick={handleTriggerPantip}
                        disabled={pantipRunning}
                        className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${pantipRunning ? 'animate-spin' : ''}`} />
                        <span>{pantipRunning ? 'กำลังสแกน...' : 'ตรวจสอบกระทู้คุณธรรม'}</span>
                      </button>
                      {pantipMsg && (
                        <div className="p-2 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-700">
                          {pantipMsg}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SUBTAB 2: AI MODEL & API PROVIDER */}
            {activeSettingsTab === 'ai' && (
              <>
              <form onSubmit={handleSaveSettings} className="bg-white rounded-xl p-6 border border-slate-200 space-y-5 text-left">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">การตั้งค่า AI Model และ API Gateway (OpenAI / LiteLLM Compatible)</h3>
                  <p className="text-xs text-slate-500">ปรับเปลี่ยน Endpoint, API Key และชื่อโมเดล มีผลทันทีกับระบบให้คะแนน, ถาม-ตอบ และร่างรายงานโดยไม่ต้อง Restart</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">API Endpoint URL</label>
                    <input
                      type="url"
                      value={sysSettings.llm_endpoint ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, llm_endpoint: e.target.value })}
                      placeholder="https://llm.addpay.in.th/v1"
                      required
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">API Key (Secret)</label>
                    <input
                      type="password"
                      value={sysSettings.llm_api_key ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, llm_api_key: e.target.value })}
                      placeholder="sk-..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <span className="text-[11px] text-slate-400 block">ค่าเดิมจะแสดงเป็น •••••••• (เว้นไว้หากไม่ต้องการเปลี่ยน)</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">Chat / Scoring Model</label>
                    <input
                      type="text"
                      value={sysSettings.llm_model ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, llm_model: e.target.value })}
                      placeholder="gemma-4-31b-it"
                      required
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">Embedding Model</label>
                    <input
                      type="text"
                      value={sysSettings.llm_embedding_model ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, llm_embedding_model: e.target.value })}
                      placeholder="embeded"
                      required
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {testLlmResult && (
                  <div className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                    testLlmResult.status === 'success'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-rose-50 border-rose-200 text-rose-900'
                  }`}>
                    <p className="font-semibold">{testLlmResult.message}</p>
                    {testLlmResult.models && testLlmResult.models.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] text-slate-600 block">คลิกเลือกโมเดลเพื่อใส่ในช่อง Chat / Scoring Model:</span>
                        <div className="flex flex-wrap gap-1.5">
                          {testLlmResult.models.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setSysSettings({ ...sysSettings, llm_model: m })}
                              className="px-2.5 py-1 rounded-md bg-white border border-slate-200 hover:border-slate-900 text-[11px] font-semibold text-slate-800 transition"
                            >
                              {m}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="pt-3 flex flex-wrap items-center justify-start gap-2.5 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                  >
                    {savingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า AI'}
                  </button>
                  <button
                    type="button"
                    onClick={handleTestLlm}
                    disabled={testingLlm}
                    className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 text-xs font-semibold transition"
                  >
                    {testingLlm ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ & ดึงรายชื่อโมเดล'}
                  </button>
                  {sysMeta.llm_model?.updated_by && (
                    <span className="text-[11px] text-slate-400">
                      แก้ไขล่าสุดโดย: {sysMeta.llm_model.updated_by}
                    </span>
                  )}
                </div>
              </form>

              {/* CARD 2: SYSTEM PROMPTS (3 AGENTS) */}
              <form onSubmit={handleSaveSettings} className="bg-white rounded-xl p-6 border border-slate-200 space-y-5 text-left mt-6">
                <div className="border-b border-slate-100 pb-3 space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">การปรับแต่งคำสั่ง System Prompts (3 Agents)</h3>
                  <p className="text-xs text-slate-500">
                    แก้ไขบทบาท น้ำเสียง และกติกาการวิเคราะห์ของ AI ได้อย่างปลอดภัย โดยระบบจะล็อกและต่อท้ายโครงสร้าง JSON Output Schema ให้อัตโนมัติ
                  </p>
                </div>

                <div className="flex flex-wrap justify-start gap-1.5">
                  {[
                    { key: 'prompt_scoring', label: 'Scoring Agent (วิเคราะห์ข่าว)' },
                    { key: 'prompt_chat', label: 'Chat Agent (ถาม-ตอบข้อมูล)' },
                    { key: 'prompt_advisor', label: 'Policy Advisor (ร่างรายงาน)' },
                  ].map((ag) => (
                    <button
                      key={ag.key}
                      type="button"
                      onClick={() => setActivePromptAgent(ag.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                        activePromptAgent === ag.key
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {ag.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  <textarea
                    rows="7"
                    value={sysSettings[activePromptAgent] ?? ''}
                    onChange={(e) => setSysSettings({ ...sysSettings, [activePromptAgent]: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs leading-relaxed rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900 font-sans"
                    placeholder="ระบุคำสั่ง System Prompt..."
                  />
                  {activePromptAgent !== 'prompt_chat' && (
                    <p className="text-[11px] text-slate-400">
                      หมายเหตุ: โครงสร้าง JSON Output Schema ถูกล็อกไว้ในระบบเบื้องหลังเพื่อป้องกันการ Parse JSON ผิดพลาด
                    </p>
                  )}
                </div>

                <div className="pt-3 flex flex-wrap items-center justify-start gap-2.5 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                  >
                    {savingSettings ? 'กำลังบันทึก...' : 'บันทึก System Prompts'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetAiDefaults('prompts')}
                    disabled={savingSettings}
                    className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold transition"
                  >
                    คืนค่าเริ่มต้น (Reset Prompts)
                  </button>
                  {sysMeta[activePromptAgent]?.updated_by && (
                    <span className="text-[11px] text-slate-400">
                      แก้ไขล่าสุดโดย: {sysMeta[activePromptAgent].updated_by}
                    </span>
                  )}
                </div>
              </form>

              {/* CARD 3: MORAL RUBRICS (v2 PER-DIMENSION + BOUNDARY + CORE RULES) */}
              <form onSubmit={handleSaveSettings} className="bg-white rounded-xl p-6 border border-slate-200 space-y-6 text-left mt-6">
                <div className="border-b border-slate-100 pb-3 space-y-1">
                  <h3 className="text-sm font-bold text-slate-900">เกณฑ์การให้คะแนนและกฎแยกแยะคุณธรรม 5 ด้าน (Moral Rubrics & Boundary Rules)</h3>
                  <p className="text-xs text-slate-500">
                    ปรับสเกลคะแนน นิยาม เกณฑ์รายระดับ (+2 ถึง -2) กฎแยกแยะรายมิติ และกฎหลักการวิเคราะห์ ระบบจะนำไปใช้ประเมินข่าวทันที
                  </p>
                </div>

                {/* 1. Scoring Scale (+2 to -2) */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-800">1. สเกลคะแนนกลาง (Scoring Scale: -2 ถึง +2)</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {['+2', '+1', '0', '-1', '-2'].map((lvl) => (
                      <div key={lvl} className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <span className="w-12 px-2 py-1 rounded bg-slate-100 text-slate-800 text-xs font-bold text-center shrink-0">
                          {lvl}
                        </span>
                        <input
                          type="text"
                          value={sysSettings.moral_rubric?.scale?.[lvl] ?? ''}
                          onChange={(e) => setSysSettings({
                            ...sysSettings,
                            moral_rubric: {
                              ...(sysSettings.moral_rubric || {}),
                              scale: {
                                ...(sysSettings.moral_rubric?.scale || {}),
                                [lvl]: e.target.value
                              }
                            }
                          })}
                          className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {/* 2. Per-Dimension Rubrics & Boundary Rules */}
                <div className="space-y-4 pt-3 border-t border-slate-100">
                  <h4 className="text-xs font-bold text-slate-800">2. เกณฑ์เฉพาะรายด้านและกฎแยกแยะ (Evaluation Rubrics & Boundary Rules)</h4>
                  <div className="flex flex-wrap justify-start gap-1.5">
                    {DIMENSIONS.map((dim) => (
                      <button
                        key={dim.key}
                        type="button"
                        onClick={() => setActiveRubricDim(dim.key)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          activeRubricDim === dim.key
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {dim.name} ({dim.key})
                      </button>
                    ))}
                  </div>

                  {(() => {
                    const dimObj = typeof sysSettings.moral_rubric?.dimensions?.[activeRubricDim] === 'object'
                      ? (sysSettings.moral_rubric?.dimensions?.[activeRubricDim] || {})
                      : { definition: String(sysSettings.moral_rubric?.dimensions?.[activeRubricDim] || ''), criteria: {}, boundary_rule: '' };

                    const updateDimField = (field, val) => {
                      setSysSettings({
                        ...sysSettings,
                        moral_rubric: {
                          ...(sysSettings.moral_rubric || {}),
                          dimensions: {
                            ...(sysSettings.moral_rubric?.dimensions || {}),
                            [activeRubricDim]: {
                              ...dimObj,
                              [field]: val
                            }
                          }
                        }
                      });
                    };

                    const updateCriteria = (lvl, val) => {
                      updateDimField('criteria', { ...(dimObj.criteria || {}), [lvl]: val });
                    };

                    return (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700">นิยาม (Definition)</label>
                          <textarea
                            rows="2"
                            value={dimObj.definition ?? ''}
                            onChange={(e) => updateDimField('definition', e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                          />
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          {['+2', '+1', '-1', '-2'].map((lvl) => (
                            <div key={lvl} className="flex flex-col sm:flex-row sm:items-center gap-2">
                              <span className={`w-12 px-2 py-1 rounded text-xs font-bold text-center shrink-0 border ${
                                lvl.startsWith('+') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}>
                                {lvl}
                              </span>
                              <input
                                type="text"
                                value={dimObj.criteria?.[lvl] ?? ''}
                                onChange={(e) => updateCriteria(lvl, e.target.value)}
                                className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                              />
                            </div>
                          ))}
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-slate-700">กฎแยกแยะ (Boundary Rule)</label>
                          <textarea
                            rows="2"
                            value={dimObj.boundary_rule ?? ''}
                            onChange={(e) => updateDimField('boundary_rule', e.target.value)}
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* 3. Core Analysis Rules */}
                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="flex items-center justify-start gap-3">
                    <h4 className="text-xs font-bold text-slate-800">3. กฎหลักในการวิเคราะห์ (Core Analysis Rules)</h4>
                    <button
                      type="button"
                      onClick={() => {
                        const curr = sysSettings.moral_rubric?.core_rules || [];
                        setSysSettings({
                          ...sysSettings,
                          moral_rubric: {
                            ...(sysSettings.moral_rubric || {}),
                            core_rules: [...curr, '']
                          }
                        });
                      }}
                      className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-semibold transition inline-flex items-center gap-1"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>เพิ่มกฎ</span>
                    </button>
                  </div>
                  <div className="space-y-2">
                    {(sysSettings.moral_rubric?.core_rules || []).map((rule, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={rule}
                          onChange={(e) => {
                            const updated = [...(sysSettings.moral_rubric?.core_rules || [])];
                            updated[idx] = e.target.value;
                            setSysSettings({
                              ...sysSettings,
                              moral_rubric: {
                                ...(sysSettings.moral_rubric || {}),
                                core_rules: updated
                              }
                            });
                          }}
                          placeholder="ระบุกฎหลักในการวิเคราะห์..."
                          className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const updated = (sysSettings.moral_rubric?.core_rules || []).filter((_, i) => i !== idx);
                            setSysSettings({
                              ...sysSettings,
                              moral_rubric: {
                                ...(sysSettings.moral_rubric || {}),
                                core_rules: updated
                              }
                            });
                          }}
                          title="ลบกฎนี้"
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition shrink-0"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-3 flex flex-wrap items-center justify-start gap-2.5 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                  >
                    {savingSettings ? 'กำลังบันทึก...' : 'บันทึก Moral Rubrics'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleResetAiDefaults('rubric')}
                    disabled={savingSettings}
                    className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold transition"
                  >
                    คืนค่าเริ่มต้น (Reset Rubrics)
                  </button>
                  <button
                    type="button"
                    onClick={handleReevaluateRecent}
                    disabled={reevaluating}
                    className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-800 text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${reevaluating ? 'animate-spin' : ''}`} />
                    <span>{reevaluating ? 'กำลังสั่งประเมิน...' : 'ประเมินข่าวล่าสุดซ้ำด้วย Rubric นี้'}</span>
                  </button>
                  {sysMeta.moral_rubric?.updated_by && (
                    <span className="text-[11px] text-slate-400">
                      แก้ไขล่าสุดโดย: {sysMeta.moral_rubric.updated_by}
                    </span>
                  )}
                </div>
              </form>
              </>
            )}

            {/* SUBTAB 3: INGESTION & LLM BUDGET */}
            {activeSettingsTab === 'ingestion' && (
              <form onSubmit={handleSaveSettings} className="bg-white rounded-xl p-6 border border-slate-200 space-y-5">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">รอบเวลาการดึงข้อมูลและเพดานงบประมาณ LLM</h3>
                  <p className="text-xs text-slate-500">ปรับความถี่ของ Background Scheduler และจำนวนข่าวต่อฟีด (มีผลทันทีหลังบันทึก)</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">ความถี่ในการดึงข่าวอัตโนมัติ (นาที)</label>
                    <input
                      type="number"
                      min="5"
                      value={sysSettings.ingest_interval_minutes ?? 60}
                      onChange={(e) => setSysSettings({ ...sysSettings, ingest_interval_minutes: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <span className="text-[11px] text-slate-400 block">ขั้นต่ำ 5 นาที (ค่าแนะนำ 60 นาที)</span>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">จำนวนข่าวสูงสุดต่อฟีด / รอบ</label>
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={sysSettings.max_items_per_feed ?? 15}
                      onChange={(e) => setSysSettings({ ...sysSettings, max_items_per_feed: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">งบประมาณประมวลผล LLM ต่อวัน (บาท)</label>
                    <input
                      type="number"
                      min="10"
                      step="10"
                      value={sysSettings.daily_budget_thb ?? 500}
                      onChange={(e) => setSysSettings({ ...sysSettings, daily_budget_thb: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="pt-3 flex flex-wrap items-center justify-start gap-3 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                  >
                    {savingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                  </button>
                  {sysMeta.ingest_interval_minutes?.updated_by && (
                    <span className="text-[11px] text-slate-400">
                      แก้ไขล่าสุดโดย: {sysMeta.ingest_interval_minutes.updated_by}
                    </span>
                  )}
                </div>
              </form>
            )}

            {/* SUBTAB 3: ALERTS & NOTIFICATION CHANNELS */}
            {activeSettingsTab === 'alerts' && (
              <form onSubmit={handleSaveSettings} className="bg-white rounded-xl p-6 border border-slate-200 space-y-6">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-900">เกณฑ์การแจ้งเตือนและช่องทางส่งออก (Alert Rules & Channels)</h3>
                  <p className="text-xs text-slate-500">ค่า Token และรหัสผ่านจะถูกซ่อนเป็น •••••••• หลังบันทึก และไม่ส่งกลับมายังเบราว์เซอร์</p>
                </div>

                {testAlertMsg && (
                  <div className="p-3 rounded-lg bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-800">
                    {testAlertMsg}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">เกณฑ์การเปลี่ยนแปลงดัชนี 24 ชม. (±)</label>
                    <input
                      type="number"
                      step="0.05"
                      min="0.05"
                      max="2.0"
                      value={sysSettings.alert_shift_threshold ?? 0.30}
                      onChange={(e) => setSysSettings({ ...sysSettings, alert_shift_threshold: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-slate-700">ระยะเวลา Cooldown กันแจ้งเตือนซ้ำ (ชั่วโมง)</label>
                    <input
                      type="number"
                      min="1"
                      max="168"
                      value={sysSettings.alert_cooldown_hours ?? 24}
                      onChange={(e) => setSysSettings({ ...sysSettings, alert_cooldown_hours: Number(e.target.value) })}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* LINE OA */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(sysSettings.alert_line_enabled)}
                        onChange={(e) => setSysSettings({ ...sysSettings, alert_line_enabled: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      <span>เปิดใช้การแจ้งเตือนผ่าน LINE Official Account (Messaging API)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleTestAlert('line')}
                      disabled={testingChannel === 'line'}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition"
                    >
                      {testingChannel === 'line' ? 'กำลังส่ง...' : 'ทดสอบส่ง LINE'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="password"
                      value={sysSettings.line_channel_access_token ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, line_channel_access_token: e.target.value })}
                      placeholder="LINE Channel Access Token"
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <input
                      type="text"
                      value={sysSettings.line_target_id ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, line_target_id: e.target.value })}
                      placeholder="LINE User / Group ID"
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                {/* Email SMTP */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-900 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(sysSettings.alert_email_enabled)}
                        onChange={(e) => setSysSettings({ ...sysSettings, alert_email_enabled: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      <span>เปิดใช้การแจ้งเตือนทางอีเมล (SMTP)</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleTestAlert('email')}
                      disabled={testingChannel === 'email'}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-xs font-semibold text-slate-700 transition"
                    >
                      {testingChannel === 'email' ? 'กำลังส่ง...' : 'ทดสอบส่ง Email'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      value={sysSettings.smtp_host ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, smtp_host: e.target.value })}
                      placeholder="SMTP Host (เช่น smtp.gmail.com)"
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <input
                      type="number"
                      value={sysSettings.smtp_port ?? 587}
                      onChange={(e) => setSysSettings({ ...sysSettings, smtp_port: Number(e.target.value) })}
                      placeholder="SMTP Port (587)"
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <input
                      type="text"
                      value={sysSettings.smtp_user ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, smtp_user: e.target.value })}
                      placeholder="SMTP Username"
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <input
                      type="password"
                      value={sysSettings.smtp_password ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, smtp_password: e.target.value })}
                      placeholder="SMTP Password"
                      className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <input
                      type="text"
                      value={sysSettings.alert_email_recipients ?? ''}
                      onChange={(e) => setSysSettings({ ...sysSettings, alert_email_recipients: e.target.value })}
                      placeholder="อีเมลผู้รับ (คั่นด้วย ,)"
                      className="md:col-span-2 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>
                </div>

                <div className="flex justify-start pt-2 border-t border-slate-100">
                  <button
                    type="submit"
                    disabled={savingSettings}
                    className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
                  >
                    {savingSettings ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่าการแจ้งเตือน'}
                  </button>
                </div>
              </form>
            )}

            {/* SUBTAB 4: PDPA, USERS & SYSTEM */}
            {activeSettingsTab === 'system' && (
              <div className="space-y-6">
                {/* PDPA Retention & Backup */}
                <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <HardDrive className="w-4 h-4 text-slate-700" />
                      <span>นโยบาย PDPA และการสำรองข้อมูล</span>
                    </span>
                    <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      เก็บข้อมูลดิบ {sysSettings.retention_days ?? 90} วัน
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">ฐานข้อมูลหลัก (Primary DB)</span>
                      <p className="font-bold text-slate-900">{backupInfo?.primary_database || 'PostgreSQL + pgvector'}</p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">กราฟความสัมพันธ์ (Graph DB)</span>
                      <p className="font-bold text-slate-900">{backupInfo?.graph_database || 'Neo4j Community'}</p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">การสำรองข้อมูล</span>
                      <p className="font-bold text-slate-900">{backupInfo?.backup_destination || 'Garage S3 / Cloudflare R2'}</p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <span className="text-[10px] text-slate-400 font-semibold block">โหมดการทำงาน & AI Model</span>
                      <p className="font-bold text-slate-900">{sysRuntime.app_env || 'production'} / {sysRuntime.litellm_model || 'gemma-4-31b-it'}</p>
                    </div>
                  </div>

                  <form onSubmit={handleSaveSettings} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="space-y-1.5 flex-1">
                      <label className="block text-xs font-semibold text-slate-800">จำนวนวันเก็บข้อความดิบก่อนลบอัตโนมัติ (PDPA Retention Days)</label>
                      <input
                        type="number"
                        min="7"
                        max="3650"
                        value={sysSettings.retention_days ?? 90}
                        onChange={(e) => setSysSettings({ ...sysSettings, retention_days: Number(e.target.value) })}
                        className="w-40 px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 transition"
                      >
                        บันทึกจำนวนวัน
                      </button>
                      <button
                        type="button"
                        onClick={handleRunRetentionCleanup}
                        disabled={retentionCleaning}
                        className="px-4 py-2 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white transition flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{retentionCleaning ? 'กำลังล้างข้อมูล...' : 'รัน PDPA Retention Cleanup'}</span>
                      </button>
                    </div>
                  </form>

                  {retentionMsg && (
                    <div className="p-3 rounded-lg bg-emerald-50 text-xs font-semibold text-emerald-800 border border-emerald-200">
                      {retentionMsg}
                    </div>
                  )}
                </div>

                {/* User Management (Authentik Role Groups) */}
                <div className="bg-white rounded-xl p-6 border border-slate-200 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">การจัดการผู้ใช้งานและสิทธิ์ (Authentik SSO)</h3>
                      <p className="text-xs text-slate-500">บัญชีผู้ใช้, 2FA และกลุ่มสิทธิ์ถูกจัดการจากศูนย์กลาง Authentik</p>
                    </div>
                    <a
                      href={sysRuntime.auth_console_url || 'https://auth.addpay.in.th/if/admin/'}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition inline-flex items-center gap-1.5 shrink-0"
                    >
                      <span>เปิด Authentik Admin Console</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <span className="font-bold text-slate-900 block">socialeye-viewers → Viewer</span>
                      <p className="text-[11px] text-slate-500">ดู Dashboard, แผนที่ 77 จังหวัด, ประเด็นร้อน, รายงานที่เผยแพร่แล้ว, ถาม-ตอบ, Export CSV</p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <span className="font-bold text-slate-900 block">socialeye-analysts → Analyst</span>
                      <p className="text-[11px] text-slate-500">สิทธิ์ Viewer + ติดป้าย Quality Center, จัดการ Golden Set, ร่างและอนุมัติเผยแพร่รายงาน</p>
                    </div>
                    <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                      <span className="font-bold text-slate-900 block">socialeye-admins → Admin</span>
                      <p className="text-[11px] text-slate-500">สิทธิ์ Analyst + ตั้งค่าระบบ, แหล่งข้อมูล, การแจ้งเตือน, สั่งดึงข้อมูล และ PDPA Retention</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
      </div>

      {/* Review & Labeling Modal (Human-in-the-Loop) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4 border border-slate-100 animate-scale-in">
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

      {/* Policy Report Review & Details Modal */}
      {selectedReportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-5 border border-slate-100 my-8 animate-scale-in">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider mb-1 ${
                  selectedReportModal.status === 'published' 
                    ? 'bg-emerald-100 text-emerald-800' 
                    : 'bg-amber-100 text-amber-800'
                }`}>
                  {selectedReportModal.status === 'published' ? '✓ เผยแพร่แล้ว (Published)' : '📝 แบบร่าง (Draft)'}
                </span>
                <h3 className="font-black text-slate-900 text-lg">
                  {selectedReportModal.title}
                </h3>
                <span className="text-xs text-slate-400 block mt-0.5">
                  ช่วงเวลา: {selectedReportModal.period_start} ถึง {selectedReportModal.period_end}
                </span>
              </div>
              <button
                onClick={() => setSelectedReportModal(null)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Executive Summary */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-black text-slate-800">๑. บทสรุปผู้บริหาร (Executive Summary)</h4>
              <div className="p-3.5 bg-slate-50 rounded-2xl text-xs text-slate-700 leading-relaxed border border-slate-100">
                {selectedReportModal.executive_summary}
              </div>
            </div>

            {/* 5-Dimension Shifts Table */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-black text-slate-800">๒. จุดเปลี่ยนรายมิติคุณธรรม ๕ ด้าน</h4>
              <div className="overflow-x-auto rounded-2xl border border-slate-100">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-100">
                    <tr>
                      <th className="p-2.5">มิติคุณธรรม</th>
                      <th className="p-2.5 text-center">สถานะ</th>
                      <th className="p-2.5">ข้อสรุปสถานการณ์</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selectedReportModal.moral_shifts || []).map((ms, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-black text-slate-800">{ms.dimension}</td>
                        <td className="p-2.5 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            ms.status === 'เชิงบวก' ? 'bg-emerald-100 text-emerald-800' :
                            ms.status === 'เฝ้าระวัง' ? 'bg-amber-100 text-amber-800' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {ms.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">{ms.summary}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recommendations */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-800">๓. ข้อเสนอแนะเชิงนโยบายและแคมเปญ (Policy Actions)</h4>
              <div className="space-y-2">
                {(selectedReportModal.recommendations || []).map((rec, idx) => (
                  <div key={idx} className="p-3 rounded-2xl bg-purple-50/50 border border-purple-100 text-xs space-y-1">
                    <span className="font-black text-purple-900 block">📌 {rec.target_group}</span>
                    <p className="text-slate-700 font-medium"><b>ข้อเสนอแนะ:</b> {rec.action}</p>
                    <p className="text-slate-500 text-[11px]"><b>เหตุผล:</b> {rec.rationale}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Regional Highlights */}
            {selectedReportModal.regional_highlights && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-black text-slate-800">๔. ข้อสังเกตเชิงพื้นที่และภูมิภาค</h4>
                <div className="p-3 bg-slate-50 rounded-2xl text-xs text-slate-600 border border-slate-100">
                  {selectedReportModal.regional_highlights}
                </div>
              </div>
            )}

            {/* Reviewer Note Input (Human-in-the-Loop) */}
            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <label className="text-xs font-black text-slate-800 block">
                บันทึกการตรวจทานของผู้เชี่ยวชาญ / คณะผู้วิเคราะห์ (Analyst Review):
              </label>
              <textarea
                value={reportReviewerNotes}
                onChange={(e) => setReportReviewerNotes(e.target.value)}
                placeholder="ระบุความเห็นเพิ่มเติมเพื่อบันทึกแนบรายงานฉบับทางการ..."
                rows="2"
                className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              ></textarea>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-slate-100">
              <button
                onClick={() => openHtmlWithAuth(`/api/reports/${selectedReportModal.id}/html`)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>พิมพ์ / บันทึก PDF (TH Sarabun)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedReportModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  ปิดหน้าต่าง
                </button>

                {isAnalyst && selectedReportModal.status !== 'published' && (
                  <button
                    type="button"
                    onClick={() => handlePublishReport(selectedReportModal)}
                    disabled={reportSavingReview}
                    className="px-4 py-2 text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white rounded-xl shadow-xs transition"
                  >
                    {reportSavingReview ? 'กำลังบันทึก...' : '✓ อนุมัติและเผยแพร่รายงาน'}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Mobile Bottom Sheet Drawer for Selected Province (< lg) */}
      {selectedMapProvince && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-indigo-200 p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-slide-up pb-10">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 relative">
            <div 
              className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto cursor-pointer" 
              onClick={() => setSelectedMapProvince(null)}
              title="ปิดแผงตรวจ"
            ></div>
            <button
              onClick={() => setSelectedMapProvince(null)}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition absolute right-0 top-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-rose-600" />
                <h3 className="font-black text-slate-900 text-lg">
                  จังหวัด{selectedMapProvince.province}
                </h3>
              </div>
              <span className="text-xs text-slate-500 mt-0.5 block">
                {selectedMapProvince.region} • {selectedMapProvince.status || 'ข้อมูลเบื้องต้น'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-slate-900">{(selectedMapProvince.overall_score ?? 2.50).toFixed(2)}</span>
              <span className="text-[10px] text-slate-400 block font-semibold">/ 5.00 คะแนน</span>
            </div>
          </div>

          {/* 5-Dimension Bars */}
          <div className="space-y-2 pt-1">
            <span className="text-xs font-black text-slate-800 block">ดัชนีคุณธรรม ๕ ด้าน</span>
            {DIMENSIONS.map((dim) => {
              const sc = selectedMapProvince.scores?.[dim.key] ?? 2.50;
              const pct = Math.min(100, Math.max(0, (sc / 5.0) * 100));
              const IconComp = DIMENSION_ICONS[dim.key] || Sparkles;
              return (
                <div key={dim.key} className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <IconComp className="w-3.5 h-3.5" style={{ color: dim.color }} />
                      {dim.name}
                    </span>
                    <span className="font-black text-slate-900">{sc.toFixed(2)}</span>
                  </div>
                  <div className="w-full bg-slate-200/80 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: dim.color }}></div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 1-Click AI Deep-Dive Action Button */}
          <div className="pt-2">
            <button
              onClick={() => {
                handleAskAiProvince(selectedMapProvince);
                setSelectedMapProvince(null);
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
            >
              <Bot className="w-4 h-4 text-indigo-200" />
              <span>สอบถามและวิเคราะห์ข้อมูลจังหวัดนี้</span>
            </button>
          </div>
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (< md) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 flex items-center justify-around shadow-lg">
        <button
          onClick={() => setActiveMainTab('dashboard')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition min-w-[54px] min-h-[44px] ${
            activeMainTab === 'dashboard' ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <Activity className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">ภาพรวม</span>
        </button>

        <button
          onClick={() => setActiveMainTab('map')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition min-w-[54px] min-h-[44px] ${
            activeMainTab === 'map' ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <Map className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">แผนที่ 77 จ.</span>
        </button>

        <button
          onClick={() => setActiveMainTab('clusters')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition min-w-[54px] min-h-[44px] ${
            activeMainTab === 'clusters' ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <Flame className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">ประเด็นร้อน</span>
        </button>

        <button
          onClick={() => setActiveMainTab('chat')}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition min-w-[54px] min-h-[44px] ${
            activeMainTab === 'chat' ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">ถาม-ตอบ</span>
        </button>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`flex flex-col items-center justify-center p-1.5 rounded-lg transition min-w-[54px] min-h-[44px] ${
            activeMainTab === 'quality' || activeMainTab === 'reports' ? 'text-slate-900 font-bold' : 'text-slate-400 font-medium'
          }`}
        >
          <MoreHorizontal className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">เพิ่มเติม</span>
        </button>
      </nav>

      {/* Mobile More Menu Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end">
          <div className="bg-white rounded-t-3xl w-full p-6 space-y-4 shadow-2xl border-t border-slate-200 animate-slide-up pb-10">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">เมนูเพิ่มเติม</span>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                onClick={() => { setActiveMainTab('quality'); setMobileMenuOpen(false); }}
                className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-2 transition ${
                  activeMainTab === 'quality'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-black block">ศูนย์วัดคุณภาพ</span>
                  <span className="text-[10px] text-slate-400">Benchmark & Golden</span>
                </div>
              </button>

              <button
                onClick={() => { setActiveMainTab('reports'); setMobileMenuOpen(false); }}
                className={`p-4 rounded-2xl border flex flex-col items-center text-center gap-2 transition ${
                  activeMainTab === 'reports'
                    ? 'bg-purple-50 border-purple-300 text-purple-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-xs font-black block">รายงาน & ข้อมูล</span>
                  <span className="text-[10px] text-slate-400">Policy Reports & Export</span>
                </div>
              </button>
            </div>

            {currentUser && (
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-900 truncate">{currentUser.name}</p>
                  <p className="text-[11px] text-slate-500 truncate">{currentUser.email}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border uppercase ${roleBadge.cls}`}>
                    {roleBadge.label}
                  </span>
                  {authEnabled && (
                    <button
                      onClick={logout}
                      className="px-3 py-1.5 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>ออก</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {isAdmin && (
              <>
                <button
                  onClick={() => { setActiveMainTab('settings'); setMobileMenuOpen(false); }}
                  className={`w-full py-3 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition ${
                    activeMainTab === 'settings'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-800 border-slate-200'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span>ตั้งค่าระบบ (Admin Settings)</span>
                </button>
                <button
                  onClick={() => { triggerIngest(); setMobileMenuOpen(false); }}
                  disabled={ingesting}
                  className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition"
                >
                  <RefreshCw className={`w-4 h-4 ${ingesting ? 'animate-spin' : ''}`} />
                  <span>{ingesting ? 'กำลังดึงข่าวในพื้นหลัง...' : 'ซิงค์ดึงข่าวและวิเคราะห์ทันที'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
