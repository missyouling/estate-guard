import { useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  label: string;
  width?: number;
  minWidth?: number;
  fixed?: 'left' | 'right';
  sortable?: boolean;
  hidden?: boolean;
  align?: 'left' | 'center' | 'right';
  render?: (value: any, row: T, index: number) => ReactNode;
  format?: (value: any) => string;
}

export interface BatchAction {
  key: string;
  label: string;
  variant?: 'primary' | 'danger' | 'default';
  icon?: ReactNode;
  requireSelection?: boolean;
  onClick: (ids: number[], rows: any[]) => void;
}

export interface TabFilter {
  key: string;
  label: string;
  count?: number;
}

export interface DataTableProps<T extends { id: number }> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  total?: number;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  selection?: 'none' | 'single' | 'multi';
  selectedIds?: number[];
  onSelectionChange?: (ids: number[]) => void;
  onRowDoubleClick?: (row: T) => void;
  batchActions?: BatchAction[];
  tabFilters?: TabFilter[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  extraFilters?: ReactNode;
  columnConfigKey?: string;
  minWidth?: number;
  emptyText?: string;
  stickyLeft?: number;
  stickyRight?: number;
  rowClassName?: (row: T) => string;
  disabledRowIds?: number[];
}

export function DataTable<T extends { id: number }>({
  columns,
  data,
  loading,
  total,
  page = 1,
  pageSize = 50,
  onPageChange,
  selection = 'none',
  selectedIds: externalSelectedIds,
  onSelectionChange,
  onRowDoubleClick,
  batchActions,
  tabFilters,
  activeTab,
  onTabChange,
  searchValue,
  onSearchChange,
  searchPlaceholder = '搜索...',
  extraFilters,
  columnConfigKey,
  minWidth = 900,
  emptyText = '暂无数据',
  stickyLeft = 0,
  stickyRight = 0,
  rowClassName,
  disabledRowIds,
}: DataTableProps<T>) {
  const allColumnKeys = useMemo(() => columns.filter(c => !c.hidden).map(c => c.key), [columns]);
  const defaultVisible = useMemo(() => new Set(allColumnKeys), [allColumnKeys]);

  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => {
    if (!columnConfigKey) return defaultVisible;
    try {
      const saved = JSON.parse(sessionStorage.getItem(columnConfigKey) || 'null');
      return saved ? new Set(saved) : defaultVisible;
    } catch { return defaultVisible; }
  });

  useEffect(() => {
    if (columnConfigKey) {
      sessionStorage.setItem(columnConfigKey, JSON.stringify([...visibleColumns]));
    }
  }, [visibleColumns, columnConfigKey]);

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const visibleColDefs = useMemo(
    () => columns.filter(c => !c.hidden && visibleColumns.has(c.key)),
    [columns, visibleColumns]
  );

  const leftFixedCols = useMemo(() => visibleColDefs.filter(c => c.fixed === 'left'), [visibleColDefs]);
  const rightFixedCols = useMemo(() => visibleColDefs.filter(c => c.fixed === 'right'), [visibleColDefs]);
  const scrollCols = useMemo(() => visibleColDefs.filter(c => !c.fixed), [visibleColDefs]);

  const hasSelectionCol = selection !== 'none';
  const multiSelect = selection === 'multi';
  const selectableRows = useMemo(() => {
    if (!disabledRowIds) return data;
    return data.filter(r => !disabledRowIds.includes(r.id));
  }, [data, disabledRowIds]);

  const allSelected = selectableRows.length > 0 && externalSelectedIds?.length === selectableRows.length;

  const toggleSelect = (id: number) => {
    if (!onSelectionChange) return;
    if (selection === 'single') {
      onSelectionChange(externalSelectedIds?.includes(id) ? [] : [id]);
      return;
    }
    const next = externalSelectedIds ? [...externalSelectedIds] : [];
    const idx = next.indexOf(id);
    if (idx >= 0) next.splice(idx, 1); else next.push(id);
    onSelectionChange(next);
  };

  const toggleSelectAll = () => {
    if (!onSelectionChange) return;
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(selectableRows.map(r => r.id));
    }
  };

  const totalPages = total ? Math.ceil(total / pageSize) : 1;

  const renderCell = (col: Column<T>, row: T, index: number) => {
    const value = (row as any)[col.key];
    if (col.render) return col.render(value, row, index);
    if (col.format) return col.format(value);
    if (value == null || value === '') return <span className="text-[var(--muted-foreground)]">—</span>;
    return String(value);
  };

  const colStyle = (col: Column<T>) => {
    const styles: React.CSSProperties = {};
    if (col.width) styles.width = col.width;
    if (col.minWidth) styles.minWidth = col.minWidth;
    if (col.align === 'center') styles.textAlign = 'center';
    if (col.align === 'right') styles.textAlign = 'right';
    return styles;
  };

  let leftPx = 0;
  const leftColStyles: Record<string, { left: number }> = {};
  for (const col of leftFixedCols) {
    leftColStyles[col.key] = { left: leftPx };
    leftPx += col.width || 80;
  }

  let rightPx = 0;
  const rightColStyles: Record<string, { right: number }> = {};
  for (const col of [...rightFixedCols].reverse()) {
    rightColStyles[col.key] = { right: rightPx };
    rightPx += col.width || 80;
  }

  if (hasSelectionCol) {
    leftPx += 36;
  }

  return (
    <div className="border border-[var(--border)] rounded-2xl shadow-sm bg-[var(--card)]">
      {/* Tab filters */}
      {tabFilters && tabFilters.length > 0 && (
        <div className="px-5 pt-4 pb-2 flex items-center gap-2 flex-wrap border-b border-[var(--border)]">
          {tabFilters.map(tab => (
            <button key={tab.key} onClick={() => onTabChange?.(tab.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                activeTab === tab.key
                  ? 'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-sm'
                  : 'bg-[var(--muted)]/60 text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
              }`}>
              {tab.label}
              {tab.count != null && (
                <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  activeTab === tab.key ? 'bg-white/20' : 'bg-[var(--border)]'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Search & filter bar */}
      {(onSearchChange || extraFilters) && (
        <div className="px-5 py-3 flex items-center gap-3 flex-wrap border-b border-[var(--border)]">
          {onSearchChange && (
            <input type="text" value={searchValue || ''} onChange={e => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex-1 min-w-[180px] max-w-[320px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)] transition-all placeholder:text-[var(--muted-foreground)]" />
          )}
          {extraFilters}
        </div>
      )}

      {/* Batch action bar */}
      {batchActions && batchActions.length > 0 && (
        <div className="px-5 py-2.5 flex items-center gap-2 flex-wrap border-b border-[var(--border)]">
          {multiSelect && (
            <label className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] cursor-pointer mr-1">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-[var(--border)] accent-[var(--primary)]" />
              全选
            </label>
          )}
          {externalSelectedIds && externalSelectedIds.length > 0 && (
            <span className="text-xs text-[var(--muted-foreground)] mr-1">已选 {externalSelectedIds.length} 项</span>
          )}
          {batchActions.map(action => {
            const disabled = action.requireSelection && (!externalSelectedIds || externalSelectedIds.length === 0);
            const variantClass = action.variant === 'danger'
              ? 'bg-[var(--destructive)]/10 text-[var(--destructive)] hover:bg-[var(--destructive)]/20'
              : action.variant === 'primary'
              ? 'bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/80'
              : 'bg-[var(--muted)]/60 text-[var(--muted-foreground)] hover:bg-[var(--accent)]';
            return (
              <button key={action.key} onClick={() => action.onClick(externalSelectedIds || [], data)}
                disabled={disabled}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors disabled:opacity-40 ${variantClass} inline-flex items-center gap-1`}>
                {action.icon}
                {action.label}
              </button>
            );
          })}
          {columnConfigKey && (
            <div className="relative group ml-auto">
              <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M12 3c4.97 0 9 4.03 9 9s-4.03 9-9 9-9-4.03-9-9 4.03-9 9-9zM3.6 9h16.8M3.6 15h16.8"/><path d="M12 3c-1.5 0-3 4-3 9s1.5 9 3 9 3-4 3-9-1.5-9-3-9z"/></svg>
                列配置
              </button>
              <div className="absolute right-0 top-full mt-1 bg-[var(--background)] border border-[var(--border)] rounded-xl shadow-xl p-3 w-44 z-20 hidden group-hover:block">
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {columns.filter(c => !c.hidden && c.fixed !== 'left' && c.fixed !== 'right').map(col => (
                    <label key={col.key} className="flex items-center gap-2 cursor-pointer text-xs text-[var(--foreground)] hover:text-[var(--primary)]">
                      <input type="checkbox" checked={visibleColumns.has(col.key)} onChange={() => toggleColumn(col.key)}
                        className="w-3.5 h-3.5 rounded border-[var(--border)] accent-[var(--primary)]" />
                      {col.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <style>{`
        .dt-scroll::-webkit-scrollbar { height: 6px; }
        .dt-scroll::-webkit-scrollbar-track { background: transparent; }
        .dt-scroll::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .dt-scroll::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
        .dt-shadow-left::after { content: ''; position: absolute; right: -6px; top: 0; bottom: 0; width: 6px; pointer-events: none; background: linear-gradient(to right, rgba(0,0,0,0.06), transparent); }
        .dt-shadow-right::before { content: ''; position: absolute; left: -6px; top: 0; bottom: 0; width: 6px; pointer-events: none; background: linear-gradient(to left, rgba(0,0,0,0.06), transparent); }
        .dark .dt-shadow-left::after { background: linear-gradient(to right, rgba(255,255,255,0.04), transparent); }
        .dark .dt-shadow-right::before { background: linear-gradient(to left, rgba(255,255,255,0.04), transparent); }
      `}</style>

      <div className="dt-scroll overflow-x-auto" style={{ overflowY: 'visible' }}>
        {loading ? (
          <div className="text-center py-16 text-[var(--muted-foreground)] text-sm flex flex-col items-center gap-3">
            <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span>加载中...</span>
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">{emptyText}</div>
        ) : (
          <table className="app-table" style={{ minWidth }}>
            <thead>
              <tr>
                {hasSelectionCol && (
                  <th className="dt-shadow-left" style={{ position: 'sticky', left: 0, zIndex: 11, width: 36, minWidth: 36, backgroundColor: 'var(--card)' }}>
                    {multiSelect && (
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll}
                        className="w-4 h-4 rounded border-[var(--border)] accent-[var(--primary)]" />
                    )}
                  </th>
                )}
                {visibleColDefs.map(col => {
                  const isLeft = col.fixed === 'left';
                  const isRight = col.fixed === 'right';
                  const style: React.CSSProperties = { ...colStyle(col) };
                  if (isLeft) {
                    style.position = 'sticky';
                    style.left = (hasSelectionCol ? 36 : 0) + (leftColStyles[col.key]?.left || 0);
                    style.zIndex = 10;
                    style.backgroundColor = 'var(--card)';
                  }
                  if (isRight) {
                    style.position = 'sticky';
                    style.right = rightColStyles[col.key]?.right || 0;
                    style.zIndex = 10;
                    style.backgroundColor = 'var(--card)';
                  }
                  return (
                    <th key={col.key} className={`${isLeft ? 'dt-shadow-left' : ''} ${isRight ? 'dt-shadow-right' : ''}`}
                      style={style}>
                      {col.label}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => {
                const isDisabled = disabledRowIds?.includes(row.id);
                const rowClass = rowClassName ? rowClassName(row) : '';
                const selected = externalSelectedIds?.includes(row.id);
                return (
                  <tr key={row.id}
                    className={`${isDisabled ? 'opacity-50' : ''} ${selected ? 'bg-[var(--primary)]/[0.03]' : ''} ${onRowDoubleClick ? 'cursor-pointer' : ''} ${rowClass}`}
                    onDoubleClick={() => onRowDoubleClick?.(row)}>
                    {hasSelectionCol && (
                      <td className="dt-shadow-left" style={{ position: 'sticky', left: 0, zIndex: 5, backgroundColor: 'var(--card)' }}
                        onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={!!selected}
                          disabled={isDisabled}
                          onChange={() => toggleSelect(row.id)}
                          className="w-4 h-4 rounded border-[var(--border)] accent-[var(--primary)] disabled:opacity-30" />
                      </td>
                    )}
                    {visibleColDefs.map(col => {
                      const isLeft = col.fixed === 'left';
                      const isRight = col.fixed === 'right';
                      const style: React.CSSProperties = { ...colStyle(col) };
                      if (isLeft) {
                        style.position = 'sticky';
                        style.left = (hasSelectionCol ? 36 : 0) + (leftColStyles[col.key]?.left || 0);
                        style.zIndex = 5;
                        style.backgroundColor = selected ? 'var(--card)' : 'var(--card)';
                      }
                      if (isRight) {
                        style.position = 'sticky';
                        style.right = rightColStyles[col.key]?.right || 0;
                        style.zIndex = 5;
                        style.backgroundColor = selected ? 'var(--card)' : 'var(--card)';
                      }
                      return (
                        <td key={col.key}
                          className={`${isLeft ? 'dt-shadow-left' : ''} ${isRight ? 'dt-shadow-right' : ''}`}
                          style={style}>
                          {renderCell(col, row, i)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {total != null && totalPages > 1 && (
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)]">
          <span className="text-xs text-[var(--muted-foreground)]">共 {total} 条，第 {page}/{totalPages} 页</span>
          <div className="flex items-center gap-1">
            <button onClick={() => onPageChange?.(1)} disabled={page <= 1}
              className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-30">首页</button>
            <button onClick={() => onPageChange?.(page - 1)} disabled={page <= 1}
              className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-30">上一页</button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let p: number;
              if (totalPages <= 5) {
                p = i + 1;
              } else if (page <= 3) {
                p = i + 1;
              } else if (page >= totalPages - 2) {
                p = totalPages - 4 + i;
              } else {
                p = page - 2 + i;
              }
              return (
                <button key={p} onClick={() => onPageChange?.(p)}
                  className={`px-2.5 py-1 text-xs rounded font-medium transition-all ${
                    p === page ? 'bg-[var(--primary)] text-[var(--primary-foreground)]' : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                  }`}>{p}</button>
              );
            })}
            <button onClick={() => onPageChange?.(page + 1)} disabled={page >= totalPages}
              className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-30">下一页</button>
            <button onClick={() => onPageChange?.(totalPages)} disabled={page >= totalPages}
              className="px-2 py-1 text-xs rounded border border-[var(--border)] text-[var(--muted-foreground)] hover:bg-[var(--accent)] disabled:opacity-30">末页</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const dt = {
  statusTag: (label: string, color: string, bg: string) => (
    <span className="inline-block text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
      style={{ color, backgroundColor: bg }}>{label}</span>
  ),
  date: (val: string | undefined | null) => {
    if (!val) return <span className="text-[var(--muted-foreground)]">—</span>;
    return <span className="text-xs text-[var(--muted-foreground)] whitespace-nowrap">{val.split('.')[0].replace('T', ' ')}</span>;
  },
  truncated: (text: string, maxWidth: number = 120) => (
    <span className="block truncate text-xs" style={{ maxWidth }} title={text}>{text}</span>
  ),
  num: (val: number | undefined | null) => (
    <span className="text-xs text-[var(--muted-foreground)] tabular-nums block text-center">{val || 0}</span>
  ),
  iconBtn: (onClick: (e: React.MouseEvent) => void, title: string, svg: ReactNode, color?: string) => (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded hover:bg-[var(--accent)] transition-colors ${color || 'text-[var(--muted-foreground)] hover:text-[var(--primary)]'}`}>
      {svg}
    </button>
  ),
};
