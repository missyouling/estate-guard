import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import type { LoginLog } from '@/types';

function passwordStrength(pwd: string): { level: 'weak' | 'medium' | 'strong'; label: string; color: string } {
  if (!pwd) return { level: 'weak', label: '', color: '' };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  if (score <= 1) return { level: 'weak', label: '弱', color: '#FF3B30' };
  if (score <= 3) return { level: 'medium', label: '中', color: '#FF9500' };
  return { level: 'strong', label: '强', color: '#34C759' };
}

const PAGE_SIZE = 5;

export default function AccountSecurity() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [usernameLoading, setUsernameLoading] = useState(false);
  const [usernameError, setUsernameError] = useState('');
  const [usernameAvail, setUsernameAvail] = useState<boolean | null>(null);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [pwdStrength, setPwdStrength] = useState(passwordStrength(''));
  const [pwdLoading, setPwdLoading] = useState(false);
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user?.username) setUsername(user.username);
    setLogsLoading(true);
    api.get('/user/login-history').then(r => {
      if (r.data.code === 0) setLoginLogs(r.data.data || []);
    }).catch(() => {}).finally(() => setLogsLoading(false));
  }, [user]);

  useEffect(() => {
    setPwdStrength(passwordStrength(newPwd));
  }, [newPwd]);

  const validateUsername = (v: string) => {
    if (!v) { setUsernameError(''); setUsernameAvail(null); return; }
    if (v.length < 4 || v.length > 20) { setUsernameError('用户名长度为 4-20 个字符'); setUsernameAvail(null); return; }
    if (!/^[a-zA-Z][a-zA-Z0-9_]{3,19}$/.test(v)) { setUsernameError('字母开头，仅支持字母、数字、下划线'); setUsernameAvail(null); return; }
    setUsernameError('');
    if (v !== user?.username) {
      setUsernameChecking(true);
      api.get('/user/username-check', { params: { username: v } }).then(r => {
        setUsernameAvail(r.data.data?.available ?? false);
      }).catch(() => setUsernameAvail(null)).finally(() => setUsernameChecking(false));
    } else {
      setUsernameAvail(null);
    }
  };

  const handleSetUsername = async () => {
    if (!username.trim()) { toast.error('请输入用户名'); return; }
    if (usernameError) { toast.error(usernameError); return; }
    if (usernameAvail === false) { toast.error('用户名已被占用'); return; }
    setUsernameLoading(true);
    try {
      const res = await api.patch('/user/me', { username: username.trim() });
      if (res.data.code === 0) {
        toast.success('用户名设置成功');
        if (user) setAuth(useAuthStore.getState().token!, { ...user, username: username.trim() });
      } else { toast.error(res.data.message || '设置失败'); }
    } catch (err: any) { toast.error(err.response?.data?.message || '设置失败'); }
    finally { setUsernameLoading(false); }
  };

  const handleChangePwd = async () => {
    if (!oldPwd || !newPwd) { toast.error('请填写完整'); return; }
    if (newPwd.length < 6) { toast.error('新密码至少6位'); return; }
    if (newPwd !== newPwd2) { toast.error('两次密码不一致'); return; }
    setPwdLoading(true);
    try {
      const res = await api.patch('/user/me', { old_password: oldPwd, new_password: newPwd });
      if (res.data.code === 0) {
        toast.success('密码修改成功');
        setOldPwd(''); setNewPwd(''); setNewPwd2('');
      } else { toast.error(res.data.message || '修改失败'); }
    } catch (err: any) { toast.error(err.response?.data?.message || '修改失败'); }
    finally { setPwdLoading(false); }
  };

  const isAbnormal = useMemo(() => {
    if (loginLogs.length < 2) return new Set<number>();
    const ipCount: Record<string, number> = {};
    loginLogs.forEach(l => { ipCount[l.ip] = (ipCount[l.ip] || 0) + 1; });
    const abnormal = new Set<number>();
    loginLogs.forEach(l => {
      const isRareIp = !l.ip || ipCount[l.ip] === 1;
      const isUnknownDevice = !l.device || l.device === '未知设备' || l.device === '未知';
      if (isRareIp || isUnknownDevice) abnormal.add(l.id);
    });
    return abnormal;
  }, [loginLogs]);

  const hasMore = visibleCount < loginLogs.length;

  const loadMore = useCallback(() => {
    if (hasMore) setVisibleCount(prev => Math.min(prev + PAGE_SIZE, loginLogs.length));
  }, [hasMore, loginLogs.length]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadMore();
    }, { rootMargin: '100px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const LogRow = ({ log }: { log: LoginLog }) => {
    const abnormal = isAbnormal.has(log.id);
    return (
      <div className="flex items-center justify-between py-1.5 border-b border-[var(--border)] last:border-0 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)] flex-shrink-0">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" /><circle cx="12" cy="9" r="2.5" />
          </svg>
          <span className="text-xs text-[var(--foreground)] truncate">{log.device || '未知设备'}</span>
          <span className="text-[10px] text-[var(--muted-foreground)] hidden sm:inline">IP {log.ip || '未知'}</span>
          {abnormal && <span className="text-[9px] px-1 py-[1px] rounded bg-red-500/10 text-[var(--destructive)] font-medium flex-shrink-0">异常</span>}
        </div>
        <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0">{(log.created_at || '').slice(0, 16)}</span>
      </div>
    );
  };

  return (
    <div className="pr-1 flex flex-col min-h-0 h-full">
      {/* Section 1: 登录凭证管理 */}
      <div className="flex-shrink-0">
        <div className="mb-1">
          <h3 className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider mb-2">登录凭证管理</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          {/* 用户名设置 */}
          <div>
            <div className="mb-2">
              <h4 className="text-sm font-semibold text-[var(--foreground)]">用户名</h4>
              <p className="text-[10px] text-[var(--muted-foreground)] leading-normal">设置后可用于登录，4-20 位字母开头，仅支持字母、数字、下划线</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input type="text" value={username} onChange={e => { setUsername(e.target.value); validateUsername(e.target.value); }}
                  placeholder="设置用户名"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all" />
                {usernameChecking && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">检测中...</span>}
                {usernameAvail === true && !usernameError && username !== user?.username && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-green-500">可用</span>
                )}
                {usernameAvail === false && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-red-500">已被占用</span>
                )}
              </div>
              <button onClick={handleSetUsername} disabled={usernameLoading || !!usernameError || usernameAvail === false}
                className="px-3 py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-60 whitespace-nowrap">
                {usernameLoading ? '保存中...' : (user?.username ? '修改' : '设置')}
              </button>
            </div>
            {usernameError && <p className="text-[10px] text-[var(--destructive)] mt-1">{usernameError}</p>}
          </div>

          {/* 修改密码 */}
          <div>
            <div className="mb-2">
              <h4 className="text-sm font-semibold text-[var(--foreground)]">修改密码</h4>
              <p className="text-[10px] text-[var(--muted-foreground)] leading-normal">修改后需重新登录，其他已登录设备自动下线</p>
            </div>
            <div className="space-y-1.5">
              <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} placeholder="当前密码"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)]" />
              <div>
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="新密码（至少6位）"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)]" />
                {newPwd && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-1 rounded-full bg-[var(--muted)] overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{
                        width: pwdStrength.level === 'weak' ? '33%' : pwdStrength.level === 'medium' ? '66%' : '100%',
                        backgroundColor: pwdStrength.color,
                      }} />
                    </div>
                    <span className="text-[9px]" style={{ color: pwdStrength.color }}>{pwdStrength.label}</span>
                  </div>
                )}
              </div>
              <input type="password" value={newPwd2} onChange={e => setNewPwd2(e.target.value)} placeholder="确认新密码"
                className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)]" />
              <button onClick={handleChangePwd} disabled={pwdLoading}
                className="w-full py-1.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-60">
                {pwdLoading ? '修改中...' : '确认修改'}
              </button>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-[var(--border)] mb-2" />
      </div>

      {/* Section 2: 登录安全记录 */}
      <div className="flex flex-col min-h-0 flex-1">
        <h3 className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider mb-2 flex-shrink-0">登录安全记录</h3>
        <div className="flex-1 overflow-y-auto min-h-0" style={{ maxHeight: '280px' }}>
          {logsLoading ? (
            <p className="text-xs text-[var(--muted-foreground)] py-4">加载中...</p>
          ) : loginLogs.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)] py-4">暂无登录记录</p>
          ) : (
            <>
              {loginLogs.slice(0, visibleCount).map((log) => (
                <LogRow key={log.id} log={log} />
              ))}
              {hasMore && (
                <div ref={sentinelRef} className="flex items-center justify-center py-3 text-[10px] text-[var(--muted-foreground)]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="animate-spin mr-1"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                  加载中...
                </div>
              )}
              {!hasMore && loginLogs.length > 0 && (
                <div className="text-center py-3 text-[10px] text-[var(--muted-foreground)]">没有更多了</div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
