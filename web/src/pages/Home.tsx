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
        const items = data?.items || data?.timeline?.flatMap((g: any) => g.items) || [];
        setMedia(items);
        setTotal(data?.total || 0);
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

  const selectAll = () => {
    if (selected.size === media.length) setSelected(new Set());
    else setSelected(new Set(media.map(m => m.id)));
  };

  const renderGridItem = useCallback((item: Media, _index: number) => {
    if (selectMode) {
      return (
        <div className="w-full h-full relative" onClick={() => toggleSelect(item.id)}>
          {item.type === 'image' ? (
            <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><rect x="1" y="3" width="22" height="18" rx="2"/></svg>
            </div>
          )}
          <div className={`absolute top-2 right-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${selected.has(item.id) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-white bg-black/20'}`}>
            {selected.has(item.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5"/></svg>}
          </div>
        </div>
      );
    }
    return (
      <div className="w-full h-full" onClick={() => goDetail(item)}>
        {item.type === 'image' ? (
          <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><rect x="1" y="3" width="22" height="18" rx="2"/></svg>
          </div>
        )}
      </div>
    );
  }, [selectMode, selected]);

  const contentHeight = 'calc(100vh - 260px)';

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Fixed header */}
      <div className="flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4 -mt-1">
          <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight">证据上传</h2>
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
              上传证据
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
            <div className="text-[var(--muted-foreground)] text-sm mb-3">暂无照片</div>
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
                    onClick={() => selectMode ? toggleSelect(item.id) : goDetail(item)}>
                    {selectMode && (
                      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(item.id) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)]'}`}>
                        {selected.has(item.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5"/></svg>}
                      </div>
                    )}
                    <div className="w-14 h-14 overflow-hidden bg-[var(--muted)] flex-shrink-0 rounded-lg">
                      {item.type === 'image' ? (
                        <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><rect x="1" y="3" width="22" height="18" rx="2"/></svg></div>
                      )}
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
                            onClick={() => selectMode ? toggleSelect(item.id) : goDetail(item)}>
                            {selectMode && (
                              <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${selected.has(item.id) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)]'}`}>
                                {selected.has(item.id) && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5"/></svg>}
                              </div>
                            )}
                            <div className="w-12 h-12 overflow-hidden bg-[var(--muted)] flex-shrink-0 rounded-lg">
                              {item.type === 'image' && <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />}
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
          items={media.map(m => ({ url: m.url, original_name: m.original_name, type: m.type, thumbnail_url: m.thumbnail_url || '' }))}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
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
