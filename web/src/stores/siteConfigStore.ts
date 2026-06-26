import { create } from 'zustand';
import api from '@/lib/api';

interface SiteConfig {
  siteName: string;
  communityName: string;
  loaded: boolean;
  fetch: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const useSiteConfigStore = create<SiteConfig>((set) => ({
  siteName: '物业服务监督',
  communityName: '',
  loaded: false,
  fetch: async () => {
    try {
      const res = await api.get('/config/public');
      const d = res.data?.data;
      if (d) {
        set({ siteName: d.site_name || '物业服务监督', communityName: d.community_name || '', loaded: true });
      }
    } catch {
      set({ loaded: true });
    }
  },
  refresh: async () => {
    try {
      const res = await api.get('/config/public');
      const d = res.data?.data;
      if (d) {
        set({ siteName: d.site_name || '物业服务监督', communityName: d.community_name || '' });
      }
    } catch {}
  },
}));
