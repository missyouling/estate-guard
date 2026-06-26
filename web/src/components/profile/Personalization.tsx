import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';

export default function Personalization() {
  const smsConfigured = useAuthStore((s) => s.smsConfigured);
  const setSmsConfigured = useAuthStore((s) => s.setSmsConfigured);
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifSms, setNotifSms] = useState(false);
  const [notifApproval, setNotifApproval] = useState(true);
  const [notifShare, setNotifShare] = useState(true);
  const [notifSystem, setNotifSystem] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get('/user/notification-prefs').then(r => {
      if (r.data.code === 0) {
        setNotifEmail(!!r.data.data?.email_enabled);
        setNotifSms(!!r.data.data?.sms_enabled);
      }
    }).finally(() => setLoading(false));
    api.get('/user/sms-status').then(r => {
      if (r.data.code === 0) setSmsConfigured(!!r.data.data?.configured);
    }).catch(() => {});
    const stored = localStorage.getItem('notif_types');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setNotifApproval(parsed.approval !== false);
        setNotifShare(parsed.share !== false);
        setNotifSystem(parsed.system !== false);
      } catch {}
    }
  }, []);

  const saveNotifPrefs = async () => {
    setSaving(true);
    try {
      const res = await api.patch('/user/notification-prefs', { email_enabled: notifEmail, sms_enabled: notifSms });
      if (res.data.code === 0) {
        localStorage.setItem('notif_types', JSON.stringify({ approval: notifApproval, share: notifShare, system: notifSystem }));
        toast.success('偏好已保存');
      } else { toast.error(res.data.message || '保存失败'); }
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : false;
  });

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: () => void }) => (
    <div className={`w-8 h-[18px] rounded-full transition-colors relative cursor-pointer flex-shrink-0 ${checked ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}`} onClick={onChange}>
      <div className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white transition-transform ${checked ? 'translate-x-full' : ''}`} />
    </div>
  );

  if (loading) return <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载中...</div>;

  return (
    <div>
      {/* 显示与浏览设置 */}
      <div className="mb-1">
        <h3 className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider mb-3">显示与浏览设置</h3>
      </div>
      <div className="space-y-0 mb-5">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm text-[var(--foreground)] whitespace-nowrap">深色模式</span>
            <span className="text-[10px] text-[var(--muted-foreground)] truncate">切换亮色/暗黑主题</span>
          </div>
          <Toggle checked={dark} onChange={toggleDark} />
        </div>
        <div className="flex items-center justify-between py-2 border-t border-[var(--border)]">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm text-[var(--foreground)] whitespace-nowrap">视频自动播放</span>
            <span className="text-[10px] text-[var(--muted-foreground)] truncate">仅影响本地显示效果，不修改服务端规则</span>
          </div>
          <div className={`w-8 h-[18px] rounded-full relative flex-shrink-0 bg-[var(--primary)] opacity-60`}>
            <div className={`absolute top-[2px] left-[2px] w-3.5 h-3.5 rounded-full bg-white translate-x-full`} />
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[var(--border)] mb-3" />

      {/* 通知偏好 */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">通知偏好</h3>
        <button onClick={saveNotifPrefs} disabled={saving}
          className="px-2.5 py-1 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-medium disabled:opacity-60">
          {saving ? '保存中...' : '保存偏好'}
        </button>
      </div>
      <p className="text-[10px] text-[var(--muted-foreground)] mb-3">站内通知始终开启，可选择补充渠道</p>

      <div className="space-y-0 mb-3">
        <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium mb-1">补充渠道</p>
        <div className="flex items-center justify-between py-1.5">
          <span className="text-sm text-[var(--foreground)]">邮件通知</span>
          <Toggle checked={notifEmail} onChange={() => setNotifEmail(!notifEmail)} />
        </div>
        {smsConfigured && (
          <div className="flex items-center justify-between py-1.5 border-t border-[var(--border)]">
            <span className="text-sm text-[var(--foreground)]">短信通知</span>
            <Toggle checked={notifSms} onChange={() => setNotifSms(!notifSms)} />
          </div>
        )}
      </div>

      <div className="space-y-0">
        <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium mb-1">通知类型订阅</p>
        <div className="flex items-center justify-between py-1.5">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm text-[var(--foreground)] whitespace-nowrap">审核结果通知</span>
            <span className="text-[10px] text-[var(--muted-foreground)] truncate">注册申请、信息变更等审核结果</span>
          </div>
          <Toggle checked={notifApproval} onChange={() => setNotifApproval(!notifApproval)} />
        </div>
        <div className="flex items-center justify-between py-1.5 border-t border-[var(--border)]">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm text-[var(--foreground)] whitespace-nowrap">分享通知</span>
            <span className="text-[10px] text-[var(--muted-foreground)] truncate">证据分享创建、访问等通知</span>
          </div>
          <Toggle checked={notifShare} onChange={() => setNotifShare(!notifShare)} />
        </div>
        <div className="flex items-center justify-between py-1.5 border-t border-[var(--border)]">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-sm text-[var(--foreground)] whitespace-nowrap">系统公告</span>
            <span className="text-[10px] text-[var(--muted-foreground)] truncate">物业发布的通知公告</span>
          </div>
          <Toggle checked={notifSystem} onChange={() => setNotifSystem(!notifSystem)} />
        </div>
      </div>
    </div>
  );
}
