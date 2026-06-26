import { request } from '../../utils/api';
import { toast, formatFileSize, formatDuration } from '../../utils/util';

Page({
  data: {
    item: null as any,
    loading: true,
  },

  onLoad(options: any) {
    if (options.id) this.loadDetail(parseInt(options.id));
  },

  async loadDetail(id: number) {
    try {
      const res = await request<any>({ url: `/media/${id}` });
      if (res.code === 0) this.setData({ item: res.data });
    } catch {
      toast('加载失败', 'error');
    } finally {
      this.setData({ loading: false });
    }
  },

  formatSize(bytes: number) { return formatFileSize(bytes); },
  formatDuration(sec: number) { return formatDuration(sec); },

  copyUrl(e: any) {
    const fmt = e.currentTarget.dataset.fmt;
    const url = this.data.item?.url || '';
    let txt = url;
    if (fmt === 'md') txt = `![](${url})`;
    else if (fmt === 'html') txt = `<img src="${url}" />`;
    wx.setClipboardData({ data: txt, success: () => toast('已复制', 'success') });
  },

  async handleDelete() {
    const res = await new Promise<boolean>((r) => {
      wx.showModal({ title: '确认删除', content: '确定删除此条记录？', success: (m) => r(m.confirm) });
    });
    if (!res) return;
    try {
      await request({ url: `/media/${this.data.item.id}`, method: 'DELETE' });
      toast('已删除', 'success');
      setTimeout(() => wx.navigateBack(), 1000);
    } catch { toast('删除失败', 'error'); }
  },
});
