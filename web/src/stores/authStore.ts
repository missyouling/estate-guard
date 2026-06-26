import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@/types';

interface AuthState {
  token: string | null;
  user: User | null;
  smsConfigured: boolean;
  setAuth: (token: string, user: User) => void;
  setSmsConfigured: (v: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      smsConfigured: false,
      setAuth: (token, user) => set({ token, user }),
      setSmsConfigured: (v) => set({ smsConfigured: v }),
      logout: () => set({ token: null, user: null, smsConfigured: false }),
    }),
    {
      name: 'property-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
    },
  ),
);
