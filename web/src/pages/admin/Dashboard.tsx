import { useEffect, useState, useCallback, useRef } from 'react';
import api from '@/lib/api';

interface DailyItem { date: string; count: number; }
interface TypeItem { type: string; count: number; }
interface CatItem { name: string; count: number; }
interface RoomItem { building: string; count: number; }

function Tooltip({ show, x, y, children }: { show: boolean; x: number; y: number; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="fixed z-50 pointer-events-none bg-[var(--foreground)] text-[var(--background)] text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap"
      style={{ left: x + 12, top: y - 10, transform: 'translateY(-100%)' }}>
      {children}
    </div>
  );
}

const typeColors: Record<string, string> = { image: '#007AFF', video: '#FF9500', audio: '#34C759', document: '#AF52DE' };
const typeLabels: Record<string, string> = { image: '图片', video: '视频', audio: '音频', document: '文件' };
const catColors = ['#007AFF', '#FF9500', '#34C759', '#AF52DE', '#FF3B30', '#FFCC00', '#5AC8FA', '#FF6B8A'];
const auditColors: Record<string, string> = {};

function PieChart({ data, colors, labelKey, colorKey, total }: {
  data: any[]; colors: Record<string, string> | string[]; labelKey: string; colorKey?: string; total: number;
}) {
  if (!data.length) return <div className="flex items-center justify-center h-48 text-[10px] text-[var(--muted-foreground)]">暂无数据</div>;
  const cx = 80, cy = 80, r = 60;

  return (
    <svg viewBox="0 0 160 160" className="w-full max-w-[180px]">
      {(() => {
        let startAngle = 0;
        return data.map((item, i) => {
          const ratio = item.count / total;
          const angle = ratio * 360;
          const endAngle = startAngle + angle;
          const midAngle = ((startAngle + endAngle) / 2 - 90) * Math.PI / 180;
          const x1 = cx + r * Math.cos((startAngle - 90) * Math.PI / 180);
          const y1 = cy + r * Math.sin((startAngle - 90) * Math.PI / 180);
          const x2 = cx + r * Math.cos((endAngle - 90) * Math.PI / 180);
          const y2 = cy + r * Math.sin((endAngle - 90) * Math.PI / 180);
          const largeArc = angle > 180 ? 1 : 0;
          const lx = cx + r * 0.58 * Math.cos(midAngle);
          const ly = cy + r * 0.58 * Math.sin(midAngle);
          const fill = Array.isArray(colors) ? colors[i % colors.length] : colors[item[colorKey || '']] || '#999';
          const label = item[labelKey];
          const offset = 6;
          const ox = offset * Math.cos(midAngle);
          const oy = offset * Math.sin(midAngle);
          const trX = cx + ox, trY = cy + oy;
          const el = (
            <g key={label} className="pie-sector">
              <path d={`M${cx} ${cy} L${x1} ${y1} A${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={fill} opacity="0.88" stroke="var(--background)" strokeWidth="1.5"
                style={{ cursor: 'pointer', transition: 'all 0.25s cubic-bezier(0.4,0,0.2,1)', transformOrigin: '80px 80px' }}
                onMouseEnter={e => {
                  const t = e.currentTarget;
                  t.setAttribute('opacity', '1');
                  t.setAttribute('transform', `translate(${ox},${oy})`);
                  t.setAttribute('filter', 'brightness(1.1)');
                }}
                onMouseMove={e => {
                  const tip = document.getElementById('chart-tooltip');
                  if (tip) {
                    tip.innerHTML = `<div style="font-weight:600">${label}</div><div>数量: ${item.count}</div><div>占比: ${Math.round(ratio * 100)}%</div>`;
                    tip.style.display = 'block';
                    tip.style.left = (e.clientX + 12) + 'px';
                    tip.style.top = (e.clientY - 10) + 'px';
                  }
                }}
                onMouseLeave={e => {
                  const t = e.currentTarget;
                  t.setAttribute('opacity', '0.88');
                  t.setAttribute('transform', 'translate(0,0)');
                  t.removeAttribute('filter');
                  const tip = document.getElementById('chart-tooltip');
                  if (tip) tip.style.display = 'none';
                }} />
              {ratio > 0.06 && (
                <text x={lx} y={ly + 1} textAnchor="middle" fontSize="9" fill="white" fontWeight="600">
                  {Math.round(ratio * 100)}%
                </text>
              )}
            </g>
          );
          startAngle = endAngle;
          return el;
        });
      })()}
    </svg>
  );
}

export default function Dashboard() {
  const [data, setData] = useState<any>({});
  const [daily, setDaily] = useState<DailyItem[]>([]);
  const [typeDist, setTypeDist] = useState<TypeItem[]>([]);
  const [roomDist, setRoomDist] = useState<RoomItem[]>([]);
  const [catDist, setCatDist] = useState<CatItem[]>([]);
  const [catTop5, setCatTop5] = useState<CatItem[]>([]);
  const [repoUrl, setRepoUrl] = useState('');
  const [dailyDays, setDailyDays] = useState(7);
  const [roomSortAsc, setRoomSortAsc] = useState(false);
  const [dailyTransition, setDailyTransition] = useState(false);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tooltip, setTooltip] = useState<{ show: boolean; x: number; y: number; content: React.ReactNode }>({ show: false, x: 0, y: 0, content: null });

  const fetchData = useCallback(async (days?: number) => {
    try {
      const params = days ? { days } : {};
      const r = await api.get('/dashboard', { params });
      if (r.data.code === 0) {
        const d = r.data.data || {};
        setData(d);
        setDaily(d.daily || []);
        setTypeDist(d.typeDistribution || []);
        setRoomDist(d.roomDistribution || []);
        setCatDist(d.categoryDistribution || []);
        setCatTop5(d.categoryTop5 || []);
      }
    } catch {}
  }, []);

  const switchDays = useCallback((days: number) => {
    setDailyTransition(true);
    setDailyDays(days);
    fetchData(days);
    setTimeout(() => setDailyTransition(false), 350);
  }, [fetchData]);

  useEffect(() => {
    fetchData(dailyDays);
    api.get('/admin/config').then(r => {
      if (r.data.code === 0) {
        const map: Record<string, string> = {};
        (r.data.data || []).forEach((c: any) => { map[c.key] = c.value; });
        if (map.site_repo_url) setRepoUrl(map.site_repo_url);
      }
    }).catch(() => {});
    const t = setInterval(() => fetchData(dailyDays), 30000);
    return () => clearInterval(t);
  }, [fetchData, dailyDays]);

  const showTooltip = useCallback((e: React.MouseEvent, content: React.ReactNode) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip({ show: true, x: e.clientX, y: e.clientY, content });
  }, []);

  const hideTooltip = useCallback(() => {
    tooltipTimer.current = setTimeout(() => setTooltip(t => ({ ...t, show: false })), 50);
  }, []);

  const sortedRoomDist = [...roomDist].sort((a, b) => roomSortAsc ? a.count - b.count : b.count - a.count);
  const maxRoom = Math.max(...sortedRoomDist.map(r => r.count), 1);
  const totalTypes = typeDist.reduce((s, t) => s + t.count, 0) || 1;
  const catTotal = catDist.reduce((s, c) => s + c.count, 0) || 1;

  const S = (v: number) => v > 0 ? `+${v}` : `${v}`;

  return (
    <div className="space-y-4">
      <Tooltip show={tooltip.show} x={tooltip.x} y={tooltip.y}>{tooltip.content}</Tooltip>
      <div id="chart-tooltip" className="fixed z-50 pointer-events-none bg-[var(--foreground)] text-[var(--background)] text-xs rounded-lg px-3 py-2 shadow-xl whitespace-nowrap hidden" />

      <div className="flex items-center justify-between">
        <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight">系统概览</h2>
        <div className="flex items-center gap-2">
          {repoUrl && (
            <a href={repoUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
            </a>
          )}
        </div>
      </div>

      {/* ---------- 4 Metric Cards ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: '总证据存量', value: data.totalMedia || 0, color: '#007AFF', icon: '📦' },
          { label: '今日新增上传', value: data.todayUploads || 0, color: '#34C759', icon: '📤', cmp: data.todayComparison },
          { label: '待审核工单', value: data.pendingApprovals || 0, color: '#FF9500', icon: '📋' },
          { label: '本月活跃用户', value: data.monthlyActiveUsers || 0, color: '#AF52DE', icon: '👤', cmp: data.activeComparison },
        ].map((c) => (
          <div key={c.label} className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-[var(--muted-foreground)] font-medium">{c.label}</span>
              <span className="text-xs opacity-50">{c.icon}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold" style={{ color: c.color }}>{c.value}</span>
              {c.cmp !== undefined && (
                <span className={`text-[10px] font-medium ${c.cmp >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {c.cmp >= 0 ? '↑' : '↓'} {Math.abs(c.cmp)}%
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Row 1: Three Columns - Type Pie, Category Pie, Top5 Bar ---------- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 shadow-sm">
          <h3 className="text-[var(--foreground)] text-sm font-semibold mb-3">证据类型占比</h3>
          <div className="flex flex-col items-center">
            <PieChart data={typeDist} colors={typeColors} labelKey="type" colorKey="type" total={totalTypes} />
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {typeDist.filter(t => t.count > 0).map(t => (
                <div key={t.type} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: typeColors[t.type] }} />
                  <span className="text-[10px] text-[var(--foreground)]">{typeLabels[t.type] || t.type}</span>
                  <span className="text-[9px] text-[var(--muted-foreground)]">{t.count} ({Math.round(t.count / totalTypes * 100)}%)</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 shadow-sm">
          <h3 className="text-[var(--foreground)] text-sm font-semibold mb-3">分类证据占比</h3>
          <div className="flex flex-col items-center">
            <PieChart data={catDist} colors={catColors} labelKey="name" total={catTotal} />
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
              {catDist.slice(0, 6).map((c, i) => (
                <div key={c.name} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: catColors[i % catColors.length] }} />
                  <span className="text-[10px] text-[var(--foreground)]">{c.name}</span>
                  <span className="text-[9px] text-[var(--muted-foreground)]">{Math.round(c.count / catTotal * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 shadow-sm">
          <h3 className="text-[var(--foreground)] text-sm font-semibold mb-3">高频分类 TOP5</h3>
          {catTop5.length > 0 ? (
            <div className="space-y-2.5 pt-1">
              {catTop5.map((c, i) => {
                const pct = c.count / (catTotal || 1);
                return (
                  <div key={c.name} className="group flex items-center gap-2 transition-all duration-200 hover:bg-[var(--muted)]/30 rounded-lg px-1.5 py-1 -mx-1.5 cursor-default"
                    onMouseEnter={e => {
                      const bar = e.currentTarget.querySelector('.top5-bar-fill') as HTMLElement;
                      if (bar) { bar.style.opacity = '1'; bar.style.transform = 'scaleX(1.05)'; bar.style.transformOrigin = 'left'; }
                    }}
                    onMouseLeave={e => {
                      const bar = e.currentTarget.querySelector('.top5-bar-fill') as HTMLElement;
                      if (bar) { bar.style.opacity = '0.75'; bar.style.transform = 'scaleX(1)'; }
                    }}>
                    <span className="text-[10px] font-medium w-4 text-[var(--muted-foreground)] shrink-0">#{i + 1}</span>
                    <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: catColors[i % catColors.length] }} />
                    <span className="text-[11px] text-[var(--foreground)] truncate flex-1">{c.name}</span>
                    <div className="flex-1 h-2.5 bg-[var(--muted)] rounded-full overflow-hidden max-w-[80px]">
                      <div className="top5-bar-fill h-full rounded-full transition-all duration-200"
                        style={{ width: `${pct * 100}%`, backgroundColor: catColors[i % catColors.length], opacity: 0.75 }} />
                    </div>
                    <span className="text-[10px] font-medium text-[var(--foreground)] w-8 text-right shrink-0">{c.count}</span>
                    <span className="text-[9px] text-[var(--muted-foreground)] w-8 text-right shrink-0">{Math.round(pct * 100)}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48 text-[10px] text-[var(--muted-foreground)]">暂无数据</div>
          )}
        </div>
      </div>

      {/* ---------- Row 2: Building Distribution ---------- */}
      {sortedRoomDist.length > 0 && (
        <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-[var(--foreground)] text-sm font-semibold">各楼栋证据数量</h3>
              <p className="text-[9px] text-[var(--muted-foreground)] mt-0.5">共 {sortedRoomDist.length} 栋楼</p>
            </div>
            <button onClick={() => setRoomSortAsc(!roomSortAsc)}
              className="text-[10px] px-2.5 py-1 rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
              {roomSortAsc ? '升序 ↑' : '降序 ↓'}
            </button>
          </div>
          <div className="overflow-x-auto pb-2">
            <div className="flex items-end gap-2" style={{ height: 180, minWidth: Math.max(sortedRoomDist.length * 48, 400) }}>
              {sortedRoomDist.map((r) => {
                const barH = (r.count / maxRoom) * 140;
                return (
                  <div key={r.building} className="flex flex-col items-center justify-end flex-shrink-0" style={{ width: 40 }}
                    onMouseMove={e => showTooltip(e, <><div className="font-medium">{r.building}栋</div><div>证据总数: {r.count}</div></>)}
                    onMouseLeave={hideTooltip}>
                    <span className="text-[9px] font-bold mb-0.5 text-[var(--foreground)]">{r.count}</span>
                    <div className="w-full rounded-t-md transition-all duration-300"
                      style={{ height: `${Math.max(barH, 4)}px`, backgroundColor: '#007AFF', opacity: 0.75, cursor: 'pointer' }} />
                    <span className="text-[9px] text-[var(--muted-foreground)] mt-1 truncate max-w-[40px] text-center">{r.building}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ---------- Row 3: Daily Trend ---------- */}
      <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[var(--foreground)] text-sm font-semibold">照片墙趋势</h3>
          <div className="flex items-center rounded-lg bg-[var(--muted)] p-0.5 gap-0.5">
            {[7, 15, 30].map(d => (
              <button key={d} onClick={() => switchDays(d)}
                className={`px-2.5 py-1 text-[10px] rounded-md font-medium transition-all ${
                  dailyDays === d
                    ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
                }`}>
                {d}日
              </button>
            ))}
          </div>
        </div>
        <div style={{
          transition: 'opacity 0.3s ease, transform 0.3s ease',
          opacity: dailyTransition ? 0.5 : 1,
          transform: dailyTransition ? 'translateY(4px)' : 'translateY(0)',
        }}>
          {daily.length > 0 ? (
            <svg viewBox="0 0 500 185" className="w-full" style={{ maxHeight: 210 }}>
              {(() => {
                const maxVal = Math.max(...daily.map(d => d.count), 1);
                const barW = daily.length > 15 ? 14 : daily.length > 7 ? 22 : 36;
                const gap = daily.length > 15 ? 4 : daily.length > 7 ? 8 : 14;
                const totalSpan = daily.length * (barW + gap);
                const offset = Math.max(0, (500 - 60 - totalSpan) / 2) + 40;
                const chartTop = 18;
                const chartBottom = 140;
                const chartRange = chartBottom - chartTop;
                const trendPoints = daily.map((d, i) => {
                  const x = offset + i * (barW + gap) + barW / 2;
                  const y = chartBottom - (d.count / maxVal) * chartRange;
                  return `${i === 0 ? 'M' : 'L'}${x} ${y}`;
                }).join(' ');

                return (
                  <>
                    {/* Trend line */}
                    <path d={trendPoints} fill="none" stroke="#007AFF" strokeWidth="2" strokeDasharray="4 3" opacity="0.5" />
                    {/* Bars */}
                    {daily.map((d, i) => {
                      const barH = (d.count / maxVal) * chartRange;
                      const x = offset + i * (barW + gap);
                      const barTop = chartBottom - barH;
                      const labelY = barTop - 4;
                      const insideLabelY = barTop + 12;
                      const needInside = labelY < 12;
                      return (
                        <g key={d.date}>
                          <rect x={x} y={barTop} width={barW} height={barH} rx="3" fill="#007AFF" opacity="0.7"
                            style={{ cursor: 'pointer' }}
                            onMouseMove={e => showTooltip(e, <><div className="font-medium">{d.date}</div><div>上传量: {d.count}</div></>)}
                            onMouseLeave={hideTooltip} />
                          {d.count > 0 && (
                            <text x={x + barW / 2} y={needInside ? insideLabelY : labelY} textAnchor="middle"
                              fontSize={daily.length > 15 ? '7' : '9'} fontWeight="600"
                              fill={needInside ? 'white' : 'var(--foreground)'}>
                              {d.count}
                            </text>
                          )}
                          {daily.length <= 15 && (
                            <text x={x + barW / 2} y={chartBottom + 10} textAnchor="middle"
                              fontSize={daily.length > 7 ? '7' : '9'} fill="var(--muted-foreground)">
                              {d.date.slice(5)}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {/* Y-axis label */}
                    <text x="20" y="75" textAnchor="middle" fontSize="9" fill="var(--muted-foreground)" transform="rotate(-90, 20, 75)">数量</text>
                  </>
                );
              })()}
            </svg>
          ) : (
            <div className="flex items-center justify-center h-40 text-[10px] text-[var(--muted-foreground)]">暂无数据</div>
          )}
        </div>
      </div>
    </div>
  );
}
