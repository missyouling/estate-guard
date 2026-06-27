import { useState, useEffect, useCallback, useRef } from 'react';
const isDark = () => document.documentElement.classList.contains('dark');

interface MediaItem {
  url: string;
  original_name?: string;
  type?: string;
  thumbnail_url?: string;
  size_bytes?: number;
  mime_type?: string;
  preview_url?: string;
  preview_mode?: string;
  preview_reason?: string;
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
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [docxHtml, setDocxHtml] = useState('');
  const [docxLoading, setDocxLoading] = useState(false);
  const [docxError, setDocxError] = useState('');
  const [xlsxHtml, setXlsxHtml] = useState<string>('');
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [xlsxError, setXlsxError] = useState('');
  const [xlsxSheets, setXlsxSheets] = useState<string[]>([]);
  const [xlsxActiveSheet, setXlsxActiveSheet] = useState(0);

  const item = items[index];
  const abortRef = useRef<AbortController | null>(null);
  const xlsxWorkbookRef = useRef<any>(null);

  useEffect(() => {
    setIframeLoaded(false);
    setDocxHtml('');
    setDocxError('');
    setDocxLoading(false);
    setXlsxHtml('');
    setXlsxError('');
    setXlsxLoading(false);
    setXlsxSheets([]);
    setXlsxActiveSheet(0);

    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
    };
  }, [index]);

  const startClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { setClosing(false); onClose(); }, 150);
  }, [closing, onClose]);

  const fullUrl = (url: string) => url?.startsWith('http') || url?.startsWith('//') ? url : window.location.origin + (url || '');
  const formatBytes = (bytes?: number) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(1)} ${units[i]}`;
  };

  const hasMultiple = items.length > 1;
  const isKkFileView = item?.preview_mode === 'kkfileview';
  const isLibreOfficePdf = item?.preview_mode === 'pdf';

  const urlLower = item?.url?.toLowerCase() || '';
  const ext = urlLower.split('.').pop() || '';
  const mime = item?.mime_type?.toLowerCase() || '';

  const isPdf = !isKkFileView && (ext === 'pdf' || mime === 'application/pdf' || isLibreOfficePdf);
  const isDocx = !isKkFileView && !isPdf && item?.type === 'document' && (
    ext === 'docx' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
  const isXlsx = !isKkFileView && !isPdf && item?.type === 'document' && (
    ext === 'xlsx' || ext === 'xls' || ext === 'csv' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel' ||
    mime === 'text/csv'
  );
  const isImage = (item?.type === 'image' || (!item?.type && !isKkFileView && !isPdf && !isDocx && !isXlsx)) && !isLibreOfficePdf;
  const isVideo = item?.type === 'video';
  const isAudio = item?.type === 'audio';
  const isFallback = item?.preview_mode === 'fallback' || (item?.type === 'document' && !isPdf && !isDocx && !isXlsx && !isLibreOfficePdf);

  useEffect(() => {
    if (!item || !isDocx || item.preview_url) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setDocxLoading(true);
      setDocxError('');
      try {
        const resp = await fetch(fullUrl(item.url), {
          signal: controller.signal,
        });
        if (!resp.ok) {
          if (resp.status === 404) throw new Error('NOT_FOUND');
          if (resp.status === 401 || resp.status === 403) throw new Error('FORBIDDEN');
          throw new Error('NETWORK');
        }
        const buffer = await resp.arrayBuffer();
        if (cancelled) return;
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml(
          { arrayBuffer: buffer },
          {
            styleMap: [
              "p[style-name='Normal'] => p:fresh",
              "p[style-name='heading 1'] => h1:fresh",
              "p[style-name='heading 2'] => h2:fresh",
              "p[style-name='heading 3'] => h3:fresh",
              "p[style-name='heading 4'] => h4:fresh",
              "p[style-name='heading 5'] => h5:fresh",
              "p[style-name='heading 6'] => h6:fresh",
              "p[style-name='List Paragraph'] => p:fresh",
              "p[style-name='Body Text'] => p:fresh",
              "p[style-name='Body Text Indent'] => p:fresh",
              "p[style-name='Block Text'] => blockquote:fresh",
              "p[style-name='Quote'] => blockquote:fresh",
              "p[style-name='Intense Quote'] => blockquote:fresh",
              "p[style-name='footnote text'] => p:fresh",
              "r[style-name='Strong'] => strong",
              "r[style-name='Emphasis'] => em",
              "r[style-name='Subtle Emphasis'] => em",
              "r[style-name='Intense Emphasis'] => strong em",
              "r[style-name='Hyperlink'] => r:fresh",
              "table => table:fresh",
              "table[style-name='Table Grid'] => table:fresh",
              "table[style-name='Light Grid Accent 1'] => table:fresh",
              "table[style-name='Light Grid'] => table:fresh",
              "table[style-name='Medium Shading 1 Accent 1'] => table:fresh",
              "table[style-name='List Table'] => table:fresh",
            ],
            convertImage: mammoth.images.imgElement(async (image: any) => {
              const blob = await image.read("base64");
              return { src: `data:${image.contentType};base64,${blob}` };
            }),
            ignoreEmptyParagraphs: false,
          },
        );
        if (cancelled) return;
        setDocxHtml(result.value || '<p style="color:#999;text-align:center;">文档解析完成但无内容</p>');
        if (result.messages?.length) {
          const errors = result.messages.filter((m: any) => m.type === 'error');
          if (errors.length > 0) {
            console.warn('docx conversion issues:', errors);
          }
        }
      } catch (err: any) {
        if (cancelled || err.name === 'AbortError') return;
        if (err.message === 'NOT_FOUND') {
          setDocxError('文件不存在或已被删除');
        } else if (err.message === 'FORBIDDEN') {
          setDocxError('无权限访问该文件');
        } else if (
          err.message?.includes('encrypted') ||
          err.message?.includes('corrupt') ||
          err.message?.includes('password') ||
          err.message?.includes('zip')
        ) {
          setDocxError('该文档格式复杂或已加密，暂不支持在线预览，请下载查看');
        } else {
          setDocxError('文档加载失败，请检查文件是否有效或下载查看');
        }
      } finally {
        if (!cancelled) setDocxLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [index, item?.url, isDocx]);

  // XLSX / CSV preview — dynamic import SheetJS
  useEffect(() => {
    if (!item || !isXlsx || item.preview_url) return;
    let cancelled = false;
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      setXlsxLoading(true);
      setXlsxError('');
      try {
        const resp = await fetch(fullUrl(item.url), {
          signal: controller.signal,
        });
        if (!resp.ok) {
          if (resp.status === 404) throw new Error('NOT_FOUND');
          if (resp.status === 401 || resp.status === 403) throw new Error('FORBIDDEN');
          throw new Error('NETWORK');
        }
        const buffer = await resp.arrayBuffer();
        if (cancelled) return;
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array', cellStyles: true });
        if (cancelled) return;
        xlsxWorkbookRef.current = workbook;
        const sheetNames = workbook.SheetNames;
        setXlsxSheets(sheetNames);
        const { renderXlsxSheet } = await import('@/utils/xlsx-renderer');
        const html = renderXlsxSheet(workbook, xlsxActiveSheet, { dark: isDark() });
        setXlsxHtml(html);
      } catch (err: any) {
        if (cancelled || err.name === 'AbortError') return;
        if (err.message === 'NOT_FOUND') {
          setXlsxError('文件不存在或已被删除');
        } else if (err.message === 'FORBIDDEN') {
          setXlsxError('无权限访问该文件');
        } else if (
          err.message?.includes('password') ||
          err.message?.includes('encrypted') ||
          err.message?.includes('corrupt')
        ) {
          setXlsxError('该文档已加密或损坏，暂不支持在线预览，请下载查看');
        } else {
          setXlsxError('表格加载失败，请检查文件是否有效或下载查看');
        }
      } finally {
        if (!cancelled) setXlsxLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [index, item?.url, isXlsx, xlsxActiveSheet]);

  // Re-render xlsx when dark mode changes
  useEffect(() => {
    if (!isXlsx || !xlsxWorkbookRef.current) return;
    const observer = new MutationObserver(() => {
      const dark = document.documentElement.classList.contains('dark');
      if (xlsxWorkbookRef.current) {
        import('@/utils/xlsx-renderer').then(({ renderXlsxSheet }) => {
          setXlsxHtml(renderXlsxSheet(xlsxWorkbookRef.current, xlsxActiveSheet, { dark }));
        });
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [isXlsx, xlsxActiveSheet]);

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
    if (isDocx || isXlsx || isKkFileView || isPdf) return;
    e.stopPropagation();
    setZoom(z => Math.min(5, Math.max(0.3, z * (e.deltaY > 0 ? 1 / 1.1 : 1.1))));
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom <= 1 || isDocx || isXlsx || isKkFileView || isPdf) return;
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
    <>
      <style>{`
        .docx-container {
          font-family: "宋体", "SimSun", "Microsoft YaHei", "微软雅黑", "Times New Roman", serif;
          font-size: 12pt;
          line-height: 1.6;
          color: #333;
        }
        .docx-container table { border-collapse: collapse; width: 100%; margin: 8px 0; page-break-inside: avoid; }
        .docx-container td, .docx-container th { border: 1px solid #999; padding: 4px 8px; vertical-align: top; text-align: left; }
        .docx-container p { margin: 0 0 6px 0; min-height: 1.2em; }
        .docx-container h1 { font-size: 22pt; margin: 16px 0 8px; font-weight: bold; line-height: 1.3; }
        .docx-container h2 { font-size: 18pt; margin: 14px 0 6px; font-weight: bold; line-height: 1.3; }
        .docx-container h3 { font-size: 15pt; margin: 12px 0 5px; font-weight: bold; line-height: 1.4; }
        .docx-container h4 { font-size: 13pt; margin: 10px 0 4px; font-weight: bold; }
        .docx-container ul, .docx-container ol { padding-left: 24px; margin: 6px 0; }
        .docx-container li { margin: 3px 0; line-height: 1.5; }
        .docx-container img { max-width: 100%; height: auto; }
        .docx-container br { display: block; content: ''; margin: 4px 0; }
        .docx-container blockquote { margin: 8px 0; padding: 4px 12px; border-left: 3px solid #ccc; color: #555; }
        .docx-container pre { font-family: "Consolas", "Courier New", monospace; font-size: 10pt; background: #f5f5f5; padding: 8px; border-radius: 4px; overflow-x: auto; }
        .docx-container strong { font-weight: bold; }
        .docx-container em { font-style: italic; }
      `}</style>
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
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}>
        {!item ? null : isKkFileView ? (
          <>
            {!iframeLoaded && (
              <div className="flex flex-col items-center gap-3 text-white/60">
                <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">正在加载预览...</span>
              </div>
            )}
            <iframe src={item.preview_url} className={`w-full h-full border-0 ${iframeLoaded ? '' : 'hidden'}`}
              onLoad={() => setIframeLoaded(true)}
              onClick={e => e.stopPropagation()} />
          </>
        ) : isImage ? (
          <img src={fullUrl(item.url)} alt={item.original_name} draggable={false}
            className="max-w-[90vw] max-h-[75vh] object-contain"
            style={{ transform: `rotate(${rotation}deg) scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`, cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default' }}
            onClick={e => e.stopPropagation()} />
        ) : isVideo ? (
          <video src={fullUrl(item.url)} controls autoPlay className="max-w-[90vw] max-h-[75vh]" onClick={e => e.stopPropagation()} />
        ) : isAudio ? (
          <audio src={fullUrl(item.url)} controls autoPlay className="w-96" onClick={e => e.stopPropagation()} />
        ) : isPdf ? (
          <iframe src={fullUrl(isLibreOfficePdf ? item.preview_url! : item.url)} className="w-full max-w-5xl" style={{ height: '85vh' }} onClick={e => e.stopPropagation()} />
        ) : isDocx ? (
          <div className="w-full max-w-5xl flex-1 flex flex-col" style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 bg-white/10 backdrop-blur-sm border-b border-white/10">
              <span className="text-white/70 text-xs truncate">{item.original_name}</span>
              <a href={fullUrl(item.url)} download
                className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                下载
              </a>
            </div>
              <div className="flex-1 overflow-y-auto bg-white/5 p-6">
                {docxLoading ? (
                  <div className="flex flex-col items-center justify-center h-full text-white/60 gap-3">
                    <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm">正在加载文档...</span>
                  </div>
                ) : docxError ? (
                  <div className="flex flex-col items-center justify-center h-full text-white gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h0"/>
                      </svg>
                    </div>
                    <p className="text-white/80 text-sm text-center max-w-md">{docxError}</p>
                    <a href={fullUrl(item.url)} download
                      className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                      下载文件
                    </a>
                  </div>
                ) : (
                  <div className="mx-auto bg-white rounded-lg shadow-lg"
                    style={{ minHeight: '200px', maxWidth: '210mm' }}>
                    <div className="docx-container p-6"
                      dangerouslySetInnerHTML={{ __html: docxHtml }} />
                  </div>
                )}
              </div>
          </div>
        ) : isXlsx ? (
          <div className="w-full max-w-5xl flex-1 flex flex-col" style={{ height: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 bg-white/10 backdrop-blur-sm border-b border-white/10">
              <span className="text-white/70 text-xs truncate">{item.original_name}</span>
              <a href={fullUrl(item.url)} download
                className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full bg-white/15 hover:bg-white/25 text-white transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                下载
              </a>
            </div>
            <div className="flex-1 overflow-auto bg-white/5 p-2">
              {xlsxLoading ? (
                <div className="flex flex-col items-center justify-center h-full text-white/60 gap-3">
                  <svg className="animate-spin h-8 w-8" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span className="text-sm">正在加载表格...</span>
                </div>
              ) : xlsxError ? (
                <div className="flex flex-col items-center justify-center h-full text-white gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h0"/>
                    </svg>
                  </div>
                  <p className="text-white/80 text-sm text-center max-w-md">{xlsxError}</p>
                  <a href={fullUrl(item.url)} download
                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                    下载文件
                  </a>
                </div>
              ) : (
                <div className="flex flex-col h-full">
                  {xlsxSheets.length > 1 && (
                    <div className="flex items-center gap-1 px-2 py-1.5 bg-white/5 border-b border-white/10 overflow-x-auto">
                      {xlsxSheets.map((name, i) => (
                        <button key={name} onClick={() => setXlsxActiveSheet(i)}
                          className={`text-xs px-3 py-1 rounded-md whitespace-nowrap transition-colors ${
                            i === xlsxActiveSheet
                              ? 'bg-white/20 text-white font-medium'
                              : 'text-white/50 hover:text-white/80 hover:bg-white/10'
                          }`}>{name}</button>
                      ))}
                    </div>
                  )}
                  <div className="flex-1 overflow-auto bg-white rounded-lg mx-2 mb-2">
                    <div className="inline-block min-w-full" dangerouslySetInnerHTML={{ __html: xlsxHtml }} />
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center p-10 text-white" onClick={e => e.stopPropagation()}>
            <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mb-5">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <p className="text-white/90 text-lg font-medium mb-1">{item.original_name || '文件'}</p>
            <p className="text-white/50 text-sm mb-1">{item.preview_mode === 'fallback' ? (item.preview_reason || '暂不支持在线预览') : (item.mime_type || item.type || '')}</p>
            <p className="text-white/50 text-sm mb-6">{formatBytes(item.size_bytes)}</p>
            <a href={fullUrl(item.url)} download
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
              下载文件
            </a>
          </div>
        )}
      </div>

      {!isKkFileView && !isDocx && !isXlsx && (
        <div className="absolute bottom-6 flex items-center gap-3" onClick={e => e.stopPropagation()}>
          {isImage ? (
            <div className="flex items-center gap-3 bg-black/50 rounded-full px-4 py-2 backdrop-blur">
              <button onClick={() => setRotation(r => r - 90)} className="text-white/70 hover:text-white p-1">↺</button>
              <button onClick={() => setZoom(z => Math.max(0.3, z / 1.1))} className="text-white/70 hover:text-white p-1">−</button>
              <span className="text-white/50 text-xs min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(5, z * 1.1))} className="text-white/70 hover:text-white p-1">+</button>
              <button onClick={() => setRotation(r => r + 90)} className="text-white/70 hover:text-white p-1">↻</button>
              <button onClick={reset} className="text-white/50 hover:text-white text-xs px-2">重置</button>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-black/50 rounded-full px-4 py-2 backdrop-blur">
              <a href={fullUrl(item!.url)} download
                className="text-white/70 hover:text-white text-xs flex items-center gap-1 px-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                下载
              </a>
              <span className="text-white/50 text-xs px-2">{item!.original_name || ''}</span>
            </div>
          )}
          {hasMultiple && (
            <div className="bg-black/50 text-white/80 text-xs px-3 py-1.5 rounded-full backdrop-blur">{index + 1} / {items.length}</div>
          )}
        </div>
      )}
      {(isDocx || isXlsx) && hasMultiple && (
        <div className="absolute bottom-6 text-white/60 text-xs px-3 py-1.5 rounded-full bg-black/50 backdrop-blur" onClick={e => e.stopPropagation()}>
          {index + 1} / {items.length}
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 text-center pb-1">
        <span className="text-white/30 text-[10px]">{isKkFileView ? 'Esc 关闭' : (isDocx || isXlsx) ? 'Esc 关闭 · 方向键 <> 切换' : '方向键 <> 切换 · Esc 关闭 · 滚轮缩放'}</span>
      </div>
    </div>
    </>
  );
}
