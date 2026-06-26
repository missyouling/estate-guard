import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import ConfirmModal from '@/components/ConfirmModal';

function extractMediaUrls(text: string) {
  const urls: { url: string; type: 'image' | 'video' | 'audio' }[] = [];
  const re = /(https?:\/\/[^\s]+?|(?<=\s|\n|^)\/files\/[^\s]+?)(?=[.,:;!?)]*\s|$)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const u = m[0].replace(/[.,:;!?)]+$/, '');
    if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(u)) urls.push({ url: u, type: 'image' });
    else if (/\.(mp4|webm|mov)(\?.*)?$/i.test(u)) urls.push({ url: u, type: 'video' });
    else if (/\.(mp3|wav|ogg)(\?.*)?$/i.test(u)) urls.push({ url: u, type: 'audio' });
  }
  return urls;
}

function renderContent(text: string, onMediaClick?: (url: string, type: string) => void) {
  const urlRe = /(https?:\/\/[^\s]+?|\/files\/[^\s]+?)(?=[.,:;!?)]*\s|$)/gi;
  const parts: { type: 'text' | 'url'; value: string }[] = [];
  let lastIdx = 0;
  let m;
  while ((m = urlRe.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push({ type: 'text', value: text.slice(lastIdx, m.index) });
    parts.push({ type: 'url', value: m[0].replace(/[.,:;!?)]+$/, '') });
    lastIdx = urlRe.lastIndex;
  }
  if (lastIdx < text.length) parts.push({ type: 'text', value: text.slice(lastIdx) });

  return parts.map((part, i) => {
    if (part.type === 'url') {
      const u = part.value;
      if (/\.(jpg|jpeg|png|gif|webp|bmp)(\?.*)?$/i.test(u)) {
        return <img key={i} src={u} className="max-w-full rounded-lg mt-1 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => onMediaClick?.(u, 'image')} alt="" />;
      }
      if (/\.(mp4|webm|mov)(\?.*)?$/i.test(u)) {
        return (
          <div key={i} className="relative mt-1 cursor-pointer group" onClick={() => onMediaClick?.(u, 'video')}>
            <video src={u} className="max-w-full rounded-lg max-h-40" preload="metadata" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        );
      }
      if (/\.(mp3|wav|ogg)(\?.*)?$/i.test(u)) {
        return <audio key={i} src={u} controls className="max-w-full mt-1 h-8" />;
      }
      return <a key={i} href={u} target="_blank" rel="noreferrer" className="text-[var(--primary)] underline text-sm">{u}</a>;
    }
    return <span key={i}>{part.value}</span>;
  });
}

function MoonIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>;
}

function SunIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;
}

function BellIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 01-3.46 0" />
    </svg>
  );
}

function MenuIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 12h18M3 6h18M3 18h18"/></svg>;
}

