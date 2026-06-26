import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Activate() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenParam = searchParams.get('token') || '';

  const [mode, setMode] = useState<'token' | 'manual'>(tokenParam ? 'token' : 'manual');
  const [token] = useState(tokenParam);
  const [idCard, setIdCard] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'error' | 'success' | 'info'>('info');
  const [userName, setUserName] = useState('');
  const [roomNumber, setRoomNumber] = useState('');
  const verifyingRef = useRef(false);

  useEffect(() => {
    if (tokenParam && !verifyingRef.current) {
      verifyingRef.current = true;
      preverifyToken(tokenParam);
    }
  }, [tokenParam]);

  const preverifyToken = async (t: string) => {
    setValidating(true);
    setMsg('正在验证激活链接...');
    setMsgType('info');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const res = await api.post('/auth/preverify-token', { token: t }, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.data.code === 0) {
        setUserName(res.data.data.name || '');
        setRoomNumber(res.data.data.room_number || '');
        setMsg(`欢迎 ${res.data.data.name}，请设置密码完成激活`);
        setMsgType('success');
      } else {
        setMsg(res.data.message || '激活链接无效');
        setMsgType('error');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError' || err.code === 'ECONNABORTED') {
        setMsg('验证超时，请刷新页面重试，或使用验证码激活');
      } else {
        setMsg(err.response?.data?.message || '网络错误，请稍后重试');
      }
      setMsgType('error');
    } finally {
      setValidating(false);
    }
  };

  const handleActivate = async () => {
    if (!password || password.length < 6) {
      setMsg('密码至少6位');
      setMsgType('error');
      return;
    }
    if (password !== confirmPassword) {
      setMsg('两次密码输入不一致');
      setMsgType('error');
      return;
    }

    setLoading(true);
    setMsg('');
    try {
      let res;
      if (mode === 'token' && token) {
        res = await api.post('/auth/verify-by-token', { token, password });
      } else {
        const id = idCard.trim().toUpperCase();
        const vc = verifyCode.trim();

        if (!id || !vc) {
          setMsg('请填写身份证号和验证码');
          setMsgType('error');
          setLoading(false);
          return;
        }
        if (!/^\d{17}[\dXx]$/.test(id)) {
          setMsg('身份证号格式不正确（需18位）');
          setMsgType('error');
          setLoading(false);
          return;
        }
        if (!/^\d{6}$/.test(vc)) {
          setMsg('验证码格式不正确（需6位数字）');
          setMsgType('error');
          setLoading(false);
          return;
        }
        res = await api.post('/auth/verify-code', {
          id_card: id,
          verify_code: vc,
          password,
        });
      }
      if (res.data.code === 0) {
        toast.success('激活成功，请登录');
        navigate('/login');
      } else {
        setMsg(res.data.message || '激活失败');
        setMsgType('error');
      }
    } catch (err: any) {
      setMsg(err.response?.data?.message || '激活失败');
      setMsgType('error');
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

        <h2 className="text-[var(--foreground)] text-xl font-bold mb-1 tracking-tight">激活账号</h2>
        <p className="text-[var(--muted-foreground)] text-xs mb-6">
          {mode === 'token' ? '点击激活链接后，设置密码即可完成注册' : '请输入您的信息以完成激活'}
        </p>

        <div className="space-y-3">
          {validating && (
            <div className="flex items-center justify-center gap-2 text-xs text-[var(--muted-foreground)]">
              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>验证中...</span>
            </div>
          )}

          {mode === 'manual' && (
            <>
              <input type="text" placeholder="身份证号 *" value={idCard}
                onChange={(e) => setIdCard(e.target.value)}
                maxLength={18}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
              <input type="text" placeholder="验证码 *" value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value)}
                maxLength={6}
                className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
            </>
          )}

          {userName && (
            <div className="text-xs text-[var(--muted-foreground)] text-center bg-[var(--muted)]/50 rounded-lg px-3 py-2">
              {userName}{roomNumber ? ` · ${roomNumber}` : ''}，请设置您的登录密码
            </div>
          )}

          <input type="password" placeholder="设置密码 (至少6位) *" value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />
          <input type="password" placeholder="确认密码 *" value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-sm outline-none focus:border-[var(--primary)] focus:ring-3 focus:ring-apple-blue/20 transition-all text-center" />

          {msg && (
            <div className={`text-xs rounded-lg px-3 py-2 text-center ${
              msgType === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : msgType === 'error'
                  ? 'bg-[var(--destructive)]/10 border border-red-200 text-[var(--destructive)]'
                  : 'bg-[var(--muted)]/50 border border-[var(--border)] text-[var(--muted-foreground)]'
            }`}>
              {msg}
            </div>
          )}

          <button onClick={handleActivate} disabled={loading || (validating && mode === 'token')}
            className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 active:scale-[0.98] transition-all disabled:opacity-60">
            {loading ? '激活中...' : validating && mode === 'token' ? '验证中...' : '激活账号'}
          </button>

          {mode === 'token' && !tokenParam && (
            <button onClick={() => setMode('manual')}
              className="w-full text-center text-xs text-[var(--primary)] hover:underline">
              使用验证码激活
            </button>
          )}

          {mode === 'token' && msg && msgType === 'error' && (
            <button onClick={() => { setMode('manual'); setMsg(''); }}
              className="w-full text-center text-xs text-[var(--primary)] hover:underline">
              尝试使用验证码手动激活
            </button>
          )}

          <p className="text-center text-[10px] text-[var(--muted-foreground)]">
            如您未提交注册申请，请忽略此页面
          </p>
        </div>
      </div>
    </div>
  );
}
