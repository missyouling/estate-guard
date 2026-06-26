import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Media } from '@/types';
import PreviewModal from '@/components/PreviewModal';

export default function SharedView() {
  const { token } = useParams();
  const [items, setItems] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [previewItem, setPreviewItem] = useState<Media | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => { if (!token) return; loadShared(); }, [token]);

  const loadShared = async (pwd?: string) => {
    setLoading(true); setError('');
    try {
      const res = await api.get(`/share/${token}`, { params: pwd ? { password: pwd } : {} });
      if (res.data.code === 0) { setItems(res.data.data?.files || []); setNeedPassword(false); }
      else { if (res.data.code === 401) setNeedPassword(true); else setError(res.data.message || '访问失败'); }
    } catch (err: any) {
      if (err.response?.status === 401) setNeedPassword(true);
      else setError(err.response?.data?.message || '链接无效或已过期');
    } finally { setLoading(false); }
  };

  const submitPassword = () => { if (!password.trim()) { toast.error('请输入密码'); return; } loadShared(password); };
  const fullUrl = (url: string) => url.startsWith('http') ? url : window.location.origin + url;

  const downloadItem = (item: Media) => { const a = document.createElement('a'); a.href = fullUrl(item.url); a.download = item.original_name; a.click(); };
  const downloadAll = async () => {
    if (!token) return;
    const a = document.createElement('a');
    a.href = `/api/share/${token}/download`;
    a.download = '分享文件.zip';
    a.click();
  };

  if (loading) return <div className="text-center py-20 text-[var(--muted-foreground)] text-sm">加载中...</div>;

  if (needPassword) {
    return (
      <div className="max-w-sm mx-auto pt-20">
        <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-4 text-center">
          <div className="text-4xl mb-2">🔒</div>
          <h2 className="text-[var(--foreground)] text-lg font-bold">需要访问密码</h2>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitPassword()} placeholder="请输入分享密码" className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:border-[var(--primary)]" />
          <button onClick={submitPassword} className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium">确认</button>
        </div>
      </div>
    );
  }

  if (error) {
    return <div className="text-center py-20"><div className="text-4xl mb-4">😕</div><div className="text-[var(--muted-foreground)]">{error}</div></div>;
  }

  return (
    <div className="max-w-5xl mx-auto pt-4">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[var(--foreground)] text-xl font-bold">分享的照片 ({items.length})</h2>
        {items.length > 1 && (
          <button onClick={downloadAll} className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium">下载全部</button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((item, i) => (
          <div key={item.id} className="relative group">
            <div className="aspect-square rounded-xl overflow-hidden bg-[var(--card)]/60 shadow-sm border border-[var(--border)] cursor-pointer" onClick={() => { setPreviewItem(item); setPreviewIndex(i); }}>
              {item.type === 'image' ? <img src={item.thumbnail_url || item.url} alt="" className="w-full h-full object-cover object-center" loading="lazy" />
              : item.type === 'video' ? <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)] gap-1"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><rect x="1" y="3" width="22" height="18" rx="2"/></svg><span className="text-xs">视频</span></div>
              : <div className="w-full h-full flex flex-col items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)] gap-1"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1}><path d="M9 12h6m-3-3v6"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg><span className="text-[10px] truncate px-1">{item.original_name}</span></div>}
            </div>
            <button onClick={(e) => { e.stopPropagation(); downloadItem(item); }} className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[var(--card)]/80 shadow flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-[var(--card)]"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
          </div>
        ))}
      </div>

      {previewItem && (
        <PreviewModal
          items={items.map(m => ({ url: m.url, original_name: m.original_name, type: m.type, thumbnail_url: m.thumbnail_url || '' }))}
          index={previewIndex}
          onClose={() => setPreviewItem(null)}
          onPrev={items.length > 1 ? () => setPreviewIndex(i => i > 0 ? i - 1 : i) : undefined}
          onNext={items.length > 1 ? () => setPreviewIndex(i => i < items.length - 1 ? i + 1 : i) : undefined}
        />
      )}
    </div>
  );
}
