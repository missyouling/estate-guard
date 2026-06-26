import { useEffect, useState, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Approval, WhitelistEntry } from '@/types';
import ConfirmModal from '@/components/ConfirmModal';
import PreviewModal from '@/components/PreviewModal';

const statusLabels: Record<string, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };
const statusColors: Record<string, string> = {
  pending: 'text-[var(--foreground)] bg-[var(--primary)]/10',
  approved: 'text-[var(--foreground)] bg-green-500/10',
  rejected: 'text-[var(--destructive)] bg-[var(--destructive)]/10',
};
const labelColors: Record<string, string> = {
  mismatch: 'text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400',
  same: 'text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400',
};

const buildings = ['1', '2', '3', '5', '8', '6', '7', '9', '10', '11', '12', '15', '18', '20'];

export default function Approval() {
  const [filter, setFilter] = useState('pending');
  const [items, setItems] = useState<Approval[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);

  const [keyword, setKeyword] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [building, setBuilding] = useState('');
  const [applyType, setApplyType] = useState('');

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [selectAll, setSelectAll] = useState(false);

  const [detailItem, setDetailItem] = useState<Approval | null>(null);
  const [detailWhitelist, setDetailWhitelist] = useState<WhitelistEntry | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'deed'>('info');

  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState<number | null>(null);
  const [batchRejectMode, setBatchRejectMode] = useState(false);
  const [batchRejectReason, setBatchRejectReason] = useState('');
  const [confirmAction, setConfirmAction] = useState<{ action: string; id?: number } | null>(null);
  const [previewImg, setPreviewImg] = useState<{ url: string; name: string } | null>(null);

  const commonReasons = ['信息不匹配', '房产证不清晰', '身份证号有误', '缺少必要材料', '其他'];

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { status: filter, page, limit: pageSize };
      if (keyword) params.keyword = keyword;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (building) params.building = building;
      if (applyType) params.apply_type = applyType;
      const res = await api.get('/admin/approvals', { params });
      if (res.data.code === 0) {
        const d = res.data.data;
        setItems(d.items || []);
        setTotal(d.total || 0);
        if (d.counts) setCounts(d.counts);
      }
    } catch {} finally { setLoading(false); }
  }, [filter, page, pageSize, keyword, dateFrom, dateTo, building, applyType]);

  useEffect(() => { load(); }, [load]);

  const handleSearch = () => { setPage(1); load(); };

  const handleApprove = (id: number) => setConfirmAction({ action: 'approve', id });
  const handleRejectStart = (id: number) => { setShowReject(id); setRejectReason(''); };

  const handleRejectConfirm = async (id: number) => {
    const reason = rejectReason.trim() || '未通过审核';
    try {
      await api.patch(`/admin/approvals/${id}`, { action: 'reject', reject_reason: reason });
      toast.success('已拒绝'); setShowReject(null); setRejectReason(''); setPage(1); load();
    } catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const handleWithdraw = async (id: number) => {
    try { await api.patch(`/admin/approvals/${id}`, { action: 'withdraw' }); toast.success('已撤回'); load(); }
    catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const execConfirm = async () => {
    if (!confirmAction) return;
    const { action, id } = confirmAction;
    setConfirmAction(null);
    if (action === 'approve' && id) {
      try { await api.patch(`/admin/approvals/${id}`, { action: 'approve' }); toast.success('已通过，验证码已发送'); setPage(1); load(); }
      catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
    }
  };

  const handleBatchApprove = async () => {
    if (selectedIds.length === 0) { toast.error('请选择申请'); return; }
    try {
      await api.post('/admin/approvals/batch', { ids: selectedIds, action: 'approve' });
      toast.success(`已批量通过 ${selectedIds.length} 条`); setSelectedIds([]); setSelectAll(false); load();
    } catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const handleBatchReject = async () => {
    if (selectedIds.length === 0) { toast.error('请选择申请'); return; }
    if (!batchRejectReason.trim()) { toast.error('请填写拒绝理由'); return; }
    try {
      await api.post('/admin/approvals/batch', { ids: selectedIds, action: 'reject', reject_reason: batchRejectReason });
      toast.success(`已批量拒绝 ${selectedIds.length} 条`); setSelectedIds([]); setSelectAll(false);
      setBatchRejectMode(false); setBatchRejectReason(''); load();
    } catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
  };

  const toggleSelectAll = () => {
    if (selectAll) { setSelectedIds([]); setSelectAll(false); }
    else { setSelectedIds(items.map(i => i.id)); setSelectAll(true); }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const openDetail = async (item: Approval) => {
    setDetailItem(item);
    setDetailTab('info');
    try {
      const res = await api.get('/admin/whitelist', { params: { keyword: item.name, limit: 10 } });
      if (res.data.code === 0) {
        const matched = res.data.data.items.find((w: WhitelistEntry) => w.name === item.name);
        setDetailWhitelist(matched || null);
      }
    } catch { setDetailWhitelist(null); }
  };

  const mismatchFields = (item: Approval): string[] => {
    const fields: string[] = [];
    if (detailWhitelist) {
      if (item.name !== detailWhitelist.name) fields.push('姓名');
      if (item.room_number !== detailWhitelist.room) fields.push('房号');
      const itemPhone = item.phone.replace(/\d(?=\d{4})/g, '*');
      const wlPhone = detailWhitelist.phone.replace(/\d(?=\d{4})/g, '*');
      if (itemPhone !== wlPhone) fields.push('手机号');
    }
    return fields;
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight">审核管理</h2>
      </div>

      <div className="border border-[var(--border)] rounded-2xl shadow-sm bg-[var(--card)]">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {['pending', 'approved', 'rejected'].map(s => (
              <button key={s} onClick={() => { setFilter(s); setPage(1); }}
                className={`relative px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  filter === s ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm' : 'bg-[var(--muted)]/60 text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                }`}>
                {statusLabels[s]}
                <span className={`ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold ${
                  filter === s ? 'bg-white/20 text-white' : 'bg-[var(--background)] text-[var(--foreground)]'
                } ${s === 'pending' && filter !== s ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : ''}`}>
                  {counts[s] ?? 0}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <input type="text" placeholder="搜索姓名/房号/申请理由..." value={keyword}
              onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
              className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none w-[130px]" />
            <span className="text-[var(--muted-foreground)] text-xs">至</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none w-[130px]" />
            <select value={building} onChange={e => setBuilding(e.target.value)}
              className="px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none">
              <option value="">全部楼栋</option>
              {buildings.map(b => <option key={b} value={b}>{b}栋</option>)}
            </select>
            <select value={applyType} onChange={e => setApplyType(e.target.value)}
              className="px-2 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none">
              <option value="">全部类型</option>
              <option value="register">注册</option>
              <option value="change">变更</option>
            </select>
            <button onClick={handleSearch}
              className="px-3 py-2 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">搜索</button>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-2 pt-2 border-t border-[var(--border)]">
              <span className="text-xs text-[var(--muted-foreground)]">已选 {selectedIds.length} 条</span>
              <button onClick={handleBatchApprove}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">批量通过</button>
              <button onClick={() => setBatchRejectMode(!batchRejectMode)}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--destructive)] text-[var(--primary-foreground)] font-medium">批量驳回</button>
              <button onClick={() => { setSelectedIds([]); setSelectAll(false); }}
                className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)]">取消选择</button>
            </div>
          )}
          {batchRejectMode && (
            <div className="flex items-center gap-2 pt-1">
              <input type="text" placeholder="批量驳回理由..." value={batchRejectReason}
                onChange={e => setBatchRejectReason(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <button onClick={handleBatchReject}
                className="px-3 py-2 text-xs rounded-lg bg-[var(--destructive)] text-[var(--primary-foreground)] font-medium">确认批量驳回</button>
              <button onClick={() => { setBatchRejectMode(false); setBatchRejectReason(''); }}
                className="px-3 py-2 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)]">取消</button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border-t border-[var(--border)]">
          {loading ? (
            <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载中...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M9 12h6M12 9v6M3 12a9 9 0 1118 0 9 9 0 01-18 0z"/>
              </svg>
              暂无{statusLabels[filter]}申请
            </div>
          ) : (
            <table className="app-table">
              <thead><tr>
                <th className="w-10"><input type="checkbox" checked={selectAll} onChange={toggleSelectAll} className="rounded" /></th>
                <th>姓名</th><th>房号</th><th>手机号</th><th>申请类型</th><th>不匹配项</th><th>房产证明</th><th>申请时间</th><th>状态</th><th>操作</th>
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} onDoubleClick={() => openDetail(item)} className="cursor-pointer">
                    <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelect(item.id)} className="rounded" /></td>
                    <td className="font-medium">{item.name}</td>
                    <td>{item.room_number}</td>
                    <td className="text-xs font-mono">{item.phone}</td>
                    <td>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        item.apply_type === 'change' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      }`}>
                        {item.apply_type === 'change' ? '变更' : '注册'}
                      </span>
                    </td>
                    <td>
                      {item.mismatch_fields ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400 font-medium">
                          {item.mismatch_fields}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="text-xs">
                      {item.property_deed_url ? (
                        <img src={item.property_deed_url} alt="证"
                          className="w-10 h-10 object-cover rounded border border-[var(--border)] cursor-pointer hover:opacity-80"
                          onClick={e => { e.stopPropagation(); setPreviewImg({ url: item.property_deed_url, name: '房产证明' }); }} />
                      ) : '-'}
                    </td>
                    <td className="text-xs text-[var(--muted-foreground)]">{item.created_at?.split('.')[0]?.replace('T', ' ')}</td>
                    <td><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[item.status]}`}>{statusLabels[item.status]}</span></td>
                    <td onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        {item.status === 'pending' && (<>
                          <button onClick={() => handleApprove(item.id)}
                            className="px-2 py-1 text-[10px] rounded bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">通过</button>
                          <button onClick={() => handleRejectStart(item.id)}
                            className="px-2 py-1 text-[10px] rounded bg-[var(--destructive)] text-[var(--primary-foreground)] font-medium">驳回</button>
                        </>)}
                        {item.status !== 'pending' && (
                          <button onClick={() => setConfirmAction({ action: 'withdraw', id: item.id })}
                            className="px-2 py-1 text-[10px] rounded bg-[var(--muted)] text-[var(--foreground)] font-medium">撤回</button>
                        )}
                      </div>
                      {showReject === item.id && (
                        <div className="mt-1 space-y-1">
                          <div className="flex gap-1 flex-wrap">
                            {commonReasons.map(r => (
                              <button key={r} onClick={() => setRejectReason(r)}
                                className={`px-1.5 py-0.5 text-[10px] rounded-full border ${
                                  rejectReason === r ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]' : 'border-[var(--border)] text-[var(--muted-foreground)]'
                                }`}>{r}</button>
                            ))}
                          </div>
                          <div className="flex gap-1">
                            <input placeholder="拒绝理由" value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                              className="flex-1 px-1.5 py-0.5 rounded border border-[var(--border)] bg-[var(--background)] text-[10px] outline-none" />
                            <button onClick={() => handleRejectConfirm(item.id)}
                              className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--destructive)] text-[var(--primary-foreground)]">确认</button>
                            <button onClick={() => setShowReject(null)}
                              className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--muted)]">取消</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--muted-foreground)]">共 {total} 条，第 {page}/{totalPages} 页</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] disabled:opacity-30">上一页</button>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] disabled:opacity-30">下一页</button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal open={!!confirmAction} title="确认操作"
        message={
          confirmAction?.action === 'approve' ? '确认通过此申请？通过后将同步加入业主名册并发验证码。' :
          confirmAction?.action === 'withdraw' ? '确认撤回此审核结果？' : ''
        }
        onConfirm={execConfirm} onCancel={() => setConfirmAction(null)} />

      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4" onClick={() => { setDetailItem(null); setDetailWhitelist(null); }}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col mx-1" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
              <h3 className="text-[var(--foreground)] text-lg font-bold">申请详情</h3>
              <div className="flex items-center gap-2">
                <div className="flex bg-[var(--muted)]/60 rounded-lg p-0.5">
                  <button onClick={() => setDetailTab('info')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${detailTab === 'info' ? 'bg-[var(--card)] shadow-sm text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>信息对比</button>
                  <button onClick={() => setDetailTab('deed')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${detailTab === 'deed' ? 'bg-[var(--card)] shadow-sm text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}`}>房产证明</button>
                </div>
                <button onClick={() => { setDetailItem(null); setDetailWhitelist(null); }} className="p-1 hover:bg-[var(--accent)] rounded-lg">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden flex flex-col">
              {detailTab === 'info' ? (
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-3 p-4 rounded-xl bg-[var(--muted)]/30 border border-[var(--border)]">
                      <h4 className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider flex items-center gap-1.5 mb-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        申请人填报
                      </h4>
                      <DiffField label="姓名" value={detailItem.name} whitelistValue={detailWhitelist?.name} />
                      <DiffField label="身份证号" value={detailItem.id_card} />
                      <DiffField label="手机号" value={detailItem.phone} />
                      <DiffField label="房号" value={detailItem.room_number} whitelistValue={detailWhitelist?.room} />
                      <DiffField label="邮箱" value={detailItem.email || '-'} />
                      <DiffField label="申请理由" value={(detailItem as any).apply_reason || '-'} />
                    </div>
                    <div className="space-y-3 p-4 rounded-xl bg-[var(--muted)]/30 border border-[var(--border)]">
                      <h4 className="text-xs font-bold text-green-600 dark:text-green-400 uppercase tracking-wider flex items-center gap-1.5 mb-3">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/></svg>
                        白名单对照
                      </h4>
                      <DiffField label="姓名" value={detailWhitelist?.name || '-'} isWhitelist />
                      <DiffField label="身份证号" value={detailWhitelist ? '**********' : '-'} isWhitelist />
                      <DiffField label="手机号" value={detailWhitelist?.phone?.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') || '-'} isWhitelist />
                      <DiffField label="房号" value={detailWhitelist?.room || '-'} isWhitelist />
                      <DiffField label="邮箱" value={detailWhitelist?.email || '-'} isWhitelist />
                      <DiffField label="备注" value={detailWhitelist?.remark || '-'} isWhitelist />
                    </div>
                  </div>
                  {detailWhitelist && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        <strong>差异提示：</strong>已对照白名单自动检测字段差异，红色标注为不匹配项。
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 flex items-center justify-center">
                  {detailItem.property_deed_url ? (
                    <div className="space-y-3 w-full">
                      <img src={detailItem.property_deed_url} alt="房产证"
                        className="max-w-full max-h-[60vh] object-contain rounded-lg border border-[var(--border)] mx-auto cursor-pointer"
                        onClick={() => setPreviewImg({ url: detailItem.property_deed_url, name: '房产证明' })} />
                      <div className="text-center text-xs text-[var(--muted-foreground)]">点击图片放大预览</div>
                    </div>
                  ) : (
                    <div className="text-xs text-[var(--muted-foreground)]">暂无附件</div>
                  )}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-[var(--border)] flex items-center gap-2 shrink-0">
              {detailItem.status === 'pending' && (<>
                <button onClick={async () => {
                  try { await api.patch(`/admin/approvals/${detailItem.id}`, { action: 'approve' }); toast.success('已通过'); setDetailItem(null); load(); }
                  catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
                }} className="px-4 py-2 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">通过</button>
                <div className="flex-1 flex items-center gap-2">
                  <div className="flex gap-1 flex-wrap">
                    {commonReasons.map(r => (
                      <button key={r} onClick={() => setRejectReason(r)}
                        className={`px-2 py-1 text-[10px] rounded-full border ${
                          rejectReason === r ? 'border-[var(--destructive)] bg-[var(--destructive)]/10 text-[var(--destructive)]' : 'border-[var(--border)] text-[var(--muted-foreground)]'
                        }`}>{r}</button>
                    ))}
                  </div>
                  <input placeholder="驳回理由..." value={rejectReason} onChange={e => setRejectReason(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-xs outline-none" />
                  <button onClick={async () => {
                    if (!rejectReason.trim()) { toast.error('请填写驳回理由'); return; }
                    try { await api.patch(`/admin/approvals/${detailItem.id}`, { action: 'reject', reject_reason: rejectReason }); toast.success('已拒绝'); setDetailItem(null); load(); }
                    catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
                  }} className="px-4 py-2 text-xs rounded-lg bg-[var(--destructive)] text-[var(--primary-foreground)] font-medium">驳回</button>
                </div>
              </>)}
              {detailItem.status !== 'pending' && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[detailItem.status]}`}>
                    {statusLabels[detailItem.status]}
                  </span>
                  {detailItem.reviewed_name && (
                    <span className="text-xs text-[var(--muted-foreground)]">审核人: {detailItem.reviewed_name}</span>
                  )}
                  <button onClick={async () => {
                    try { await api.patch(`/admin/approvals/${detailItem.id}`, { action: 'withdraw' }); toast.success('已撤回'); setDetailItem(null); load(); }
                    catch (err: any) { toast.error(err.response?.data?.message || '操作失败'); }
                  }} className="px-3 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)]">撤回</button>
                </div>
              )}
              <button onClick={() => { setDetailItem(null); setDetailWhitelist(null); }}
                className="px-3 py-2 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)]">关闭</button>
            </div>
          </div>
        </div>
      )}

      {previewImg && <PreviewModal items={[{ url: previewImg.url, original_name: previewImg.name, type: 'image' }]} index={0} onClose={() => setPreviewImg(null)} />}
    </div>
  );
}

function DiffField({ label, value, whitelistValue, isWhitelist }: { label: string; value: string; whitelistValue?: string; isWhitelist?: boolean }) {
  const diff = !isWhitelist && whitelistValue && value !== whitelistValue;
  return (
    <div className={`px-3 py-2 rounded-lg ${diff ? 'bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800' : ''}`}>
      <div className="text-[10px] text-[var(--muted-foreground)]">{label}</div>
      <div className={`text-sm font-medium ${diff ? 'text-red-600 dark:text-red-400' : ''}`}>
        {value}
        {diff && <span className="ml-1.5 text-[10px] text-red-500">(白名单: {whitelistValue})</span>}
      </div>
    </div>
  );
}
