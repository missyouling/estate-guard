import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Sidebar from './Sidebar';
import DockBar from './DockBar';

export default function AppLayout() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdmin = user?.role === 'admin';
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : false;
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="h-screen flex bg-[var(--background)] overflow-hidden">
      <Sidebar
        open={sidebarOpen}
        visible={sidebarVisible}
        onClose={() => setSidebarOpen(false)}
        onMenuClick={() => setSidebarOpen(!sidebarOpen)}
      />

      <main className={`flex-1 flex flex-col overflow-hidden transition-all ${sidebarVisible ? 'md:ml-0' : ''} md:mx-2 md:my-2 md:rounded-3xl`} style={{ backgroundColor: 'var(--muted)' }}>
        <div className="flex-1 overflow-auto p-4 md:px-6 md:pb-6 md:pt-5 bg-[var(--card)] md:rounded-3xl md:shadow-sm">
          <div className="animate-fade-in max-w-6xl mx-auto">
            <Outlet />
          </div>
        </div>
      </main>

      <DockBar dark={dark} onToggleTheme={() => setDark(!dark)} onToggleSidebar={() => setSidebarVisible(!sidebarVisible)} />

      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-[var(--background)]/80 backdrop-blur-md border-t border-[var(--border)] z-40 flex justify-around py-2 px-4">
        <TabButton icon="grid" label="首页"
          active={location.pathname === '/' || location.pathname === '/admin' || location.pathname.startsWith('/admin')}
          onClick={() => navigate(isAdmin ? '/admin' : '/')}
        />
        <TabButton icon="upload" label="上传"
          active={location.pathname === '/upload'}
          onClick={() => navigate('/upload')}
        />
      </nav>
    </div>
  );
}

function TabButton({ icon, label, active, onClick }: {
  icon: string; label: string; active: boolean; onClick: () => void;
}) {
  const paths: Record<string, string> = {
    grid: 'M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z',
    upload: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4m4-7l5-5 5 5m-5-5v12',
  };
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center gap-1 px-4 py-1 rounded-lg transition-all ${
        active ? 'text-[var(--primary)]' : 'text-[var(--muted-foreground)]'
      }`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d={paths[icon] || ''} />
      </svg>
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}
