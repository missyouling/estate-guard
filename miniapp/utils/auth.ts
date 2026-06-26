const app = getApp<{ globalData: { token: string; user: any }; setAuth: (t: string, u: any) => void; logout: () => void }>();

export function isLoggedIn(): boolean {
  return !!app.globalData.token;
}

export function getUser() {
  return app.globalData.user;
}

export function getRole() {
  return app.globalData.user?.role || '';
}

export { app };
