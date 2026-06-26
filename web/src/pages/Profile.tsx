import { useState } from 'react';
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

export default function Profile() {
  const [activeTab, setActiveTab] = useState('info');

  return (
    <div className="max-w-3xl mx-auto">
      <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight mb-6">个人中心</h2>

      <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="flex overflow-x-auto border-b border-[var(--border)] scrollbar-thin">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.key ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d={tab.icon} /></svg>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === 'info' && <ProfileInfo />}
          {activeTab === 'security' && <AccountSecurity />}
          {activeTab === 'properties' && <MyProperties />}
          {activeTab === 'preferences' && <Personalization />}
          {activeTab === 'history' && <ChangeHistory />}
        </div>
      </div>
    </div>
  );
}
