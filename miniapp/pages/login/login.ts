import { request } from '../../utils/api';
import { toast } from '../../utils/util';
const app = getApp<{ globalData: any; setAuth: (t: string, u: any) => void }>();

Page({
  data: { account: '', password: '', loading: false, error: '' },

  onAccount(e: any) { this.setData({ account: e.detail.value.trim(), error: '' }); },
  onPassword(e: any) { this.setData({ password: e.detail.value.trim(), error: '' }); },

  async handleLogin() {
    const { account, password } = this.data;
    if (!account || !password) { this.setData({ error: '请输入账号和密码' }); return; }
    this.setData({ loading: true, error: '' });
    try {
      const res = await request<any>({
        url: '/auth/login',
        method: 'POST',
        data: { account, password },
      });
      if (res.code === 0 && res.data) {
        app.setAuth(res.data.token, res.data.user);
        toast('登录成功', 'success');
        setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 500);
      } else {
        this.setData({ error: res.message || '登录失败' });
      }
    } catch (err: any) {
      this.setData({ error: err.message || '网络错误' });
    } finally {
      this.setData({ loading: false });
    }
  },

  goRegister() {
    wx.navigateTo({ url: '/pages/register/register' });
  },
});
