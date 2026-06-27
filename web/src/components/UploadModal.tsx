import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const ACCEPT_TYPES = 'image/*,video/*,audio/*,.pdf,.txt,.xlsx,.xls,.csv,.ppt,.pptx,.doc,.docx,.md';

function captureVideoFrame(file: File): Promise<string> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    const url = URL.createObjectURL(file);
    video.src = url;

    let settled = false;
    const done = (dataUrl: string) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      video.remove();
      resolve(dataUrl);
    };

    const timeout = setTimeout(() => done(''), 8000);

    const trySeek = () => {
      const seekTime = Math.max(0.5, Math.min(0.5, (video.duration || 1) * 0.1));
      video.currentTime = seekTime;
    };

    video.onloadedmetadata = () => {
      if (video.videoWidth === 0 || video.videoHeight === 0) { done(''); return; }
      trySeek();
    };

    video.onseeked = () => {
      clearTimeout(timeout);
      const w = video.videoWidth || 400;
      const h = video.videoHeight || 300;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.drawImage(video, 0, 0, w, h);
      done(canvas.toDataURL('image/jpeg', 0.6));
    };

    video.onerror = () => { clearTimeout(timeout); done(''); };
    video.onabort = () => { clearTimeout(timeout); done(''); };
  });
}

export default function UploadModal({ onClose, redirectTo, onUploaded }: { onClose: () => void; redirectTo?: string; onUploaded?: () => void }) {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [progress, setProgress] = useState<number[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [address, setAddress] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const getGpsLocation = () => {
    if (!navigator.geolocation) {
      toast('当前浏览器不支持定位');
      return;
    }
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await api.post('/geocode', { latitude, longitude });
          if (res.data.code === 0 && res.data.data?.address) {
            setAddress(res.data.data.address);
          } else {
            setAddress(`GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
          }
        } catch {
          setAddress(`GPS: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`);
        }
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) {
          toast('定位权限被拒绝，可手动填写地址');
        } else if (err.code === 2) {
          toast('无法获取位置，请检查GPS是否开启');
        } else {
          toast('获取位置超时，可稍后重试');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    api.get('/category').then(r => { if (r.data.code === 0) setCategories(r.data.data || []); });
  }, []);

  const processFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList).slice(0, 9);

    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    const newProgress: number[] = [];

    for (const f of arr) {
      newFiles.push(f);
      let previewUrl = '';
      if (f.type.startsWith('image/')) {
        previewUrl = await new Promise<string>(resolve => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(f);
        });
      } else if (f.type.startsWith('video/')) {
        previewUrl = await captureVideoFrame(f);
      }
      newPreviews.push(previewUrl);
      newProgress.push(0);
    }

    setFiles(prev => [...prev, ...newFiles].slice(0, 9));
    setPreviews(prev => [...prev, ...newPreviews].slice(0, 9));
    setProgress(prev => [...prev, ...newProgress].slice(0, 9));
  }, []);

  const removeFile = (i: number) => {
    setFiles(f => f.filter((_, j) => j !== i));
    setPreviews(p => p.filter((_, j) => j !== i));
    setProgress(p => p.filter((_, j) => j !== i));
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!files.length) { toast('请选择文件'); return; }
    if (!categoryId) { toast('请选择分类'); return; }
    if (!address.trim()) { toast('请填写情况说明'); return; }
    setUploading(true);
    setProgress(files.map(() => 0));
    let success = 0;
    let hasDocument = false;
    const docIds: number[] = [];
    const failedReasons: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fd = new FormData();
      fd.append('file', file);
      if (categoryId) fd.append('category_id', String(categoryId));
      fd.append('address', address);
      const endpoint = file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'audio' : file.type.startsWith('image') ? 'image' : 'document';
      if (endpoint === 'document') hasDocument = true;
      try {
        const res = await api.post(`/upload/${endpoint}`, fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setProgress(prev => { const n = [...prev]; n[i] = pct; return n; });
            }
          },
        });
        if (res.data.code === 0) {
          success++;
          if (endpoint === 'document' && res.data.data?.id) docIds.push(res.data.data.id);
          setProgress(prev => { const n = [...prev]; n[i] = 100; return n; });
        }
        else { failedReasons.push(`${file.name}: ${res.data.message}`); setProgress(prev => { const n = [...prev]; n[i] = -1; return n; }); }
      } catch (err: any) {
        failedReasons.push(`${file.name}: ${err.response?.data?.message || '网络错误'}`);
        setProgress(prev => { const n = [...prev]; n[i] = -1; return n; });
      }
    }
    setUploading(false);
    if (success > 0 && failedReasons.length === 0) {
      if (hasDocument && docIds.length > 0) {
        toast.success((t) => (
          <div className="flex items-center gap-3">
            <span>该类文件已保存，可前往证据管理页面查看预览与管理</span>
            <button onClick={() => { toast.dismiss(t.id); navigate(`/export?focus=${docIds[0]}`); }}
              className="text-[var(--primary)] font-medium whitespace-nowrap shrink-0">前往</button>
          </div>
        ), { duration: 6000 });
      } else {
        toast.success(`成功上传 ${success} 个文件`);
      }
      onUploaded?.();
      onClose();
      if (!hasDocument && redirectTo) navigate(redirectTo);
    } else if (success > 0) {
      toast.success(`成功上传 ${success} 个文件`);
      toast.error(`上传失败 ${failedReasons.length} 个\n${failedReasons.join('\n')}`, { duration: 5000 });
      onUploaded?.();
      onClose();
      if (redirectTo) navigate(redirectTo);
    } else {
      toast.error(`上传全部失败\n${failedReasons.join('\n')}`, { duration: 5000 });
    }
  };

  const renderPreview = (url: string, i: number) => {
    const file = files[i];
    if (url) return <img src={url} alt="" className="w-full h-full object-cover" />;
    if (file?.type.startsWith('video/')) return (
      <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><rect x="1" y="3" width="22" height="18" rx="2"/>
        </svg>
      </div>
    );
    if (file?.type.startsWith('audio/')) return (
      <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
        </svg>
      </div>
    );
    return (
      <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/>
        </svg>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[var(--foreground)] text-lg font-bold">上传文件</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--accent)] rounded-lg">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-[var(--muted-foreground)] block mb-1">分类 *</label>
            <select value={categoryId || ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm">
              <option value="">选择分类</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] hover:border-[var(--primary)]'
            }`}
            onClick={() => document.getElementById('upload-file-input')?.click()}
          >
            <input id="upload-file-input" type="file" accept={ACCEPT_TYPES} multiple className="hidden"
              onChange={(e) => processFiles(e.target.files)} />
            <svg className="mx-auto mb-1 text-[var(--muted-foreground)]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
            </svg>
            <p className="text-sm text-[var(--foreground)] font-medium">点击或拖拽文件到此处上传</p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">支持上传常用图片、视频、音频、文档</p>
            <p className="text-xs text-[var(--muted-foreground)]">单文件大小限制: 图片20MB, 视频200MB, 音频50MB</p>
          </div>
          {previews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {previews.map((url, i) => (
                <div key={i} className="w-16 h-16 overflow-hidden bg-[var(--muted)] relative border border-[var(--border)]">
                  {renderPreview(url, i)}
                  {progress[i] > 0 && progress[i] < 100 && (
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-black/10">
                      <div className="h-full bg-[var(--primary)] transition-all duration-200" style={{ width: `${progress[i]}%` }} />
                    </div>
                  )}
                  {progress[i] === -1 && (
                    <div className="absolute inset-0 bg-[var(--destructive)]/20 flex items-center justify-center">
                      <span className="text-[10px] text-[var(--destructive)] font-bold">失败</span>
                    </div>
                  )}
                  {!uploading && (
                    <button onClick={() => removeFile(i)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[var(--destructive)] text-white flex items-center justify-center text-[10px] shadow-sm">×</button>
                  )}
                  {uploading && progress[i] > 0 && progress[i] < 100 && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <span className="text-[10px] text-white font-bold">{progress[i]}%</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="text-xs text-[var(--muted-foreground)] block mb-1">情况说明 *</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="如: 1栋楼下垃圾桶未清理"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm" />
            <button type="button" onClick={getGpsLocation} disabled={gpsLoading}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-60">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M12 2a8 8 0 00-8 8c0 5.5 8 12 8 12s8-6.5 8-12a8 8 0 00-8-8z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {gpsLoading ? '获取定位中...' : '获取定位'}
            </button>
          </div>
          {files.length > 0 && (
            <button onClick={handleUpload} disabled={uploading}
              className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60">
              {uploading ? `上传中 ${progress.filter(p => p === 100).length}/${files.length} ...` : `上传证据 ${files.length} 个文件`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
