import { request, uploadFile } from '../../utils/api';
import { toast } from '../../utils/util';

interface TempFile {
  path: string;
  type: 'image' | 'video';
  size: number;
  duration?: number;
  originalName: string;
}

Page({
  data: {
    categories: [] as { id: number; name: string }[],
    categoryIdx: -1,
    selectedCategory: '',
    categoryId: 0,
    address: '',
    latitude: 0,
    longitude: 0,
    remark: '',
    tempFiles: [] as TempFile[],
    maxImage: 20,
    maxVideo: 200,
    maxCount: 9,
    uploading: false,
    uploadProgress: 0,
  },

  onLoad() {
    this.loadCategories();
    this.loadLimits();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
  },

  async loadCategories() {
    try {
      const res = await request<any>({ url: '/category', showLoading: false });
      if (res.code === 0 && res.data) {
        this.setData({ categories: res.data });
      }
    } catch {}
  },

  async loadLimits() {
    try {
      const res = await request<any>({ url: '/upload/config', showLoading: false });
      if (res.code === 0 && res.data) {
        this.setData({
          maxImage: res.data.maxImageSizeMb || 20,
          maxVideo: res.data.maxVideoSizeMb || 200,
          maxCount: res.data.maxCountPerBatch || 9,
        });
      }
    } catch {}
  },

  onCategoryChange(e: any) {
    const idx = e.detail.value;
    const cat = this.data.categories[idx];
    this.setData({
      categoryIdx: idx,
      selectedCategory: cat.name,
      categoryId: cat.id,
    });
  },

  onAddressInput(e: any) {
    this.setData({ address: e.detail.value.trim() });
  },

  onRemarkInput(e: any) {
    this.setData({ remark: e.detail.value.trim() });
  },

  getLocation() {
    wx.getLocation({
      type: 'wgs84',
      success: (res) => {
        this.setData({
          latitude: parseFloat(res.latitude.toFixed(6)),
          longitude: parseFloat(res.longitude.toFixed(6)),
        });
        toast('定位成功', 'success');
      },
      fail: () => toast('定位失败，请手动输入', 'error'),
    });
  },

  chooseMedia() {
    const remaining = this.data.maxCount - this.data.tempFiles.length;
    if (remaining <= 0) {
      toast(`最多上传 ${this.data.maxCount} 个文件`, 'none');
      return;
    }

    wx.chooseMedia({
      count: remaining,
      mediaType: ['image', 'video'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      maxDuration: 60,
      success: (res) => {
        const files: TempFile[] = res.tempFiles.map((f) => ({
          path: f.tempFilePath,
          type: f.fileType === 'video' ? 'video' : 'image',
          size: f.size,
          duration: f.duration,
          originalName: f.fileType + '_' + Date.now(),
        }));
        this.setData({ tempFiles: [...this.data.tempFiles, ...files] });
      },
    });
  },

  removeFile(e: any) {
    const idx = e.currentTarget.dataset.index;
    const files = [...this.data.tempFiles];
    files.splice(idx, 1);
    this.setData({ tempFiles: files });
  },

  async uploadAll() {
    const files = this.data.tempFiles;
    if (files.length === 0) return;
    this.setData({ uploading: true, uploadProgress: 0 });

    let success = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fields: Record<string, string> = {};
      if (this.data.categoryId) fields.category_id = String(this.data.categoryId);
      if (this.data.address) fields.address = this.data.address;
      if (this.data.latitude) fields.latitude = String(this.data.latitude);
      if (this.data.longitude) fields.longitude = String(this.data.longitude);
      if (this.data.remark) fields.remark = this.data.remark;

      try {
        const res = await uploadFile(file.path, file.type, fields, (pct: number) => {
          this.setData({ uploadProgress: Math.round((i / files.length) * 100 + pct / files.length) });
        });
        if (res.code === 0) success++;
      } catch {}
    }

    this.setData({ uploading: false, uploadProgress: 0 });
    if (success > 0) {
      toast(`成功上传 ${success} 个文件`, 'success');
      this.setData({ tempFiles: [] });
      wx.switchTab({ url: '/pages/index/index' });
    } else {
      toast('上传失败', 'error');
    }
  },
});
