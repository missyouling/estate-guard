interface AppData {
  token: string;
  user: any;
  apiBase: string;
}

App<AppData>({
  globalData: {
    token: '',
    user: null,
    apiBase: 'http://localhost:3000/api',
  },

  onLaunch() {
    const token = wx.getStorageSync('token');
    const user = wx.getStorageSync('user');
    if (token) {
      this.globalData.token = token;
      this.globalData.user = user;
    }
  },

  setAuth(token: string, user: any) {
    this.globalData.token = token;
    this.globalData.user = user;
    wx.setStorageSync('token', token);
    wx.setStorageSync('user', user);
  },

  logout() {
    this.globalData.token = '';
    this.globalData.user = null;
    wx.removeStorageSync('token');
    wx.removeStorageSync('user');
  },
});
