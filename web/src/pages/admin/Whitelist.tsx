import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { WhitelistEntry, ChangeLog, PropertyFile } from '@/types';
import ConfirmModal from '@/components/ConfirmModal';
import PreviewModal from '@/components/PreviewModal';

const statusLabels: Record<string, string> = { pending: '待注册', active: '已注册', registered: '已注册', disabled: '已禁用' };
const statusColors: Record<string, string> = {
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  active: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  registered: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  disabled: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};

function maskPhone(p: string) { return p?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') || p; }
function maskIdCard(c: string) { return c?.length >= 15 ? c.slice(0, 4) + '**********' + c.slice(-4) : c; }

interface OwnerPropertyItem {
  id: number; name: string; room: string; id_card: string; phone: string;
  email?: string; property_info?: string; status: string;
  docs: PropertyFile[]; co_owners: { id: number; name: string; room: string; phone: string; id_card: string }[];
  created_at: string;
}

export default function Whitelist() {
  const [allItems, setAllItems] = useState<WhitelistEntry[]>([]);
  const [filteredItems, setFilteredItems] = useState<WhitelistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [building, setBuilding] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', id_card: '', phone: '', room: '', email: '', remark: '' });
  const [propertyFile, setPropertyFile] = useState<File | null>(null);

  const [detailItem, setDetailItem] = useState<WhitelistEntry | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'property' | 'changelog' | 'approval'>('info');
  const [changeLogs, setChangeLogs] = useState<ChangeLog[]>([]);
  const [propertyFiles, setPropertyFiles] = useState<PropertyFile[]>([]);
  const [ownerProperties, setOwnerProperties] = useState<OwnerPropertyItem[]>([]);
  const [editForm, setEditForm] = useState({ name: '', id_card: '', phone: '', room: '', email: '', remark: '' });

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<WhitelistEntry | null>(null);
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);
  const [confirmDetailSave, setConfirmDetailSave] = useState(false);
  const [confirmDetailDelete, setConfirmDetailDelete] = useState<WhitelistEntry | null>(null);
  const [confirmToggleStatus, setConfirmToggleStatus] = useState<{ item: WhitelistEntry; action: 'enable' | 'disable' } | null>(null);
  const [previewImg, setPreviewImg] = useState<{ url: string; name: string } | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number; total: number; details: any[] } | null>(null);
  const [showSensitive, setShowSensitive] = useState<Record<number, boolean>>({});

  const buildings = ['1', '2', '3', '5', '8', '6', '7', '9', '10', '11', '12', '15', '18', '20'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page: 1, limit: 500 };
      if (filter !== 'all') params.status = filter;
      if (building) params.building = building;
      const res = await api.get('/admin/whitelist', { params });
      if (res.data.code === 0) {
        const data = res.data.data?.items || [];
        setAllItems(data);
        applyFilter(data, search);
      }
    } catch {} finally { setLoading(false); }
  }, [filter, building]);

  useEffect(() => { load(); }, [load]);

  const applyFilter = (data: WhitelistEntry[], s: string) => {
    if (!s.trim()) { setFilteredItems(data); return; }
    const kw = s.toLowerCase();
    setFilteredItems(data.filter(it =>
      it.name.toLowerCase().includes(kw) ||
      it.room.toLowerCase().includes(kw) ||
      it.phone.includes(kw) ||
      it.id_card.includes(kw)
    ));
  };

  useEffect(() => { applyFilter(allItems, search); }, [search, allItems]);

  const handleAdd = async () => {
    if (!form.name || !form.id_card || !form.phone || !form.room) { toast.error('请填写所有必填字段'); return; }
    try {
      const fd = new FormData();
      fd.append('name', form.name); fd.append('id_card', form.id_card); fd.append('phone', form.phone);
      fd.append('room', form.room); fd.append('email', form.email); fd.append('remark', form.remark);
      if (propertyFile) fd.append('property_file', propertyFile);
      await api.post('/admin/whitelist', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('添加成功'); setShowAdd(false);
      setForm({ name: '', id_card: '', phone: '', room: '', email: '', remark: '' }); setPropertyFile(null); load();
    } catch (err: any) { toast.error(err.response?.data?.message || '添加失败'); }
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    api.delete(`/admin/whitelist/${confirmDelete.id}`).then(() => { toast.success('已删除'); load(); }).catch(() => toast.error('删除失败'));
    setConfirmDelete(null);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await api.post('/admin/whitelist/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.code === 0 && res.data.data?.details) {
        setImportResult(res.data.data);
      } else {
        toast.success(res.data.message || '导入成功');
      }
      load();
    } catch (err: any) { toast.error(err.response?.data?.message || '导入失败'); }
    e.target.value = '';
  };

  const downloadTemplate = () => {
    const csv = '\uFEFF姓名,身份证号,手机号,房号,邮箱,备注\n张三,110101199001011234,13800138000,1-101,zhangsan@example.com,业主';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '业主名册导入模板.csv'; a.click(); URL.revokeObjectURL(url);
  };

  const exportData = async () => {
    try {
      const res = await api.get('/admin/whitelist/export');
      if (res.data.code === 0 && Array.isArray(res.data.data)) {
        const rows = res.data.data as any[];
        const header = '姓名,身份证号,手机号,房号,邮箱,备注,状态,添加时间\n';
        const csv = header + rows.map(r =>
          `${r.name},${r.id_card},${r.phone},${r.room},${r.email||''},${r.remark||''},${r.status},${r.created_at||''}`
        ).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = '业主名册_export.csv'; a.click(); URL.revokeObjectURL(url);
        toast.success('导出成功');
      }
    } catch { toast.error('导出失败'); }
  };

  const openDetail = async (item: WhitelistEntry) => {
    setDetailItem(item);
    setDetailTab('info');
    setEditForm({ name: item.name, id_card: item.id_card, phone: item.phone, room: item.room, email: item.email || '', remark: item.remark || '' });
    setOwnerProperties([]);
    try {
      const [logsRes, filesRes, propsRes] = await Promise.all([
        api.get(`/admin/whitelist/${item.id}/changelogs`),
        api.get(`/admin/whitelist/${item.id}/property-files`),
        api.get(`/admin/whitelist/${item.id}/properties`),
      ]);
      if (logsRes.data.code === 0) setChangeLogs(logsRes.data.data || []);
      if (filesRes.data.code === 0) setPropertyFiles(filesRes.data.data || []);
      if (propsRes.data.code === 0) setOwnerProperties(propsRes.data.data || []);
    } catch { setChangeLogs([]); setPropertyFiles([]); setOwnerProperties([]); }
  };

  const saveDetail = async () => {
    if (!detailItem) return;
    setConfirmDetailSave(false);
    try {
      await api.patch(`/admin/whitelist/${detailItem.id}`, editForm);
      toast.success('已保存'); setDetailItem(null); load();
    } catch (err: any) { toast.error(err.response?.data?.message || '保存失败'); }
  };

  const uploadPropertyFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!detailItem || !e.target.files?.[0]) return;
    const fd = new FormData();
    fd.append('property_file', e.target.files[0]);
    fd.append('remark', '');
    try {
      await api.post(`/admin/whitelist/${detailItem.id}/property-files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('已上传');
      const [filesRes, propsRes] = await Promise.all([
        api.get(`/admin/whitelist/${detailItem.id}/property-files`),
        api.get(`/admin/whitelist/${detailItem.id}/properties`),
      ]);
      if (filesRes.data.code === 0) setPropertyFiles(filesRes.data.data || []);
      if (propsRes.data.code === 0) setOwnerProperties(propsRes.data.data || []);
    } catch (err: any) { toast.error(err.response?.data?.message || '上传失败'); }
    e.target.value = '';
  };

  const deletePropertyFile = async (id: number) => {
    try { await api.delete(`/admin/whitelist/property-files/${id}`); toast.success('已删除');
      const [filesRes, propsRes] = await Promise.all([
        api.get(`/admin/whitelist/${detailItem!.id}/property-files`),
        api.get(`/admin/whitelist/${detailItem!.id}/properties`),
      ]);
      if (filesRes.data.code === 0) setPropertyFiles(filesRes.data.data || []);
      if (propsRes.data.code === 0) setOwnerProperties(propsRes.data.data || []);
    } catch { toast.error('删除失败'); }
  };

  const handleToggleStatus = async () => {
    if (!confirmToggleStatus) return;
    const { item, action } = confirmToggleStatus;
    setConfirmToggleStatus(null);
    try {
      await api.post('/admin/whitelist/batch', { ids: [item.id], action });
      toast.success(action === 'disable' ? '已禁用' : '已启用');
      setDetailItem(null); load();
    } catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const handleDetailDelete = async () => {
    if (!confirmDetailDelete) return;
    const item = confirmDetailDelete;
    setConfirmDetailDelete(null);
    try {
      await api.delete(`/admin/whitelist/${item.id}`);
      toast.success('已删除'); setDetailItem(null); load();
    } catch { toast.error('删除失败'); }
  };

  const toggleSelectAll = () => {
    if (selectAll) { setSelectedIds([]); setSelectAll(false); }
    else { setSelectedIds(filteredItems.map(i => i.id)); setSelectAll(true); }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const batchAction = async (action: string) => {
    if (selectedIds.length === 0) { toast.error('请选择记录'); return; }
    try {
      await api.post('/admin/whitelist/batch', { ids: selectedIds, action });
      toast.success('操作成功'); setSelectedIds([]); setSelectAll(false); load();
    } catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const sendRegisterLink = async (id: number) => {
    try { toast.success('注册链接已发送'); } catch {}
  };

  const formatCount = (item: WhitelistEntry) => {
    const c = (item as any).property_count;
    if (c == null) return '-';
    return c === 1 ? '1 套' : `${c} 套`;
  };

  return (<>
    <div>
      <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight mb-6">业主名册</h2>
      <div className="border border-[var(--border)] rounded-2xl shadow-sm bg-[var(--card)]">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === 'all' ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'bg-[var(--muted)]/60 text-[var(--muted-foreground)]'}`}>全部</button>
            {Object.entries(statusLabels).map(([k, v]) => (
              <button key={k} onClick={() => setFilter(k)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${filter === k ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'bg-[var(--muted)]/60 text-[var(--muted-foreground)]'}`}>{v}</button>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <input type="text" placeholder="搜索姓名/房号/手机号/身份证..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
            <select value={building} onChange={e => setBuilding(e.target.value)}
              className="px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none">
              <option value="">全部楼栋</option>
              {buildings.map(b => <option key={b} value={b}>{b}栋</option>)}
            </select>
            <label className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] cursor-pointer hover:bg-[var(--accent)] font-medium">
              导入CSV <input type="file" accept=".csv" className="hidden" onChange={handleImport} />
            </label>
            <button onClick={downloadTemplate}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] font-medium">下载模板</button>
            <button onClick={exportData}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] font-medium">导出CSV</button>
            <button onClick={() => setShowAdd(true)}
              className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">添加</button>
          </div>

          {showAdd && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border)]">
              <input placeholder="姓名 *" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <input placeholder="身份证号 *" value={form.id_card} onChange={e => setForm(p => ({...p, id_card: e.target.value}))} maxLength={18}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <input placeholder="手机号 *" value={form.phone} onChange={e => setForm(p => ({...p, phone: e.target.value}))} maxLength={11}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <input placeholder="房号 *" value={form.room} onChange={e => setForm(p => ({...p, room: e.target.value}))}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <input placeholder="邮箱" value={form.email} onChange={e => setForm(p => ({...p, email: e.target.value}))}
                className="px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <div className="flex gap-2">
                <label className={`flex-1 border-2 border-dashed rounded-lg p-2 text-center cursor-pointer text-xs ${
                  propertyFile ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--foreground)]' : 'border-[var(--border)] text-[var(--muted-foreground)]'
                }`}>
                  <input type="file" accept="image/*,.pdf" className="hidden" onChange={e => setPropertyFile(e.target.files?.[0] || null)} />
                  {propertyFile ? propertyFile.name : '房产证明'}
                </label>
                <button onClick={() => setShowAdd(false)}
                  className="px-4 py-2 text-xs rounded-lg bg-[var(--muted)] hover:bg-[var(--accent)]">取消</button>
                <button onClick={handleAdd}
                  className="px-4 py-2 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)]">确认添加</button>
            </div>
          </div>
          )}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
              <span className="text-xs text-[var(--muted-foreground)]">已选 {selectedIds.length} 条</span>
              <button onClick={() => batchAction('enable')}
                className="px-2 py-1 text-[10px] rounded bg-green-500 text-white font-medium">批量启用</button>
              <button onClick={() => batchAction('disable')}
                className="px-2 py-1 text-[10px] rounded bg-gray-500 text-white font-medium">批量禁用</button>
              <button onClick={() => setConfirmBatchDelete(true)}
                className="px-2 py-1 text-[10px] rounded bg-[var(--destructive)] text-white font-medium">批量删除</button>
              <button onClick={() => { setSelectedIds([]); setSelectAll(false); }}
                className="px-2 py-1 text-[10px] rounded bg-[var(--muted)] text-[var(--foreground)]">取消选择</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border-t border-[var(--border)]">
          {loading ? (
            <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载中...</div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">暂无数据</div>
          ) : (
            <table className="app-table">
              <thead><tr>
                <th className="w-10"><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} className="rounded" /></th>
                <th>姓名</th><th>身份证号</th><th>手机号</th><th>房号</th><th>邮箱</th><th>房产套数</th><th>状态</th><th>操作</th>
              </tr></thead>
              <tbody>
                {filteredItems.map(item => (
                  <tr key={item.id} onDoubleClick={() => openDetail(item)} className="cursor-pointer">
                    <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="rounded" /></td>
                    <td className="font-medium">{item.name}</td>
                    <td className="text-xs font-mono">
                      <span className="flex items-center gap-1">
                        {showSensitive[item.id] ? item.id_card : maskIdCard(item.id_card)}
                        <button onClick={e => { e.stopPropagation(); setShowSensitive(prev => ({...prev, [item.id]: !prev[item.id]})); }}
                          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                            {showSensitive[item.id]
                              ? <><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></>
                              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>
                            }
                          </svg>
                        </button>
                      </span>
                    </td>
                    <td className="text-xs font-mono">{showSensitive[item.id] ? item.phone : maskPhone(item.phone)}</td>
                    <td>{item.room}</td>
                    <td className="text-xs text-[var(--muted-foreground)]">{item.email || '-'}</td>
                    <td className="text-xs">{formatCount(item)}</td>
                    <td>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[item.status || 'pending']}`}>
                        {statusLabels[item.status || 'pending']}
                      </span>
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openDetail(item)} title="详情"
                          className="p-1 hover:bg-[var(--accent)] rounded">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        </button>
                        {item.status !== 'registered' && (
                          <button onClick={() => sendRegisterLink(item.id)} title="发送注册链接"
                            className="p-1 hover:bg-[var(--accent)] rounded text-[var(--primary)]">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          </button>
                        )}
                        {item.status === 'registered' ? (
                          <button onClick={() => setConfirmToggleStatus({ item, action: 'disable' })} title="禁用"
                            className="p-1 hover:bg-[var(--accent)] rounded text-orange-500">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M10.68 13.31a16 16 0 003.55 2.37m-3.67-4.07a4 4 0 11-5.66-5.66m-1.42 8.49A5 5 0 002 14v2m0 0v4h4m-4-4h6m11.31-6.31a4 4 0 01-5.66 5.66M20 10a4 4 0 01-4 4"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          </button>
                        ) : (
                          <button onClick={() => setConfirmToggleStatus({ item, action: 'enable' })} title="启用"
                            className="p-1 hover:bg-[var(--accent)] rounded text-green-500">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 11l3 3L22 4"/><path d="M21 12v3a2 2 0 01-2 2H5a2 2 0 01-2-2V9a2 2 0 012-2h7"/></svg>
                          </button>
                        )}
                        <button onClick={() => setConfirmDelete(item)} title="删除"
                          className="p-1 hover:bg-[var(--accent)] rounded text-[var(--destructive)]">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={() => { setDetailItem(null); }}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col mx-1" style={{ height: 'min(75vh, 520px)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] shrink-0">
              <h3 className="text-[var(--foreground)] text-base font-bold">{detailItem.name} - 业主详情</h3>
              <button onClick={() => setDetailItem(null)} className="p-1 hover:bg-[var(--accent)] rounded-lg">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <div className="flex flex-1 min-h-0">
              <nav className="w-36 flex-shrink-0 border-r border-[var(--border)] bg-[var(--muted)]/10 py-1 overflow-y-auto">
                {(['info', 'property', 'changelog', 'approval'] as const).map(tab => (
                  <button key={tab} onClick={() => setDetailTab(tab)}
                    className={`relative w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] transition-colors text-left ${
                      detailTab === tab
                        ? 'text-[var(--primary)] font-medium bg-[var(--primary)]/[0.04]'
                        : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]/30'
                    }`}>
                    {detailTab === tab && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-[var(--primary)] rounded-r-full" />
                    )}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="flex-shrink-0">
                      {tab === 'info' ? <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> :
                       tab === 'property' ? <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" /> :
                       tab === 'changelog' ? <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /> :
                       <path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />}
                    </svg>
                    <span>{{ info: '基本信息', property: '房产证照', changelog: '变更历史', approval: '审核记录' }[tab]}</span>
                  </button>
                ))}
              </nav>

              <div className="flex-1 overflow-y-auto min-h-0 p-3">
              {detailTab === 'info' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)]">姓名</label>
                      <input value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)]">房号</label>
                      <input value={editForm.room} onChange={e => setEditForm(p => ({...p, room: e.target.value}))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)]">身份证号</label>
                      <input value={editForm.id_card} onChange={e => setEditForm(p => ({...p, id_card: e.target.value}))} maxLength={18}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)]">手机号</label>
                      <input value={editForm.phone} onChange={e => setEditForm(p => ({...p, phone: e.target.value}))} maxLength={11}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)]">邮箱</label>
                      <input value={editForm.email} onChange={e => setEditForm(p => ({...p, email: e.target.value}))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none" />
                    </div>
                    <div>
                      <label className="text-xs text-[var(--muted-foreground)]">备注</label>
                      <input value={editForm.remark} onChange={e => setEditForm(p => ({...p, remark: e.target.value}))}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none" />
                    </div>
                  </div>

                  <div className="flex items-center gap-4 flex-wrap py-2 px-2.5 rounded-lg bg-[var(--muted)]/20">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--muted-foreground)]">注册状态</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-block ${statusColors[detailItem.status || 'pending']}`}>
                        {statusLabels[detailItem.status || 'pending']}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-[var(--muted-foreground)]">添加时间</span>
                      <span className="text-xs font-medium">{detailItem.created_at || '-'}</span>
                    </div>
                  </div>

                  <div className="flex gap-1.5 flex-wrap">
                    <button onClick={() => setConfirmDetailSave(true)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">保存修改</button>
                    {detailItem.status !== 'registered' && (
                      <button onClick={() => sendRegisterLink(detailItem.id)}
                        className="px-3 py-1.5 text-xs rounded-lg bg-blue-500 text-white font-medium">发送注册链接</button>
                    )}
                    {detailItem.status === 'registered' ? (
                      <button onClick={() => setConfirmToggleStatus({ item: detailItem, action: 'disable' })}
                        className="px-3 py-1.5 text-xs rounded-lg bg-orange-500 text-white font-medium">禁用账号</button>
                    ) : (
                      <button onClick={() => setConfirmToggleStatus({ item: detailItem, action: 'enable' })}
                        className="px-3 py-1.5 text-xs rounded-lg bg-green-500 text-white font-medium">启用账号</button>
                    )}
                    <button onClick={() => setConfirmDetailDelete(detailItem)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-[var(--destructive)] text-white font-medium">删除业主</button>
                    <button onClick={() => { setDetailItem(null); }}
                      className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)]">关闭</button>
                  </div>
                </div>
              )}

              {detailTab === 'property' && (
                <div className="space-y-2">
                  {ownerProperties.length === 0 ? (
                    <div className="text-center py-6 text-[var(--muted-foreground)] text-xs">暂无房产信息</div>
                  ) : (
                    ownerProperties.map(prop => (
                      <div key={prop.id} className="border border-[var(--border)] rounded-xl overflow-hidden">
                        <div className="p-2 bg-[var(--muted)]/20 border-b border-[var(--border)]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-[var(--foreground)]">{prop.room}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[prop.status]}`}>
                                {statusLabels[prop.status] || prop.status}
                              </span>
                            </div>
                          </div>
                          {prop.co_owners.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              <span className="text-[10px] text-[var(--muted-foreground)]">共有人:</span>
                              {prop.co_owners.map(co => (
                                <span key={co.id} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--primary)]/10 text-[var(--primary)]">
                                  {co.name} ({co.room})
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          {prop.docs.length === 0 ? (
                            <div className="text-center py-3 text-[var(--muted-foreground)] text-xs">暂无证照</div>
                          ) : (
                            <>
                              <div className="text-[10px] text-[var(--muted-foreground)] mb-1.5">证照文件 ({prop.docs.length})</div>
                              <div className="grid grid-cols-3 gap-1.5">
                                {prop.docs.map(doc => (
                                  <div key={doc.id} className="border border-[var(--border)] rounded-lg overflow-hidden group relative">
                                    {doc.url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                      <img src={doc.url} alt={doc.original_name}
                                        className="w-full h-20 object-cover cursor-pointer"
                                        onClick={() => setPreviewImg({ url: doc.url, name: doc.original_name })} />
                                    ) : (
                                      <div className="w-full h-20 flex items-center justify-center bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">{doc.original_name}</div>
                                    )}
                                    <div className="px-1.5 py-0.5">
                                      <div className="text-[10px] truncate">{doc.original_name}</div>
                                    </div>
                                    <button onClick={() => deletePropertyFile(doc.id)}
                                      className="absolute top-1 right-1 p-0.5 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  <div className="flex justify-center">
                    <label className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] cursor-pointer font-medium">
                      上传证照 <input type="file" accept="image/*,.pdf" className="hidden" onChange={uploadPropertyFile} />
                    </label>
                  </div>
                </div>
              )}

              {detailTab === 'changelog' && (
                <div className="space-y-1.5">
                  {changeLogs.length === 0 ? (
                    <div className="text-center py-6 text-[var(--muted-foreground)] text-xs">暂无变更记录</div>
                  ) : (
                    changeLogs.map(log => (
                      <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-[var(--muted)]/30 border border-[var(--border)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-[var(--primary)] mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium">{log.field}</span>
                            <span className="text-[10px] text-[var(--muted-foreground)]">{log.created_at}</span>
                          </div>
                          {log.old_value && <div className="text-[10px] text-[var(--destructive)] line-through mt-0.5">{log.old_value}</div>}
                          {log.new_value && <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">{log.new_value}</div>}
                          {log.operator_name && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">操作人: {log.operator_name}</div>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {detailTab === 'approval' && (
                <div className="space-y-1.5">
                  {changeLogs.filter(l => l.target_type === 'approval').length === 0 ? (
                    <div className="text-center py-6 text-[var(--muted-foreground)] text-xs">暂无关联审核记录</div>
                  ) : (
                    changeLogs.filter(l => l.target_type === 'approval').map(log => (
                      <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-[var(--muted)]/30 border border-[var(--border)]">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-medium">{log.field === 'status' ? '审核状态变更' : log.field}</span>
                            <span className="text-[10px] text-[var(--muted-foreground)]">{log.created_at}</span>
                          </div>
                          {log.old_value && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">从: {log.old_value}</div>}
                          {log.new_value && <div className="text-[10px] text-green-600 dark:text-green-400 mt-0.5">到: {log.new_value}</div>}
                          {log.operator_name && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">审核人: {log.operator_name}</div>}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {importResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={() => setImportResult(null)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg max-h-[70vh] flex flex-col mx-1" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)]">
              <h3 className="text-[var(--foreground)] text-lg font-bold">导入结果</h3>
              <button onClick={() => setImportResult(null)} className="p-1 hover:bg-[var(--accent)] rounded-lg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-3 text-sm font-medium">成功 {importResult.imported}/{importResult.total} 条</div>
              {importResult.details.filter(d => !d.success).length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs text-[var(--destructive)] font-medium">失败明细：</div>
                  {importResult.details.filter(d => !d.success).map((d, i) => (
                    <div key={i} className="text-[10px] p-2 rounded bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800">
                      {d.name} / {d.room}: <span className="text-[var(--destructive)]">{d.reason}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-[var(--border)] flex justify-end">
              <button onClick={() => setImportResult(null)}
                className="px-4 py-2 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)]">关闭</button>
            </div>
          </div>
        </div>
      )}
    </div>
    <ConfirmModal open={!!confirmDelete} title="确认删除" message="确定要删除该业主信息吗？此操作不可撤销。" onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} danger />
    <ConfirmModal open={confirmBatchDelete} title="确认批量删除" message={`确定要删除选中的 ${selectedIds.length} 条记录吗？此操作不可撤销。`} onConfirm={() => { setConfirmBatchDelete(false); batchAction('delete'); }} onCancel={() => setConfirmBatchDelete(false)} danger />
    <ConfirmModal open={confirmDetailSave} title="确认保存修改" message="确定要保存对业主信息的修改吗？修改后将记录变更日志。" onConfirm={saveDetail} onCancel={() => setConfirmDetailSave(false)} />
    <ConfirmModal open={!!confirmToggleStatus} title={confirmToggleStatus?.action === 'disable' ? '确认禁用账号' : '确认启用账号'}
      message={confirmToggleStatus?.action === 'disable' ? '禁用账号后该业主将无法登录系统，是否确认执行？' : '确定要启用该业主的账号吗？'}
      onConfirm={handleToggleStatus} onCancel={() => setConfirmToggleStatus(null)}
      danger={confirmToggleStatus?.action === 'disable'} />
    <ConfirmModal open={!!confirmDetailDelete} title="确认删除业主" message="删除业主信息后将不可恢复，并同步移除名下所有房产关联。确定要删除吗？"
      onConfirm={handleDetailDelete} onCancel={() => setConfirmDetailDelete(null)} danger />
    {previewImg && <PreviewModal items={[{url: previewImg.url, original_name: previewImg.name, type: 'image'}]} index={0} onClose={() => setPreviewImg(null)} />}
  </>);
}
