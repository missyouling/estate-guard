const app = getApp<{ globalData: { token: string; apiBase: string } }>();

interface RequestOptions {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  data?: any;
  header?: any;
  showLoading?: boolean;
}

export function request<T = any>(options: RequestOptions): Promise<{ code: number; message: string; data: T }> {
  const token = app.globalData.token;

  return new Promise((resolve, reject) => {
    if (options.showLoading !== false) {
      wx.showLoading({ title: '加载中...', mask: true });
    }

    wx.request({
      url: app.globalData.apiBase + options.url,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header,
      },
      success(res: any) {
        if (res.statusCode === 401) {
          app.logout();
          wx.reLaunch({ url: '/pages/login/login' });
          reject(new Error('未登录'));
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error(res.data?.message || '请求失败'));
        }
      },
      fail(err: any) {
        reject(new Error(err.errMsg || '网络错误'));
      },
      complete() {
        if (options.showLoading !== false) {
          wx.hideLoading();
        }
      },
    });
  });
}

export function uploadFile(
  filePath: string,
  type: string,
  extraFields: Record<string, string>,
  onProgress?: (percent: number) => void,
): Promise<{ code: number; message: string; data: any }> {
  const token = app.globalData.token;

  return new Promise((resolve, reject) => {
    const uploadTask = wx.uploadFile({
      url: app.globalData.apiBase + '/upload/' + type,
      filePath,
      name: 'file',
      formData: extraFields,
      header: {
        'Authorization': token ? `Bearer ${token}` : '',
      },
      success(res: any) {
        try {
          resolve(JSON.parse(res.data));
        } catch {
          reject(new Error('解析响应失败'));
        }
      },
      fail(err: any) {
        reject(new Error(err.errMsg || '上传失败'));
      },
    });

    if (onProgress) {
      uploadTask.onProgressUpdate((res) => {
        onProgress(res.progress);
      });
    }
  });
}
