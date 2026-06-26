import { useEffect, useState, useRef, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import type { UserProfile } from '@/types';

function maskCard(card: string) {
  if (!card || card.length < 10) return card;
  return card.slice(0, 6) + '********' + card.slice(-4);
}

function maskPhone(phone: string) {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function CountdownBtn({ onClick, disabled, countdown, label }: {
  onClick: () => void; disabled: boolean; countdown: number; label: string;
}) {
  return (
    <button onClick={onClick} disabled={disabled || countdown > 0}
      className="px-2 py-1 rounded-lg border border-[var(--border)] text-[10px] whitespace-nowrap text-[var(--foreground)] disabled:opacity-50 hover:bg-[var(--muted)]/30">
      {countdown > 0 ? `${countdown}s` : label}
    </button>
  );
}

export default function ProfileInfo() {
  const user = useAuthStore((s) => s.user);
  const setAuth = useAuthStore((s) => s.setAuth);
  const smsConfigured = useAuthStore((s) => s.smsConfigured);
  const setSmsConfigured = useAuthStore((s) => s.setSmsConfigured);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [showIdCard, setShowIdCard] = useState(false);
  const [showAllProperties, setShowAllProperties] = useState(false);
  const [showVerify, setShowVerify] = useState(false);
  const [verifyType, setVerifyType] = useState<'password' | 'sms'>('password');
  const [verifyCode, setVerifyCode] = useState('');
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [smsSending, setSmsSending] = useState(false);
  const [smsCountdown, setSmsCountdown] = useState(0);
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeCountdown, setEmailCodeCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bind state
  const [boundOwner, setBoundOwner] = useState<{ id: number; room: string; name: string } | null>(null);
  const [showBindModal, setShowBindModal] = useState(false);
  const [bindStep, setBindStep] = useState<'search' | 'create' | 'confirm'>('search');
  const [bindName, setBindName] = useState('');
  const [bindIdCard, setBindIdCard] = useState('');
  const [bindPhone, setBindPhone] = useState('');
  const [bindRoom, setBindRoom] = useState('');
  const [bindEmail, setBindEmail] = useState('');
  const [bindFiles, setBindFiles] = useState<File[]>([]);
  const [bindPreviews, setBindPreviews] = useState<string[]>([]);
  const [bindUploading, setBindUploading] = useState(false);
  const [binding, setBinding] = useState(false);
  const [bindFound, setBindFound] = useState<any>(null);
  const bindFileRef = useRef<HTMLInputElement>(null);

  // Email change state
  const [emailCode, setEmailCode] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailStep, setEmailStep] = useState<'input' | 'verify'>('input');
  const [emailTarget, setEmailTarget] = useState('');

  // Phone change state
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneVerifyType, setPhoneVerifyType] = useState<'sms' | 'email' | 'password'>('sms');
  const [phoneStep, setPhoneStep] = useState<'input' | 'verify'>('input');
  const [phoneNew, setPhoneNew] = useState('');

  useEffect(() => {
    api.get('/user/profile').then(r => {
      if (r.data.code === 0) {
        setProfile(r.data.data);
        setEmail(r.data.data?.email || '');
        setNewEmail(r.data.data?.email || '');
        setPhone(r.data.data?.phone || '');
        setPhoneNew(r.data.data?.phone || '');
        setAvatarUrl(r.data.data?.avatar_url || null);
        if (r.data.data?.bound_owner) setBoundOwner(r.data.data.bound_owner);
      }
    }).finally(() => setLoading(false));
    api.get('/user/sms-status').then(r => {
      if (r.data.code === 0) setSmsConfigured(!!r.data.data?.configured);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const startCountdown = useCallback((setter: React.Dispatch<React.SetStateAction<number>>, duration = 60) => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setter(duration);
    countdownRef.current = setInterval(() => {
      setter((prev: number) => {
        if (prev <= 1) { clearInterval(countdownRef.current!); countdownRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  }, []);

  // Avatar
  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.post('/user/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (res.data.code === 0) { setAvatarUrl(res.data.data); toast.success('头像已更新'); }
    } catch { toast.error('上传失败'); }
  };

  // Verify identity for id card
  const handleSendSmsCode = async () => {
    if (smsSending || smsCountdown > 0) return;
    setSmsSending(true);
    try {
      const res = await api.post('/user/send-verify-code', {});
      if (res.data.code === 0) { toast.success('验证码已发送至绑定手机号'); startCountdown(setSmsCountdown); }
      else { toast.error(res.data.message || '发送失败'); }
    } catch { toast.error('发送失败'); }
    finally { setSmsSending(false); }
  };

  const handleVerifyAndShowIdCard = async () => {
    if (!verifyCode.trim()) { toast.error('请输入验证凭据'); return; }
    try {
      const res = await api.post('/user/verify-identity', { type: verifyType, code: verifyCode.trim() });
      if (res.data.code === 0) {
        setShowIdCard(true); setVerifyCode(''); setShowVerify(false);
        if (profile) setProfile({ ...profile, id_card_raw: res.data.data?.id_card });
      } else { toast.error(res.data.message || '验证失败'); }
    } catch { toast.error('验证失败'); }
  };

  // ---------- Bind flow ----------
  const handleBindSearch = async () => {
    if (!bindName.trim() || !bindIdCard.trim()) { toast.error('请填写姓名和身份证号'); return; }
    setBinding(true);
    try {
      const res = await api.post('/admin/whitelist/search', { name: bindName.trim(), id_card: bindIdCard.trim().toUpperCase() });
      if (res.data.code === 0 && res.data.data?.found) {
        setBindFound(res.data.data.data);
        setBindStep('confirm');
      } else {
        setBindStep('create');
      }
    } catch { toast.error('搜索失败'); }
    finally { setBinding(false); }
  };

  const handleBindConfirm = async () => {
    if (!bindFound) return;
    setBinding(true);
    try {
      const r = await api.post('/admin/whitelist/bind-owner', { whitelist_id: bindFound.id });
      if (r.data.code === 0) {
        toast.success('已绑定业主身份');
        closeBindModal();
        const pr = await api.get('/user/profile');
        if (pr.data.code === 0) applyProfile(pr.data.data);
      } else { toast.error(r.data.message || '绑定失败'); }
    } catch { toast.error('绑定失败'); }
    finally { setBinding(false); }
  };

  const handleBindCreate = async () => {
    if (!bindName.trim() || !bindIdCard.trim() || !bindPhone.trim() || !bindRoom.trim()) {
      toast.error('请填写所有必填字段'); return;
    }
    setBindUploading(true);
    try {
      const fd = new FormData();
      fd.append('name', bindName.trim());
      fd.append('id_card', bindIdCard.trim().toUpperCase());
      fd.append('phone', bindPhone.trim());
      fd.append('room', bindRoom.trim());
      if (bindEmail.trim()) fd.append('email', bindEmail.trim());
      bindFiles.forEach(f => fd.append('property_file', f));

      const res = await api.post('/admin/whitelist/create-and-bind', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.code === 0) {
        toast.success('已添加并绑定业主身份');
        closeBindModal();
        const pr = await api.get('/user/profile');
        if (pr.data.code === 0) applyProfile(pr.data.data);
      } else { toast.error(res.data.message || '创建失败'); }
    } catch { toast.error('创建失败'); }
    finally { setBindUploading(false); }
  };

  const handleUnbind = async () => {
    try {
      const r = await api.post('/admin/whitelist/unbind-owner');
      if (r.data.code === 0) {
        toast.success('已解绑');
        setBoundOwner(null);
        const pr = await api.get('/user/profile');
        if (pr.data.code === 0) applyProfile(pr.data.data);
      } else { toast.error(r.data.message || '解绑失败'); }
    } catch { toast.error('解绑失败'); }
  };

  const closeBindModal = () => {
    setShowBindModal(false);
    setBindStep('search');
    setBindName(''); setBindIdCard(''); setBindPhone(''); setBindRoom(''); setBindEmail('');
    setBindFiles([]); setBindPreviews([]); setBindFound(null);
  };

  const handleBindFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processBindFiles(e.target.files);
  };

  const processBindFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const arr = Array.from(fileList).slice(0, 9 - bindFiles.length);
    const newFiles: File[] = [];
    const newPreviews: string[] = [];
    for (const f of arr) {
      newFiles.push(f);
      if (f.type.startsWith('image/')) {
        const url = await new Promise<string>(resolve => {
          const r = new FileReader();
          r.onload = () => resolve(r.result as string);
          r.readAsDataURL(f);
        });
        newPreviews.push(url);
      } else {
        newPreviews.push('');
      }
    }
    setBindFiles(prev => [...prev, ...newFiles].slice(0, 9));
    setBindPreviews(prev => [...prev, ...newPreviews].slice(0, 9));
  };

  const removeBindFile = (i: number) => {
    setBindFiles(f => f.filter((_, j) => j !== i));
    setBindPreviews(p => p.filter((_, j) => j !== i));
  };

  // ---------- Email change ----------
  const handleStartEmailEdit = () => {
    setEditingEmail(true);
    setEmailStep(profile?.email ? 'verify' : 'input');
    setEmailCode('');
    setNewEmail(profile?.email || '');
    if (profile?.email) {
      setEmailTarget(profile.email);
    }
  };

  const handleSendEmailCode = async () => {
    if (emailCodeSending || emailCodeCountdown > 0) return;
    const target = profile?.email || newEmail;
    if (!target || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) { toast.error('邮箱格式不正确'); return; }
    setEmailCodeSending(true);
    try {
      const res = await api.post('/user/send-email-code', { email: target });
      if (res.data.code === 0) {
        toast.success(`验证码已发送至 ${profile?.email ? '原邮箱' : '新邮箱'}`);
        startCountdown(setEmailCodeCountdown);
      } else { toast.error(res.data.message || '发送失败'); }
    } catch { toast.error('发送失败'); }
    finally { setEmailCodeSending(false); }
  };

  const handleSaveEmail = async () => {
    if (!newEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) { toast.error('邮箱格式不正确'); return; }
    if (!emailCode.trim()) { toast.error('请先验证邮箱，输入您收到的验证码'); return; }
    setSaving(true);
    try {
      const res = await api.patch('/user/email', { email: newEmail.trim(), code: emailCode.trim() });
      if (res.data.code === 0) {
        toast.success('邮箱已更新');
        setEmail(newEmail.trim());
        setEditingEmail(false);
        setEmailCode('');
        if (profile) setProfile({ ...profile, email: newEmail.trim() });
      } else { toast.error(res.data.message || '保存失败'); }
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const cancelEmailEdit = () => {
    setEditingEmail(false);
    setEmailCode('');
    setNewEmail(profile?.email || '');
  };

  // ---------- Phone change ----------
  const handleStartPhoneEdit = () => {
    setEditingPhone(true);
    setPhoneStep('input');
    setPhoneCode('');
    setPhoneNew(profile?.phone || '');
    if (smsConfigured) setPhoneVerifyType('sms');
    else setPhoneVerifyType('email');
  };

  const handleSendPhoneCode = async () => {
    if (smsSending || smsCountdown > 0) return;
    if (phoneVerifyType === 'sms') {
      setSmsSending(true);
      try {
        const res = await api.post('/user/send-verify-code', {});
        if (res.data.code === 0) { toast.success('验证码已发送至当前绑定手机号'); startCountdown(setSmsCountdown); }
        else { toast.error(res.data.message || '发送失败'); }
      } catch { toast.error('发送失败'); }
      finally { setSmsSending(false); }
    } else if (phoneVerifyType === 'email') {
      if (!profile?.email) { toast.error('未绑定邮箱，无法发送验证码'); return; }
      setEmailCodeSending(true);
      try {
        const res = await api.post('/user/send-email-code', { email: profile.email });
        if (res.data.code === 0) { toast.success('验证码已发送至绑定邮箱'); startCountdown(setEmailCodeCountdown); }
        else { toast.error(res.data.message || '发送失败'); }
      } catch { toast.error('发送失败'); }
      finally { setEmailCodeSending(false); }
    }
  };

  const handleSavePhone = async () => {
    if (!phoneNew.trim() || !/^1[3-9]\d{9}$/.test(phoneNew)) { toast.error('手机号格式不正确'); return; }
    setSaving(true);
    try {
      const body: any = { phone: phoneNew.trim() };
      if (phoneVerifyType === 'sms') {
        if (!phoneCode.trim()) { toast.error('请先通过短信验证'); setSaving(false); return; }
        body.code = phoneCode.trim();
      } else {
        if (!phoneCode.trim()) { toast.error('请先通过邮箱验证'); setSaving(false); return; }
        body.email_code = phoneCode.trim();
      }
      const res = await api.patch('/user/phone', body);
      if (res.data.code === 0) {
        toast.success('手机号已更新');
        setPhone(phoneNew.trim());
        setEditingPhone(false);
        setPhoneCode('');
        if (profile) setProfile({ ...profile, phone: phoneNew.trim() });
      } else { toast.error(res.data.message || '保存失败'); }
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const cancelPhoneEdit = () => {
    setEditingPhone(false);
    setPhoneCode('');
    setPhoneNew(profile?.phone || '');
  };

  const applyProfile = (data: any) => {
    setProfile(data);
    setEmail(data?.email || '');
    setNewEmail(data?.email || '');
    setPhone(data?.phone || '');
    setPhoneNew(data?.phone || '');
    if (data?.bound_owner) setBoundOwner(data.bound_owner);
    else setBoundOwner(null);
  };

  if (loading) return <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载中...</div>;
  if (!profile) return <div className="text-center py-12 text-[var(--muted-foreground)] text-sm">加载失败</div>;

  const firstProperty = profile.properties?.[0];
  const hasMultiple = (profile.properties?.length || 0) > 1;

  return (
    <div className="space-y-2">
      <div className="bg-[var(--card)]/50 rounded-xl border border-[var(--border)] p-2.5">
        <div className="flex items-center gap-2">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            {avatarUrl ? (
              <img src={avatarUrl} className="w-10 h-10 rounded-full object-cover border border-[var(--border)]" alt="" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[var(--primary)]/10 text-[var(--primary)] flex items-center justify-center text-base font-bold border border-[var(--border)]">
                {profile.name?.[0] || '?'}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          </div>
          <div>
            <h3 className="text-[var(--foreground)] text-sm font-semibold">{profile.name}</h3>
            <p className="text-[9px] text-[var(--muted-foreground)]">{profile.role === 'admin' ? '管理员' : '业主'} · 注册于 {profile.created_at?.slice(0, 10)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-2">
          <label className="text-[8px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">姓名</label>
          <p className="text-[11px] text-[var(--foreground)] mt-0.5">{profile.name}</p>
        </div>
        <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-2">
          <label className="text-[8px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">身份证号</label>
          <div className="flex items-center gap-1 mt-0.5">
            {profile.role === 'admin' && !boundOwner ? (
              <button onClick={() => setShowBindModal(true)} className="text-[10px] text-[var(--primary)] hover:underline">
                绑定业主身份
              </button>
            ) : (
              <>
                <p className="text-[11px] text-[var(--foreground)] font-mono">
                  {showIdCard && profile.id_card_raw ? profile.id_card_raw : maskCard(profile.id_card)}
                </p>
                {!showIdCard && (
                  <button onClick={() => setShowVerify(true)} className="text-[8px] text-[var(--primary)] hover:underline shrink-0">查看</button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-2">
          <label className="text-[8px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">所属小区</label>
          <p className="text-[11px] text-[var(--foreground)] mt-0.5">{profile.community_name || '未设置'}</p>
        </div>
        <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-2">
          <label className="text-[8px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">名下房号</label>
          <div className="relative">
            <p className="text-[11px] text-[var(--foreground)] mt-0.5">
              {firstProperty ? firstProperty.room : (profile.room_number || (profile.role === 'admin' && !boundOwner ? '未绑定' : '未登记'))}
              {hasMultiple && (
                <button onClick={() => setShowAllProperties(!showAllProperties)}
                  className="ml-1 text-[8px] text-[var(--primary)] hover:underline">
                  +{profile.properties!.length - 1} 套
                </button>
              )}
            </p>
            {showAllProperties && profile.properties && (
              <div className="absolute top-full left-0 mt-1 z-10 bg-[var(--background)] border border-[var(--border)] rounded-lg p-1.5 shadow-lg min-w-[120px]">
                {profile.properties.map((pr, idx) => (
                  <div key={idx} className="text-[9px] text-[var(--foreground)] py-0.5 px-1 hover:bg-[var(--muted)]/50 rounded">
                    {pr.room}
                    <span className={`ml-1 text-[8px] ${pr.status === 'active' ? 'text-green-500' : 'text-amber-500'}`}>
                      {pr.status === 'active' ? '正常' : '待注册'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-2">
          <label className="text-[8px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">注册日期</label>
          <p className="text-[11px] text-[var(--foreground)] mt-0.5">{profile.created_at?.slice(0, 10) || '未知'}</p>
        </div>
      </div>

      {/* Email section */}
      <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-2">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[8px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">电子邮箱</label>
          {!editingEmail && (
            <button onClick={handleStartEmailEdit} className="text-[9px] text-[var(--primary)] hover:underline">
              {profile.email ? '修改' : '设置'}
            </button>
          )}
        </div>
        {editingEmail ? (
          <div className="space-y-1.5">
            {/* Step 1: If has email, show current email + code input */}
            {profile.email && emailStep === 'verify' && (
              <>
                <p className="text-[9px] text-[var(--muted-foreground)]">
                  原邮箱: {profile.email}
                </p>
                <div className="flex gap-1.5 items-center">
                  <input type="text" value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="原邮箱验证码" maxLength={6} className="flex-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)] tracking-[0.3em]" />
                  <CountdownBtn onClick={handleSendEmailCode} disabled={emailCodeSending} countdown={emailCodeCountdown} label="发送验证码" />
                </div>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="新邮箱地址" className="w-full px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
              </>
            )}
            {/* Step 1b: No email - enter new email, send code */}
            {!profile.email && emailStep === 'input' && (
              <>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="输入邮箱地址" className="w-full px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
                <div className="flex gap-1.5 items-center">
                  <input type="text" value={emailCode} onChange={e => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="邮箱验证码" maxLength={6} className="flex-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)] tracking-[0.3em]" />
                  <CountdownBtn onClick={handleSendEmailCode} disabled={emailCodeSending || !newEmail.trim()} countdown={emailCodeCountdown} label="发送验证码" />
                </div>
              </>
            )}
            <div className="flex gap-1.5 pt-0.5">
              <button onClick={handleSaveEmail} disabled={saving || !newEmail.trim() || !emailCode.trim()}
                className="flex-1 py-1 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-medium disabled:opacity-60">
                {saving ? '处理中...' : '确认修改'}
              </button>
              <button onClick={cancelEmailEdit}
                className="px-3 py-1 rounded-lg border border-[var(--border)] text-[10px]">取消</button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--foreground)]">{email || '未设置'}</p>
        )}
      </div>

      {/* Phone section */}
      <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-2">
        <div className="flex items-center justify-between mb-1">
          <label className="text-[8px] text-[var(--muted-foreground)] uppercase tracking-wider font-medium">手机号</label>
          {!editingPhone && <button onClick={handleStartPhoneEdit} className="text-[9px] text-[var(--primary)] hover:underline">修改</button>}
        </div>
        {editingPhone ? (
          <div className="space-y-1.5">
            <input type="tel" value={phoneNew} onChange={e => setPhoneNew(e.target.value)} placeholder="新手机号"
              className="w-full px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
            {phoneStep === 'input' && (
              <div className="flex gap-1.5 items-center">
                <input type="text" value={phoneCode} onChange={e => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder={phoneVerifyType === 'sms' ? '短信验证码' : '邮箱验证码'}
                  maxLength={6}
                  className="flex-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)] tracking-[0.3em]" />
                {phoneVerifyType === 'sms' ? (
                  <CountdownBtn onClick={handleSendPhoneCode}
                    disabled={smsSending}
                    countdown={smsCountdown}
                    label="发送短信" />
                ) : (
                  <CountdownBtn onClick={handleSendPhoneCode}
                    disabled={emailCodeSending}
                    countdown={emailCodeCountdown}
                    label="发送邮箱验证码" />
                )}
              </div>
            )}
            {phoneVerifyType === 'email' && (
              <p className="text-[9px] text-[var(--muted-foreground)]">验证码已发送至 {profile?.email}</p>
            )}
            {smsConfigured && (
              <button onClick={() => setPhoneVerifyType(t => t === 'sms' ? 'email' : 'sms')}
                className="text-[9px] text-[var(--muted-foreground)] hover:text-[var(--primary)]">
                {phoneVerifyType === 'sms' ? '改用邮箱验证' : '改用短信验证'}
              </button>
            )}
            <div className="flex gap-1.5 pt-0.5">
              <button onClick={handleSavePhone} disabled={saving}
                className="flex-1 py-1 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-[10px] font-medium disabled:opacity-60">
                {saving ? '处理中...' : '确认修改'}
              </button>
              <button onClick={cancelPhoneEdit}
                className="px-3 py-1 rounded-lg border border-[var(--border)] text-[10px]">取消</button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[var(--foreground)]">{phone ? maskPhone(phone) : '未设置'}</p>
        )}
      </div>

      {/* Bind Modal */}
      {showBindModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={closeBindModal}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[var(--foreground)] text-sm font-semibold">
                {bindStep === 'confirm' ? '确认绑定' : bindStep === 'create' ? '新增业主' : '绑定业主身份'}
              </h4>
              <button onClick={closeBindModal} className="p-1 hover:bg-[var(--muted)] rounded-lg">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            {/* Search step */}
            {bindStep === 'search' && (
              <div className="space-y-3">
                <p className="text-[10px] text-[var(--muted-foreground)]">通过姓名与身份证号检索业主名册，匹配成功可直接绑定；未匹配到则进入新建业主流程。</p>
                <div>
                  <label className="text-[9px] text-[var(--muted-foreground)] block mb-0.5">姓名</label>
                  <input value={bindName} onChange={e => setBindName(e.target.value)} placeholder="请输入业主姓名"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)]" />
                </div>
                <div>
                  <label className="text-[9px] text-[var(--muted-foreground)] block mb-0.5">身份证号</label>
                  <input value={bindIdCard} onChange={e => setBindIdCard(e.target.value)} placeholder="请输入身份证号"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)]" />
                </div>
                <button onClick={handleBindSearch} disabled={binding}
                  className="w-full py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-60">
                  {binding ? '检索中...' : '检索并绑定'}
                </button>
              </div>
            )}

            {/* Confirm step */}
            {bindStep === 'confirm' && bindFound && (
              <div className="space-y-3">
                <div className="bg-[var(--card)]/50 rounded-lg border border-[var(--border)] p-3 space-y-1.5">
                  <div className="flex justify-between"><span className="text-[10px] text-[var(--muted-foreground)]">姓名</span><span className="text-xs text-[var(--foreground)]">{bindFound.name}</span></div>
                  <div className="flex justify-between"><span className="text-[10px] text-[var(--muted-foreground)]">身份证号</span><span className="text-xs text-[var(--foreground)]">{bindFound.id_card}</span></div>
                  <div className="flex justify-between"><span className="text-[10px] text-[var(--muted-foreground)]">联系电话</span><span className="text-xs text-[var(--foreground)]">{bindFound.phone}</span></div>
                  <div className="flex justify-between"><span className="text-[10px] text-[var(--muted-foreground)]">登记房号</span><span className="text-xs text-[var(--foreground)]">{bindFound.room}</span></div>
                  {bindFound.email && <div className="flex justify-between"><span className="text-[10px] text-[var(--muted-foreground)]">邮箱</span><span className="text-xs text-[var(--foreground)]">{bindFound.email}</span></div>}
                </div>
                <p className="text-[10px] text-[var(--muted-foreground)]">确认绑定后，个人中心将同步展示该业主的档案与房产信息。</p>
                <div className="flex gap-2">
                  <button onClick={() => { setBindStep('search'); setBindFound(null); }}
                    className="flex-1 py-2 rounded-lg border border-[var(--border)] text-xs">返回重选</button>
                  <button onClick={handleBindConfirm} disabled={binding}
                    className="flex-1 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-60">
                    {binding ? '绑定中...' : '确认绑定'}
                  </button>
                </div>
              </div>
            )}

            {/* Create step */}
            {bindStep === 'create' && (
              <div className="space-y-2.5">
                <p className="text-[10px] text-[var(--muted-foreground)]">未匹配到业主信息，请填写以下信息新增业主。</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-[var(--muted-foreground)] block mb-0.5">姓名 *</label>
                    <input value={bindName} onChange={e => setBindName(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
                  </div>
                  <div>
                    <label className="text-[9px] text-[var(--muted-foreground)] block mb-0.5">身份证号 *</label>
                    <input value={bindIdCard} onChange={e => setBindIdCard(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
                  </div>
                  <div>
                    <label className="text-[9px] text-[var(--muted-foreground)] block mb-0.5">手机号 *</label>
                    <input value={bindPhone} onChange={e => setBindPhone(e.target.value)}
                      className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
                  </div>
                  <div>
                    <label className="text-[9px] text-[var(--muted-foreground)] block mb-0.5">房号 *</label>
                    <input value={bindRoom} onChange={e => setBindRoom(e.target.value)} placeholder="如 4-2-102"
                      className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
                  </div>
                </div>
                <div>
                  <label className="text-[9px] text-[var(--muted-foreground)] block mb-0.5">邮箱</label>
                  <input value={bindEmail} onChange={e => setBindEmail(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-xs outline-none focus:border-[var(--primary)]" />
                </div>
                <div>
                  <label className="text-[9px] text-[var(--muted-foreground)] block mb-1">产权证明材料</label>
                  <div
                    className={`border-2 border-dashed rounded-xl p-3 text-center cursor-pointer transition-colors ${
                      bindFiles.length > 0 ? 'border-[var(--primary)] bg-[var(--primary)]/5' : 'border-[var(--border)] hover:border-[var(--primary)]'
                    }`}
                    onClick={() => bindFileRef.current?.click()}
                  >
                    <input ref={bindFileRef} type="file" accept="image/*,.pdf" multiple className="hidden"
                      onChange={handleBindFilesChange} />
                    <svg className="mx-auto mb-1 text-[var(--muted-foreground)]" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
                    </svg>
                    <p className="text-[10px] text-[var(--muted-foreground)]">点击上传产权证明（支持多张图片 / PDF）</p>
                  </div>
                  {bindPreviews.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {bindPreviews.map((url, i) => (
                        <div key={i} className="w-12 h-12 overflow-hidden bg-[var(--muted)] relative border border-[var(--border)] rounded">
                          {url ? <img src={url} className="w-full h-full object-cover" /> : (
                            <div className="w-full h-full flex items-center justify-center text-[9px] text-[var(--muted-foreground)]">PDF</div>
                          )}
                          <button onClick={() => removeBindFile(i)}
                            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[var(--destructive)] text-white flex items-center justify-center text-[8px] shadow-sm">×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => { setBindStep('search'); setBindFound(null); }}
                    className="flex-1 py-2 rounded-lg border border-[var(--border)] text-xs">返回检索</button>
                  <button onClick={handleBindCreate} disabled={bindUploading || !bindName || !bindIdCard || !bindPhone || !bindRoom}
                    className="flex-1 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-medium disabled:opacity-60">
                    {bindUploading ? '创建中...' : '创建并绑定'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Verify Identity Modal */}
      {showVerify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowVerify(false)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl p-5 shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <h4 className="text-[var(--foreground)] text-sm font-semibold mb-2">身份验证</h4>
            <p className="text-[10px] text-[var(--muted-foreground)] mb-3">查看完整身份证号需验证身份</p>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setVerifyType('password')}
                className={`px-3 py-1.5 text-xs rounded-lg ${verifyType === 'password' ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>登录密码</button>
              {smsConfigured && (
                <button onClick={() => setVerifyType('sms')}
                  className={`px-3 py-1.5 text-xs rounded-lg ${verifyType === 'sms' ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'bg-[var(--muted)] text-[var(--muted-foreground)]'}`}>短信验证码</button>
              )}
            </div>
            {verifyType === 'password' ? (
              <input type="password" value={verifyCode} onChange={e => setVerifyCode(e.target.value)}
                placeholder="输入登录密码"
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] mb-1" />
            ) : (
              <div className="space-y-2 mb-1">
                <div className="flex gap-2">
                  <input type="text" value={verifyCode} onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setVerifyCode(v); }}
                    onKeyDown={e => { if (e.key === 'Enter' && verifyCode.length === 6) handleVerifyAndShowIdCard(); }}
                    placeholder="输入短信验证码" maxLength={6}
                    className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] text-center tracking-[0.5em]" />
                  <button onClick={handleSendSmsCode} disabled={smsSending || smsCountdown > 0}
                    className="px-3 py-2 rounded-lg border border-[var(--border)] text-xs whitespace-nowrap text-[var(--foreground)] disabled:opacity-50 transition-colors hover:bg-[var(--muted)]/30">
                    {smsCountdown > 0 ? `${smsCountdown}s` : '获取验证码'}
                  </button>
                </div>
              </div>
            )}
            <button onClick={handleVerifyAndShowIdCard} disabled={verifyType === 'sms' && verifyCode.length !== 6}
              className="w-full py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60 mt-1">验证</button>
          </div>
        </div>
      )}
    </div>
  );
}
