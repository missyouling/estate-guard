import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Register() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'check' | 'whitelist' | 'manual' | 'verify' | 'done'>('check');
  const [name, setName] = useState('');
  const [idCard, setIdCard] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [applyReason, setApplyReason] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const [password, setPassword] = useState('');
  const [propertyDeed, setPropertyDeed] = useState<File | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const checkWhitelist = async () => {
    if (!name.trim()) { setMsg('请填写姓名'); return; }
    if (!/^[\u4e00-\u9fa5]{2,4}$/.test(name.trim())) { setMsg('请输入正确的中文姓名(2-4个字)'); return; }
    if (!idCard.trim() || !phone.trim()) { setMsg('请填写姓名、身份证号和手机号'); return; }
    if (!/^[1-9]\d{5}(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/.test(idCard)) {
      setMsg('身份证号格式不正确');
      return;
    }
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setMsg('手机号格式不正确');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setMsg('请输入有效的电子邮箱');
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await api.post('/auth/check-whitelist', {
        name: name.trim(), id_card: idCard.trim(), phone: phone.trim(),
      });
      const data = res.data;
      if (data.data?.registered) {
        setMsg(`该身份证号已于 ${data.data.registered_at} 注册过，请直接登录`);
        setStep('check');
      } else if (data.data?.matched) {
        toast.success(data.data?.message || '白名单匹配成功');
        setStep('whitelist');
      } else if (data.data?.partial_matches) {
        toast.error(data.data?.message, { duration: 6000 });
      } else {
        setStep('manual');
      }
    } catch (err: any) {
      setMsg(err.response?.data?.message || '校验失败');
    } finally {
      setLoading(false);
    }
  };

  const registerWhitelist = async () => {
    if (!password || password.length < 6) {
      setMsg('密码至少6位');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/register-whitelist', {
        name: name.trim(), id_card: idCard.trim(), phone: phone.trim(), email: email.trim(), password,
      });
      if (res.data.code === 0) {
        toast.success('注册成功，请登录');
        navigate('/login');
      } else {
        setMsg(res.data.message || '注册失败');
      }
    } catch (err: any) {
      setMsg(err.response?.data?.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  const submitManual = async () => {
    if (!roomNumber.trim()) { setMsg('请填写房号'); return; }
    if (!applyReason.trim()) { setMsg('请填写申请注册理由'); return; }
    if (!propertyDeed) { setMsg('请上传房产证或购房合同'); return; }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('name', name.trim());
      formData.append('id_card', idCard.trim());
      formData.append('phone', phone.trim());
      formData.append('email', email.trim());
      formData.append('apply_reason', applyReason.trim());
      formData.append('room_number', roomNumber.trim());
      formData.append('property_deed', propertyDeed);

      const res = await api.post('/auth/register-manual', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (res.data.code === 0) {
        toast.success('申请已提交，请留意审核通知');
        navigate('/login');
      } else {
        setMsg(res.data.message || '提交失败');
      }
    } catch (err: any) {
      setMsg(err.response?.data?.message || '提交失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-panel p-8 w-full max-w-sm shadow-lg animate-fade-in">
        <button onClick={() => navigate('/login')} className="text-[var(--primary)] text-xs mb-4 hover:underline inline-flex items-center gap-1">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5m7-7l-7 7 7 7" /></svg>
          返回登录
        </button>

        <h2 className="text-[var(--foreground)] text-xl font-bold mb-1 tracking-tight">业主注册</h2>
        <p className="text-[var(--muted-foreground)] text-xs mb-6">
          {step === 'check' && '请输入您的身份信息进行验证'}
          {step === 'whitelist' && '白名单匹配成功，设置密码即可完成注册'}
          {step === 'manual' && '未匹配白名单，请提交房产证进行人工审核'}
        </p>
        {step === 'check' && (
          <p className="text-xs text-orange-600 dark:text-orange-400 mb-4 bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3">
            ⚠️ 请务必保证提供的姓名、身份证号、手机号与物业登记信息完全一致，才可通过白名单免审批注册。否则只能通过人工审核通道注册。
          </p>
        )}

        <div className="space-y-3">
          <input type="text" placeholder="姓名 *" value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
          <input type="text" placeholder="身份证号 *" value={idCard}
            onChange={(e) => setIdCard(e.target.value)}
            maxLength={18}
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
          <input type="text" placeholder="手机号 *" value={phone}
            onChange={(e) => setPhone(e.target.value)}
            maxLength={11}
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
          <input type="email" placeholder="电子邮箱 *" value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />

          {step === 'whitelist' && (
            <>
              <p className="text-green-600 text-xs text-center bg-green-50 py-1.5 rounded-md">
                白名单验证通过，请设置密码
              </p>
              <input type="password" placeholder="设置密码 (至少6位) *" value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
            </>
          )}

          {step === 'manual' && (
            <>
              <textarea placeholder="申请注册理由 * (如: 我是业主/租户等)"
                value={applyReason} onChange={(e) => setApplyReason(e.target.value)}
                rows={2}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] transition-all resize-none" />
              <input type="text" placeholder="房号 * 如: 1栋2单元301" value={roomNumber}
                onChange={(e) => setRoomNumber(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
              <div className="border-2 border-dashed border-[var(--border)] rounded-lg p-6 text-center cursor-pointer hover:border-[var(--primary)] hover:bg-[var(--primary)]/5 transition-all"
                onClick={() => document.getElementById('deedInput')?.click()}>
                {propertyDeed ? (
                  <p className="text-green-600 text-sm">{propertyDeed.name}</p>
                ) : (
                  <p className="text-[var(--muted-foreground)] text-xs">点击上传房产证/购房合同图片 *</p>
                )}
                <input id="deedInput" type="file" accept="image/*" className="hidden"
                  onChange={(e) => setPropertyDeed(e.target.files?.[0] || null)} />
              </div>
            </>
          )}

          {msg && (
            <div className={`text-xs rounded-lg px-3 py-2 text-center ${
              msg.includes('成功') || msg.includes('匹配') || msg.includes('通过')
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-[var(--destructive)]/10 border border-red-200 text-[var(--destructive)]'
            }`}>
              {msg}
            </div>
          )}

          {step === 'check' && (
            <button onClick={checkWhitelist} disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 active:scale-[0.98] transition-all disabled:opacity-60">
              {loading ? '验证中...' : '验证身份'}
            </button>
          )}

          {step === 'whitelist' && (
            <button onClick={registerWhitelist} disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 active:scale-[0.98] transition-all disabled:opacity-60">
              {loading ? '注册中...' : '确认注册'}
            </button>
          )}

          {step === 'manual' && (
            <button onClick={submitManual} disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 active:scale-[0.98] transition-all disabled:opacity-60">
              {loading ? '提交中...' : '提交审核'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
