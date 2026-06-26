import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import ProfileInfo from '@/components/profile/ProfileInfo';
import AccountSecurity from '@/components/profile/AccountSecurity';
import MyProperties from '@/components/profile/MyProperties';
import Personalization from '@/components/profile/Personalization';
import ChangeHistory from '@/components/profile/ChangeHistory';

const TABS = [
  { key: 'info', label: '基础档案', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { key: 'security', label: '账号安全', icon: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' },
  { key: 'properties', label: '我的房产', icon: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z' },
  { key: 'preferences', label: '个性化设置', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z' },
  { key: 'history', label: '变更记录', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
];

export default function AvatarProfile({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('info');
  const user = useAuthStore((s) => s.user);

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center p-2 sm:p-4 bg-black/40" onClick={onClose}>
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-[92vw] sm:w-[780px] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()} style={{ height: 'min(60vh, 520px)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] flex-shrink-0">
          <div className="flex items-center gap-2">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-[10px] font-bold">
                {user?.name?.[0] || '?'}
              </div>
            )}
            <div>
              <div className="text-xs font-semibold text-[var(--foreground)]">{user?.name}</div>
              <div className="text-[9px] text-[var(--muted-foreground)]">
                {user?.role === 'admin' ? '管理员' : '业主'}
                {user?.room_number && ` · ${user.room_number}`}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="p-1.5 hover:bg-[var(--accent)] rounded-lg text-[var(--muted-foreground)]">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body: left nav + right content */}
        <div className="flex flex-1 min-h-0">
          {/* Left sidebar navigation */}
          <nav className="w-36 flex-shrink-0 border-r border-[var(--border)] bg-[var(--muted)]/10 py-1 overflow-y-auto">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`relative w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors text-left ${
                  activeTab === tab.key
                    ? 'text-[var(--primary)] font-medium bg-[var(--primary)]/[0.04]'
                    : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/30'
                }`}>
                {activeTab === tab.key && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[var(--primary)] rounded-r-full" />
                )}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="flex-shrink-0"><path d={tab.icon} /></svg>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          {/* Right content area */}
          <div className="flex-1 overflow-y-auto min-h-0 p-3">
            {activeTab === 'info' && <ProfileInfo />}
            {activeTab === 'security' && <AccountSecurity />}
            {activeTab === 'properties' && <MyProperties />}
            {activeTab === 'preferences' && <Personalization />}
            {activeTab === 'history' && <ChangeHistory />}
          </div>
        </div>
      </div>
    </div>
  );
}
