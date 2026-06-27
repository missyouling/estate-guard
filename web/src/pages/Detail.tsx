import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Media } from '@/types';
import { formatBytes } from '@/lib/utils';

export default function Detail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [item, setItem] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [total, setTotal] = useState(0);
  const [allIds, setAllIds] = useState<number[]>([]);

  const mediaList = (location.state as any)?.mediaList as Media[] | undefined;

  useEffect(() => {
    if (!id) return;
    api.get(`/media/${id}`).then(r => {
      if (r.data.code === 0) setItem(r.data.data);
    }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (mediaList && mediaList.length > 0 && item) {
      const idx = mediaList.findIndex((m: Media) => m.id === item.id);
      if (idx >= 0) { setIndex(idx); setTotal(mediaList.length); setAllIds(mediaList.map((m: Media) => m.id)); }
    }
  }, [item, mediaList]);

  const copyUrl = (url: string, format: 'url' | 'md' | 'html') => {
    const fullUrl = url.startsWith('http') || url.startsWith('//') ? url : window.location.origin + url;
    let txt = fullUrl;
    if (format === 'md') txt = `![](${fullUrl})`;
    if (format === 'html') txt = `<img src="${fullUrl}" />`;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(() => toast.success('已复制'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      toast.success('已复制');
    }
  };

  const handleDelete = async () => {
    if (!confirm('确定删除此条记录？')) return;
    try {
      await api.delete(`/media/${id}`);
      toast.success('已删除');
      navigate('/');
    } catch { toast.error('删除失败'); }
  };

  if (loading) return <div className="text-center py-20 text-[var(--muted-foreground)]">加载中...</div>;
  if (!item) return <div className="text-center py-20 text-[var(--muted-foreground)]">记录不存在</div>;

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => navigate(-1)} className="text-[var(--primary)] text-sm mb-4 hover:underline inline-flex items-center gap-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5m7-7l-7 7 7 7"/></svg>
        返回
      </button>


      <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl overflow-hidden shadow-lg">
        <div className="relative bg-black/5">
          {item.type === 'image' && (
            <img src={item.url} alt={item.original_name} className="w-full object-contain" style={{ maxHeight: 'calc(100vh - 300px)', minHeight: '300px' }} />
          )}
          {item.type === 'video' && (
            <video src={item.url} controls className="w-full bg-black" style={{ maxHeight: 'calc(100vh - 300px)', minHeight: '300px' }} />
          )}
          {item.type === 'audio' && (
            <div className="p-10 flex items-center justify-center">
              <audio src={item.url} controls className="w-full" />
            </div>
          )}
          {item.type === 'document' && (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-[var(--card)]">
              <div className="w-20 h-20 rounded-2xl bg-[var(--muted)] flex items-center justify-center mb-4">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              </div>
              <p className="text-[var(--foreground)] text-lg font-medium mb-1">{item.original_name}</p>
              <p className="text-[var(--muted-foreground)] text-sm mb-1">{item.mime_type || '文件'}</p>
              <p className="text-[var(--muted-foreground)] text-sm mb-6">{formatBytes(item.size_bytes)}</p>
              <a href={item.url} download
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-80 transition-opacity">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                下载文件
              </a>
            </div>
          )}

          {total > 1 && (
            <>
              {index > 0 && (
                <button onClick={() => navigate(`/detail/${allIds[index - 1]}`, { state: location.state })}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[var(--card)]/80 backdrop-blur shadow-lg flex items-center justify-center hover:bg-[var(--card)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6"/></svg>
                </button>
              )}
              {index < total - 1 && (
                <button onClick={() => navigate(`/detail/${allIds[index + 1]}`, { state: location.state })}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-[var(--card)]/80 backdrop-blur shadow-lg flex items-center justify-center hover:bg-[var(--card)] transition-colors">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
                </button>
              )}
              <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2 py-1 rounded-full backdrop-blur">
                {index + 1} / {total}
              </div>
            </>
          )}
        </div>

        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-[var(--foreground)] font-semibold text-lg">{item.original_name}</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              记录编号: NO.{item.record_no} · 类型: {item.type}
              {item.category_name && ` · ${item.category_name}`}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {item.width && item.height && (
              <div><span className="text-[var(--muted-foreground)] text-xs">尺寸</span><p>{item.width} x {item.height}</p></div>
            )}
            <div><span className="text-[var(--muted-foreground)] text-xs">大小</span><p>{formatBytes(item.size_bytes)}</p></div>
            {item.duration && (
              <div><span className="text-[var(--muted-foreground)] text-xs">时长</span><p>{item.duration}秒</p></div>
            )}
            <div><span className="text-[var(--muted-foreground)] text-xs">上传时间</span><p className="text-xs">{item.uploaded_at}</p></div>
            <div><span className="text-[var(--muted-foreground)] text-xs">水印</span><p>{item.watermark_applied ? '已添加' : '无'}</p></div>
            {item.file_hash && (
              <div className="col-span-2">
                <span className="text-[var(--muted-foreground)] text-xs">文件哈希 (SHA-256)</span>
                <p className="text-xs font-mono break-all text-[var(--foreground)] opacity-80">{item.file_hash}</p>
              </div>
            )}
          </div>

          {item.address && (
            <div>
              <span className="text-[var(--muted-foreground)] text-xs">位置</span>
              <p className="text-sm">{item.address}</p>
            </div>
          )}
          {item.remark && (
            <div>
              <span className="text-[var(--muted-foreground)] text-xs">备注</span>
              <p className="text-sm">{item.remark}</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--border)]">
            <button onClick={() => copyUrl(item.url, 'url')} className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/80 transition-colors">复制 URL</button>
            <button onClick={() => copyUrl(item.url, 'md')} className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors">复制 Markdown</button>
            <button onClick={() => copyUrl(item.url, 'html')} className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors">复制 HTML</button>
            <button onClick={handleDelete} className="px-2 py-1 rounded-lg bg-[var(--destructive)]/10 hover:bg-[var(--destructive)]/20 transition-colors ml-auto" title="删除">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-[var(--destructive)]"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
