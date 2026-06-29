import { useEffect, useState } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import ConfirmModal from '@/components/ConfirmModal';
import PreviewModal from '@/components/PreviewModal';
import { DataTable, type Column, type BatchAction } from '@/components/DataTable';
import * as XLSX from 'xlsx';

interface ShareItem {
  id: number; token: string; user_name: string; media_count: number;
  password: string; password_hash: string; visit_count: number;
  download_count: number; last_access_at?: string;
  status: string; ip_address: string; expires_at: string; created_at: string;
}

interface MediaItem { id: number; record_no: number; original_name: string; type: string; url: string; thumbnail_url?: string; category_name?: string; uploaded_at: string; }
interface LogItem { id: number; share_id: number; ip: string; action: string; created_at: string; }

const statusLabel = (s: string) => ({ active: '有效', expired: '已过期', disabled: '已失效' }[s] || s);
const statusColor = (s: string) => s === 'active' ? '#34C759' : s === 'expired' ? '#86868B' : '#FF3B30';
const statusBg = (s: string) => s === 'active' ? 'rgba(52,199,89,0.1)' : s === 'expired' ? 'rgba(134,134,139,0.1)' : 'rgba(255,59,48,0.1)';

export default function Shares() {
  const [items, setItems] = useState<ShareItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<number[]>([]);
  const [detailItem, setDetailItem] = useState<ShareItem | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'files' | 'logs'>('info');
  const [detailFiles, setDetailFiles] = useState<MediaItem[]>([]);
  const [detailLogs, setDetailLogs] = useState<LogItem[]>([]);
  const [showPassword, setShowPassword] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ShareItem | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [previewItem, setPreviewItem] = useState<MediaItem | null>(null);
  const [renewItem, setRenewItem] = useState<ShareItem | null>(null);
  const [renewDays, setRenewDays] = useState(7);
  const [editItem, setEditItem] = useState<ShareItem | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [editExpiry, setEditExpiry] = useState('');

  const load = async () => {
    setLoading(true);
    try { const res = await api.get('/admin/shares'); if (res.data.code === 0) setItems(res.data.data || []); } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const copyText = (text: string) => {
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast.success('已复制'));
    else { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); toast.success('已复制'); }
  };

  const execDelete = async () => {
    if (!confirmDelete) return;
    try { await api.delete(`/admin/shares/${confirmDelete.id}`); toast.success('已删除'); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || '删除失败'); }
    finally { setConfirmDelete(null); }
  };

  const execBatchDelete = async () => {
    try { await api.post('/admin/shares/batch-delete', { ids: selected }); toast.success('已删除'); setSelected([]); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || '批量删除失败'); }
    finally { setConfirmBatchDelete(false); }
  };

  const toggleStatus = async (item: ShareItem) => {
    const newStatus = item.status === 'disabled' ? 'active' : 'disabled';
    try { await api.patch(`/admin/shares/${item.id}/status`, { status: newStatus }); toast.success(newStatus === 'active' ? '已恢复' : '已失效'); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const batchStatus = async (status: string) => {
    try { await api.post('/admin/shares/batch-status', { ids: selected, status }); toast.success(`已${status === 'active' ? '恢复' : '失效'} ${selected.length} 条`); setSelected([]); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const doRenew = async () => {
    if (!renewItem) return;
    try { await api.patch(`/admin/shares/${renewItem.id}/renew`, { days: renewDays }); toast.success(`已续期 ${renewDays} 天`); setRenewItem(null); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || '续期失败'); }
  };

  const doEdit = async () => {
    if (!editItem) return;
    const body: any = {};
    if (editPassword !== editItem.password) body.password = editPassword;
    if (editExpiry) body.expires_at = editExpiry;
    if (Object.keys(body).length === 0) { setEditItem(null); return; }
    try { await api.patch(`/admin/shares/${editItem.id}`, body); toast.success('已更新'); setEditItem(null); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || '更新失败'); }
  };

  const openDetail = async (item: ShareItem) => {
    setDetailItem(item); setDetailTab('info');
    try {
      const [fRes, lRes] = await Promise.all([
        api.get(`/admin/shares/${item.id}/files`),
        api.get(`/admin/shares/${item.id}/logs`),
      ]);
      if (fRes.data.code === 0) setDetailFiles(fRes.data.data || []);
      if (lRes.data.code === 0) setDetailLogs(lRes.data.data || []);
    } catch {}
  };

  const handleExportExcel = () => {
    if (items.length === 0) { toast.error('无数据可导出'); return; }
    try {
      const ws = XLSX.utils.json_to_sheet(items.map(s => ({
        '分享人': s.user_name, '文件数': s.media_count, '状态': statusLabel(s.status),
        '浏览次数': s.visit_count, '下载次数': s.download_count, '最后访问': s.last_access_at || '-',
        'IP地址': s.ip_address || '-', '有效期': s.expires_at ? new Date(s.expires_at).toLocaleString('zh-CN') : '-',
        '分享时间': s.created_at?.split('.')[0].replace('T', ' ') || '-',
        '链接': `${window.location.origin}/shared/${s.token}`,
      })));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, '分享台账');
      XLSX.writeFile(wb, `分享台账_${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('导出成功');
    } catch { toast.error('导出失败'); }
  };

  const Svg = { eye: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 5c-7 0-11 7-11 7s4 7 11 7 11-7 11-7-4-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>,
    eyeOff: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><path d="M1 1l22 22"/></svg>,
    copy: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
    detail: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><circle cx="12" cy="12" r="3"/><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/></svg>,
    renew: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>,
    disable: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>,
    enable: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/><path d="M12 14v4"/></svg>,
    trash: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
  };

  const columns: Column<ShareItem>[] = [
    { key: 'user_name', label: '分享人', width: 100, fixed: 'left' },
    { key: 'status', label: '状态', width: 64, fixed: 'left',
      render: (v) => <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ color: statusColor(v), backgroundColor: statusBg(v) }}>{statusLabel(v)}</span> },
    { key: 'media_count', label: '文件', width: 56, align: 'center',
      render: (v) => <span className="text-xs text-[var(--muted-foreground)] tabular-nums">{v}</span> },
    { key: 'password', label: '密码', width: 80,
      render: (v, row) => row.password ? <span className="inline-flex items-center gap-1 whitespace-nowrap"><span className="font-mono text-[11px]">{showPassword === row.id ? row.password : '••••'}</span>
        <button onClick={e => { e.stopPropagation(); setShowPassword(showPassword === row.id ? null : row.id); }} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] flex-shrink-0">{showPassword === row.id ? Svg.eyeOff : Svg.eye}</button></span>
        : <span className="text-[var(--muted-foreground)] text-xs">—</span> },
    { key: 'visit_count', label: '浏览', width: 46, align: 'center',
      render: (v) => <span className="text-xs text-[var(--muted-foreground)] tabular-nums">{v || 0}</span> },
    { key: 'download_count', label: '下载', width: 46, align: 'center',
      render: (v) => <span className="text-xs text-[var(--muted-foreground)] tabular-nums">{v || 0}</span> },
    { key: 'last_access', label: '最后访问', width: 150,
      render: (v) => <span className="text-xs text-[var(--muted-foreground)] block truncate" title={v || '-'}>{v ? v.split('.')[0].replace('T', ' ') : '-'}</span> },
    { key: 'ip_address', label: 'IP地址', width: 128,
      render: (v) => <span className="text-xs font-mono text-[var(--muted-foreground)] block truncate" title={v || '-'}>{v || '-'}</span> },
    { key: 'expires_at', label: '有效期', width: 150,
      render: (v) => <span className="text-xs text-[var(--muted-foreground)] block truncate" title={v ? new Date(v).toLocaleString('zh-CN') : '-'}>{v ? new Date(v).toLocaleString('zh-CN') : '-'}</span> },
    { key: 'created_at', label: '分享时间', width: 150,
      render: (v) => <span className="text-xs text-[var(--muted-foreground)] block truncate" title={v?.split('.')[0].replace('T', ' ')}>{v?.split('.')[0].replace('T', ' ')}</span> },
    { key: 'link', label: '链接', width: 240,
      render: (_, row) => <div className="flex items-center gap-1"><span className="text-xs font-mono truncate text-[var(--muted-foreground)] flex-1 min-w-0" title={`${window.location.origin}/shared/${row.token}`}>{window.location.origin}/shared/{row.token}</span>
        <button onClick={e => { e.stopPropagation(); copyText(`${window.location.origin}/shared/${row.token}`); }} className="flex-shrink-0 text-[var(--muted-foreground)] hover:text-[var(--primary)] p-0.5" title="复制链接">{Svg.copy}</button></div> },
    { key: 'actions', label: '操作', width: 180, fixed: 'right',
      render: (_, row) => <div className="flex items-center gap-0.5 whitespace-nowrap">
        <button onClick={e => { e.stopPropagation(); openDetail(row); }} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] p-1.5" title="查看详情">{Svg.detail}</button>
        <button onClick={e => { e.stopPropagation(); copyText(`${window.location.origin}/shared/${row.token}`); }} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] p-1.5" title="复制链接">{Svg.copy}</button>
        {(row.status === 'active' || row.status === 'expired') && (
          <button onClick={e => { e.stopPropagation(); setRenewItem(row); }} className="text-[var(--muted-foreground)] hover:text-[var(--primary)] p-1.5" title="续期">{Svg.renew}</button>
        )}
        {row.status !== 'disabled' ? (
          <button onClick={e => { e.stopPropagation(); toggleStatus(row); }} className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] p-1.5" title="失效">{Svg.disable}</button>
        ) : (
          <button onClick={e => { e.stopPropagation(); toggleStatus(row); }} className="text-[var(--muted-foreground)] hover:text-[#34C759] p-1.5" title="恢复">{Svg.enable}</button>
        )}
        <button onClick={e => { e.stopPropagation(); setConfirmDelete(row); }} className="text-[var(--muted-foreground)] hover:text-[var(--destructive)] p-1.5" title="删除">{Svg.trash}</button>
      </div> },
  ];

  const batchActions: BatchAction[] = [
    { key: 'export', label: '导出台账', variant: 'primary', onClick: () => handleExportExcel() },
    { key: 'batchDisable', label: '批量失效', requireSelection: true, onClick: (ids) => { if (ids.length) batchStatus('disabled'); } },
    { key: 'batchDelete', label: '批量删除', variant: 'danger', requireSelection: true, onClick: () => { if (selected.length) setConfirmBatchDelete(true); } },
  ];

  return (
    <div>
      <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight mb-6">分享管理</h2>

      <DataTable<ShareItem>
        columns={columns}
        data={items}
        loading={loading}
        selection="multi"
        selectedIds={selected}
        onSelectionChange={setSelected}
        onRowDoubleClick={openDetail}
        batchActions={batchActions}
        columnConfigKey="shares_visibleCols"
        minWidth={1100}
        emptyText="暂无分享记录"
      />

      {detailItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDetailItem(null)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <h3 className="text-[var(--foreground)] text-sm font-semibold">分享详情</h3>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg bg-[var(--muted)] p-0.5 gap-0.5">
                  {(['info', 'files', 'logs'] as const).map(tab => (
                    <button key={tab} onClick={() => setDetailTab(tab)}
                      className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${detailTab === tab ? 'bg-[var(--background)] text-[var(--foreground)] shadow-sm' : 'text-[var(--muted-foreground)]'}`}>
                      {tab === 'info' ? '基础信息' : tab === 'files' ? `文件 (${detailFiles.length})` : `访问日志 (${detailLogs.length})`}
                    </button>
                  ))}
                </div>
                <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-[var(--accent)] rounded-lg">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              {detailTab === 'info' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                    <div><span className="text-[var(--muted-foreground)]">分享人</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.user_name}</div></div>
                    <div><span className="text-[var(--muted-foreground)]">文件数</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.media_count} 个</div></div>
                    <div><span className="text-[var(--muted-foreground)]">状态</span><div className="mt-0.5"><span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ color: statusColor(detailItem.status), backgroundColor: statusBg(detailItem.status) }}>{statusLabel(detailItem.status)}</span></div></div>
                    <div><span className="text-[var(--muted-foreground)]">密码</span><div className="text-[var(--foreground)] font-medium mt-0.5 font-mono">{detailItem.password || '无'}</div></div>
                    <div><span className="text-[var(--muted-foreground)]">有效期</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.expires_at ? new Date(detailItem.expires_at).toLocaleString('zh-CN') : '-'}</div></div>
                    <div><span className="text-[var(--muted-foreground)]">分享时间</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.created_at?.split('.')[0].replace('T', ' ')}</div></div>
                    <div><span className="text-[var(--muted-foreground)]">浏览次数</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.visit_count || 0}</div></div>
                    <div><span className="text-[var(--muted-foreground)]">下载次数</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.download_count || 0}</div></div>
                    <div><span className="text-[var(--muted-foreground)]">最后访问</span><div className="text-[var(--foreground)] font-medium mt-0.5">{detailItem.last_access_at ? detailItem.last_access_at.split('.')[0].replace('T', ' ') : '-'}</div></div>
                    <div><span className="text-[var(--muted-foreground)]">创建 IP</span><div className="text-[var(--foreground)] font-medium mt-0.5 font-mono">{detailItem.ip_address || '-'}</div></div>
                  </div>
                  <div className="bg-[var(--muted)] rounded-xl p-3 space-y-1">
                    <div className="text-xs text-[var(--muted-foreground)]">分享链接</div>
                    <div className="flex items-center gap-2">
                      <input readOnly value={`${window.location.origin}/shared/${detailItem.token}`}
                        className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs font-mono text-[var(--foreground)] cursor-pointer"
                        onClick={e => { (e.target as HTMLInputElement).select(); copyText(`${window.location.origin}/shared/${detailItem.token}`); }} />
                      <button onClick={() => copyText(`${window.location.origin}/shared/${detailItem.token}`)} className="px-3 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium">复制链接</button>
                      <button onClick={() => copyText(detailItem.password || '')} className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs text-[var(--foreground)] font-medium">复制密码</button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
                    {detailItem.status !== 'disabled' ? (
                      <button onClick={() => { toggleStatus(detailItem); setDetailItem(null); }} className="px-4 py-2 rounded-lg bg-[var(--destructive)]/10 text-[var(--destructive)] text-xs font-medium">失效链接</button>
                    ) : (
                      <button onClick={() => { toggleStatus(detailItem); setDetailItem(null); }} className="px-4 py-2 rounded-lg bg-[#34C759]/10 text-[#34C759] text-xs font-medium">恢复链接</button>
                    )}
                    <button onClick={() => { setDetailItem(null); setRenewItem(detailItem); }} className="px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-medium">续期</button>
                    <button onClick={() => { setDetailItem(null); setEditItem(detailItem); setEditPassword(detailItem.password); setEditExpiry(detailItem.expires_at); }} className="px-4 py-2 rounded-lg bg-[var(--muted)] text-[var(--foreground)] text-xs font-medium">编辑</button>
                  </div>
                </div>
              )}
              {detailTab === 'files' && (
                <div className="space-y-1">
                  {detailFiles.length === 0 ? <div className="text-center py-8 text-[var(--muted-foreground)] text-xs">暂无文件</div> : detailFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--muted)] cursor-pointer transition-colors" onClick={() => setPreviewItem(f)}>
                      <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center overflow-hidden flex-shrink-0">
                        {f.type === 'image' && f.thumbnail_url ? <img src={f.thumbnail_url} alt="" className="w-full h-full object-cover" /> : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="text-[var(--muted-foreground)]"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><rect x="1" y="3" width="22" height="18" rx="2"/></svg>
                        )}
                      </div>
                      <div className="flex-1 min-w-0"><div className="text-sm text-[var(--foreground)] truncate">{f.original_name}</div><div className="text-xs text-[var(--muted-foreground)]">NO.{f.record_no} · {f.uploaded_at}</div></div>
                    </div>
                  ))}
                </div>
              )}
              {detailTab === 'logs' && (
                <div className="space-y-1">
                  {detailLogs.length === 0 ? <div className="text-center py-8 text-[var(--muted-foreground)] text-xs">暂无访问记录</div> : detailLogs.map(l => (
                    <div key={l.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs">
                      <span className={`inline-block w-12 text-center text-[10px] px-1.5 py-0.5 rounded-full font-medium ${l.action === 'view' ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[#34C759]/10 text-[#34C759]'}`}>{l.action === 'view' ? '浏览' : '下载'}</span>
                      <span className="font-mono text-[var(--foreground)]">{l.ip || '-'}</span>
                      <span className="text-[var(--muted-foreground)] ml-auto">{l.created_at?.split('.')[0].replace('T', ' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {renewItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setRenewItem(null)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-[var(--foreground)] text-sm font-semibold mb-4">续期</h3>
            <div className="flex items-center gap-2 mb-4">
              {[7, 30].map(d => (
                <button key={d} onClick={() => setRenewDays(d)}
                  className={`flex-1 py-2 text-xs rounded-lg font-medium transition-all ${renewDays === d ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>{d} 天</button>
              ))}
              <div className="flex-1 relative">
                <input type="number" min={1} max={365} value={renewDays} onChange={e => setRenewDays(parseInt(e.target.value) || 7)}
                  className={`w-full py-2 text-xs text-center rounded-lg font-medium outline-none transition-all ${![7, 30].includes(renewDays) ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`} placeholder="自定义" />
                <span className="absolute -right-4 top-1/2 -translate-y-1/2 text-[10px] text-[var(--muted-foreground)]">天</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRenewItem(null)} className="flex-1 py-2 text-xs rounded-lg border border-[var(--border)] text-[var(--foreground)]">取消</button>
              <button onClick={doRenew} className="flex-1 py-2 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">确认续期</button>
            </div>
          </div>
        </div>
      )}

      {editItem && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setEditItem(null)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-[var(--foreground)] text-sm font-semibold mb-4">编辑分享设置</h3>
            <div className="space-y-3 mb-4">
              <div><label className="text-xs text-[var(--muted-foreground)] mb-1 block">密码（留空不修改）</label>
                <input value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder={editItem.password || '无'}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]" /></div>
              <div><label className="text-xs text-[var(--muted-foreground)] mb-1 block">有效期</label>
                <input type="datetime-local" value={editExpiry?.replace(' ', 'T')} onChange={e => setEditExpiry(e.target.value.replace('T', ' '))}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]" /></div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditItem(null)} className="flex-1 py-2 text-xs rounded-lg border border-[var(--border)] text-[var(--foreground)]">取消</button>
              <button onClick={doEdit} className="flex-1 py-2 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">保存</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal open={!!confirmDelete} title="确认删除" message="确定要删除此分享链接？删除后无法恢复。" onConfirm={execDelete} onCancel={() => setConfirmDelete(null)} danger />
      <ConfirmModal open={confirmBatchDelete} title="批量删除" message={`确定要删除选中的 ${selected.length} 条分享记录？`} onConfirm={execBatchDelete} onCancel={() => setConfirmBatchDelete(false)} danger />
      {previewItem && <PreviewModal items={[{ url: previewItem.url, original_name: previewItem.original_name, type: previewItem.type, thumbnail_url: previewItem.thumbnail_url || '' }]} index={0} onClose={() => setPreviewItem(null)} />}
    </div>
  );
}
