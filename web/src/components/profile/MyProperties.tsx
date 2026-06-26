import { useEffect, useState, useRef, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { UserProperty, PropertyDocument } from '@/types';
import { getRoomErrorMessage, isValidRoom } from '@/utils/roomValidator';
import ConfirmModal from '@/components/ConfirmModal';
import PreviewModal from '@/components/PreviewModal';

const approvalStatusStyle: Record<string, { text: string; cls: string }> = {
  pending: { text: '待审核', cls: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  approved: { text: '已通过', cls: 'bg-green-500/10 text-green-600 dark:text-green-400' },
  rejected: { text: '已驳回', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' },
};

export default function MyProperties() {
  const [properties, setProperties] = useState<(UserProperty & { docs?: PropertyDocument[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [progressDetail, setProgressDetail] = useState<{ room: string; approvals: any[] } | null>(null);

  // New property form
  const [showAddForm, setShowAddForm] = useState(false);
  const [addRoom, setAddRoom] = useState('');
  const [addRoomError, setAddRoomError] = useState('');
  const [addFiles, setAddFiles] = useState<File[]>([]);
  const [addPreviews, setAddPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const addDragOver = useRef(false);

  // Change (modify) form
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [changeTargetId, setChangeTargetId] = useState<number | null>(null);
  const [changeTargetRoom, setChangeTargetRoom] = useState('');
  const [changeNewRoom, setChangeNewRoom] = useState('');
  const [changeNewRoomError, setChangeNewRoomError] = useState('');
  const [changeFiles, setChangeFiles] = useState<File[]>([]);
  const [changePreviews, setChangePreviews] = useState<string[]>([]);
  const changeDragOver = useRef(false);

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState<{ id: number; room: string } | null>(null);

  // Preview
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => { loadProperties(); }, []);

  const loadProperties = async () => {
    try {
      const r = await api.get('/user/properties');
      if (r.data.code === 0) setProperties(r.data.data || []);
    } catch {} finally { setLoading(false); }
  };

  // --- Room input validation ---
  const validateAddRoom = (val: string) => {
    setAddRoom(val);
    const err = getRoomErrorMessage(val);
    setAddRoomError(err || '');
  };

  const validateChangeNewRoom = (val: string) => {
    setChangeNewRoom(val);
    const err = getRoomErrorMessage(val);
    setChangeNewRoomError(err || '');
  };

  // --- File processing ---
  const processFiles = useCallback((fileList: FileList | null, mode: 'add' | 'change') => {
    if (!fileList) return;
    const arr = Array.from(fileList).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf');
    if (arr.length === 0) { toast.error('仅支持图片和PDF文件'); return; }
    const setFiles = mode === 'add' ? setAddFiles : setChangeFiles;
    const setPreviews = mode === 'add' ? setAddPreviews : setChangePreviews;
    setFiles(prev => [...prev, ...arr].slice(0, 9));
    const readers = arr.map(f => new Promise<string>(resolve => {
      if (f.type.startsWith('image/')) {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.readAsDataURL(f);
      } else resolve('');
    }));
    Promise.all(readers).then(urls => {
      setPreviews(prev => [...prev, ...urls].slice(0, 9));
    });
  }, []);

  const removeFile = (i: number, mode: 'add' | 'change') => {
    if (mode === 'add') {
      setAddFiles(f => f.filter((_, j) => j !== i));
      setAddPreviews(p => p.filter((_, j) => j !== i));
    } else {
      setChangeFiles(f => f.filter((_, j) => j !== i));
      setChangePreviews(p => p.filter((_, j) => j !== i));
    }
  };

  // --- Add property ---
  const handleAddSubmit = async () => {
    if (!addRoom.trim() || addRoomError) { toast.error('请填写正确的房号'); return; }
    if (!isValidRoom(addRoom.trim())) { toast.error('房号格式不正确'); return; }
    if (addFiles.length === 0) { toast.error('请至少上传1份产权证明材料'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('action', 'add');
      fd.append('room', addRoom.trim());
      for (const f of addFiles) fd.append('file', f);
      const res = await api.post('/user/property-change-request', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.code === 0) {
        toast.success('申请已提交，请等待管理员审核');
        setShowAddForm(false);
        setAddRoom(''); setAddFiles([]); setAddPreviews([]); setAddRoomError('');
        loadProperties();
      } else { toast.error(res.data.message || '提交失败'); }
    } catch (err: any) { toast.error(err.response?.data?.message || '提交失败'); }
    finally { setSubmitting(false); }
  };

  // --- Change property ---
  const openChangeForm = (id: number, room: string) => {
    setChangeTargetId(id);
    setChangeTargetRoom(room);
    setChangeNewRoom('');
    setChangeNewRoomError('');
    setChangeFiles([]);
    setChangePreviews([]);
    setShowChangeForm(true);
  };

  const handleChangeSubmit = async () => {
    if (!changeNewRoom.trim() || changeNewRoomError) { toast.error('请填写正确的房号'); return; }
    if (!isValidRoom(changeNewRoom.trim())) { toast.error('房号格式不正确'); return; }
    if (changeNewRoom.trim() === changeTargetRoom) { toast.error('新房号与原房号相同'); return; }
    if (changeFiles.length === 0) { toast.error('请至少上传1份产权证明材料'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('action', 'modify');
      fd.append('room', changeNewRoom.trim());
      fd.append('whitelist_id', String(changeTargetId));
      for (const f of changeFiles) fd.append('file', f);
      const res = await api.post('/user/property-change-request', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.code === 0) {
        toast.success('申请已提交，请等待管理员审核');
        setShowChangeForm(false);
        loadProperties();
      } else { toast.error(res.data.message || '提交失败'); }
    } catch (err: any) { toast.error(err.response?.data?.message || '提交失败'); }
    finally { setSubmitting(false); }
  };

  // --- Delete property ---
  const handleDeleteSubmit = async () => {
    if (!confirmDelete) return;
    setSubmitting(true);
    try {
      const res = await api.post('/user/property-delete-request', { whitelist_id: confirmDelete.id, reason: '用户申请删除' });
      if (res.data.code === 0) {
        toast.success('删除申请已提交，等待管理员审核');
        setConfirmDelete(null);
        loadProperties();
      } else { toast.error(res.data.message || '提交失败'); }
    } catch (err: any) { toast.error(err.response?.data?.message || '提交失败'); }
    finally { setSubmitting(false); }
  };

  const handleDocUpload = async (ownerId: number, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post(`/user/properties/${ownerId}/documents`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.code === 0) { toast.success('证照已上传'); loadProperties(); }
      else { toast.error(res.data.message || '上传失败'); }
    } catch { toast.error('上传失败'); }
  };

  const openPreview = (url: string) => {
    setPreviewUrl(url);
    setPreviewOpen(true);
  };

  const showProgressDetail = async (p: UserProperty) => {
    try {
      const r = await api.get('/user/property-approvals');
      if (r.data.code === 0) {
        const related = (r.data.data || []).filter((a: any) => a.room_number === p.room);
        setProgressDetail({ room: p.room, approvals: related.sort((a: any, b: any) => (b.created_at || '').localeCompare(a.created_at || '')) });
      }
    } catch {}
  };

  if (loading) return <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载中...</div>;

  const statusLabel = (s?: string) => {
    if (s === 'active') return { text: '正常', cls: 'bg-green-500/10 text-green-600 dark:text-green-400' };
    if (s === 'pending') return { text: '待注册', cls: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
    if (s === 'disabled') return { text: '已禁用', cls: 'bg-red-500/10 text-red-600 dark:text-red-400' };
    return { text: s || '未知', cls: 'bg-[var(--muted)] text-[var(--muted-foreground)]' };
  };

  const renderFileUploadArea = (mode: 'add' | 'change') => {
    const files = mode === 'add' ? addFiles : changeFiles;
    const previews = mode === 'add' ? addPreviews : changePreviews;
    const dragOver = mode === 'add' ? addDragOver : changeDragOver;
    return (
      <div>
        <label className="block text-xs text-[var(--muted-foreground)] mb-1">产权证明材料 * <span className="text-[var(--muted-foreground)]">（至少1张，支持多图）</span></label>
        <div
          onDragOver={e => { e.preventDefault(); (mode === 'add' ? addDragOver : changeDragOver).current = true; }}
          onDragLeave={() => { (mode === 'add' ? addDragOver : changeDragOver).current = false; }}
          onDrop={e => { e.preventDefault(); processFiles(e.dataTransfer.files, mode); }}
          onClick={() => document.getElementById(`property-file-input-${mode}`)?.click()}
          className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
            dragOver.current ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] hover:border-[var(--primary)]'
          }`}>
          <input id={`property-file-input-${mode}`} type="file" accept="image/*,.pdf" multiple className="hidden"
            onChange={e => { processFiles(e.target.files, mode); e.target.value = ''; }} />
          <svg className="mx-auto mb-1 text-[var(--muted-foreground)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
          </svg>
          <p className="text-xs text-[var(--muted-foreground)]">点击或拖拽上传房产证/购房合同</p>
          <p className="text-[10px] text-[var(--muted-foreground)] mt-0.5">支持 JPG/PNG/PDF，单文件 ≤20MB</p>
        </div>
        {previews.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {previews.map((url, i) => (
              <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden bg-[var(--muted)] border border-[var(--border)] group">
                {url ? (
                  <img src={url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    </svg>
                  </div>
                )}
                {!submitting && (
                  <button onClick={e => { e.stopPropagation(); removeFile(i, mode); }}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--destructive)] text-white flex items-center justify-center text-[9px] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[var(--foreground)]">
          {properties.length > 0 ? `共 ${properties.length} 套房产` : '名下房产'}
        </h4>
        <button onClick={() => setShowAddForm(true)}
          className="px-3 py-1.5 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-medium hover:bg-[var(--primary)]/20 transition-colors">
          新增房产
        </button>
      </div>

      {properties.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-[var(--muted-foreground)]">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} className="mb-3 opacity-40">
            <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <p className="text-sm mb-3">暂无房产信息</p>
          <button onClick={() => setShowAddForm(true)} className="px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-xs font-medium hover:bg-[var(--primary)]/20">
            新增房产
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {properties.map((p) => {
            const sl = statusLabel(p.status);
            const asl = p.approval_status ? approvalStatusStyle[p.approval_status] : null;
            const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(url);
            return (
              <div key={p.id} className="bg-[var(--card)]/50 rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="p-4">
                  <div className="flex items-center justify-between cursor-pointer" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--foreground)]">{p.room}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${sl.cls}`}>{sl.text}</span>
                      {asl && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${asl.cls}`}>{asl.text}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-[var(--muted-foreground)]">{p.docs?.length || 0} 证照</span>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        className={`text-[var(--muted-foreground)] transition-transform ${expandedId === p.id ? 'rotate-180' : ''}`}>
                        <polyline points="6 9 12 15 18 9"/>
                      </svg>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-2">
                    {p.approval_status && p.approval_status !== 'approved' && (
                      <button onClick={() => showProgressDetail(p)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20 transition-colors">
                        查看进度
                      </button>
                    )}
                    <button onClick={() => openChangeForm(p.id, p.room)}
                      className="text-[10px] px-2 py-1 rounded-lg bg-[var(--muted)]/50 text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                      房号变更
                    </button>
                    <button onClick={() => setConfirmDelete({ id: p.id, room: p.room })}
                      className="text-[10px] px-2 py-1 rounded-lg bg-[var(--destructive)]/10 text-[var(--destructive)] hover:bg-[var(--destructive)]/20 transition-colors">
                      删除
                    </button>
                  </div>
                </div>

                <div style={{
                  maxHeight: expandedId === p.id ? `${Math.min((p.docs?.length || 0) * 180 + 60, 600)}px` : '0',
                  opacity: expandedId === p.id ? 1 : 0,
                  overflow: 'hidden',
                  transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease',
                }}>
                  <div className="px-4 pb-4 space-y-3 border-t border-[var(--border)] pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[var(--foreground)] font-medium">证照材料 ({p.docs?.length || 0})</span>
                      <label className="text-[10px] text-[var(--primary)] cursor-pointer hover:underline">
                        上传证照
                        <input type="file" accept="image/*,.pdf" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) handleDocUpload(p.id, f); e.target.value = ''; }} />
                      </label>
                    </div>
                    {(!p.docs || p.docs.length === 0) ? (
                      <p className="text-[10px] text-[var(--muted-foreground)]">暂无证照材料，请上传房产证或购房合同</p>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {p.docs.map((doc: any) => (
                          <div key={doc.id} onClick={() => isImage(doc.url) && openPreview(doc.url)}
                            className={`aspect-[3/4] rounded-lg bg-[var(--muted)]/50 border border-[var(--border)] overflow-hidden flex items-center justify-center ${isImage(doc.url) ? 'cursor-pointer hover:opacity-80' : ''}`}>
                            {isImage(doc.url) ? (
                              <img src={doc.url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-[var(--muted-foreground)]">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                              </svg>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress detail modal */}
      {progressDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setProgressDetail(null)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-[var(--foreground)]">审核进度 - {progressDetail.room}</h4>
              <button onClick={() => setProgressDetail(null)} className="p-1 hover:bg-[var(--accent)] rounded-lg">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            {progressDetail.approvals.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)] py-4 text-center">暂无审核记录</p>
            ) : (
              <div className="space-y-3 max-h-60 overflow-y-auto">
                {progressDetail.approvals.map((a: any, idx: number) => (
                  <div key={a.id || idx} className="relative pl-5 pb-3 border-l-2 border-[var(--border)] last:border-transparent last:pb-0">
                    <div className={`absolute left-[-5px] top-0 w-2 h-2 rounded-full ${
                      a.status === 'approved' ? 'bg-green-500' : a.status === 'rejected' ? 'bg-red-500' : 'bg-blue-500'
                    }`} />
                    <div className="text-xs font-medium text-[var(--foreground)]">{a.apply_reason || (a.apply_type === 'delete' ? '删除申请' : '房产变更')}</div>
                    <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">提交于 {a.created_at?.slice(0, 16)}</div>
                    <div className={`text-[10px] mt-0.5 font-medium ${
                      a.status === 'approved' ? 'text-green-600 dark:text-green-400'
                        : a.status === 'rejected' ? 'text-red-600 dark:text-red-400'
                        : 'text-blue-600 dark:text-blue-400'
                    }`}>
                      {a.status === 'pending' ? '审核中' : a.status === 'approved' ? '已通过' : '已驳回'}
                      {a.status === 'rejected' && (a.reject_reason_preset || a.remark) && `: ${a.reject_reason_preset || a.remark}`}
                    </div>
                    {a.status === 'pending' && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">预计 1-3 个工作日内处理</div>}
                    {a.status !== 'pending' && a.reviewed_at && <div className="text-[10px] text-[var(--muted-foreground)] mt-0.5">审核于 {a.reviewed_at?.slice(0, 16)}</div>}
                  </div>
                ))}
              </div>
            )}
            <div className="flex justify-end mt-3">
              <button onClick={() => setProgressDetail(null)} className="px-4 py-1.5 rounded-lg border border-[var(--border)] text-xs">关闭</button>
            </div>
          </div>
        </div>
      )}

      {/* Add property form modal */}
      {showAddForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowAddForm(false)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h4 className="text-[var(--foreground)] text-sm font-semibold mb-3">新增房产</h4>
            <div className="space-y-3">
              <div>
                <input type="text" value={addRoom} onChange={e => validateAddRoom(e.target.value)}
                  placeholder="请输入房号，如 4-2-102、3-101"
                  onBlur={() => { if (addRoom && !addRoomError) validateAddRoom(addRoom); }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${
                    addRoomError ? 'border-[var(--destructive)]' : 'border-[var(--border)] focus:border-[var(--primary)]'
                  } bg-[var(--card)]/80 text-[var(--foreground)]`} />
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                  支持「栋-单元-层户号」(如 4-2-102)、「栋-层户号」(如 3-101) 两种格式，仅允许数字与半角连接符 -
                </p>
                {addRoomError && <p className="text-[10px] text-[var(--destructive)] mt-0.5">{addRoomError}</p>}
              </div>
              {renderFileUploadArea('add')}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddSubmit} disabled={submitting || addFiles.length === 0}
                className="flex-1 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60">
                {submitting ? '提交中...' : '提交申请'}
              </button>
              <button onClick={() => { setShowAddForm(false); setAddFiles([]); setAddPreviews([]); setAddRoomError(''); }}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Change property form modal */}
      {showChangeForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowChangeForm(false)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h4 className="text-[var(--foreground)] text-sm font-semibold mb-3">产权变更</h4>
            <div className="space-y-3">
              <div className="bg-[var(--muted)]/30 rounded-lg px-3 py-2">
                <span className="text-[10px] text-[var(--muted-foreground)]">原房号</span>
                <p className="text-sm text-[var(--foreground)] font-medium">{changeTargetRoom}</p>
              </div>
              <div>
                <input type="text" value={changeNewRoom} onChange={e => validateChangeNewRoom(e.target.value)}
                  placeholder="新房号（如 3-101）"
                  onBlur={() => { if (changeNewRoom && !changeNewRoomError) validateChangeNewRoom(changeNewRoom); }}
                  className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-colors ${
                    changeNewRoomError ? 'border-[var(--destructive)]' : 'border-[var(--border)] focus:border-[var(--primary)]'
                  } bg-[var(--card)]/80 text-[var(--foreground)]`} />
                <p className="text-[10px] text-[var(--muted-foreground)] mt-1">
                  支持「栋-单元-层户号」(如 4-2-102)、「栋-层户号」(如 3-101) 两种格式
                </p>
                {changeNewRoomError && <p className="text-[10px] text-[var(--destructive)] mt-0.5">{changeNewRoomError}</p>}
              </div>
              {renderFileUploadArea('change')}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleChangeSubmit} disabled={submitting || changeFiles.length === 0}
                className="flex-1 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60">
                {submitting ? '提交中...' : '提交变更'}
              </button>
              <button onClick={() => setShowChangeForm(false)}
                className="px-4 py-2 rounded-lg border border-[var(--border)] text-xs">取消</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={!!confirmDelete}
        title="确认删除房产"
        message={`确定删除 ${confirmDelete?.room || ''} 这套房产吗？删除后将同步更新业主名册，需管理员审核生效。`}
        onConfirm={handleDeleteSubmit}
        onCancel={() => setConfirmDelete(null)}
        danger
      />

      {previewOpen && (
        <PreviewModal items={[{ url: previewUrl }]} index={0} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  );
}
