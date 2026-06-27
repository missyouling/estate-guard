import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import type { Media } from '@/types';
import PreviewModal from '@/components/PreviewModal';
import UploadModal from '@/components/UploadModal';
import ShareModal from '@/components/ShareModal';

type ViewMode = 'grid' | 'list' | 'timeline';
type ThumbSize = 'sm' | 'md' | 'lg';

const THUMB_SIZES: { key: ThumbSize; label: string; cols: number }[] = [
  { key: 'sm', label: '小', cols: 9 },
  { key: 'md', label: '中', cols: 8 },
  { key: 'lg', label: '大', cols: 6 },
];

function loadThumbSize(): ThumbSize {
  try { const v = localStorage.getItem('evidence_thumb_size'); if (v === 'sm' || v === 'md' || v === 'lg') return v; } catch {}
  return 'md';
}

function VirtualGrid({ items, columns, renderItem, containerRef }: {
  items: Media[]; columns: number; renderItem: (item: Media, index: number) => React.ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: columns * 20 });
  const sentinelRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rowHeight = useRef(0);

  const updateVisible = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const scrollTop = el.scrollTop;
    const clientH = el.clientHeight;
    if (!rowHeight.current) {
      const first = itemRefs.current.find(Boolean);
      if (first) rowHeight.current = first.offsetHeight || 160;
      else rowHeight.current = 160;
    }
    const rh = rowHeight.current || 160;
    const totalRows = Math.ceil(items.length / columns);
    const visibleRows = Math.ceil(clientH / rh) + 4;
    const startRow = Math.max(0, Math.floor(scrollTop / rh) - 2);
    const endRow = Math.min(totalRows, startRow + visibleRows);
    const start = startRow * columns;
    const end = Math.min(items.length, endRow * columns);
    setVisibleRange({ start, end });
  }, [items.length, columns, containerRef]);

  useEffect(() => {
    rowHeight.current = 0;
    updateVisible();
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateVisible, { passive: true });
    const ro = new ResizeObserver(updateVisible);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', updateVisible); ro.disconnect(); };
  }, [updateVisible, containerRef]);

  useEffect(() => { updateVisible(); }, [items, columns, updateVisible]);

  const totalRows = Math.ceil(items.length / columns);
  const rh = 160;

  const rendered = useMemo(() => {
    const result: React.ReactNode[] = [];
    for (let i = 0; i < items.length; i++) {
      const row = Math.floor(i / columns);
      if (i >= visibleRange.start && i < visibleRange.end) {
        result.push(
          <div key={items[i].id} ref={el => { itemRefs.current[i] = el; }}
            className="aspect-square overflow-hidden bg-[var(--muted)] cursor-pointer hover:scale-[1.02] transition-transform shadow-sm border border-[var(--border)] relative">
            {renderItem(items[i], i)}
          </div>
        );
      } else {
        result.push(
          <div key={items[i].id}
            style={{ paddingTop: '100%' }}
            className="bg-[var(--muted)] border border-[var(--border)]" />
        );
      }
    }
    return result;
  }, [items, visibleRange, renderItem]);

  return (
    <>
      <div ref={sentinelRef} style={{ gridColumn: `1 / -1`, height: 0 }} />
      {rendered}
      {items.length > 0 && (
        <div style={{ gridColumn: '1 / -1', height: Math.max(0, (totalRows * rh) - ((visibleRange.end - visibleRange.start) / columns * rh)) }} />
      )}
    </>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [thumbSize, setThumbSize] = useState<ThumbSize>(loadThumbSize);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [previewInfoMap, setPreviewInfoMap] = useState<Record<number, { url: string; mode: string }>>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(72);
  const [total, setTotal] = useState(0);
  const [showUpload, setShowUpload] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showShare, setShowShare] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const columns = THUMB_SIZES.find(s => s.key === thumbSize)?.cols || 8;

  useEffect(() => { loadCategories(); }, []);
  useEffect(() => { loadMedia(); }, [categoryId, page, pageSize, refreshKey]);

  async function loadCategories() {
    try {
      const res = await api.get('/category');
      if (res.data.code === 0) setCategories(res.data.data || []);
    } catch {}
  }

  async function loadMedia() {
    setLoading(true);
    try {
      const params: any = { view: 'grid', page, limit: pageSize };
      if (categoryId) params.category_id = categoryId;
      params.type = 'image,video,audio';
      const res = await api.get('/media/wall', { params });
      if (res.data.code === 0) {
        const data = res.data.data;
        const raw = data?.items || data?.timeline?.flatMap((g: any) => g.items) || [];
        const VALID_TYPES = ['image', 'video', 'audio'];
        const items = raw.filter((m: Media) => VALID_TYPES.includes(m.type));
        setMedia(items);
        const totalFromData = data?.total;
        setTotal(totalFromData !== undefined ? totalFromData : items.length);
      }
    } catch {} finally { setLoading(false); }
  }

  const changeThumbSize = (size: ThumbSize) => {
    setThumbSize(size);
    try { localStorage.setItem('evidence_thumb_size', size); } catch {}
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const goDetail = (item: Media) => {
    if (selectMode) { toggleSelect(item.id); return; }
    const idx = media.findIndex(m => m.id === item.id);
    if (idx >= 0) setPreviewIndex(idx);
  };

  const toggleSelect = (id: number) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const openPreview = async (item: Media) => {
    if (selectMode) { toggleSelect(item.id); return; }
    const idx = media.findIndex(m => m.id === item.id);
    if (idx < 0) return;
    if (!previewInfoMap[item.id]) {
      try {
        const res = await api.get('/preview/url', { params: { path: item.url } });
        if (res.data.code === 0 && res.data.data) {
          const { mode, url } = res.data.data;
          if (mode === 'kkfileview' || mode === 'pdf') {
            setPreviewInfoMap(prev => ({ ...prev, [item.id]: { url, mode } }));
          }
        }
      } catch {}
    }
    setPreviewIndex(idx);
  };

  const selectAll = () => {
    if (selected.size === media.length) setSelected(new Set());
    else setSelected(new Set(media.map(m => m.id)));
  };

  const renderGridItem = useCallback((item: Media, index: number) => {
    const onClickItem = () => {
      if (selectMode) { toggleSelect(item.id); return; }
      setPreviewIndex(index);
    };
    const renderThumb = () => {
      if (item.type === 'image') {
        return <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />;
      }
      if (item.type === 'video') {
        return (
          <div className="w-full h-full relative">
            {item.thumbnail_url ? (
              <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800/30 to-zinc-900/30 dark:from-zinc-700/40 dark:to-zinc-900/40">
                <div className="flex flex-col items-center gap-1">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
                    <rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,8 16,12 10,16"/>
                  </svg>
                  <span className="text-[10px] text-[var(--muted-foreground)] font-medium tracking-wider">VIDEO</span>
                </div>
              </div>
            )}
            <div className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="8,5 19,12 8,19"/></svg>
            </div>
          </div>
        );
      }
      if (item.type === 'audio') {
        return (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400/15 to-purple-400/15">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
              <path d="M9 18V5l12-2v13"/>
              <circle cx="6" cy="18" r="3"/>
              <circle cx="18" cy="16" r="3"/>
            </svg>
          </div>
        );
      }
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-[var(--muted)] p-1">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/>
            <path d="M14 2v6h6"/>
          </svg>
          <span className="text-[10px] text-center leading-tight truncate w-full text-[var(--muted-foreground)]">{item.original_name}</span>
        </div>
      );
    };
    if (selectMode) {
      return (
        <div className="w-full h-full relative" onClick={() => toggleSelect(item.id)}>
          {renderThumb()}
          <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selected.has(item.id) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-white bg-black/20'}`}>
            {selected.has(item.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5"/></svg>}
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-full relative" onClick={onClickItem}>
        {renderThumb()}
      </div>
    );
  }, [selectMode, selected, setPreviewIndex, navigate]);

  const contentHeight = 'calc(100vh - 260px)';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Fixed header */}
      <div className="flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 -mt-1">
           <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight">照片墙</h2>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); scrollRef.current?.scrollTo(0, 0); }}
                className="appearance-none pl-2.5 pr-7 py-1.5 text-xs rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] outline-none focus:ring-1 focus:ring-[var(--ring)] cursor-pointer">
                <option value="">全部分类</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--muted-foreground)]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6"/></svg>
            </div>
            <button onClick={() => setShowUpload(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-7l5-5 5 5m-5-5v12"/></svg>
              上传文件
            </button>
            <button onClick={() => navigate('/export')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)] font-medium transition-colors shadow-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>
              证据管理
            </button>
            <div className="flex rounded-lg bg-[var(--muted)] p-0.5 gap-0.5">
              {(['grid', 'list', 'timeline'] as ViewMode[]).map((mode) => (
                <button key={mode} onClick={() => setViewMode(mode)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-all whitespace-nowrap ${
                    viewMode === mode ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'
                  }`}>
                  {mode === 'grid' ? `平铺` : { list: '列表', timeline: '时间轴' }[mode]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {media.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }}
              className={`px-3 py-1 text-xs rounded-lg transition-colors font-medium ${selectMode ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>
              {selectMode ? '取消选择' : '选择'}
            </button>
            {selectMode && (<>
              <button onClick={selectAll} className="text-xs text-[var(--primary)] hover:underline">{selected.size === media.length ? '取消全选' : '全选'}</button>
              <span className="text-xs text-[var(--muted-foreground)]">已选 {selected.size} 项</span>
              {selected.size > 0 && (
                <button onClick={() => setShowShare(true)}
                  className="px-3 py-1 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">分享</button>
              )}
            </>)}
            <div className="flex-1" />

            {/* Thumbnail size control - only for grid view */}
            {viewMode === 'grid' && (
              <div className="flex items-center gap-1 bg-[var(--muted)] rounded-lg p-0.5">
                {THUMB_SIZES.map(s => (
                  <button key={s.key} onClick={() => changeThumbSize(s.key)}
                    className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${
                      thumbSize === s.key ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin" ref={scrollRef} style={{ maxHeight: contentHeight }}>
        {loading ? (
          <div className="text-center py-20 text-[var(--muted-foreground)] text-sm">加载中...</div>
        ) : media.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-[var(--muted-foreground)] text-sm mb-3">暂无内容</div>
            <button onClick={() => setShowUpload(true)} className="text-[var(--primary)] text-sm font-medium hover:underline">去上传文件</button>
          </div>
        ) : (
          <>
            {viewMode === 'grid' && (
              <div className="grid gap-1 sm:gap-1.5" style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              }}>
                <VirtualGrid items={media} columns={columns} renderItem={renderGridItem} containerRef={scrollRef} />
              </div>
            )}

            {viewMode === 'list' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {media.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 bg-[var(--card)] rounded-xl p-3 cursor-pointer hover:bg-[var(--muted)] transition-colors border border-[var(--border)] shadow-sm"
                    onClick={() => openPreview(item)}>
                    {selectMode && (
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(item.id) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)]'}`}>
                        {selected.has(item.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5"/></svg>}
                      </div>
                    )}
                    <div className="w-14 h-14 overflow-hidden bg-[var(--muted)] flex-shrink-0 rounded-lg">
                      {item.type === 'image' ? (
                        <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
                      ) : item.type === 'video' ? (
                        <div className="w-full h-full relative">
                          {item.thumbnail_url ? (
                            <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800/30 to-zinc-900/30 dark:from-zinc-700/40 dark:to-zinc-900/40">
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
                                <rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,8 16,12 10,16"/>
                              </svg>
                            </div>
                          )}
                          <div className="absolute bottom-0.5 left-0.5 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><polygon points="8,5 19,12 8,19"/></svg>
                          </div>
                        </div>
                      ) : item.type === 'audio' ? (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400/15 to-purple-400/15">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
                            <path d="M9 18V5l12-2v13"/>
                            <circle cx="6" cy="18" r="3"/>
                            <circle cx="18" cy="16" r="3"/>
                          </svg>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex-1 min-w-0"><div className="text-sm font-medium text-[var(--foreground)] truncate">NO.{item.record_no} {item.original_name}</div><div className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.category_name && <span className="mr-2">{item.category_name}</span>}{item.uploaded_at}</div></div>
                  </div>
                ))}
              </div>
            )}

            {viewMode === 'timeline' && (
              <div className="space-y-6">
                {Object.entries(media.reduce<Record<string, Media[]>>((acc, item) => { const date = item.uploaded_at?.split(' ')[0] || ''; if (!acc[date]) acc[date] = []; acc[date].push(item); return acc; }, {}))
                  .sort(([a], [b]) => b.localeCompare(a))
                  .map(([date, items]) => (
                    <div key={date}>
                      <div className="flex items-center gap-3 mb-3"><div className="w-2 h-2 rounded-full bg-[var(--primary)]"/><span className="text-[var(--foreground)] text-sm font-semibold">{date}</span><span className="text-xs text-[var(--muted-foreground)]">{items.length} 条</span></div>
                      <div className="ml-3 pl-4 border-l-2 border-[var(--border)] space-y-3">
                        {items.map((item) => (
                          <div key={item.id} className="flex items-center gap-3 bg-[var(--card)] rounded-xl p-3 cursor-pointer hover:bg-[var(--muted)] transition-colors border border-[var(--border)] shadow-sm"
                            onClick={() => openPreview(item)}>
                            {selectMode && (
                              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(item.id) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)]'}`}>
                                {selected.has(item.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5"/></svg>}
                              </div>
                            )}
                            <div className="w-12 h-12 overflow-hidden bg-[var(--muted)] flex-shrink-0 rounded-lg">
                              {item.type === 'image' && <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />}
                              {item.type === 'video' && (
                                <div className="w-full h-full relative">
                                  {item.thumbnail_url ? (
                                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800/30 to-zinc-900/30 dark:from-zinc-700/40 dark:to-zinc-900/40">
                                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
                                        <rect x="2" y="4" width="20" height="16" rx="2"/><polygon points="10,8 16,12 10,16"/>
                                      </svg>
                                    </div>
                                  )}
                                  <div className="absolute bottom-0.5 left-0.5 w-4 h-4 rounded-full bg-black/60 flex items-center justify-center backdrop-blur-sm">
                                    <svg width="8" height="8" viewBox="0 0 24 24" fill="white"><polygon points="8,5 19,12 8,19"/></svg>
                                  </div>
                                </div>
                              )}
                              {item.type === 'audio' && (
                                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-400/15 to-purple-400/15">
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
                                    <path d="M9 18V5l12-2v13"/>
                                    <circle cx="6" cy="18" r="3"/>
                                    <circle cx="18" cy="16" r="3"/>
                                  </svg>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0"><div className="text-sm font-medium text-[var(--foreground)] truncate">{item.original_name}</div><div className="text-xs text-[var(--muted-foreground)]">NO.{item.record_no} {item.address && `· ${item.address}`}</div></div>
                            <span className="text-xs text-[var(--muted-foreground)]">{item.uploaded_at?.split(' ')[1] || ''}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Fixed pagination */}
      {totalPages > 1 && (
        <div className="flex-shrink-0 flex items-center justify-center gap-2 pt-3 pb-1 flex-wrap">
          <span className="text-xs text-[var(--muted-foreground)] mr-2">共 {total} 条</span>
          <button onClick={() => { setPage(p => Math.max(1, p - 1)); scrollRef.current?.scrollTo(0, 0); }} disabled={page <= 1}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--muted)] transition-colors">上一页</button>
          {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
            let p: number;
            if (totalPages <= 7) p = i + 1;
            else if (page <= 4) p = i + 1;
            else if (page >= totalPages - 3) p = totalPages - 6 + i;
            else p = page - 3 + i;
            return <button key={p} onClick={() => { setPage(p); scrollRef.current?.scrollTo(0, 0); }}
              className={`w-8 h-8 text-xs rounded-lg transition-colors ${p === page ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'hover:bg-[var(--muted)]'}`}>{p}</button>;
          })}
          <button onClick={() => { setPage(p => Math.min(totalPages, p + 1)); scrollRef.current?.scrollTo(0, 0); }} disabled={page >= totalPages}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] disabled:opacity-30 hover:bg-[var(--muted)] transition-colors">下一页</button>
        </div>
      )}

      {previewIndex !== null && (
        <PreviewModal
          items={media.map(m => ({
            url: m.url,
            original_name: m.original_name,
            type: m.type,
            thumbnail_url: m.thumbnail_url || '',
            size_bytes: m.size_bytes,
            mime_type: m.mime_type,
            preview_url: previewInfoMap[m.id]?.url,
            preview_mode: previewInfoMap[m.id]?.mode,
          }))}
          index={previewIndex}
          onClose={() => { setPreviewIndex(null); setPreviewInfoMap({}); }}
          onPrev={() => setPreviewIndex(i => i! > 0 ? i! - 1 : i)}
          onNext={() => setPreviewIndex(i => i! < media.length - 1 ? i! + 1 : i)}
        />
      )}
      {showUpload && <UploadModal onClose={() => setShowUpload(false)} redirectTo="/" onUploaded={() => { setPage(1); setRefreshKey(k => k + 1); }} />}
      {showShare && (
        <ShareModal
          mediaIds={Array.from(selected)}
          mediaItems={media.filter(m => selected.has(m.id))}
          onClose={() => { setShowShare(false); setSelectMode(false); setSelected(new Set()); }}
        />
      )}
    </div>
  );
}
