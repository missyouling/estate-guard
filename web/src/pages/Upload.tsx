import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface Category { id: number; name: string; icon?: string; sort_order: number; }

export default function Upload() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [address, setAddress] = useState('');
  const [remark, setRemark] = useState('');
  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [limits, setLimits] = useState({ maxImageSizeMb: 20, maxVideoSizeMb: 200, maxCount: 9 });
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get('/category').then(r => {
      if (r.data.code === 0) setCategories(r.data.data || []);
    });
    api.get('/upload/config').then(r => {
      if (r.data.code === 0 && r.data.data) setLimits(r.data.data);
    });
  }, []);

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {} // Silently fail if no GPS
      );
    }
  }, []);

  const processFiles = useCallback((fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList);
    setFiles(prev => [...prev, ...arr].slice(0, limits.maxCount));
    const readers = arr.map(f => {
      return new Promise<string>((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(f);
      });
    });
    Promise.all(readers).then(urls => {
      setPreviews(prev => [...prev, ...urls].slice(0, limits.maxCount));
    });
  }, [limits.maxCount]);

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpload = async () => {
    if (files.length === 0) { toast.error('请选择文件'); return; }
    if (!categoryId) { toast.error('请选择分类'); return; }
    if (!address.trim()) { toast.error('请填写位置描述'); return; }
    setUploading(true);
    let success = 0;
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const formData = new FormData();
      formData.append('file', files[i]);
      if (categoryId) formData.append('category_id', String(categoryId));
      if (address) formData.append('address', address);
      if (position) {
        formData.append('latitude', String(position.lat));
        formData.append('longitude', String(position.lng));
      }
      if (remark) formData.append('remark', remark);
      const endpoint = files[i].type.startsWith('video') ? 'video'
        : files[i].type.startsWith('audio') ? 'audio'
        : files[i].type.startsWith('image') ? 'image'
        : 'document';
      try {
        const res = await api.post(`/upload/${endpoint}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (res.data.code === 0) success++;
        else errors.push(res.data.message || '上传失败');
      } catch (err: any) {
        errors.push(err.response?.data?.message || err.message || '网络错误');
      }
    }
    setUploading(false);
    if (success > 0) {
      toast.success(`成功上传 ${success} 个文件`);
      setFiles([]);
      setPreviews([]);
      navigate('/');
    } else if (errors.length > 0) {
      toast.error(errors[0]);
    } else {
      toast.error('上传失败');
    }
  };

  return (
    <div>
      <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight mb-6">上传文件</h2>

      <div className="space-y-5">
        <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4">
          <label className="text-[var(--foreground)] text-xs font-semibold text-[var(--muted-foreground)] mb-2 block">分类 <span className="text-[var(--destructive)]">*</span></label>
          <select value={categoryId || ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}
            className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all">
            <option value="">选择分类</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div ref={dropRef}
          onClick={() => document.getElementById('fileInput')?.click()}
          onDragOver={(e) => { e.preventDefault(); dropRef.current?.classList.add('border-apple-blue'); }}
          onDragLeave={() => dropRef.current?.classList.remove('border-apple-blue')}
          onDrop={(e) => { e.preventDefault(); dropRef.current?.classList.remove('border-apple-blue'); processFiles(e.dataTransfer.files); }}
          className="border-2 border-dashed border-[var(--border)] rounded-xl p-10 text-center cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all bg-[var(--card)]/80 backdrop-blur-md">
          <input id="fileInput" type="file" accept="image/*,video/*,audio/*,.pdf,.txt,.xlsx,.xls,.csv,.ppt,.pptx,.doc,.docx,.md" multiple className="hidden"
            onChange={(e) => processFiles(e.target.files)} />
          <svg className="mx-auto mb-3" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#86868B" strokeWidth={1.3}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" /></svg>
          <p className="text-[var(--foreground)] text-sm font-medium mb-1">点击或拖拽文件</p>
          <p className="text-xs text-[var(--muted-foreground)]">
            图片 ≤{limits.maxImageSizeMb}MB | 视频 ≤{limits.maxVideoSizeMb}MB | 每次最多 {limits.maxCount} 个
          </p>
        </div>

        {previews.length > 0 && (
          <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4">
            <div className="flex flex-wrap gap-2 mb-4">
              {previews.map((url, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-[var(--muted)] group">
                  {files[i]?.type.startsWith('image') ? (
                    <img src={url} alt="" className="w-full h-full object-contain bg-black/5" />
                  ) : files[i]?.type.startsWith('video') ? (
                    <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)] text-xs bg-black/5">视频</div>
                  ) : files[i]?.type.startsWith('audio') ? (
                    <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)] text-xs bg-black/5">音频</div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)] text-[10px] bg-black/5 truncate px-1">{files[i]?.name}</div>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-xl p-4 space-y-3">
          <div>
            <label className="text-xs font-semibold text-[var(--muted-foreground)] mb-1 block">情况说明 <span className="text-[var(--destructive)]">*</span></label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)}
              placeholder="如: 1栋楼下垃圾桶未清理"
              className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] transition-all" />
            {position && (
              <p className="text-xs text-[var(--primary)] mt-1">
                GPS: {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
              </p>
            )}
          </div>
        </div>

        {files.length > 0 && (
          <button onClick={handleUpload} disabled={uploading}
            className="w-full py-3 rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)] font-medium text-sm hover:bg-[var(--primary)]/80 active:scale-[0.98] transition-all disabled:opacity-60">
            {uploading ? `上传中...` : `上传 ${files.length} 个文件`}
          </button>
        )}
      </div>
    </div>
  );
}
