import { useRoutes, Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

import AppLayout from '@/components/layout/AppLayout';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Activate from '@/pages/Activate';
import Home from '@/pages/Home';
import Upload from '@/pages/Upload';
import Detail from '@/pages/Detail';
import Share from '@/pages/Share';
import SharedView from '@/pages/SharedView';

import AdminDashboard from '@/pages/admin/Dashboard';
import AdminWhitelist from '@/pages/admin/Whitelist';
import AdminApproval from '@/pages/admin/Approval';
import AdminCategory from '@/pages/admin/Category';
import AdminConfig from '@/pages/admin/Config';
import AdminExport from '@/pages/admin/Export';
import AdminShares from '@/pages/admin/Shares';

function ProtectedRoute({ children, role }: { children: React.ReactNode; role?: 'admin' | 'owner' }) {
  const user = useAuthStore((s) => s.user);
  if (!user) return <Login />;
  if (role === 'admin' && user.role !== 'admin') return <Home />;
  return <>{children}</>;
}

export default function AppRouter() {
  const routes = [
    { path: '/login', element: <Login /> },
    { path: '/register', element: <Register /> },
    { path: '/activate', element: <Activate /> },
    { path: '/shared/:token', element: <SharedView /> },
    {
      path: '/',
      element: (
        <ProtectedRoute>
          <AppLayout />
        </ProtectedRoute>
      ),
      children: [
        { index: true, element: <Home /> },
        { path: 'upload', element: <Upload /> },
        { path: 'detail/:id', element: <Detail /> },
        { path: 'shares', element: <AdminShares /> },
        { path: 'export', element: <AdminExport /> },
        { path: 'share', element: <Share /> },
        { path: 'dashboard', element: <AdminDashboard /> },
        { path: 'profile', element: <Navigate to="/" replace /> },
      ],
    },
    {
      path: '/admin',
      element: (
        <ProtectedRoute role="admin">
          <AppLayout />
        </ProtectedRoute>
      ),
      children: [
        { index: true, element: <AdminDashboard /> },
        { path: 'whitelist', element: <AdminWhitelist /> },
        { path: 'approvals', element: <AdminApproval /> },
        { path: 'categories', element: <AdminCategory /> },
        { path: 'config', element: <AdminConfig /> },
        { path: 'export', element: <AdminExport /> },
      ],
    },
  ];

  return useRoutes(routes);
}
