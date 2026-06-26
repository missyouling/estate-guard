import { request } from '../../utils/api';
import { toast } from '../../utils/util';

Page({
  data: {
    step: 'check',
    name: '', idCard: '', phone: '', email: '', roomNumber: '',
    password: '', deedPath: '', deedName: '',
    loading: false, msg: '', msgType: 'info',
  },

  onField(e: any) {
    const f = e.currentTarget.dataset.field;
    const val = e.detail.value.trim();
    this.setData({ [f]: val, msg: '' } as any);
  },

  async checkWhitelist() {
    const { name, idCard, phone } = this.data;
    if (!name || !idCard || !phone) { this.setData({ msg: '请填写所有必填字段', msgType: 'error' }); return; }
    this.setData({ loading: true, msg: '' });
    try {
      const res = await request<any>({
        url: '/auth/check-whitelist', method: 'POST',
        data: { name, id_card: idCard, phone },
      });
      if (res.code === 0) {
        const d = res.data;
        if (d.registered) {
          this.setData({ msg: d.message || '已注册', msgType: 'error' });
        } else if (d.matched) {
          this.setData({ step: 'whitelist', msg: d.message, msgType: 'success' });
        } else {
          this.setData({ step: 'manual', msg: d.message, msgType: 'info' });
        }
      } else { this.setData({ msg: res.message, msgType: 'error' }); }
    } catch (err: any) {
      this.setData({ msg: err.message || '校验失败', msgType: 'error' });
    } finally { this.setData({ loading: false }); }
  },

  async registerWhitelist() {
    const { name, idCard, phone, password } = this.data;
    if (!password || password.length < 6) { this.setData({ msg: '密码至少6位', msgType: 'error' }); return; }
    this.setData({ loading: true });
    try {
      const res = await request<any>({
        url: '/auth/register-whitelist', method: 'POST',
        data: { name, id_card: idCard, phone, password },
      });
      if (res.code === 0) {
        toast('注册成功，请登录', 'success');
        setTimeout(() => wx.navigateBack(), 1000);
      } else { this.setData({ msg: res.message, msgType: 'error' }); }
    } catch (err: any) {
      this.setData({ msg: err.message || '注册失败', msgType: 'error' });
    } finally { this.setData({ loading: false }); }
  },

  uploadDeed() {
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const p = res.tempFilePaths[0];
        this.setData({ deedPath: p, deedName: p.split('/').pop() || 'deed.jpg' });
      },
    });
  },

  async submitManual() {
    const { name, idCard, phone, email, roomNumber, deedPath } = this.data;
    if (!roomNumber) { this.setData({ msg: '请填写房号', msgType: 'error' }); return; }
    if (!deedPath) { this.setData({ msg: '请上传房产证', msgType: 'error' }); return; }
    this.setData({ loading: true });

    wx.uploadFile({
      url: getApp().globalData.apiBase + '/auth/register-manual',
      filePath: deedPath,
      name: 'property_deed',
      formData: {
        name, id_card: idCard, phone,
        email: email || '',
        room_number: roomNumber,
      },
      header: {},
      success: (res: any) => {
        try {
          const data = JSON.parse(res.data);
          if (data.code === 0) {
            toast('已提交，请留意审核通知', 'success');
            setTimeout(() => wx.navigateBack(), 1500);
          } else {
            this.setData({ msg: data.message || '提交失败', msgType: 'error' });
          }
        } catch { this.setData({ msg: '提交失败', msgType: 'error' }); }
      },
      fail: () => { this.setData({ msg: '网络错误', msgType: 'error' }); },
      complete: () => { this.setData({ loading: false }); },
    });
  },
});
