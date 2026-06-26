import { request } from '../../utils/api';
import { toast } from '../../utils/util';
import { isLoggedIn, getUser, app } from '../../utils/auth';

Page({
  data: {
    userName: '',
    role: '',
    userPhone: '',
    userRoom: '',
    stats: { total: 0, images: 0, videos: 0 },
    oldPwd: '',
    newPwd: '',
  },

  onShow() {
    if (!isLoggedIn()) {
      wx.navigateTo({ url: '/pages/login/login' });
      return;
    }
    const user = getUser();
    this.setData({
      userName: user?.name || '',
      role: user?.role || '',
      userPhone: user?.phone || '',
      userRoom: user?.room_number || '',
    });
    this.loadStats();
  },

  onOldPwd(e: any) { this.setData({ oldPwd: e.detail.value }); },
  onNewPwd(e: any) { this.setData({ newPwd: e.detail.value }); },

  async loadStats() {
    try {
      const res = await request<any>({ url: '/user/stats', showLoading: false });
      if (res.code === 0) this.setData({ stats: res.data });
    } catch {}
  },

  async changePwd() {
    const { oldPwd, newPwd } = this.data;
    if (!oldPwd || !newPwd || newPwd.length < 6) { toast('请填写完整，新密码至少6位', 'error'); return; }
    try {
      const res = await request({
        url: '/user/me', method: 'PATCH',
        data: { old_password: oldPwd, new_password: newPwd },
      });
      if (res.code === 0) {
        toast('密码修改成功', 'success');
        this.setData({ oldPwd: '', newPwd: '' });
      } else { toast(res.message || '修改失败', 'error'); }
    } catch (err: any) { toast(err.message || '修改失败', 'error'); }
  },

  handleLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出吗？',
      success: (res) => {
        if (res.confirm) {
          app.logout();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      },
    });
  },
});