export default function DockBar({ dark, onToggleTheme, onToggleSidebar }: {
  dark: boolean; onToggleTheme: () => void; onToggleSidebar: () => void;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifClosing, setNotifClosing] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [notifTypeCounts, setNotifTypeCounts] = useState<Record<string, number>>({});
  const [notifTypeFilter, setNotifTypeFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [notifTab, setNotifTab] = useState('system');
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [groupReplyText, setGroupReplyText] = useState('');
  const [sendingGroupReply, setSendingGroupReply] = useState(false);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewType, setPreviewType] = useState('image');
  const [previewClosing, setPreviewClosing] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState<Record<number, boolean>>({});
  const [confirmGroupDelete, setConfirmGroupDelete] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const contentHeights = useRef<Map<number, HTMLDivElement>>(new Map());
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const ADMIN_ID = 1;

  const closeNotif = useCallback(() => {
    if (notifClosing) return;
    setNotifClosing(true);
    setTimeout(() => { setNotifClosing(false); setShowNotifications(false); }, 150);
  }, [notifClosing]);

  const closePreview = useCallback(() => {
    if (previewClosing) return;
    setPreviewClosing(true);
    setPreviewUrl('');
    setTimeout(() => { setPreviewClosing(false); setPreviewType('image'); }, 150);
  }, [previewClosing]);

  const fetchUnread = async () => {
    try {
      const res = await api.get('/notifications/unread-count');
      if (res.data.code === 0) setUnreadCount(res.data.data?.count || 0);
    } catch {}
  };

  useEffect(() => { fetchUnread(); const t = setInterval(fetchUnread, 30000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (expandedId && listRef.current) {
      const timer = setTimeout(() => {
        const el = listRef.current?.querySelector(`[data-nid="${expandedId}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [expandedId]);

  useLayoutEffect(() => {
    contentHeights.current.forEach((el, id) => {
      if (id === expandedId) {
        const h = el.scrollHeight;
        el.style.height = h > 0 ? h + 'px' : '0px';
      } else {
        el.style.height = '0px';
      }
    });
  }, [expandedId]);

  const fetchNotifTypes = async () => {
    try {
      const res = await api.get('/notifications/types');
      if (res.data.code === 0) setNotifTypeCounts(res.data.data || {});
    } catch {}
  };

  const openNotifications = async () => {
    setExpandedId(null);
    setNotifTypeFilter('all');
    setShowNotifications(true);
    try {
      const [notifRes, typeRes] = await Promise.all([
        api.get('/notifications'),
        api.get('/notifications/types'),
      ]);
      if (notifRes.data.code === 0) setNotifications(notifRes.data.data || []);
      if (typeRes.data.code === 0) setNotifTypeCounts(typeRes.data.data || {});
    } catch {}
  };

  const markRead = async (id: number) => {
    try { await api.patch(`/notifications/${id}/read`); fetchUnread(); } catch {}
  };

  const markAllRead = async () => {
    try {
      const res = await api.post('/notifications/mark-all-read');
      if (res.data.code === 0) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
        setUnreadCount(0);
        setNotifTypeCounts({});
        toast.success('已全部标为已读');
      }
    } catch {}
  };

  const clearRead = async () => {
    try {
      const res = await api.post('/notifications/clear-read');
      if (res.data.code === 0) {
        setNotifications(prev => prev.filter(n => !n.is_read));
        toast.success('已清空已读通知');
      }
    } catch {}
  };

  const submitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/feedback', { content: feedbackText.trim() });
      if (res.data.code === 0) {
        toast.success('反馈已提交');
        setFeedbackText('');
        const notifRes = await api.get('/notifications');
        if (notifRes.data.code === 0) setNotifications(notifRes.data.data || []);
      } else {
        toast.error(res.data.message || '提交失败');
      }
    } catch { toast.error('提交失败'); }
    setSubmitting(false);
  };

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/upload/chat-image', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.code === 0) {
        const url = res.data.data.url;
        if (isAdmin && expandedGroup) {
          setGroupReplyText(prev => prev + (prev ? '\n' : '') + url);
        } else {
          setFeedbackText(prev => prev + (prev ? '\n' : '') + url);
        }
      } else {
        toast.error(res.data.message || '上传失败');
      }
    } catch { toast.error('图片上传失败'); }
    setUploadingImg(false);
    if (e.target) e.target.value = '';
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await api.delete(`/notifications/${id}`);
      if (res.data.code === 0) {
        setNotifications(prev => prev.filter(n => n.id !== id));
        setExpandedId(prev => prev === id ? null : prev);
        fetchUnread();
        toast.success('已删除');
      } else {
        toast.error(res.data.message || '删除失败');
      }
    } catch { toast.error('删除失败'); }
  };

  const fetchOnlineStatus = useCallback(async () => {
    try {
      const feedbackUsers = new Set<number>();
      notifications.filter(n => n.type === 'feedback').forEach(n => {
        const m = n.content.match(/\[uid=(\d+)\]/);
        if (m) feedbackUsers.add(parseInt(m[1]));
        if (isAdmin && n.user_id) feedbackUsers.add(1);
      });
      if (!isAdmin) feedbackUsers.add(ADMIN_ID);
      feedbackUsers.add(user?.id || 0);
      const ids = [...feedbackUsers].join(',');
      if (!ids) return;
      const res = await api.get(`/online-status?userIds=${ids}`);
      if (res.data.code === 0) setOnlineStatus(res.data.data || {});
    } catch {}
  }, [notifications, isAdmin, user?.id]);

  useEffect(() => {
    if (showNotifications) { fetchOnlineStatus(); const t = setInterval(fetchOnlineStatus, 30000); return () => clearInterval(t); }
  }, [showNotifications, fetchOnlineStatus]);

  function stripUid(text: string) {
    return text ? text.replace(/\[uid=\d+\]/, '') : '';
  }

  function hasReply(text: string) {
    return text && text.includes('【管理员回复');
  }

  function parseReply(text: string) {
    if (!text) return { original: '', reply: '' };
    const idx = text.indexOf('【管理员回复');
    if (idx === -1) return { original: stripUid(text), reply: '' };
    return {
      original: stripUid(text.slice(0, idx)),
      reply: text.slice(idx),
    };
  }

  function renderSystemNotifications(items: any[]) {
    const filtered = notifTypeFilter === 'all' ? items : items.filter(n => n.type === notifTypeFilter);
    if (!items.length) {
      return (
        <div className="flex flex-col h-full min-h-0">
          <div className="flex-shrink-0 px-4 py-2 flex items-center gap-1 border-b border-[var(--border)]">
            {[
              { key: 'all', label: '全部' },
              { key: 'system', label: '系统' },
              { key: 'approval', label: '审核' },
              { key: 'share', label: '分享' },
              { key: 'security', label: '安全' },
            ].map(t => (
              <button key={t.key} onClick={() => { setExpandedId(null); setNotifTypeFilter(t.key); }}
                className={`px-2 py-1 text-[10px] rounded-lg transition-colors ${
                  notifTypeFilter === t.key ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                }`}>
                {t.label}
              </button>
            ))}
            <div className="flex-1" />
            <button onClick={markAllRead} className="px-2 py-1 text-[10px] rounded-lg text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors" title="全部标为已读">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
            </button>
            <button onClick={clearRead} className="px-2 py-1 text-[10px] rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors" title="清空已读">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center text-[var(--muted-foreground)] text-xs">暂无通知</div>
        </div>
      );
    }
    const sorted = [...filtered].sort((a, b) => (a.is_read === b.is_read ? 0 : a.is_read ? 1 : -1));
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex-shrink-0 px-4 py-2 flex items-center gap-1 border-b border-[var(--border)]">
          {[
            { key: 'all', label: '全部' },
            { key: 'system', label: '系统' },
            { key: 'approval', label: '审核' },
            { key: 'share', label: '分享' },
            { key: 'security', label: '安全' },
          ].map(t => (
            <button key={t.key} onClick={() => { setExpandedId(null); setNotifTypeFilter(t.key); }}
              className={`px-2 py-1 text-[10px] rounded-lg transition-colors ${
                notifTypeFilter === t.key ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
              }`}>
              {t.label}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={markAllRead} className="px-2 py-1 text-[10px] rounded-lg text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors" title="全部标为已读">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          </button>
          <button onClick={clearRead} className="px-2 py-1 text-[10px] rounded-lg text-[var(--muted-foreground)] hover:bg-[var(--muted)] transition-colors" title="清空已读">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-[var(--muted-foreground)]">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-2 opacity-30">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
              </svg>
              <span className="text-xs">暂无{notifTypeFilter === 'all' ? '' : '该分类'}通知</span>
            </div>
          ) : sorted.map((n: any) => {
            const isRead = n.is_read;
            const summary = (n.content || '').split('\n').find((l: string) => l.trim()) || '';
            const isExpanded = expandedId === n.id;
            const typeLabel: Record<string, string> = { system: '系统', approval: '审核', share: '分享', security: '安全', info: '通知' };
            const typeColor: Record<string, string> = { system: 'bg-blue-500/10 text-blue-600 dark:text-blue-400', approval: 'bg-amber-500/10 text-amber-600 dark:text-amber-400', share: 'bg-green-500/10 text-green-600 dark:text-green-400', security: 'bg-red-500/10 text-red-600 dark:text-red-400', info: 'bg-gray-500/10 text-gray-600 dark:text-gray-400' };
            return (
              <div key={n.id} data-nid={n.id} className={`group border-b border-[var(--border)] last:border-b-0 transition-colors ${isRead ? '' : 'bg-[var(--primary)]/[0.02]'}`}>
                <div className="flex cursor-pointer hover:bg-[var(--muted)]/30 transition-colors"
                  onClick={() => {
                    if (isExpanded) { setExpandedId(null); }
                    else {
                      setExpandedId(n.id);
                      if (!isRead) {
                        setNotifications(prev => prev.map(item =>
                          item.id === n.id ? { ...item, is_read: 1 } : item
                        ));
                        setUnreadCount(prev => Math.max(0, prev - 1));
                        markRead(n.id);
                      }
                    }
                  }}
                >
                  <div className={`w-[3px] flex-shrink-0 self-stretch ${!isRead ? 'bg-[var(--primary)]' : ''}`} />
                  <div className="flex-1 min-w-0 px-3 py-3">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      {!isRead && <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] flex-shrink-0" />}
                      <div className={`text-sm truncate ${isRead ? 'text-[var(--muted-foreground)] font-normal' : 'text-[var(--foreground)] font-semibold'}`}>
                        {n.title || '系统通知'}
                      </div>
                      <span className={`text-[9px] px-1.5 py-[1px] rounded-full flex-shrink-0 ${typeColor[n.type] || 'bg-gray-500/10 text-gray-600'}`}>
                        {typeLabel[n.type] || n.type}
                      </span>
                      <div className="flex-1" />
                      <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0 whitespace-nowrap">{(n.created_at || '').slice(0, 16)}</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`flex-shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                      <button onClick={e => { e.stopPropagation(); handleDelete(n.id); }}
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--destructive)]/10 text-[var(--destructive)] transition-all flex-shrink-0" title="删除">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
                <div ref={el => {
                  if (el) contentHeights.current.set(n.id, el);
                  else contentHeights.current.delete(n.id);
                }}
                style={{
                  overflow: 'hidden',
                  transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  willChange: 'height',
                }}>
                  <div className="px-3 pb-3 text-sm text-[var(--muted-foreground)] whitespace-pre-wrap break-words leading-relaxed">{n.content || ''}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderFeedback(items: any[]) {
    const sorted = [...items].sort((a, b) => a.created_at?.localeCompare(b.created_at || '') || 0);

    if (isAdmin) {
      const groups: Record<string, { msgs: any[]; uid: number }> = {};
      sorted.forEach((n: any) => {
        const uidMatch = n.content.match(/\[uid=(\d+)\]/);
        const uid = uidMatch ? parseInt(uidMatch[1]) : 0;
        const userName = n.title?.startsWith('系统反馈: ') ? n.title.slice(5) : '未知用户';
        if (!groups[userName]) groups[userName] = { msgs: [], uid };
        groups[userName].msgs.push(n);
      });

      const userNames = Object.keys(groups).sort((a, b) => {
        const lastA = groups[a].msgs[groups[a].msgs.length - 1]?.created_at || '';
        const lastB = groups[b].msgs[groups[b].msgs.length - 1]?.created_at || '';
        return lastB.localeCompare(lastA);
      });

      function getChatMessages(msgs: any[]) {
        const chat: { text: string; time: string; isAdmin: boolean; notifId: number }[] = [];
        msgs.forEach((n: any) => {
          const { original, reply } = parseReply(n.content);
          const replies: { text: string; time: string }[] = [];
          if (reply) {
            const parts = reply.split(/(?=【管理员回复)/);
            parts.forEach((p: string) => {
              const tMatch = p.match(/【管理员回复 ([^】]+)】\n?(.*)/s);
              if (tMatch) replies.push({ text: tMatch[2], time: tMatch[1] });
            });
          }
          if (original.trim()) {
            chat.push({ text: original, time: (n.created_at || '').slice(0, 16), isAdmin: false, notifId: n.id });
          }
          replies.forEach(r => {
            chat.push({ text: r.text, time: r.time, isAdmin: true, notifId: n.id });
          });
        });
        chat.sort((a, b) => a.time.localeCompare(b.time) || 0);
        return chat;
      }

      const selectedMsgs = expandedGroup ? groups[expandedGroup]?.msgs : null;
      const chatMessages = selectedMsgs ? getChatMessages(selectedMsgs) : [];
      const lastUserNotif = selectedMsgs ? [...selectedMsgs].reverse().find((m: any) => m.title?.includes('系统反馈')) : null;
      const targetNotifId = lastUserNotif?.id || selectedMsgs?.[selectedMsgs.length - 1]?.id || 0;

      const handleExpandGroup = (un: string) => {
        if (expandedGroup === un) {
          setExpandedGroup(null);
        } else {
          setExpandedGroup(un);
          const msgs = groups[un].msgs;
          msgs.forEach((m: any) => {
            if (!m.is_read) {
              setNotifications(prev => prev.map(item => item.id === m.id ? { ...item, is_read: 1 } : item));
              markRead(m.id);
            }
          });
          fetchUnread();
        }
      };

      const handleGroupDelete = async (un: string) => {
        const g = groups[un];
        const uidMatch = g.msgs[0]?.content.match(/\[uid=(\d+)\]/);
        const targetUid = uidMatch ? parseInt(uidMatch[1]) : 0;
        if (!targetUid) return;
        try {
          const res = await api.delete(`/notifications/group/${targetUid}`);
          if (res.data.code === 0) {
            setNotifications(prev => prev.filter(n => {
              const m = n.content.match(/\[uid=(\d+)\]/);
              const nid = m ? parseInt(m[1]) : 0;
              return !(n.type === 'feedback' && (nid === targetUid || (n.user_id === targetUid)));
            }));
            setExpandedGroup(prev => prev === un ? null : prev);
            fetchUnread();
            toast.success('会话已删除');
          } else {
            toast.error(res.data.message || '删除失败');
          }
        } catch { toast.error('删除失败'); }
      };

      const sendGroupReply = async () => {
        if (!groupReplyText.trim() || !targetNotifId) return;
        setSendingGroupReply(true);
        try {
          const res = await api.post(`/notifications/${targetNotifId}/reply`, { content: groupReplyText.trim() });
          if (res.data.code === 0) {
            toast.success('回复已发送');
            setGroupReplyText('');
            const notifRes = await api.get('/notifications');
            if (notifRes.data.code === 0) setNotifications(notifRes.data.data || []);
          } else {
            toast.error(res.data.message || '回复失败');
          }
        } catch { toast.error('回复失败'); }
        setSendingGroupReply(false);
      };

      return (
        <div className="flex flex-col h-full min-h-0">
          <ConfirmModal
            open={!!confirmGroupDelete}
            title="删除会话"
            message="确定要删除与该用户的全部反馈会话吗？此操作不可撤销。"
            onConfirm={() => { if (confirmGroupDelete) { handleGroupDelete(confirmGroupDelete); setConfirmGroupDelete(null); } }}
            onCancel={() => setConfirmGroupDelete(null)}
            danger
          />
          {!expandedGroup ? (
            <div className="flex-1 overflow-y-auto min-h-0">
              {!userNames.length ? (
                <div className="text-center py-12 text-[var(--muted-foreground)] text-xs">暂无反馈</div>
              ) : (
                userNames.map(un => {
                  const g = groups[un];
                  const hasUnread = g.msgs.some((m: any) => !m.is_read);
                  const isOnline = onlineStatus[g.uid];
                  return (
                    <div key={un} className="flex items-center border-b border-[var(--border)] group">
                      <button onClick={() => handleExpandGroup(un)}
                        className="flex-1 flex items-center gap-2 px-4 py-3 hover:bg-[var(--muted)]/50 transition-colors text-left">
                        {hasUnread && <div className="w-2 h-2 rounded-full bg-[var(--primary)] flex-shrink-0" />}
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <span className={`text-sm flex-1 truncate ${hasUnread ? 'font-medium text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>
                          {un}
                        </span>
                        <span className="text-[10px] text-[var(--muted-foreground)]">{isOnline ? '在线' : '不在线'}</span>
                        <span className="text-[10px] text-[var(--muted-foreground)] ml-1">{g.msgs.length}条</span>
                      </button>
                      <button onClick={() => setConfirmGroupDelete(un)}
                        className="p-2 opacity-0 group-hover:opacity-100 hover:bg-[var(--destructive)]/10 text-[var(--destructive)] hover:opacity-70 transition-all" title="删除会话">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/20 flex-shrink-0">
                <button onClick={() => setExpandedGroup(null)} className="p-1 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)]" title="返回">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                </button>
                <span className={`w-1.5 h-1.5 rounded-full ${onlineStatus[groups[expandedGroup]?.uid] ? 'bg-green-500' : 'bg-gray-300'}`} />
                <span className="text-sm font-medium text-[var(--foreground)]">{expandedGroup}</span>
                <span className="text-[10px] text-[var(--muted-foreground)]">{onlineStatus[groups[expandedGroup]?.uid] ? '在线' : '不在线'}</span>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-3">
                {!chatMessages.length && <div className="text-center py-6 text-[var(--muted-foreground)] text-xs">暂无消息</div>}
                {chatMessages.map((msg, i) => (
                  msg.isAdmin ? (
                    <div key={i} className="flex justify-end">
                      <div className="max-w-[80%]">
                        <div className="text-[10px] text-[var(--muted-foreground)] mb-1 text-right">{msg.time}</div>
                        <div className="px-3 py-2 rounded-2xl rounded-tr-sm bg-[#007AFF] text-white text-sm whitespace-pre-wrap break-words">
                          {renderContent(msg.text, (url, type) => { setPreviewUrl(url); setPreviewType(type); })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div key={i} className="flex justify-start">
                      <div className="max-w-[80%]">
                        <div className="text-[10px] text-[var(--muted-foreground)] mb-1">{msg.time}</div>
                        <div className="px-3 py-2 rounded-2xl rounded-tl-sm bg-[var(--muted)] text-[var(--foreground)] text-sm relative group">
                          <div className="whitespace-pre-wrap break-words">
                            {renderContent(msg.text, (url, type) => { setPreviewUrl(url); setPreviewType(type); })}
                          </div>
                          <button onClick={() => handleDelete(msg.notifId)} className="absolute -top-1.5 -right-1.5 opacity-0 group-hover:opacity-100 p-0.5 rounded-full bg-[var(--background)] shadow border border-[var(--border)] hover:bg-[var(--destructive)]/10 text-[var(--destructive)] transition-opacity" title="删除">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
              <div className="flex-shrink-0 px-3 py-2.5 flex gap-2 bg-[var(--background)]">
                <input value={groupReplyText}
                  onChange={e => setGroupReplyText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroupReply(); } }}
                  placeholder="输入回复..." className="flex-1 px-3 py-1.5 text-sm rounded-xl bg-[var(--muted)]/30 outline-none" />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImg}
                  className="p-1.5 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors disabled:opacity-50" title="上传图片">
                  {uploadingImg ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  )}
                </button>
                <button onClick={sendGroupReply} disabled={sendingGroupReply || !groupReplyText.trim()}
                  className="px-3 py-1.5 text-sm rounded-xl bg-[#007AFF] text-white font-medium disabled:opacity-50">发送</button>
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
              </div>
            </div>
          )}
        </div>
      );
    }

    const adminOnline = onlineStatus[ADMIN_ID];

    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)] bg-[var(--muted)]/20 flex-shrink-0">
          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${adminOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
          <span className="text-sm font-medium text-[var(--foreground)]">管理员</span>
          <span className="text-[10px] text-[var(--muted-foreground)]">{adminOnline ? '在线' : '不在线'}</span>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-4">
          {!sorted.length && (
            <div className="text-center py-12 text-[var(--muted-foreground)] text-xs">暂无反馈，您可以发送问题给管理员</div>
          )}
          {sorted.map((n: any) => {
            const { original, reply } = parseReply(n.content);
            const hasReplyContent = hasReply(n.content);
            return (
              <div key={n.id} className="space-y-2 group">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[var(--muted-foreground)]">{(n.created_at || '').slice(0, 16)}</span>
                  <div className="flex items-center gap-1.5">
                    {!n.is_read && !hasReplyContent && n.title !== '系统反馈' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--primary)]">未读</span>
                    )}
                    {hasReplyContent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--primary)]/10 text-[var(--foreground)] font-medium">已回复</span>
                    )}
                    {n.is_read && !hasReplyContent && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">已读</span>
                    )}
                    <button onClick={() => handleDelete(n.id)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-opacity" title="删除">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>
                  </div>
                </div>
                {n.title === '系统反馈' && (
                  <div className="flex justify-start">
                    <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tl-sm bg-[var(--muted)] text-[var(--foreground)] text-sm">
                      <div className="whitespace-pre-wrap break-words">
                        {renderContent(original, (url, type) => { setPreviewUrl(url); setPreviewType(type); })}
                      </div>
                    </div>
                  </div>
                )}
                {n.title === '管理员回复' && (
                  <div className="flex justify-end">
                    <div className="max-w-[80%] px-3 py-2 rounded-2xl rounded-tr-sm bg-[#007AFF] text-white text-sm">
                      <div className="whitespace-pre-wrap break-words">
                        {renderContent(n.content, (url, type) => { setPreviewUrl(url); setPreviewType(type); })}
                      </div>
                    </div>
                  </div>
                )}
                {n.title === '系统反馈' && !hasReplyContent && (
                  <div className="flex justify-end mt-1">
                    <div className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">等待管理员回复</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex-shrink-0 px-3 py-2.5 flex gap-2 bg-[var(--background)]">
          <input
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitFeedback(); } }}
            placeholder="输入您的问题或建议..."
            className="flex-1 px-3 py-1.5 text-sm rounded-xl bg-[var(--muted)]/30 outline-none"
          />
          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingImg}
            className="p-1.5 rounded-xl hover:bg-[var(--muted)] text-[var(--muted-foreground)] transition-colors disabled:opacity-50" title="上传图片">
            {uploadingImg ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="animate-spin"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
            )}
          </button>
          <button onClick={submitFeedback} disabled={submitting || !feedbackText.trim()}
            className="px-3 py-1.5 text-sm rounded-xl bg-[#007AFF] text-white font-medium disabled:opacity-50">发送</button>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
        </div>
      </div>
    );
  }

  const systemNotifications = notifications.filter((n: any) => n.type !== 'feedback' && n.type !== 'contact');
  const feedbackNotifications = notifications.filter((n: any) => n.type === 'feedback');
  const unreadSystem = systemNotifications.filter((n: any) => !n.is_read).length;
  const unreadFeedback = feedbackNotifications.filter((n: any) => !n.is_read).length;

  const dockActions = [
    {
      title: '侧边栏',
      icon: <MenuIcon size={16} />,
      onClick: onToggleSidebar,
    },
    {
      title: '消息通知',
      icon: (
        <div className="relative">
          <BellIcon size={16} />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-4 flex items-center justify-center px-0.5 shadow-sm">{unreadCount > 9 ? '9+' : unreadCount}</span>
          )}
        </div>
      ),
      onClick: openNotifications,
    },
    {
      title: dark ? '浅色模式' : '深色模式',
      icon: dark ? <SunIcon size={16} /> : <MoonIcon size={16} />,
      onClick: onToggleTheme,
    },
  ];

  return (
    <>
      {/* Desktop Dock - 1:1 from hr-office */}
      <div className="hidden md:block fixed bottom-8 z-50" style={{ left: 'calc(16rem + 1rem)' }}>
        <div className="flex items-end gap-2 rounded-xl bg-[#E5E7EB] dark:bg-[#292929] px-2 pb-2 shadow-sm dark:shadow-white/5 h-12">
          {dockActions.map((item, idx) => (
            <DockIcon key={idx} title={item.title} onClick={item.onClick}>
              {item.icon}
            </DockIcon>
          ))}
        </div>
      </div>

      {/* Mobile Dock - expanded menu */}
      <div className="md:hidden fixed bottom-20 right-4 z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex flex-col gap-2 items-end"
            >
              {dockActions.map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10, transition: { delay: idx * 0.05 } }}
                  transition={{ delay: (dockActions.length - 1 - idx) * 0.05 }}
                >
                  <button
                    type="button"
                    onClick={() => { item.onClick(); setMobileOpen(false); }}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--muted)] text-[var(--foreground)] shadow dark:bg-[#292929]"
                  >
                    {item.icon}
                  </button>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#E5E7EB] dark:bg-[#292929] shadow-sm"
          aria-expanded={mobileOpen}
        >
          <motion.div animate={{ rotate: mobileOpen ? 180 : 0 }} transition={{ duration: 0.3, ease: 'easeInOut' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-[var(--foreground)]"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
          </motion.div>
        </button>
      </div>

      {/* Notification Modal */}
      {(showNotifications || notifClosing) && (
        <div className={`fixed inset-0 z-[60] flex items-center justify-center ${notifClosing ? 'animate-modal-leave' : 'animate-modal-enter'}`} onClick={closeNotif}>
          <div className={`bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-[92vw] sm:w-[520px] h-[55vh] flex flex-col ${notifClosing ? 'animate-modal-content-leave' : 'animate-modal-content-enter'}`} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
              <h3 className="text-[var(--foreground)] text-sm font-semibold">消息通知 {unreadCount > 0 && `(${unreadCount}条未读)`}</h3>
              <button onClick={closeNotif} className="p-1 hover:bg-[var(--accent)] rounded-lg">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            <div className="flex-1 flex overflow-hidden min-h-0">
              {!notifications.length ? (
                <div className="flex-1 text-center py-12 text-[var(--muted-foreground)] text-sm">暂无通知</div>
              ) : (
                <>
                  <div className="w-28 sm:w-32 flex-shrink-0 border-r border-[var(--border)] overflow-y-auto bg-[var(--muted)]/20">
                    {[
                      { key: 'system', label: '系统通知', unread: unreadSystem },
                      { key: 'feedback', label: '意见反馈', unread: unreadFeedback },
                    ].map(cat => (
                      <button key={cat.key} onClick={() => { setExpandedId(null); setNotifTab(cat.key); }}
                        className={`w-full px-3 py-3 text-left text-xs transition-colors ${
                          notifTab === cat.key ? 'bg-[var(--background)] text-[var(--primary)] font-medium' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]'
                        }`}>
                        <div className="flex items-center justify-between">
                          <span>{cat.label}</span>
                          {cat.unread > 0 && <span className="bg-[var(--destructive)] text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{cat.unread}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex-1 min-h-0 flex flex-col">
                    <div className="flex-1 overflow-y-auto min-h-0">
                      {notifTab === 'feedback' ? renderFeedback(feedbackNotifications) : renderSystemNotifications(systemNotifications)}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {(previewUrl || previewClosing) && (
        <div className={`fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 ${previewClosing ? 'animate-modal-leave' : 'animate-modal-enter'}`} onClick={closePreview}>
          <div className="max-w-[90vw] max-h-[85vh] flex items-center justify-center" onClick={e => e.stopPropagation()}>
            {previewType === 'image' ? (
              <img src={previewUrl} className="max-w-full max-h-[85vh] object-contain rounded-lg" alt="" />
            ) : previewType === 'video' ? (
              <video src={previewUrl} controls className="max-w-full max-h-[85vh] rounded-lg" autoPlay />
            ) : previewType === 'audio' ? (
              <div className="bg-[var(--background)] rounded-2xl p-8 flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-[var(--primary)]/10 flex items-center justify-center">
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth={1.5}><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
                </div>
                <audio src={previewUrl} controls className="w-full max-w-sm" autoPlay />
              </div>
            ) : null}
            <button onClick={closePreview} className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function DockIcon({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex items-center justify-center w-9 h-9 rounded-full bg-[var(--muted)] dark:bg-[#292929] text-[var(--foreground)] dark:text-white transition-colors hover:bg-gray-300 dark:hover:bg-[#333]"
    >
      {children}
      <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-0.5 text-xs text-[var(--foreground)] opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-sm">
        {title}
      </span>
    </button>
  );
}
