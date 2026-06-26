import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSiteConfigStore } from '@/stores/siteConfigStore';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function Login() {
  const navigate = useNavigate();
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [contactForm, setContactForm] = useState({ title: '', content: '', name: '', phone: '', email: '' });
  const [contactLoading, setContactLoading] = useState(false);
  const siteName = useSiteConfigStore((s) => s.siteName);
  const communityName = useSiteConfigStore((s) => s.communityName);
  const fetchSiteConfig = useSiteConfigStore((s) => s.fetch);

  useEffect(() => { fetchSiteConfig(); }, [fetchSiteConfig]);

  const handleLogin = async () => {
    if (!account || !password) { setError('请输入账号和密码'); return; }
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/login', { account, password });
      if (res.data.code === 0) {
        useAuthStore.getState().setAuth(res.data.data.token, res.data.data.user);
    navigate('/dashboard');
    }
    } catch (err: any) { setError(err.response?.data?.message || '登录失败'); }
    finally { setLoading(false); }
  };

  const handleContact = async () => {
    if (!contactForm.name.trim()) { toast.error('请填写姓名'); return; }
    if (!/^[\u4e00-\u9fa5]{2,4}$/.test(contactForm.name.trim())) { toast.error('请输入正确的中文姓名(2-4个字)'); return; }
    if (!contactForm.phone.trim()) { toast.error('请填写手机号'); return; }
    if (!/^1[3-9]\d{9}$/.test(contactForm.phone.trim())) { toast.error('请输入正确的11位手机号码'); return; }
    if (contactForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactForm.email.trim())) { toast.error('邮箱格式不正确'); return; }
    if (!contactForm.title.trim() || !contactForm.content.trim()) { toast.error('请填写问题标题和描述'); return; }
    setContactLoading(true);
    try {
      await api.post('/contact', contactForm);
      toast.success('提交成功，管理员收到后会与您联系，请注意查收消息');
      setShowContact(false);
      setContactForm({ title: '', content: '', name: '', phone: '', email: '' });
    } catch (err: any) { toast.error(err.response?.data?.message || '提交失败'); }
    finally { setContactLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-10 w-full max-w-sm shadow-lg">
        <div className="flex flex-col items-center mb-2">
          <h1 className="text-[var(--foreground)] text-2xl font-bold text-center tracking-tight">{siteName}</h1>
          {communityName && (
            <span className="mt-2 inline-block text-[11px] px-2.5 py-1 rounded-md bg-[var(--foreground)] text-[var(--background)] font-medium leading-none">{communityName}</span>
          )}
        </div>
        <input type="text" placeholder="用户名 / 手机号 / 身份证号 / 姓名" value={account} onChange={(e) => setAccount(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none mb-3 text-center" />
        <input type="password" placeholder="密码" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLogin()} className="w-full px-4 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none mb-4 text-center" />
        {error && <div className="bg-[var(--destructive)]/10 border border-red-200 text-[var(--destructive)] text-xs rounded-lg px-3 py-2 mb-3 text-center">{error}</div>}
        <button onClick={handleLogin} disabled={loading} className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium transition-all disabled:opacity-60">{loading ? '登录中...' : '登录'}</button>
        <p className="text-center mt-4 flex gap-2 justify-center flex-wrap">
          <button onClick={() => navigate('/register')} className="text-[var(--primary)] text-xs font-medium hover:underline">还没有账号？注册</button>
          <span className="text-[var(--muted-foreground)]">|</span>
          <button onClick={() => navigate('/activate')} className="text-[var(--primary)] text-xs font-medium hover:underline">验证码激活</button>
          <span className="text-[var(--muted-foreground)]">|</span>
          <button onClick={() => setShowContact(true)} className="text-[var(--primary)] text-xs font-medium hover:underline">联系管理员</button>
        </p>
      </div>

      {showContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowContact(false)}>
          <div className="bg-[var(--background)] border border-[var(--border)] rounded-2xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="text-[var(--foreground)] text-lg font-bold">联系管理员</h3>
              <button onClick={() => setShowContact(false)} className="p-1 hover:bg-[var(--accent)] rounded-lg"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="姓名 *" value={contactForm.name} onChange={e => setContactForm(p => ({...p, name: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
                <input placeholder="手机号码 *" value={contactForm.phone} onChange={e => setContactForm(p => ({...p, phone: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              </div>
              <input placeholder="电子邮箱 (选填)" value={contactForm.email} onChange={e => setContactForm(p => ({...p, email: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <input placeholder="您所遇到的问题？标题 *" value={contactForm.title} onChange={e => setContactForm(p => ({...p, title: e.target.value}))} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none" />
              <textarea placeholder="请描述您遇到的问题... *" value={contactForm.content} onChange={e => setContactForm(p => ({...p, content: e.target.value}))} rows={3} className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-sm outline-none resize-none" />
              <button onClick={handleContact} disabled={contactLoading} className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60">{contactLoading ? '提交中...' : '提交'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
