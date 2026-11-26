import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, MessageSquare, MapPin, ShieldCheck, Users } from 'lucide-react';

function runForceLayout(rawNodes, rawEdges, width = 860, height = 520) {
  if (!rawNodes || rawNodes.length === 0) return [];

  const cx = width / 2;
  const cy = height / 2;

  // Initialize positions deterministically by node type
  const dims = rawNodes.filter((n) => n.type === 'dimension');
  const entities = rawNodes.filter((n) => n.type === 'entity');
  const provs = rawNodes.filter((n) => n.type === 'province');

  const posMap = {};

  dims.forEach((n, idx) => {
    const angle = (idx / Math.max(1, dims.length)) * Math.PI * 2 - Math.PI / 2;
    const r = dims.length === 1 ? 0 : 105;
    posMap[n.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0, pinned: true };
  });

  entities.forEach((n, idx) => {
    const angle = (idx / Math.max(1, entities.length)) * Math.PI * 2;
    const r = 195 + (idx % 2) * 35;
    posMap[n.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0, pinned: false };
  });

  provs.forEach((n, idx) => {
    const angle = (idx / Math.max(1, provs.length)) * Math.PI * 2 + 0.3;
    const r = 245;
    posMap[n.id] = { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r, vx: 0, vy: 0, pinned: false };
  });

  const ids = rawNodes.map((n) => n.id);

  // Iterative force-directed layout
  for (let iter = 0; iter < 110; iter++) {
    // Repulsion between all pairs
    for (let i = 0; i < ids.length; i++) {
      const a = posMap[ids[i]];
      for (let j = i + 1; j < ids.length; j++) {
        const b = posMap[ids[j]];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distSq = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(distSq);
        const force = Math.min(8, 2200 / distSq);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.pinned) {
          a.vx -= fx;
          a.vy -= fy;
        }
        if (!b.pinned) {
          b.vx += fx;
          b.vy += fy;
        }
      }
    }

    // Spring attraction along edges
    for (const edge of rawEdges) {
      const a = posMap[edge.source];
      const b = posMap[edge.target];
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const targetLen = edge.type === 'location' ? 115 : 135;
      const force = (dist - targetLen) * 0.03;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned) {
        a.vx += fx;
        a.vy += fy;
      }
      if (!b.pinned) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Gentle center gravity + damping + bounds
    for (const id of ids) {
      const p = posMap[id];
      if (p.pinned) continue;
      p.vx = (p.vx + (cx - p.x) * 0.004) * 0.72;
      p.vy = (p.vy + (cy - p.y) * 0.004) * 0.72;
      p.x = Math.max(55, Math.min(width - 55, p.x + p.vx));
      p.y = Math.max(40, Math.min(height - 40, p.y + p.vy));
    }
  }

  return rawNodes.map((n) => ({
    ...n,
    x: posMap[n.id]?.x ?? cx,
    y: posMap[n.id]?.y ?? cy,
  }));
}

