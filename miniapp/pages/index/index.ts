import { request } from '../../utils/api';
import { formatTime } from '../../utils/util';

interface Media {
  id: number;
  record_no: number;
  type: string;
  original_name: string;
  url: string;
  thumbnail_url?: string;
  category_name?: string;
  address?: string;
  uploaded_at: string;
}

Page({
  data: {
    viewMode: 'grid',
    mediaList: [] as Media[],
    timeline: [] as any[],
    loading: true,
    page: 1,
    hasMore: true,
  },

  onLoad() {
    this.loadMedia();
  },

  onPullDownRefresh() {
    this.setData({ page: 1, hasMore: true });
    this.loadMedia().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore) {
      this.loadMedia(true);
    }
  },

  switchView(e: any) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({ viewMode: mode, mediaList: [], timeline: [], page: 1, hasMore: true });
    this.loadMedia();
  },

  async loadMedia(append = false) {
    this.setData({ loading: !append });
    try {
      const res = await request<any>({
        url: `/media/wall?view=${this.data.viewMode}&page=${this.data.page}&limit=30`,
      });
      if (res.code === 0) {
        if (this.data.viewMode === 'time') {
          const timeline = res.data?.timeline || [];
          this.setData({
            timeline: append ? [...this.data.timeline, ...timeline] : timeline,
            hasMore: timeline.length >= 30,
            page: append ? this.data.page + 1 : 2,
          });
        } else {
          const items = res.data?.items || [];
          this.setData({
            mediaList: append ? [...this.data.mediaList, ...items] : items,
            hasMore: items.length >= 30,
            page: append ? this.data.page + 1 : 2,
          });
        }
      }
    } catch {} finally {
      this.setData({ loading: false });
    }
  },

  goDetail(e: any) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },

  goUpload() {
    wx.switchTab({ url: '/pages/upload/upload' });
  },
});
