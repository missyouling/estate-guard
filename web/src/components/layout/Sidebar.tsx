import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSiteConfigStore } from '@/stores/siteConfigStore';
import ConfirmModal from '@/components/ConfirmModal';
import AvatarProfile from '@/components/AvatarProfile';

const navItems = [
  { path: '/', label: '证据上传', icon: 'grid' },
  { path: '/dashboard', label: '系统概览', icon: 'home' },
  { path: '/export', label: '证据管理', icon: 'file-text' },
  { path: '/shares', label: '分享管理', icon: 'share-2' },
];

const adminItems = [
  { path: '/admin/whitelist', label: '业主名册', icon: 'list-checks' },
  { path: '/admin/approvals', label: '审核管理', icon: 'check-circle' },
  { path: '/admin/config', label: '系统配置', icon: 'settings' },
];

export default function Sidebar({ open, visible, onClose, onMenuClick }: {
  open: boolean; visible: boolean; onClose: () => void; onMenuClick: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'admin';
  const [showProfile, setShowProfile] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const siteName = useSiteConfigStore((s) => s.siteName);
  const communityName = useSiteConfigStore((s) => s.communityName);
  const fetchSiteConfig = useSiteConfigStore((s) => s.fetch);

  useEffect(() => { fetchSiteConfig(); }, [fetchSiteConfig]);

  const doLogout = () => { useAuthStore.getState().logout(); window.location.href = '/login'; };

  const openProfile = () => setShowProfile(true);

  return (
    <>
      {open && <div className="fixed inset-0 bg-black/30 z-40 md:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-0 left-0 z-50 bg-[var(--sidebar)] text-[var(--sidebar-foreground)] flex flex-col md:relative md:translate-x-0 md:z-0 md:border-r md:border-[var(--sidebar-border)] transition-all duration-200 ${
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        } ${visible ? 'w-56' : 'w-14 md:overflow-hidden'}`}>
        <div className="flex items-center h-14 px-2 overflow-hidden">
          <button onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--sidebar-accent)] transition-colors w-full min-w-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="flex-shrink-0 text-[var(--sidebar-foreground)]"><path d="M3 21h18M5 21V7l8-4v18M19 21V11l-6-4M9 9v1m0 4v1"/></svg>
            <span className={`text-base font-semibold whitespace-nowrap transition-all duration-200 ease-linear ${visible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-2 w-0 overflow-hidden'}`} style={{color: 'var(--sidebar-foreground)'}}>{siteName}</span>
            {visible && communityName && (
              <span className="text-[11px] text-[var(--muted-foreground)] flex-shrink-0 transition-opacity duration-200">v {communityName}</span>
            )}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto px-2 py-1 space-y-1">
          {navItems.map((item) => (<SidebarItem key={item.path} item={item} active={location.pathname === item.path} compact={!visible} onClick={() => { navigate(item.path); onClose(); }} />))}
          {isAdmin && adminItems.map((item) => (<SidebarItem key={item.path} item={item} active={location.pathname === item.path} compact={!visible} onClick={() => { navigate(item.path); onClose(); }} />))}
        </nav>
        <div className="border-t border-[var(--sidebar-border)] p-2">
          {visible ? (
            <div className="flex items-center gap-1">
              <button onClick={openProfile} className="flex-1 flex items-center gap-2.5 rounded-md p-2 hover:bg-[var(--sidebar-accent)] transition-colors overflow-hidden min-w-0">
                <div className="relative flex-shrink-0">
                  {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" /> : <div className="w-10 h-10 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-sm font-bold flex-shrink-0">{user?.name?.[0] || '?'}</div>}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium truncate">{user?.name}</div>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[11px] text-[var(--muted-foreground)]">{user?.role === 'admin' ? '管理员' : '业主'}</span>
                    {communityName && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--foreground)] text-[var(--background)] leading-none">{communityName}</span>}
                  </div>
                </div>
              </button>
              <button onClick={() => setShowLogoutConfirm(true)} className="p-2 rounded-md hover:bg-red-50 text-[var(--destructive)] transition-colors flex-shrink-0" title="退出登录">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
              </button>
            </div>
          ) : (
            <button onClick={openProfile} className="w-full flex justify-center p-1 rounded-md hover:bg-[var(--sidebar-accent)] transition-colors" title={user?.name}>
              {user?.avatar_url ? <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center text-sm font-bold">{user?.name?.[0] || '?'}</div>}
            </button>
          )}
        </div>
      </aside>

      {showProfile && <AvatarProfile onClose={() => setShowProfile(false)} />}

      <ConfirmModal
        open={showLogoutConfirm}
        title="退出登录"
        message="确定要退出登录吗？"
        onConfirm={doLogout}
        onCancel={() => setShowLogoutConfirm(false)}
        danger
      />
    </>
  );
}

function SidebarItem({ item, active, compact, onClick }: {
  item: { path: string; label: string; icon: string }; active: boolean; compact: boolean; onClick: () => void;
}) {
  const iconPaths: Record<string, string> = {
    grid: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-7l5-5 5 5m-5-5v12', home: 'M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z',
    settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
    'check-circle': 'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3', filter: 'M22 3H2l8 9.46V19l4 2v-8.54L22 3z',
    'file-text': 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM16 13H8m8 4H8m0-8h5',
    users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2m18-2v-2a4 4 0 00-3-3.87M8 7a4 4 0 100-8 4 4 0 000 8zm13 0a4 4 0 100-8 4 4 0 000 8z',
    'share-2': 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98',
    'list-checks': 'M3 5h6M3 9h6M3 13h6M10 5h11M10 9h11M10 13h11',
  };
  return (
    <button onClick={onClick} title={compact ? item.label : undefined}
      className={`flex items-center w-full h-9 rounded-lg text-sm font-medium transition-all ${
        compact ? 'justify-center px-0 w-9 mx-auto' : 'px-3 gap-3'
      } ${
        active ? 'bg-black text-white shadow-sm dark:bg-white dark:text-black' : 'hover:bg-[var(--sidebar-accent)] text-[var(--sidebar-foreground)]'
      }`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d={iconPaths[item.icon] || ''}/></svg>
      {!compact && <span className="truncate">{item.label}</span>}
    </button>
  );
}
