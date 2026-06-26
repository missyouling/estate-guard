import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSiteConfigStore } from '@/stores/siteConfigStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Header({ onMenuClick, onTitleClick }: {
  onMenuClick: () => void;
  onTitleClick: () => void;
}) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const siteName = useSiteConfigStore((s) => s.siteName);
  const fetchSiteConfig = useSiteConfigStore((s) => s.fetch);
  const [showUser, setShowUser] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ username: '', email: '', oldPassword: '', newPassword: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchSiteConfig(); }, [fetchSiteConfig]);

  const handleLogout = () => {
    useAuthStore.getState().logout();
    window.location.href = '/login';
  };

  const openEdit = () => {
    setEditForm({
      username: user?.username || '',
      email: user?.email || '',
      oldPassword: '',
      newPassword: '',
    });
    setEditing(true);
    setShowUser(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: any = {};
      if (editForm.username !== (user?.username || '')) body.username = editForm.username;
      if (editForm.email !== (user?.email || '')) body.email = editForm.email;
      if (editForm.newPassword) {
        body.old_password = editForm.oldPassword;
        body.new_password = editForm.newPassword;
      }

      if (Object.keys(body).length === 0) {
        toast.error('无修改内容');
        setSaving(false);
        return;
      }

      const res = await api.patch('/user/me', body);
      if (res.data.code === 0) {
        toast.success('信息已更新');
        const me = await api.get('/user/me');
        if (me.data.code === 0) {
          const updated = me.data.data;
          setAuth(useAuthStore.getState().token!, {
            id: updated.id,
            username: updated.username,
            role: updated.role,
            name: updated.name,
            phone: updated.phone,
            id_card: updated.id_card,
            email: updated.email,
            room_number: updated.room_number,
            status: updated.status,
            register_method: updated.register_method,
            created_at: updated.created_at,
          });
        }
        setEditing(false);
      } else {
        toast.error(res.data.message || '修改失败');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || '修改失败');
    } finally { setSaving(false); }
  };

  return (
    <header className="sticky top-0 z-30 bg-[var(--card)]/80 backdrop-blur-md border-b border-white/50 shadow-sm">
      <div className="max-w-7xl mx-auto flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 -ml-2 text-[var(--foreground)] hover:bg-black/5 rounded-lg transition-colors"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          <button onClick={onTitleClick} className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-[var(--foreground)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#007AFF" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v1m0 4v1" />
            </svg>
            {siteName}
          </button>
        </div>

        <div className="relative">
          <button onClick={() => setShowUser(!showUser)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-full hover:bg-black/5 transition-colors">
            <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-sm font-bold">
              {user?.name?.[0] || '?'}
            </div>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2} strokeLinecap="round" className={`text-[var(--muted-foreground)] transition-transform ${showUser ? 'rotate-180' : ''}`}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {showUser && (
            <div className="fixed inset-0 z-40" onClick={() => setShowUser(false)}>
              <div className="absolute right-0 top-full mt-2 w-72 bg-[var(--card)]/80 backdrop-blur-md rounded-2xl shadow-xl z-50 border border-[var(--border)] overflow-hidden"
                style={{ right: '1rem', top: '3.5rem' }}
                onClick={e => e.stopPropagation()}>
                <div className="p-5 border-b border-[var(--border)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-lg font-bold flex-shrink-0">
                      {user?.name?.[0] || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{user?.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{user?.role === 'admin' ? '管理员' : '业主'}</div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <InfoRow label="用户名" value={user?.username} />
                    {user?.room_number && <InfoRow label="房号" value={user.room_number} />}
                    <InfoRow label="手机号" value={user?.phone} />
                    <InfoRow label="身份证" value={user?.id_card} />
                    <InfoRow label="邮箱" value={user?.email} />
                    <InfoRow label="注册日期" value={user?.created_at?.split(' ')[0]} />
                  </div>
                </div>

                <div className="p-2 space-y-1">
                  <button onClick={openEdit}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    编辑个人信息
                  </button>
                  <button onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--destructive)] hover:bg-[var(--destructive)]/10 transition-colors">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    退出登录
                  </button>
                </div>
              </div>
            </div>
          )}

          {editing && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }} onClick={() => setEditing(false)}>
              <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="text-[var(--foreground)] text-lg font-bold">编辑个人信息</h3>
                    <button onClick={() => setEditing(false)} className="p-1 hover:bg-black/5 rounded-lg">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">姓名</label>
                      <input readOnly value={user?.name || ''}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">房号</label>
                      <input readOnly value={user?.room_number || ''}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">手机号</label>
                      <input readOnly value={user?.phone || ''}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">身份证</label>
                      <input readOnly value={user?.id_card || ''}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">注册日期</label>
                      <input readOnly value={user?.created_at?.split(' ')[0] || ''}
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--muted)]/50 text-sm text-[var(--muted-foreground)] cursor-not-allowed" />
                    </div>
                    <div className="border-t border-[var(--border)]" />
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">登录用户名</label>
                      <input type="text" value={editForm.username} onChange={e => setEditForm(p => ({...p, username: e.target.value}))}
                        placeholder="登录用户名"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">电子邮箱</label>
                      <input type="email" value={editForm.email} onChange={e => setEditForm(p => ({...p, email: e.target.value}))}
                        placeholder="电子邮箱"
                        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all" />
                    </div>
                    <div className="border-t border-[var(--border)] pt-1">
                      <label className="text-xs text-[var(--muted-foreground)] block mb-1">修改密码（留空不修改）</label>
                      <div className="space-y-2">
                        <input type="password" value={editForm.oldPassword} onChange={e => setEditForm(p => ({...p, oldPassword: e.target.value}))}
                          placeholder="当前密码"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all" />
                        <input type="password" value={editForm.newPassword} onChange={e => setEditForm(p => ({...p, newPassword: e.target.value}))}
                          placeholder="新密码（至少6位）"
                          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all" />
                      </div>
                    </div>

                    <button onClick={handleSave} disabled={saving}
                      className="w-full py-2.5 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 transition-colors disabled:opacity-60">
                      {saving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </div>
          )}
        </div>
      </div>
    </header>
  );
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="font-medium">{value || '-'}</span>
    </div>
  );
}
