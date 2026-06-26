import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Media } from '@/types';
import ConfirmModal from './ConfirmModal';

interface ShareModalProps {
  mediaIds: number[];
  mediaItems: Media[];
  onClose: () => void;
}

const PASSWORD_PRESETS = [
  { label: '6位数字', generate: () => String(Math.floor(100000 + Math.random() * 900000)) },
  { label: '8位数字', generate: () => String(Math.floor(10000000 + Math.random() * 90000000)) },
  { label: '8位混合', generate: () => { const c='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; return Array.from({length:8},()=>c[Math.floor(Math.random()*c.length)]).join(''); } },
];

const EXPIRE_OPTIONS = [
  { label: '1 天', days: 1 },
  { label: '3 天', days: 3 },
  { label: '7 天', days: 7 },
  { label: '30 天', days: 30 },
  { label: '永久有效', days: 0 },
  { label: '自定义', days: -1 },
];

const ACCESS_LIMITS = [
  { label: '不限', value: 0 },
  { label: '1 次', value: 1 },
  { label: '5 次', value: 5 },
  { label: '10 次', value: 10 },
];

export default function ShareModal({ mediaIds, mediaItems, onClose }: ShareModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'config' | 'result'>('config');
  const [password, setPassword] = useState('');
  const [noPassword, setNoPassword] = useState(false);
  const [expireOption, setExpireOption] = useState(2);
  const [expireCustom, setExpireCustom] = useState('');
  const [allowDownload, setAllowDownload] = useState(false);
  const [accessLimit, setAccessLimit] = useState(0);
  const [forceWatermark, setForceWatermark] = useState(true);
  const [remark, setRemark] = useState('');
  const [fileListOpen, setFileListOpen] = useState(true);
  const [creating, setCreating] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [sharePassword, setSharePassword] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [showNoPwdConfirm, setShowNoPwdConfirm] = useState(false);

  const totalSize = mediaItems.reduce((s, m) => s + (m.size_bytes || 0), 0);
  const buildings = [...new Set(mediaItems.map(m => m.address?.match(/^(\d+)栋/)?.[1]).filter(Boolean))];

  const generatePassword = (fn: () => string) => { setPassword(fn()); setNoPassword(false); };

  const getExpireDays = () => {
    if (expireOption === -1) return -1;
    return EXPIRE_OPTIONS[expireOption]?.days ?? 7;
  };

  const handleCreate = async () => {
    if (getExpireDays() === -1 && !expireCustom) { toast.error('请选择自定义过期时间'); return; }
    if (allowDownload) { setShowConfirm(true); return; }
    if (noPassword && !password) { setShowNoPwdConfirm(true); return; }
    doCreate();
  };

  const doCreate = async () => {
    setCreating(true);
    try {
      const payload: any = {
        media_ids: mediaIds,
        password: noPassword ? undefined : (password || undefined),
        allow_download: allowDownload,
        max_access_count: accessLimit > 0 ? accessLimit : undefined,
        force_watermark: forceWatermark,
        remark: remark || undefined,
      };
      if (expireOption === -1 && expireCustom) {
        payload.expire_at = expireCustom;
      } else {
        const days = getExpireDays();
        if (days > 0) payload.expire_days = days;
      }
      const res = await api.post('/media/share', payload);
      if (res.data.code === 0) {
        const token = res.data.data.token;
        const base = window.location.origin;
        setShareUrl(`${base}/shared/${token}`);
        setSharePassword(password);
        setStep('result');
        toast.success('分享链接已创建');
      }
    } catch (err: any) { toast.error(err.response?.data?.message || '创建失败'); }
    finally { setCreating(false); }
  };

  const copyText = (txt: string) => {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(txt).then(() => toast.success('已复制'));
    } else {
      const ta = document.createElement('textarea');
      ta.value = txt; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      toast.success('已复制');
    }
  };

  const formatSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0; let s = bytes;
    while (s >= 1024 && i < units.length - 1) { s /= 1024; i++; }
    return `${s.toFixed(1)} ${units[i]}`;
  };

  if (mediaIds.length === 0) return null;

  return (<>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={onClose}>
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col mx-1" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
          <h3 className="text-[var(--foreground)] text-lg font-bold">
            {step === 'config' ? `创建分享 (${mediaIds.length} 个文件)` : '分享已生成'}
          </h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--accent)] rounded-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {step === 'config' ? (<>
            <div>
              <button onClick={() => setFileListOpen(!fileListOpen)}
                className="flex items-center justify-between w-full text-xs text-[var(--muted-foreground)] py-2">
                <span>文件清单 ({mediaIds.length} 个，共 {formatSize(totalSize)})</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  className={`transition-transform ${fileListOpen ? 'rotate-180' : ''}`}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </button>
              {fileListOpen && (
                <div className="max-h-32 overflow-y-auto space-y-1.5 border border-[var(--border)] rounded-xl p-2">
                  {mediaItems.map(m => (
                    <div key={m.id} className="flex items-center gap-2 text-xs">
                      {m.thumbnail_url ? (
                        <img src={m.thumbnail_url} alt="" className="w-8 h-8 rounded object-cover border border-[var(--border)]" />
                      ) : (
                        <div className="w-8 h-8 rounded bg-[var(--muted)] flex items-center justify-center text-[10px] text-[var(--muted-foreground)]">
                          {m.type === 'video' ? '🎬' : m.type === 'audio' ? '🎵' : '📄'}
                        </div>
                      )}
                      <span className="flex-1 truncate">{m.original_name}</span>
                      <span className="text-[var(--muted-foreground)]">{formatSize(m.size_bytes)}</span>
                    </div>
                  ))}
                </div>
              )}
              {buildings.length > 0 && (
                <div className="mt-2 text-[10px] text-[var(--muted-foreground)]">
                  涉及楼栋: {buildings.join(', ')}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">访问密码</label>
              <div className="flex gap-2">
                <input type="text" value={password} onChange={e => { setPassword(e.target.value); setNoPassword(false); }}
                  placeholder="输入密码" disabled={noPassword}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none transition-all ${noPassword ? 'bg-[var(--muted)]/50 text-[var(--muted-foreground)]' : 'border-[var(--border)] bg-[var(--background)]'}`} />
                <button onClick={() => { setNoPassword(!noPassword); if (!noPassword) setPassword(''); }}
                  className={`px-2.5 py-2 text-[10px] rounded-lg border font-medium whitespace-nowrap ${noPassword ? 'bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]' : 'border-[var(--border)] text-[var(--muted-foreground)]'}`}>
                  {noPassword ? '公开访问' : '无密码'}
                </button>
              </div>
              {!noPassword && (
                <div className="flex gap-1.5 mt-1.5 flex-wrap">
                  {PASSWORD_PRESETS.map(p => (
                    <button key={p.label} onClick={() => generatePassword(p.generate)}
                      className="px-2 py-1 text-[10px] rounded-full border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]">
                      生成{p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">有效期</label>
              <div className="flex gap-1.5 flex-wrap">
                {EXPIRE_OPTIONS.map((opt, i) => (
                  <button key={i} onClick={() => setExpireOption(i)}
                    className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                      expireOption === i ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'bg-[var(--muted)]/60 text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                    }`}>{opt.label}</button>
                ))}
              </div>
              {expireOption === -1 && (
                <input type="datetime-local" value={expireCustom} onChange={e => setExpireCustom(e.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">访问次数上限</label>
                <div className="flex gap-1 flex-wrap">
                  {ACCESS_LIMITS.map(opt => (
                    <button key={opt.value} onClick={() => setAccessLimit(opt.value)}
                      className={`px-2 py-1 text-[10px] rounded-lg font-medium transition-all ${
                        accessLimit === opt.value ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'bg-[var(--muted)]/60 text-[var(--muted-foreground)]'
                      }`}>{opt.label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={allowDownload} onChange={e => setAllowDownload(e.target.checked)}
                    className="rounded text-[var(--primary)]" />
                  <span className="text-xs text-[var(--foreground)]">允许下载原文件</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={forceWatermark} onChange={e => setForceWatermark(e.target.checked)}
                    className="rounded text-[var(--primary)]" />
                  <span className="text-xs text-[var(--foreground)]">强制水印</span>
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[var(--muted-foreground)] mb-1">分享事由（选填）</label>
              <input type="text" value={remark} onChange={e => setRemark(e.target.value)}
                placeholder="填写分享事由，方便后续追溯..."
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
            </div>

            <button onClick={handleCreate} disabled={creating}
              className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 transition-colors disabled:opacity-60">
              {creating ? '创建中...' : '生成分享链接'}
            </button>
          </>) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                <div className="text-sm text-green-700 dark:text-green-400 font-medium mb-1">分享已生成</div>
                <div className="text-xs text-green-600 dark:text-green-500">
                  {sharePassword ? '已设置访问密码' : '公开访问'} · {EXPIRE_OPTIONS[expireOption]?.label || '自定义'}
                </div>
              </div>

              <div>
                <label className="block text-xs text-[var(--muted-foreground)] mb-1">分享链接</label>
                <div className="flex items-center gap-2">
                  <input readOnly value={shareUrl}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm font-mono outline-none" />
                  <button onClick={() => copyText(shareUrl)}
                    className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium whitespace-nowrap">复制链接</button>
                </div>
              </div>

              {sharePassword && (
                <div>
                  <label className="block text-xs text-[var(--muted-foreground)] mb-1">访问密码</label>
                  <div className="flex items-center gap-2">
                    <input readOnly value={sharePassword}
                      className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm font-mono outline-none" />
                    <button onClick={() => copyText(sharePassword)}
                      className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium whitespace-nowrap">复制密码</button>
                  </div>
                </div>
              )}

              <button onClick={() => {
                const lines = [`【证据分享】`, `链接: ${shareUrl}`];
                if (sharePassword) lines.push(`密码: ${sharePassword}`);
                const expireLabel = EXPIRE_OPTIONS[expireOption]?.label;
                if (expireLabel) lines.push(`有效期: ${expireLabel}`);
                if (remark) lines.push(`事由: ${remark}`);
                copyText(lines.join('\n'));
              }}
                className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--accent)] transition-colors">
                复制完整分享文案
              </button>

              <button onClick={() => { onClose(); navigate('/shares'); }}
                className="w-full py-2.5 rounded-lg bg-[var(--muted)] text-[var(--foreground)] text-sm font-medium hover:bg-[var(--accent)] transition-colors">
                查看分享记录
              </button>
            </div>
          )}
        </div>
      </div>
    </div>

    <ConfirmModal open={showConfirm} title="确认操作"
      message="开启「允许下载原文件」后，接收方可保存文件到本地。请确保分享对象可信，确认开启？"
      onConfirm={() => { setShowConfirm(false); doCreate(); }} onCancel={() => setShowConfirm(false)} />

    <ConfirmModal open={showNoPwdConfirm} title="确认操作"
      message="无密码公开访问意味着任何知道链接的人均可查看文件内容，确认创建？"
      onConfirm={() => { setShowNoPwdConfirm(false); doCreate(); }} onCancel={() => setShowNoPwdConfirm(false)} />
  </>);
}
