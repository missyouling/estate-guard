import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Share() {
  const location = useLocation();
  const navigate = useNavigate();
  const ids = (location.state as any)?.ids as number[] || [];
  const [password, setPassword] = useState('');
  const [expireDays, setExpireDays] = useState(7);
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');

  const generatePassword = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setPassword(result);
  };

  const handleCreate = async () => {
    if (ids.length === 0) return;
    setCreating(true);
    try {
      const res = await api.post('/media/share', {
        media_ids: ids,
        password: password || undefined,
        expire_days: expireDays,
      });
      if (res.data.code === 0) {
        const token = res.data.data.token;
        const base = window.location.origin;
        setShareUrl(`${base}/shared/${token}`);
        toast.success('分享链接已创建');
      }
    } catch (err: any) { toast.error(err.response?.data?.message || '创建失败'); }
    finally { setCreating(false); }
  };

  const copyShareUrl = () => {
    const txt = shareUrl;
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

  if (ids.length === 0) {
    return <div className="text-center py-20 text-[var(--muted-foreground)]">未选择任何照片</div>;
  }

  return (
    <div className="max-w-lg mx-auto">
      <button onClick={() => navigate(-1)} className="text-[var(--primary)] text-sm mb-6 hover:underline inline-flex items-center gap-1">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5m7-7l-7 7 7 7"/></svg>
        返回
      </button>

      <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl p-6 shadow-sm space-y-5">
        <h2 className="text-[var(--foreground)] text-lg font-bold">分享 {ids.length} 张照片</h2>

        {!shareUrl ? (
          <>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">访问密码（可选）</label>
              <div className="flex gap-2">
                <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="留空则无需密码"
                  className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all" />
                <button type="button" onClick={generatePassword}
                  className="px-2.5 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 hover:bg-[var(--muted)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-all flex items-center justify-center"
                  title="随机生成5位密码">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="2" y="2" width="8" height="8" rx="1.5"/>
                    <rect x="14" y="2" width="8" height="8" rx="1.5"/>
                    <rect x="2" y="14" width="8" height="8" rx="1.5"/>
                    <rect x="14" y="14" width="8" height="8" rx="1.5"/>
                  </svg>
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">有效期</label>
              <select value={expireDays} onChange={e => setExpireDays(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all">
                <option value={1}>1 天</option>
                <option value={3}>3 天</option>
                <option value={7}>7 天</option>
                <option value={30}>30 天</option>
                <option value={90}>90 天</option>
              </select>
            </div>
            <button onClick={handleCreate} disabled={creating}
              className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 transition-colors disabled:opacity-60">
              {creating ? '创建中...' : '生成分享链接'}
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 rounded-xl text-sm text-green-700">
              分享链接已生成，有效期 {expireDays} 天{password ? '，已设置访问密码' : ''}
            </div>
            <div className="flex items-center gap-2">
              <input readOnly value={shareUrl}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm outline-none" />
              <button onClick={copyShareUrl}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium hover:bg-[var(--primary)]/80 transition-colors whitespace-nowrap">
                复制链接
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
