import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Footer() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [showFeedback, setShowFeedback] = useState(false);
  const [fbTitle, setFbTitle] = useState('');
  const [fbContent, setFbContent] = useState('');
  const [fbFiles, setFbFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/admin/config').then(r => {
      if (r.data.code === 0) {
        const map: Record<string, string> = {};
        (r.data.data || []).forEach((c: any) => { map[c.key] = c.value; });
        setConfigs(map);
      }
    }).catch(() => {});
  }, []);

  const copyright = configs.site_copyright || '物业服务监督系统';
  const repoUrl = configs.site_repo_url || '';
  const communityName = configs.community_name || '';

  const handleSubmit = async () => {
    if (!fbTitle.trim()) { toast('请输入问题标题'); return; }
    if (!fbContent.trim()) { toast('请输入问题描述'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/feedback', { content: `标题:${fbTitle.trim()}\n描述:${fbContent.trim()}` });
      if (res.data.code === 0) {
        toast.success('反馈已提交');
        setShowFeedback(false);
        setFbTitle('');
        setFbContent('');
        setFbFiles([]);
      } else {
        toast.error(res.data.message || '提交失败');
      }
    } catch { toast.error('提交失败'); }
    setSubmitting(false);
  };

  return (
    <>
      <footer className="hidden md:flex items-center justify-center gap-4 py-4 text-xs text-[var(--muted-foreground)] border-t border-[var(--border)] mt-4">
        <span>
          {repoUrl ? (
            <a href={repoUrl} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--primary)] transition-colors">
              {copyright}
            </a>
          ) : copyright}
          {communityName && <span className="ml-2 px-1.5 py-0.5 rounded border border-current text-[10px]">{communityName}</span>}
        </span>
        <span>&copy; {new Date().getFullYear()}</span>
        <button onClick={() => setShowFeedback(true)} className="hover:text-[var(--primary)] transition-colors">反馈</button>
      </footer>

      {showFeedback && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setShowFeedback(false)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[var(--foreground)] text-lg font-bold">用户反馈</h3>
              <button onClick={() => setShowFeedback(false)} className="p-1 hover:bg-[var(--accent)] rounded-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-[var(--muted-foreground)]">你所遇到的问题？</p>
              <input value={fbTitle} onChange={e => setFbTitle(e.target.value)} placeholder="问题标题 *"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:border-[var(--primary)]" />
              <textarea value={fbContent} onChange={e => setFbContent(e.target.value)} placeholder="问题描述 *" rows={4}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none focus:border-[var(--primary)] resize-none" />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--muted)]">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  上传附件
                  <input type="file" multiple className="hidden" onChange={e => setFbFiles(Array.from(e.target.files || []))} />
                </label>
                {fbFiles.length > 0 && <span className="text-xs text-[var(--muted-foreground)]">已选 {fbFiles.length} 个文件</span>}
              </div>
              <button onClick={handleSubmit} disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60">
                {submitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