export default function MoralNetworkGraph({
  networkData,
  loading,
  dimensionFilter,
  setDimensionFilter,
  polarityFilter,
  setPolarityFilter,
  limitEntities,
  setLimitEntities,
  onAskAiEntity,
}) {
  const width = 860;
  const height = 520;

  const initialPositioned = useMemo(
    () => runForceLayout(networkData?.nodes || [], networkData?.edges || [], width, height),
    [networkData]
  );

  const [nodePositions, setNodePositions] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [hoveredNodeId, setHoveredNodeId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const svgRef = useRef(null);

  useEffect(() => {
    const map = {};
    for (const n of initialPositioned) {
      map[n.id] = { x: n.x, y: n.y };
    }
    setNodePositions(map);
    setSelectedNodeId(null);
  }, [initialPositioned]);

  const nodes = useMemo(
    () =>
      (networkData?.nodes || []).map((n) => ({
        ...n,
        x: nodePositions[n.id]?.x ?? width / 2,
        y: nodePositions[n.id]?.y ?? height / 2,
      })),
    [networkData, nodePositions]
  );

  const nodeMap = useMemo(() => {
    const m = {};
    for (const n of nodes) m[n.id] = n;
    return m;
  }, [nodes]);

  const edges = networkData?.edges || [];
  const activeId = hoveredNodeId || selectedNodeId;

  const connectedIds = useMemo(() => {
    if (!activeId) return null;
    const set = new Set([activeId]);
    for (const e of edges) {
      if (e.source === activeId) set.add(e.target);
      if (e.target === activeId) set.add(e.source);
    }
    return set;
  }, [activeId, edges]);

  const selectedNode = selectedNodeId ? nodeMap[selectedNodeId] : null;

  const selectedNodeItems = useMemo(() => {
    if (!selectedNode) return [];
    if (selectedNode.type === 'entity') return selectedNode.items || [];
    // For dimension or province, gather connected entity items
    const items = [];
    for (const e of edges) {
      if (e.target === selectedNode.id && nodeMap[e.source]?.items) {
        for (const it of nodeMap[e.source].items) {
          if (selectedNode.type === 'dimension' && it.dimension !== selectedNode.dimension) continue;
          if (selectedNode.type === 'province' && it.province !== selectedNode.label) continue;
          items.push({ ...it, entity_name: nodeMap[e.source].label });
        }
      }
    }
    return items.slice(0, 12);
  }, [selectedNode, edges, nodeMap]);

  const getSvgCoords = (clientX, clientY) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    return {
      x: ((clientX - rect.left) * scaleX - pan.x) / zoom,
      y: ((clientY - rect.top) * scaleY - pan.y) / zoom,
    };
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current) return;
    if (dragRef.current.mode === 'node') {
      const pt = getSvgCoords(e.clientX, e.clientY);
      const id = dragRef.current.id;
      setNodePositions((prev) => ({
        ...prev,
        [id]: { x: Math.max(30, Math.min(width - 30, pt.x)), y: Math.max(30, Math.min(height - 30, pt.y)) },
      }));
    } else if (dragRef.current.mode === 'pan') {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPan({ x: dragRef.current.origPanX + dx, y: dragRef.current.origPanY + dy });
    }
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="space-y-4">
      {/* Filter Toolbar */}
      <div className="bg-white rounded-xl p-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={dimensionFilter}
            onChange={(e) => setDimensionFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="all">ทุกมิติคุณธรรม (5 ด้าน)</option>
            <option value="sufficiency">พอเพียง (Sufficiency)</option>
            <option value="discipline">วินัย (Discipline)</option>
            <option value="integrity">สุจริต (Integrity)</option>
            <option value="public_mind">จิตอาสา (Public Mind)</option>
            <option value="gratitude">กตัญญู (Gratitude)</option>
          </select>

          <select
            value={polarityFilter}
            onChange={(e) => setPolarityFilter(e.target.value)}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value="all">ทุกขั้วพฤติกรรม (บวก & ลบ)</option>
            <option value="positive">เฉพาะเชิงบวก (+1, +2)</option>
            <option value="negative">เฉพาะเชิงลบ (-1, -2)</option>
          </select>

          <select
            value={limitEntities}
            onChange={(e) => setLimitEntities(Number(e.target.value))}
            className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            <option value={20}>Top 20 เอนทิตี</option>
            <option value={35}>Top 35 เอนทิตี</option>
            <option value={50}>Top 50 เอนทิตี</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.2, Number((z + 0.2).toFixed(1))))}
            title="ขยาย"
            className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z - 0.2).toFixed(1))))}
            title="ย่อ"
            className="p-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
            title="รีเซ็ตมุมมอง"
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>รีเซ็ต</span>
          </button>
        </div>
      </div>

      {/* Main Graph + Inspector Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Interactive SVG Canvas */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col">
          <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-900 inline-block" /> มิติคุณธรรม</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" /> เอนทิตีเชิงบวก</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" /> เอนทิตีเชิงลบ</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-400 inline-block" /> จังหวัด</span>
            </div>
            <span>ลากโหนดเพื่อจัดเรียง • คลิกเพื่อดูหลักฐาน</span>
          </div>

          <div className="relative bg-slate-50/50 h-[440px] sm:h-[520px] select-none">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-slate-500">
                กำลังประมวลผลแผนผังความสัมพันธ์...
              </div>
            ) : nodes.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                ยังไม่มีข้อมูลความสัมพันธ์เอนทิตีในเงื่อนไขที่เลือก
              </div>
            ) : (
              <svg
                ref={svgRef}
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-full cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => {
                  if (e.target === svgRef.current) {
                    dragRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, origPanX: pan.x, origPanY: pan.y };
                  }
                }}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
              >
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Edges */}
                  {edges.map((edge, idx) => {
                    const s = nodeMap[edge.source];
                    const t = nodeMap[edge.target];
                    if (!s || !t) return null;
                    const dimmed = connectedIds && (!connectedIds.has(edge.source) || !connectedIds.has(edge.target));
                    const strokeColor =
                      edge.polarity === 'positive'
                        ? '#10b981'
                        : edge.polarity === 'negative'
                        ? '#f43f5e'
                        : '#cbd5e1';
                    return (
                      <line
                        key={idx}
                        x1={s.x}
                        y1={s.y}
                        x2={t.x}
                        y2={t.y}
                        stroke={strokeColor}
                        strokeWidth={Math.min(4, 1 + (edge.weight || 1) * 0.5)}
                        strokeDasharray={edge.type === 'location' ? '4 3' : undefined}
                        strokeOpacity={dimmed ? 0.12 : edge.type === 'location' ? 0.6 : 0.72}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {nodes.map((node) => {
                    const dimmed = connectedIds && !connectedIds.has(node.id);
                    const isSelected = selectedNodeId === node.id;

                    if (node.type === 'dimension') {
                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          className="cursor-pointer"
                          style={{ opacity: dimmed ? 0.25 : 1 }}
                          onMouseEnter={() => setHoveredNodeId(node.id)}
                          onMouseLeave={() => setHoveredNodeId(null)}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedNodeId(node.id);
                            dragRef.current = { mode: 'node', id: node.id };
                          }}
                        >
                          <rect
                            x={-44}
                            y={-17}
                            width={88}
                            height={34}
                            rx={8}
                            fill="#0f172a"
                            stroke={isSelected ? '#3b82f6' : '#334155'}
                            strokeWidth={isSelected ? 3 : 1.5}
                          />
                          <text
                            textAnchor="middle"
                            dominantBaseline="central"
                            fill="#ffffff"
                            fontSize="11"
                            fontWeight="700"
                          >
                            {node.label}
                          </text>
                        </g>
                      );
                    }

                    if (node.type === 'province') {
                      return (
                        <g
                          key={node.id}
                          transform={`translate(${node.x}, ${node.y})`}
                          className="cursor-pointer"
                          style={{ opacity: dimmed ? 0.2 : 1 }}
                          onMouseEnter={() => setHoveredNodeId(node.id)}
                          onMouseLeave={() => setHoveredNodeId(null)}
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            setSelectedNodeId(node.id);
                            dragRef.current = { mode: 'node', id: node.id };
                          }}
                        >
                          <circle
                            r={12}
                            fill="#f1f5f9"
                            stroke={isSelected ? '#0f172a' : '#64748b'}
                            strokeWidth={isSelected ? 2.5 : 1.5}
                          />
                          <text y={21} textAnchor="middle" fill="#475569" fontSize="9.5" fontWeight="600">
                            {node.label}
                          </text>
                        </g>
                      );
                    }

                    // Entity node
                    const r = Math.min(24, 11 + Math.sqrt(node.count || 1) * 4);
                    const fill =
                      node.net_polarity === 'positive'
                        ? '#10b981'
                        : node.net_polarity === 'negative'
                        ? '#e11d48'
                        : '#64748b';
                    const shortLabel = node.label.length > 18 ? `${node.label.slice(0, 17)}…` : node.label;

                    return (
                      <g
                        key={node.id}
                        transform={`translate(${node.x}, ${node.y})`}
                        className="cursor-pointer"
                        style={{ opacity: dimmed ? 0.2 : 1 }}
                        onMouseEnter={() => setHoveredNodeId(node.id)}
                        onMouseLeave={() => setHoveredNodeId(null)}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          setSelectedNodeId(node.id);
                          dragRef.current = { mode: 'node', id: node.id };
                        }}
                      >
                        <circle
                          r={r}
                          fill={fill}
                          stroke={isSelected ? '#0f172a' : '#ffffff'}
                          strokeWidth={isSelected ? 3 : 2}
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fill="#ffffff"
                          fontSize="9.5"
                          fontWeight="700"
                        >
                          {node.count}
                        </text>
                        <text
                          y={r + 12}
                          textAnchor="middle"
                          fill="#0f172a"
                          fontSize="10"
                          fontWeight="600"
                        >
                          {shortLabel}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
            )}
          </div>
        </div>

        {/* Right Inspector Panel */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between space-y-4">
          {!selectedNode ? (
            <div className="my-auto text-center space-y-2 py-10">
              <Users className="w-8 h-8 text-slate-300 mx-auto" />
              <h4 className="text-xs font-bold text-slate-800">คลิกที่โหนดบนกราฟเพื่อดูรายละเอียด</h4>
              <p className="text-[11px] text-slate-500">
                สามารถดูบทบาทของบุคคล/องค์กร หลักฐานอ้างอิงจากเนื้อข่าว และส่งไปวิเคราะห์ต่อในหน้า ถาม-ตอบข้อมูล ได้ทันที
              </p>
              <div className="pt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold text-slate-900 block">{networkData?.stats?.entity_count || 0}</span>
                  <span className="text-slate-400">เอนทิตี</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold text-slate-900 block">{networkData?.stats?.province_count || 0}</span>
                  <span className="text-slate-400">จังหวัด</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="font-bold text-slate-900 block">{networkData?.stats?.edge_count || 0}</span>
                  <span className="text-slate-400">ความเชื่อมโยง</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex-1 overflow-y-auto max-h-[460px]">
              <div className="border-b border-slate-100 pb-3 space-y-1">
                <div className="flex items-center gap-2">
                  {selectedNode.type === 'province' ? (
                    <MapPin className="w-4 h-4 text-slate-600 shrink-0" />
                  ) : (
                    <ShieldCheck className="w-4 h-4 text-slate-900 shrink-0" />
                  )}
                  <h4 className="text-sm font-bold text-slate-900">{selectedNode.label}</h4>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">
                    {selectedNode.type === 'dimension'
                      ? 'มิติคุณธรรม'
                      : selectedNode.type === 'province'
                      ? 'จังหวัด'
                      : selectedNode.role || 'ตัวละคร/องค์กร'}
                  </span>
                  {selectedNode.type === 'entity' && (
                    <>
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold">
                        +{selectedNode.pos_count} เชิงบวก
                      </span>
                      <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-semibold">
                        -{selectedNode.neg_count} เชิงลบ
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-2.5">
                <span className="text-[11px] font-bold text-slate-500 block">
                  ข่าวและหลักฐานที่เชื่อมโยง ({selectedNodeItems.length})
                </span>
                {selectedNodeItems.map((it, idx) => (
                  <div key={idx} className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-semibold text-slate-500">
                        {it.source} • {it.province}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${
                          it.score > 0
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {it.dimension_name}: {it.score > 0 ? `+${it.score}` : it.score}
                      </span>
                    </div>
                    {it.entity_name && (
                      <div className="text-[11px] font-bold text-slate-800">{it.entity_name}</div>
                    )}
                    <p className="font-semibold text-slate-900 leading-snug">{it.title}</p>
                    {it.evidence && (
                      <p className="text-[11px] text-slate-600 border-l-2 border-slate-400 pl-2">
                        "{it.evidence}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {selectedNode && onAskAiEntity && (
            <button
              type="button"
              onClick={() => onAskAiEntity(selectedNode.label)}
              className="w-full py-2.5 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>วิเคราะห์ "{selectedNode.label}" ใน ถาม-ตอบข้อมูล</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
