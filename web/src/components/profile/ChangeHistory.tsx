import { useEffect, useMemo, useState } from 'react';
import api from '@/lib/api';

interface HistoryItem {
  id: string | number;
  type: string;
  field: string;
  old_value?: string;
  new_value?: string;
  operator_name?: string;
  status: string;
  remark?: string;
  created_at: string;
}

const typeLabels: Record<string, string> = {
  info_change: '信息变更',
  register: '注册申请',
  property_change: '房产变更',
};

const typeOptions = [
  { key: '', label: '全部类型' },
  { key: 'info_change', label: '信息变更' },
  { key: 'register', label: '注册申请' },
  { key: 'property_change', label: '房产变更' },
];

const statusOptions = [
  { key: '', label: '全部状态' },
  { key: 'approved', label: '已生效' },
  { key: 'pending', label: '审核中' },
  { key: 'rejected', label: '已驳回' },
];

const statusLabels: Record<string, { label: string; color: string }> = {
  approved: { label: '已生效', color: 'text-green-600 dark:text-green-400 bg-green-500/10' },
  pending: { label: '审核中', color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10' },
  rejected: { label: '已驳回', color: 'text-red-600 dark:text-red-400 bg-red-500/10' },
};

export default function ChangeHistory() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    api.get('/user/change-history').then(r => {
      if (r.data.code === 0) setItems(r.data.data || []);
    }).finally(() => setLoading(false));
  }, []);

  const fieldLabel = (field: string) => {
    const map: Record<string, string> = {
      email: '电子邮箱', phone: '手机号', username: '用户名', status: '账号状态',
      '注册申请': '注册申请', '房产变更': '房产变更',
    };
    return map[field] || field;
  };

  const filtered = useMemo(() => {
    let result = [...items];
    if (filterType) result = result.filter(i => i.type === filterType);
    if (filterStatus) result = result.filter(i => i.status === filterStatus);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(i =>
        fieldLabel(i.field).toLowerCase().includes(q) ||
        (i.operator_name || '').toLowerCase().includes(q) ||
        (i.remark || '').toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const diff = (a.created_at || '').localeCompare(b.created_at || '');
      return sortAsc ? diff : -diff;
    });
    return result;
  }, [items, filterType, filterStatus, search, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  if (loading) return <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载中...</div>;

  return (
    <div>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <select value={filterType} onChange={e => { setFilterType(e.target.value); setPage(1); }}
          className="px-2 py-1 text-[10px] rounded-lg border border-[var(--border)] bg-[var(--card)]/80 outline-none focus:border-[var(--primary)] text-[var(--foreground)]">
          {typeOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
          className="px-2 py-1 text-[10px] rounded-lg border border-[var(--border)] bg-[var(--card)]/80 outline-none focus:border-[var(--primary)] text-[var(--foreground)]">
          {statusOptions.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <div className="relative flex-1 min-w-[120px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input type="text" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="搜索变更内容..."
            className="w-full pl-7 pr-2 py-1 text-[10px] rounded-lg border border-[var(--border)] bg-[var(--card)]/80 outline-none focus:border-[var(--primary)] text-[var(--foreground)]" />
        </div>
        <button onClick={() => setSortAsc(!sortAsc)}
          className="p-1 rounded-lg border border-[var(--border)] hover:bg-[var(--muted)]/30 text-[var(--muted-foreground)] transition-colors" title={sortAsc ? '正序' : '倒序'}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={`transition-transform ${sortAsc ? 'rotate-180' : ''}`}>
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">暂无变更记录</div>
      ) : (
        <>
          <div>
            {paged.map((item) => {
              const st = statusLabels[item.status] || { label: item.status, color: 'bg-[var(--muted)] text-[var(--muted-foreground)]' };
              const isExpanded = expandedId === item.id;
              return (
                <div key={item.id} className="border-b border-[var(--border)] last:border-0">
                  <div className="flex items-center justify-between py-2 cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : item.id)}>
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className={`flex-shrink-0 text-[var(--muted-foreground)] transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <span className="text-[10px] px-1.5 py-[1px] rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] flex-shrink-0">{typeLabels[item.type] || item.type}</span>
                      <span className="text-sm text-[var(--foreground)] truncate">{fieldLabel(item.field)}</span>
                      <span className={`text-[9px] px-1.5 py-[1px] rounded-full flex-shrink-0 ${st.color}`}>{st.label}</span>
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0 ml-2">{(item.created_at || '').slice(0, 16)}</span>
                  </div>
                  <div style={{
                    maxHeight: isExpanded ? '200px' : '0',
                    opacity: isExpanded ? 1 : 0,
                    overflow: 'hidden',
                    transition: 'max-height 0.25s ease, opacity 0.2s ease',
                  }}>
                    <div className="pb-2 pl-5 space-y-1 text-xs text-[var(--muted-foreground)]">
                      {item.type === 'info_change' ? (
                        <>
                          {item.old_value != null && <p><span className="text-[var(--foreground)]">变更前：</span>{item.old_value}</p>}
                          {item.new_value != null && <p><span className="text-[var(--foreground)]">变更后：</span>{item.new_value}</p>}
                          {item.operator_name && <p><span className="text-[var(--foreground)]">操作人：</span>{item.operator_name}</p>}
                        </>
                      ) : (
                        <>
                          {item.remark && <p><span className="text-[var(--foreground)]">备注：</span>{item.remark}</p>}
                          {item.status === 'rejected' && item.remark && (
                            <p className="text-[var(--destructive)]">驳回原因：{item.remark}</p>
                          )}
                          {item.status === 'pending' && (
                            <p className="text-[var(--primary)]">正在审核中，请耐心等待...</p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination */}
          {filtered.length > pageSize && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-[var(--border)]">
              <div className="flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
                <span>共 {filtered.length} 条</span>
                <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="px-1 py-0.5 rounded border border-[var(--border)] bg-[var(--card)]/80 outline-none text-[10px]">
                  <option value={20}>20条/页</option>
                  <option value={50}>50条/页</option>
                  <option value={100}>100条/页</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                  className="p-1 rounded hover:bg-[var(--muted)]/30 text-[var(--muted-foreground)] disabled:opacity-30 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M15 18l-6-6 6-6" /></svg>
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const n = start + i;
                  if (n > totalPages) return null;
                  return (
                    <button key={n} onClick={() => setPage(n)}
                      className={`w-6 h-6 text-[10px] rounded ${n === page ? 'bg-[var(--primary)]/10 text-[var(--primary)] font-medium' : 'text-[var(--muted-foreground)] hover:bg-[var(--muted)]/30'}`}>
                      {n}
                    </button>
                  );
                })}
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                  className="p-1 rounded hover:bg-[var(--muted)]/30 text-[var(--muted-foreground)] disabled:opacity-30 transition-colors">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6" /></svg>
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
