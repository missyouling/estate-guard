import { useState, useEffect, useCallback } from 'react';

interface MediaItem {
  url: string;
  original_name?: string;
  type?: string;
  thumbnail_url?: string;
}

interface Props {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export default function PreviewModal({ items, index, onClose, onPrev, onNext }: Props) {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [closing, setClosing] = useState(false);

  const item = items[index];
  if (!item && !closing) return null;

  const startClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 150);
  }, [closing, onClose]);

  const fullUrl = (url: string) => url?.startsWith('http') || url?.startsWith('//') ? url : window.location.origin + (url || '');
  const hasMultiple = items.length > 1;

  const reset = () => { setRotation(0); setZoom(1); setPan({ x: 0, y: 0 }); };
  const goPrev = useCallback(() => { reset(); onPrev?.(); }, [onPrev]);
  const goNext = useCallback(() => { reset(); onNext?.(); }, [onNext]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { startClose(); }
      if (e.key === 'ArrowLeft') { goPrev(); }
      if (e.key === 'ArrowRight') { goNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [startClose, goPrev, goNext]);

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom(z => Math.min(5, Math.max(0.3, z * (e.deltaY > 0 ? 1 / 1.1 : 1.1))));
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1) return;
    e.stopPropagation(); e.preventDefault();
    setDragging(true); setDragStart({ x: e.clientX, y: e.clientY });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPan(p => ({ x: p.x + (e.clientX - dragStart.x), y: p.y + (e.clientY - dragStart.y) }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };
  const handleMouseUp = () => setDragging(false);

  const visible = item && !closing;

  return (
    <div className={`fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm ${closing ? 'animate-modal-leave' : 'animate-modal-enter'}`} onClick={startClose}>
      <button className="absolute top-4 right-4 text-white/60 hover:text-white z-10 p-2" onClick={startClose}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>

      {hasMultiple && onPrev && (
        <button className="absolute left-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-10 p-3 bg-white/10 rounded-full" onClick={e => { e.stopPropagation(); goPrev(); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
      {hasMultiple && onNext && (
        <button className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white z-10 p-3 bg-white/10 rounded-full" onClick={e => { e.stopPropagation(); goNext(); }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
        </button>
      )}

      <div className={`flex-1 flex items-center justify-center w-full overflow-hidden ${visible ? 'animate-modal-content-enter' : ''}`}
        onWheel={handleWheel} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>
        {item?.type === 'image' || !item?.type ? (
          <img src={fullUrl(item!.url)} alt={item?.original_name} draggable={false}
            className="max-w-[90vw] max-h-[75vh] object-contain"
            style={{ transform: `rotate(${rotation}deg) scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
            onClick={e => e.stopPropagation()} />
        ) : item?.type === 'video' ? (
          <video src={fullUrl(item.url)} controls autoPlay className="max-w-[90vw] max-h-[75vh]" onClick={e => e.stopPropagation()} />
        ) : item?.type === 'audio' ? (
          <audio src={fullUrl(item.url)} controls autoPlay className="w-96" onClick={e => e.stopPropagation()} />
        ) : (
          <iframe src={fullUrl(item!.url)} className="w-full max-w-5xl rounded" style={{ height: '85vh' }} onClick={e => e.stopPropagation()} />
        )}
      </div>

      <div className="absolute bottom-6 flex items-center gap-3" onClick={e => e.stopPropagation()}>
        {item?.type === 'image' || !item?.type ? (
          <div className="flex items-center gap-3 bg-black/50 rounded-full px-4 py-2 backdrop-blur">
            <button onClick={() => setRotation(r => r - 90)} className="text-white/70 hover:text-white p-1">↺</button>
            <button onClick={() => setZoom(z => Math.max(0.3, z / 1.1))} className="text-white/70 hover:text-white p-1">−</button>
            <span className="text-white/50 text-xs min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(5, z * 1.1))} className="text-white/70 hover:text-white p-1">+</button>
            <button onClick={() => setRotation(r => r + 90)} className="text-white/70 hover:text-white p-1">↻</button>
            <button onClick={reset} className="text-white/50 hover:text-white text-xs px-2">重置</button>
          </div>
        ) : (
          <div className="bg-black/50 text-white/80 text-xs px-3 py-1.5 rounded-full backdrop-blur">{item?.original_name || ''}</div>
        )}
        {hasMultiple && (
          <div className="bg-black/50 text-white/80 text-xs px-3 py-1.5 rounded-full backdrop-blur">{index + 1} / {items.length}</div>
        )}
      </div>

      <div className="absolute bottom-0 left-0 right-0 text-center pb-1">
        <span className="text-white/30 text-[10px]">方向键 &lt; &gt; 切换 · Esc 关闭 · 滚轮缩放</span>
      </div>
    </div>
  );
}