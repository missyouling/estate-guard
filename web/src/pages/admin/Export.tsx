import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Category } from '@/types';
import PreviewModal from '@/components/PreviewModal';
import ConfirmModal from '@/components/ConfirmModal';
import * as XLSX from 'xlsx';

interface EvidenceItem {
  id: number;
  record_no: number;
  type: string;
  category_name: string;
  original_name: string;
  url: string;
  thumbnail_url?: string;
  address?: string;
  user_name?: string;
  storage_location?: string;
  watermark_applied: boolean;
  uploaded_at: string;
  size_bytes: number;
  file_hash?: string;
}

export default function Export() {
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState(() => sessionStorage.getItem('export_categoryId') || '');
  const [dateFrom, setDateFrom] = useState(() => sessionStorage.getItem('export_dateFrom') || '');
  const [dateTo, setDateTo] = useState(() => sessionStorage.getItem('export_dateTo') || '');
  const [type, setType] = useState(() => sessionStorage.getItem('export_type') || '');
  const [items, setItems] = useState<EvidenceItem[]>(() => {
    try { return JSON.parse(sessionStorage.getItem('export_items') || '[]'); } catch { return []; }
  });
  const [total, setTotal] = useState(() => parseInt(sessionStorage.getItem('export_total') || '0'));
  const [loading, setLoading] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [showPrintPreview, setShowPrintPreview] = useState(false);
  const [printHtml, setPrintHtml] = useState('');
  const [previewItem, setPreviewItem] = useState<EvidenceItem | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewItems, setPreviewItems] = useState<EvidenceItem[]>([]);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EvidenceItem | null>(null);
  const [detailItem, setDetailItem] = useState<EvidenceItem | null>(null);
  const [verifyItem, setVerifyItem] = useState<EvidenceItem | null>(null);
  const printFrameRef = useRef<HTMLIFrameElement>(null);
  const [printReady, setPrintReady] = useState(false);
  const printPendingRef = useRef(false);

  const doPrint = () => {
    const f = printFrameRef.current;
    if (!f?.contentWindow) return;
    if (!printReady) {
      printPendingRef.current = true;
      return;
    }
    printPendingRef.current = false;
    try { f.contentWindow.print(); } catch { window.print(); }
  };

  useEffect(() => {
    if (printReady && printPendingRef.current) doPrint();
  }, [printReady]);

  useEffect(() => {
    api.get('/category').then(r => { if (r.data.code === 0) setCategories(r.data.data || []); });
    handleSearch();
  }, []); // eslint-disable-line

  useEffect(() => {
    if (items.length > 0 || categoryId || dateFrom || dateTo || type) {
      sessionStorage.setItem('export_categoryId', categoryId);
      sessionStorage.setItem('export_dateFrom', dateFrom);
      sessionStorage.setItem('export_dateTo', dateTo);
      sessionStorage.setItem('export_type', type);
      sessionStorage.setItem('export_items', JSON.stringify(items));
      sessionStorage.setItem('export_total', String(total));
    }
  }, [categoryId, dateFrom, dateTo, type, items, total]);

  const saveFiltersAndNavigate = (path: string, state?: any) => {
    sessionStorage.setItem('export_categoryId', categoryId);
    sessionStorage.setItem('export_dateFrom', dateFrom);
    sessionStorage.setItem('export_dateTo', dateTo);
    sessionStorage.setItem('export_type', type);
    sessionStorage.setItem('export_items', JSON.stringify(items));
    sessionStorage.setItem('export_total', String(total));
    navigate(path, state);
  };

  const fullUrl = (url: string) => url?.startsWith('http') || url?.startsWith('//') ? url : window.location.origin + (url || '');

  const handleSearch = async () => {
    setLoading(true); setSelected(new Set()); setSelectMode(false);
    try {
      const params: any = {};
      if (categoryId) params.category_id = categoryId;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (type) params.type = type;
      params.page = 1;
      params.limit = 10000;
      const res = await api.get('/admin/export/evidence', { params });
      if (res.data.code === 0) {
        setItems(res.data.data?.items || []);
        setPreviewItems(res.data.data?.items || []);
      }
      else toast.error(res.data.message || '查询失败');
    } catch { toast.error('查询失败'); }
    finally { setLoading(false); }
  };

  const selectedItems = items.filter(it => selected.has(it.record_no));

  const handlePrint = () => {
    const toPrint = selected.size > 0 ? selectedItems : items;
    if (toPrint.length === 0) { toast.error('无数据可打印'); return; }
    const isDark = document.documentElement.classList.contains('dark');
    const html = `<!DOCTYPE html><html class="${isDark ? 'dark' : ''}"><head><meta charset="utf-8"><title>证据清单</title>
<style>*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;margin:20px;color:#1D1D1F;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h2{font-size:18px;margin:0 0 4px}p{font-size:11px;color:#86868B;margin:0 0 16px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #E5E5EA}
th{font-size:11px;color:#86868B;font-weight:600;background:#f5f5f7}
@media(prefers-color-scheme:dark){.dark body,.dark h2,.dark p,.dark table,.dark th,.dark td{color:#E0E0E0!important}.dark body{background:#1C1C1E}.dark th{background:#2C2C2E!important;color:#CCCCCC!important}.dark td{border-color:#3A3A3A!important}}
@media print{@page{size:A4;margin:15mm}body{margin:0}th{background:#f5f5f7!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
<h2>证据清单</h2><p>${new Date().toLocaleString('zh-CN')} | 共 ${toPrint.length} 条</p>
<table><thead><tr><th>编号</th><th>类型</th><th>分类</th><th>文件名</th><th>位置</th><th>备注</th><th>时间</th></tr></thead><tbody>
${toPrint.map(it => `<tr><td>NO.${it.record_no}</td><td>${{image:'图片',video:'视频',audio:'音频',document:'文件'}[it.type]||it.type}</td><td>${it.category_name||'-'}</td><td>${it.original_name}</td><td>${it.address||'-'}</td><td>${it.user_name||'-'}</td><td>${it.uploaded_at}</td></tr>`).join('')}
</tbody></table></body></html>`;
    setPrintHtml(html); setPrintReady(false); printPendingRef.current = false; setShowPrintPreview(true);
  };

  const handlePreview = (item: EvidenceItem, idx: number) => {
    const list = previewItems.length > 0 ? previewItems : items;
    const i = list.findIndex(it => it.record_no === item.record_no);
    const previewable = ['image', 'video', 'audio'];
    if (previewable.includes(item.type)) { setPreviewItem(item); setPreviewIndex(i >= 0 ? i : idx); return; }
    if (item.type === 'document') {
      const ext = item.original_name?.split('.').pop()?.toLowerCase();
      if (ext === 'pdf') { setPreviewItem(item); setPreviewIndex(i >= 0 ? i : idx); return; }
    }
    toast.error('此文件类型不支持预览，请下载查看');
  };

  const handleDownload = (item: EvidenceItem) => {
    const a = document.createElement('a');
    a.href = fullUrl(item.url); a.download = item.original_name; a.click();
  };

  const handleBatchDownload = async () => {
    const toDl = selected.size > 0 ? selectedItems : items;
    if (toDl.length === 0) return;
    if (toDl.length === 1) { handleDownload(toDl[0]); return; }
    try {
      toast.loading('正在打包...');
      const res = await api.post('/admin/export/download', { urls: toDl.map(it => ({ url: it.url, name: it.original_name })) }, { responseType: 'blob' });
      toast.dismiss();
      if (res.data.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = () => { try { const j = JSON.parse(reader.result as string); toast.error(j.message || '下载失败'); } catch { toast.error('下载失败'); } };
        reader.readAsText(res.data);
      } else {
        const blob = new Blob([res.data], { type: 'application/zip' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = '证据文件.zip'; a.click();
        window.URL.revokeObjectURL(url);
        toast.success('下载完成');
      }
    } catch { toast.dismiss(); toast.error('打包下载失败'); }
  };

  const toggleSelect = (rno: number) => {
    const next = new Set(selected); next.has(rno) ? next.delete(rno) : next.add(rno); setSelected(next);
  };
  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(it => it.record_no)));
  };

  const handleDelete = async (item: EvidenceItem) => {
    setConfirmDelete(item);
  };

  const execDelete = async () => {
    if (!confirmDelete) return;
    const item = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.delete(`/media/${item.id}`);
      toast.success('已删除');
      setItems(prev => prev.filter(it => it.record_no !== item.record_no));
      setPreviewItems(prev => prev.filter(it => it.record_no !== item.record_no));
      setSelected(prev => { const next = new Set(prev); next.delete(item.record_no); return next; });
    } catch (err: any) { toast.error(err.response?.data?.message || '删除失败'); }
  };
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB';
  };
  const typeLabel = (t: string) => ({ image: '图片', video: '视频', audio: '音频', document: '文件' }[t] || t);

  const evidenceStatus = (hash?: string) => {
    if (hash) return { icon: 'shield-check', color: '#34C759', label: '存证完成', tip: '文件已生成数字指纹，可验真溯源' };
    return { icon: 'alert', color: '#FF3B30', label: '存证异常', tip: '存证失败，请重试' };
  };

  const handleExportExcel = () => {
    if (items.length === 0) { toast.error('无数据可导出'); return; }
    try {
      const ws = XLSX.utils.json_to_sheet(items.map(it => ({
        '证据编号': `NO.${it.record_no}`,
        '分类': it.category_name || '-',
        '文件名': it.original_name,
        '上传人': it.user_name || '-',
        '上传时间': it.uploaded_at || '-',
        '存证状态': evidenceStatus(it.file_hash).label,
        'SHA-256 哈希': it.file_hash || '-',
      })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, '存证清单');
      XLSX.writeFile(wb, `存证清单_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('导出成功');
    } catch { toast.error('导出失败'); }
  };

  const handleExportCertPdf = (item: EvidenceItem) => {
    const isDark = document.documentElement.classList.contains('dark');
    const siteName = document.querySelector('title')?.textContent || '物业服务监督系统';
    const html = `<!DOCTYPE html><html class="${isDark ? 'dark' : ''}"><head><meta charset="utf-8"><title>存证凭证</title>
<style>*,*::before,*::after{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",sans-serif;margin:0;padding:40px;color:#1D1D1F;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.cert{max-width:700px;margin:0 auto;border:2px solid #E5E5EA;border-radius:16px;padding:48px}
h1{text-align:center;font-size:22px;margin:0 0 4px}h2{text-align:center;font-size:13px;color:#86868B;font-weight:400;margin:0 0 32px;padding-bottom:24px;border-bottom:1px solid #E5E5EA}
.info{font-size:13px;line-height:2}.info dt{color:#86868B;font-size:11px;margin-top:12px}.info dd{margin:0 0 0 0;color:#1D1D1F;font-weight:500;word-break:break-all}
.fingerprint{background:#f5f5f7;border-radius:12px;padding:16px;margin-top:24px;font-size:12px}
.fingerprint .label{color:#86868B;font-size:11px;margin-bottom:8px}.fingerprint .hash{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;word-break:break-all;color:#1D1D1F;line-height:1.6}
.footer{text-align:center;margin-top:32px;padding-top:24px;border-top:1px solid #E5E5EA;font-size:10px;color:#86868B}
@media(prefers-color-scheme:dark){.dark body{background:#1C1C1E;color:#E0E0E0}.dark .cert{border-color:#3A3A3A}.dark h2,.dark .info dt,.dark .fingerprint .label,.dark .footer{color:#98989D}.dark .info dd,.dark .fingerprint .hash{color:#E0E0E0}.dark .fingerprint{background:#2C2C2E}}
@media print{@page{size:A4;margin:15mm}body{padding:0}.cert{border:none;padding:0}}</style></head><body>
<div class="cert"><h1>${siteName}</h1><h2>电子数据存证凭证</h2>
<dl class="info"><dt>证据编号</dt><dd>NO.${item.record_no}</dd>
<dt>文件名称</dt><dd>${item.original_name}</dd>
<dt>文件大小</dt><dd>${formatBytes(item.size_bytes)}</dd>
<dt>文件类型</dt><dd>${typeLabel(item.type)}</dd>
<dt>文件分类</dt><dd>${item.category_name || '-'}</dd>
<dt>上传人</dt><dd>${item.user_name || '-'}</dd>
<dt>上传时间</dt><dd>${item.uploaded_at}</dd>
<dt>存储位置</dt><dd>${item.storage_location || '本地存储'}</dd>
${item.file_hash ? `<div class="fingerprint"><div class="label">数字指纹 (SHA-256)</div><div class="hash">${item.file_hash}</div></div>` : ''}
</dl>
<div class="footer">本凭证由系统自动生成，用于证明文件在存证时间点后的完整性<br>凭证生成时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</div>
</div></body></html>`;
    const a = document.createElement('a');
    a.href = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
    a.download = `存证凭证_NO.${item.record_no}.html`;
    a.click();
    toast.success('凭证已导出，打开后可使用浏览器打印为PDF');
  };

  return (
    <div>
      <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight mb-6">证据清单</h2>

      <div className="border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm bg-[var(--card)]">
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div><label className="text-[var(--foreground)] text-xs font-semibold text-[var(--muted-foreground)] mb-1 block">分类</label>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none">
                <option value="">全部分类</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="text-[var(--foreground)] text-xs font-semibold text-[var(--muted-foreground)] mb-1 block">类型</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm">
                <option value="">全部类型</option><option value="image">图片</option><option value="video">视频</option><option value="audio">音频</option><option value="document">文件</option></select></div>
            <div><label className="text-[var(--foreground)] text-xs font-semibold text-[var(--muted-foreground)] mb-1 block">开始日期</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm" /></div>
            <div><label className="text-[var(--foreground)] text-xs font-semibold text-[var(--muted-foreground)] mb-1 block">结束日期</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm" /></div>
            <div className="flex items-end gap-2"><button onClick={handleSearch} disabled={loading} className="flex-1 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-60">{loading ? '查询中...' : '查询'}</button></div>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)] flex-wrap">
              <span className="text-xs text-[var(--muted-foreground)]">共 {items.length} 条</span>
              <button onClick={() => { setSelectMode(!selectMode); setSelected(new Set()); }} className={`px-3 py-1 text-xs rounded-lg font-medium ${selectMode ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>{selectMode ? '取消选择' : '选择'}</button>
              {selectMode && (<><button onClick={selectAll} className="text-xs text-[var(--primary)] hover:underline">{selected.size === items.length ? '取消全选' : '全选'}</button><span className="text-xs text-[var(--muted-foreground)]">已选 {selected.size} 项</span></>)}
              <div className="flex-1" />
              <button onClick={handleBatchDownload} className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] font-medium">{selected.size > 0 ? `下载 (${selected.size})` : '下载全部'}</button>
              <button onClick={() => saveFiltersAndNavigate('/share', { state: { ids: (selected.size > 0 ? selectedItems : items).map(it => it.id) } })}
                className="px-3 py-1 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">分享 {selected.size > 0 ? `(${selected.size})` : ''}</button>
              <button onClick={handlePrint} className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] font-medium">打印预览 {selected.size > 0 ? `(${selected.size})` : ''}</button>
              <button onClick={handleExportExcel} className="px-3 py-1 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">导出现存证清单</button>
            </div>
          )}
        </div>

        {items.length > 0 && (<>
          <div className="overflow-x-auto border-t border-[var(--border)]" style={{ overflowY: 'visible', maxHeight: 'calc(100vh - 350px)' }}>
            <table className="app-table">
              <thead><tr className="border-b border-[var(--border)] text-[var(--muted-foreground)] text-xs">
                {selectMode && <th className="text-left py-3 px-4 w-10"></th>}
                <th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">编号</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">类型</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">分类</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">文件名</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">情况说明</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">上传人</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">存储位置</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">上传时间</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">大小</th><th className="text-[var(--muted-foreground)] text-left py-3 px-4 font-medium">操作</th></tr></thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.record_no} onDoubleClick={() => handlePreview(item, i)}
                    onClick={() => selectMode && toggleSelect(item.record_no)}
                    className={`border-b border-[var(--border)] last:border-none transition-colors ${selectMode ? 'cursor-pointer' : 'cursor-pointer hover:bg-[var(--muted)]/50'} ${selectMode && selected.has(item.record_no) ? 'bg-blue-50/50 dark:bg-blue-900/20' : ''}`}>
                    {selectMode && (<td className="py-2.5 px-4"><div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${selected.has(item.record_no) ? 'bg-[var(--primary)] border-[var(--primary)]' : 'border-[var(--border)]'}`}>{selected.has(item.record_no) && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}><path d="M20 6L9 17l-5-5"/></svg>}</div></td>)}
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1.5">
                        {(() => {
                          const st = evidenceStatus(item.file_hash);
                          return st.icon === 'shield-check' ? (
                            <span title={st.tip}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: st.color, flexShrink: 0 }}>
                                <path d="M12 2l7 4v5c0 5-3.5 9.7-7 11-3.5-1.3-7-6-7-11V6l7-4z" fill="currentColor" opacity="0.15"/>
                                <path d="M12 2l7 4v5c0 5-3.5 9.7-7 11-3.5-1.3-7-6-7-11V6l7-4z" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </span>
                          ) : (
                            <span title={st.tip}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ color: st.color, flexShrink: 0 }}>
                                <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.15"/>
                                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                                <path d="M12 8v4M12 16h0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                              </svg>
                            </span>
                          );
                        })()}
                        <span className="font-mono text-xs">NO.{item.record_no}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4">{typeLabel(item.type)}</td>
                    <td className="py-2.5 px-4 text-[var(--muted-foreground)]">{item.category_name || '-'}</td>
                    <td className="py-2.5 px-4 max-w-[200px] truncate" title={item.original_name}>{item.original_name}</td>
                    <td className="py-2.5 px-4 text-[var(--muted-foreground)] text-xs max-w-[150px] truncate">{item.address || '-'}</td>
                    <td className="py-2.5 px-4 text-xs">{item.user_name || '-'}</td>
                    <td className="py-2.5 px-4 text-xs text-[var(--muted-foreground)]">{item.storage_location || '本地存储'}</td>
                    <td className="py-2.5 px-4 text-xs text-[var(--muted-foreground)]">{item.uploaded_at}</td>
                    <td className="py-2.5 px-4 text-xs text-[var(--muted-foreground)]">{formatBytes(item.size_bytes)}</td>
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setDetailItem(item); }} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors" title="存证详情">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <path d="M9 12h6M12 9v6"/>
                          </svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setVerifyItem(item); }} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] transition-colors" title="文件验真">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                            <path d="M12 2l7 4v5c0 5-3.5 9.7-7 11-3.5-1.3-7-6-7-11V6l7-4z"/>
                            <path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); handleDelete(item); }} className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] transition-colors" title="删除">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
      {!loading && items.length === 0 && (<div className="text-center py-12 text-[var(--muted-foreground)] text-sm">{categoryId || dateFrom || dateTo || type ? '未找到匹配的证据数据' : '暂无证据数据'}</div>)}

      <ConfirmModal open={!!confirmDelete} title="确认删除" message="此操作不可撤销，确定要删除此记录吗？" onConfirm={execDelete} onCancel={() => setConfirmDelete(null)} danger />

      {showPrintPreview && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowPrintPreview(false)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ height: '90vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]"><h3 className="text-[var(--foreground)] text-sm font-semibold">打印预览</h3><div className="flex items-center gap-2"><button onClick={doPrint} disabled={!printReady} className="px-4 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-50">打印</button><button onClick={() => setShowPrintPreview(false)} className="p-1 hover:bg-[var(--accent)] rounded-lg"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg></button></div></div>
            <iframe ref={printFrameRef} id="printFrame" srcDoc={printHtml} onLoad={() => setPrintReady(true)} className="flex-1 w-full border-0 rounded-b-2xl bg-[var(--card)]" />
          </div>
        </div>
      )}

      {previewItem && (
        <PreviewModal
          items={(previewItems.length > 0 ? previewItems : items).map(it => ({ url: it.url, original_name: it.original_name, type: it.type }))}
          index={(previewItems.length > 0 ? previewItems : items).findIndex(it => it.record_no === previewItem.record_no)}
          onClose={() => setPreviewItem(null)}
          onPrev={(previewItems.length > 0 ? previewItems : items).length > 1 ? () => {
            const list = previewItems.length > 0 ? previewItems : items;
            const i = list.findIndex(it => it.record_no === previewItem.record_no);
            if (i > 0) { setPreviewItem(list[i - 1]); setPreviewIndex(i - 1); }
          } : undefined}
          onNext={(previewItems.length > 0 ? previewItems : items).length > 1 ? () => {
            const list = previewItems.length > 0 ? previewItems : items;
            const i = list.findIndex(it => it.record_no === previewItem.record_no);
            if (i < list.length - 1) { setPreviewItem(list[i + 1]); setPreviewIndex(i + 1); }
          } : undefined}
        />
      )}

      {/* Evidence detail modal */}
      {detailItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetailItem(null)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <h3 className="text-[var(--foreground)] text-sm font-semibold">存证详情</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => handleExportCertPdf(detailItem)} className="px-3 py-1 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">导出存证凭证</button>
                <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-[var(--accent)] rounded-lg">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div><span className="text-[var(--muted-foreground)]">证据编号</span><div className="text-[var(--foreground)] font-medium mt-0.5 font-mono">NO.{detailItem.record_no}</div></div>
                <div><span className="text-[var(--muted-foreground)]">文件大小</span><div className="text-[var(--foreground)] font-medium mt-0.5">{formatBytes(detailItem.size_bytes)}</div></div>
                <div><span className="text-[var(--muted-foreground)]">文件名</span><div className="text-[var(--foreground)] font-medium mt-0.5 truncate" title={detailItem.original_name}>{detailItem.original_name}</div></div>
                <div><span className="text-[var(--muted-foreground)]">文件类型</span><div className="text-[var(--foreground)] font-medium mt-0.5">{typeLabel(detailItem.type)}</div></div>
                <div><span className="text-[var(--muted-foreground)]">文件分类</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.category_name || '-'}</div></div>
                <div><span className="text-[var(--muted-foreground)]">上传人</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.user_name || '-'}</div></div>
                <div className="col-span-2"><span className="text-[var(--muted-foreground)]">上传时间</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.uploaded_at}</div></div>
                <div className="col-span-2"><span className="text-[var(--muted-foreground)]">存储位置</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.storage_location || '本地存储'}</div></div>
              </div>

              {detailItem.file_hash && (
                <div className="bg-[var(--muted)] rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[var(--foreground)]">数字指纹 (SHA-256)</span>
                    <button onClick={() => { navigator.clipboard.writeText(detailItem.file_hash || ''); toast.success('已复制'); }}
                      className="text-[10px] text-[var(--primary)] font-medium hover:underline">一键复制</button>
                  </div>
                  <div className="font-mono text-[11px] text-[var(--foreground)] break-all leading-relaxed bg-[var(--background)] rounded-lg p-3">{detailItem.file_hash}</div>
                </div>
              )}

              <div className="bg-[var(--muted)] rounded-xl p-4 space-y-2">
                <span className="text-xs font-semibold text-[var(--foreground)]">印记详情</span>
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--muted-foreground)]">水印叠加：</span>
                    {detailItem.watermark_applied ? (
                      <span className="flex items-center gap-1 text-[#34C759]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M20 6L9 17l-5-5"/></svg>已叠加</span>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">未叠加</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--muted-foreground)]">元数据嵌入：</span>
                    {['video', 'audio'].includes(detailItem.type) ? (
                      <span className="flex items-center gap-1 text-[#34C759]"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M20 6L9 17l-5-5"/></svg>已嵌入</span>
                    ) : detailItem.type === 'image' ? (
                      <span className="text-[var(--muted-foreground)]">不适用（图片水印替代）</span>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">不支持此格式</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* File verify modal */}
      {verifyItem && (
        <FileVerifyModal item={verifyItem} onClose={() => setVerifyItem(null)} />
      )}
    </div>
  );
}

function sha256Hex(data: ArrayBuffer): string {
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  const ch = (x: number, y: number, z: number) => (x & y) ^ (~x & z);
  const maj = (x: number, y: number, z: number) => (x & y) ^ (x & z) ^ (y & z);
  const sig0 = (x: number) => rotr(x, 2) ^ rotr(x, 13) ^ rotr(x, 22);
  const sig1 = (x: number) => rotr(x, 6) ^ rotr(x, 11) ^ rotr(x, 25);
  const om0 = (x: number) => rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3);
  const om1 = (x: number) => rotr(x, 17) ^ rotr(x, 19) ^ (x >>> 10);

  const bytes = new Uint8Array(data);
  const bitLen = bytes.length * 8;
  // pad: append 0x80, then zeros, then 64-bit big-endian length
  const padLen = (((bytes.length + 9 + 63) >>> 6) << 6);
  const padded = new Uint8Array(padLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(padLen - 8, Math.floor(bitLen / 0x100000000), false); // high 32 bits
  dv.setUint32(padLen - 4, bitLen >>> 0, false);

  let H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const W = new Uint32Array(64);

  for (let offset = 0; offset < padLen; offset += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] = dv.getUint32(offset + t * 4, false);
    }
    for (let t = 16; t < 64; t++) {
      W[t] = (om1(W[t - 2]) + W[t - 7] + om0(W[t - 15]) + W[t - 16]) >>> 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let t = 0; t < 64; t++) {
      const T1 = (h + sig1(e) + ch(e, f, g) + K[t] + W[t]) >>> 0;
      const T2 = (sig0(a) + maj(a, b, c)) >>> 0;
      h = g; g = f; f = e; e = (d + T1) >>> 0; d = c; c = b; b = a; a = (T1 + T2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0; H[1] = (H[1] + b) >>> 0; H[2] = (H[2] + c) >>> 0; H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0; H[5] = (H[5] + f) >>> 0; H[6] = (H[6] + g) >>> 0; H[7] = (H[7] + h) >>> 0;
  }
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += H[i].toString(16).padStart(8, '0');
  }
  return hex;
}

function FileVerifyModal({ item, onClose }: { item: EvidenceItem; onClose: () => void }) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ match: boolean; hash: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setSelectedFile(file); setResult(null); setProgress(0); }
  };

  const computeHash = async () => {
    if (!selectedFile) return;
    if (!item.file_hash) { toast.error('原始存证哈希不存在，无法验真'); return; }
    setComputing(true);
    setProgress(0);
    try {
      const buffer = await selectedFile.arrayBuffer();
      let hashHex: string;
      try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      } catch {
        hashHex = sha256Hex(buffer);
      }
      setProgress(100);
      const match = hashHex.toLowerCase() === item.file_hash.toLowerCase();
      setResult({ match, hash: hashHex });
      toast.success(match ? '验真通过' : '验真失败');
    } catch {
      toast.error('验真计算失败');
    } finally {
      setComputing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
          <h3 className="text-[var(--foreground)] text-sm font-semibold">文件验真</h3>
          <button onClick={onClose} className="p-1 hover:bg-[var(--accent)] rounded-lg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="bg-[var(--muted)] rounded-xl p-3 space-y-1">
            <div className="text-xs text-[var(--muted-foreground)]">待验证文件</div>
            <div className="text-sm text-[var(--foreground)] font-medium">NO.{item.record_no} - {item.original_name}</div>
          </div>

          {item.file_hash && (
            <div className="bg-[var(--muted)] rounded-xl p-3 space-y-1">
              <div className="text-xs text-[var(--muted-foreground)]">原始存证哈希 (SHA-256)</div>
              <div className="font-mono text-[10px] text-[var(--foreground)] break-all">{item.file_hash}</div>
            </div>
          )}

          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">选择本地文件</label>
            <input type="file" onChange={handleFileChange}
              className="w-full text-xs text-[var(--foreground)] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[var(--primary)] file:text-[var(--primary-foreground)] hover:file:opacity-80 cursor-pointer" />
          </div>

          {selectedFile && !computing && !result && (
            <button onClick={computeHash}
              className="w-full py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium">开始验真</button>
          )}

          {(computing || progress > 0) && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs"><span className="text-[var(--muted-foreground)]">{computing ? '计算中...' : '计算完成'}</span><span className="text-[var(--muted-foreground)]">{progress}%</span></div>
              <div className="w-full h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-300" style={{ width: `${progress}%`, backgroundColor: result?.match ? '#34C759' : result && !result.match ? '#FF3B30' : '#007AFF' }} />
              </div>
            </div>
          )}

          {result && (
            <div className={`rounded-xl p-4 ${result.match ? 'bg-[#34C759]/10' : 'bg-[#FF3B30]/10'}`}>
              <div className="flex items-center gap-2 mb-2">
                {result.match ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34C759" strokeWidth={2.5}><path d="M20 6L9 17l-5-5"/></svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" strokeWidth={2.5}><path d="M18 6L6 18M6 6l12 12"/></svg>
                )}
                <span className={`text-sm font-semibold ${result.match ? 'text-[#34C759]' : 'text-[#FF3B30]'}`}>
                  {result.match ? '文件与原始存证一致，未被篡改' : '文件内容已被修改，与原始存证不符'}
                </span>
              </div>
              <div className="font-mono text-[10px] text-[var(--muted-foreground)] break-all">本地哈希：{result.hash}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
