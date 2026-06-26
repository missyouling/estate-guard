import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Category } from '@/types';
import { useSiteConfigStore } from '@/stores/siteConfigStore';
import ConfirmModal from '@/components/ConfirmModal';
import dayjs from 'dayjs';

function beijingFormat(format: string): string {
  const now = new Date();
  const bj = new Date(now.getTime() + (8 * 60 - now.getTimezoneOffset()) * 60000);
  return dayjs(bj).format(format);
}

interface ConfigItem { key: string; value: string; }

const configGroups: { label: string; keys: string[] }[] = [
  { label: '基础配置', keys: ['site_name', 'community_name', 'site_copyright', 'site_repo_url'] },
  { label: '上传限制', keys: ['upload_max_image_size_mb', 'upload_max_video_size_mb', 'upload_max_audio_size_mb', 'upload_max_count_per_batch'] },
  { label: '文件格式', keys: ['allowed_image_types', 'allowed_video_types', 'allowed_audio_types', 'allowed_document_types'] },
  { label: '图片处理', keys: ['image_compress_max_width', 'image_compress_quality'] },
  { label: '水印设置', keys: ['watermark_auto_apply', 'watermark_template', 'watermark_position', 'watermark_show_bg', 'watermark_text_color', 'watermark_font_weight', 'watermark_font_size', 'watermark_opacity'] },
  { label: '视频处理', keys: ['video_transcode_max_width', 'video_transcode_bitrate'] },
  { label: '地理编码', keys: ['geocode_provider', 'geocode_api_key'] },
  { label: '存储配置', keys: ['storage_backend', 'node_image_api_url', 'node_image_api_key', 's3_endpoint', 's3_bucket', 's3_access_key', 's3_secret_key', 's3_region'] },
];

const keyLabels: Record<string, string> = {
  site_name: '系统名称', community_name: '小区名称',
  site_copyright: '版权信息', site_repo_url: '仓库地址',
  upload_max_image_size_mb: '图片最大(MB)', upload_max_video_size_mb: '视频最大(MB)',
  upload_max_audio_size_mb: '音频最大(MB)', upload_max_count_per_batch: '单次最大数量',
  allowed_image_types: '图片格式', allowed_video_types: '视频格式',
  allowed_audio_types: '音频格式', allowed_document_types: '证件格式',
  image_compress_max_width: '压缩最大宽度', image_compress_quality: '压缩质量(1-100)',
  watermark_template: '水印模板', watermark_position: '水印位置',
  watermark_font_size: '水印字体大小', watermark_opacity: '水印背景透明度', watermark_auto_apply: '自动水印',
  watermark_show_bg: '背景与边框', watermark_text_color: '水印文字颜色', watermark_font_weight: '文字粗细',
  watermark_date_format: '日期格式', watermark_record_prefix: '编号前缀', watermark_record_digits: '编号位数', watermark_record_suffix: '编号后缀',
  video_transcode_max_width: '转码最大宽度', video_transcode_bitrate: '转码码率',
  smtp_host: 'SMTP 主机', smtp_port: 'SMTP 端口', smtp_user: 'SMTP 用户',
  smtp_pass: 'SMTP 密码', mail_from: '发件地址', verify_code_expire_minutes: '验证码有效期(分)',
  site_url: '系统访问地址',
  sms_provider: '短信服务商', sms_access_key: '短信 AccessKey', sms_secret_key: '短信 SecretKey',
  sms_sign_name: '短信签名', sms_template_code: '短信模板',
  geocode_provider: '地理编码服务', geocode_api_key: '地理编码 Key',
  storage_backend: '存储后端', s3_endpoint: 'S3 Endpoint', s3_bucket: 'S3 Bucket',
  s3_access_key: 'S3 AccessKey', s3_secret_key: 'S3 SecretKey', s3_region: 'S3 Region',
  node_image_api_url: '图床API地址', node_image_api_key: '图床API Key',
};

const keyHelpers: Record<string, string> = {
  upload_max_image_size_mb: '单张图片上传大小上限',
  upload_max_video_size_mb: '单个视频上传大小上限',
  upload_max_audio_size_mb: '单个音频上传大小上限',
  upload_max_count_per_batch: '单次批量上传最多文件数量',
  allowed_image_types: '允许上传的图片扩展名，点击标签选中/取消，可手动输入自定义格式',
  allowed_video_types: '允许上传的视频扩展名',
  allowed_audio_types: '允许上传的音频扩展名',
  allowed_document_types: '允许上传的证件/文档扩展名',
  image_compress_max_width: '超过此宽度的图片将被等比压缩',
  image_compress_quality: 'JPEG 压缩质量，数值越大质量越好',
  watermark_template: '点击下方变量按钮快速插入，支持回车换行',
  watermark_opacity: '仅调节水印背景矩形的透明程度，不影响水印文字显示效果。0=完全透明，1=完全不透明',
  video_transcode_max_width: '超过此宽度的视频将被等比缩放',
  video_transcode_bitrate: '视频转码码率，单位 kbps',
  smtp_host: 'SMTP 服务器地址，如 smtp.qq.com',
  smtp_port: 'SMTP 服务器端口。465=SSL加密, 587=STARTTLS, 25=非加密。QQ邮箱推荐465端口',
  smtp_pass: 'SMTP 登录密码或授权码。QQ邮箱等需使用授权码（在邮箱设置中生成），非登录密码',
  mail_from: '发件人邮箱地址，需与SMTP用户一致',
  verify_code_expire_minutes: '验证码有效时间，过期后需重新发送',
  site_url: '系统对外访问地址，用于生成激活链接等。格式如 http://域名:端口',
  sms_provider: '短信服务提供商',
  sms_access_key: '短信服务 AccessKey',
  sms_secret_key: '短信服务 SecretKey',
  sms_sign_name: '短信签名，需在服务商平台审核通过',
  sms_template_code: '短信模板编号',
  geocode_provider: '地理编码服务提供商',
  geocode_api_key: '地理编码服务 API Key',
  storage_backend: '文件存储后端，切换后需测试连通性',
  s3_endpoint: 'S3 兼容存储的 Endpoint 地址',
  s3_bucket: 'S3 存储桶名称',
  s3_access_key: 'S3 访问密钥',
  s3_secret_key: 'S3 秘密访问密钥',
  s3_region: 'S3 区域代码',
  node_image_api_url: 'Node 图床 API 地址',
  node_image_api_key: 'Node 图床 API Key',
};

// Boolean config keys — show as Switch toggle
const BOOLEAN_KEYS = new Set(['watermark_auto_apply', 'watermark_show_bg']);

// Numeric config keys — show as number input with +/- buttons and unit
const NUMERIC_KEYS = new Set([
  'upload_max_image_size_mb', 'upload_max_video_size_mb', 'upload_max_audio_size_mb',
  'upload_max_count_per_batch', 'image_compress_max_width', 'image_compress_quality',
  'watermark_font_size', 'video_transcode_max_width', 'video_transcode_bitrate',
  'smtp_port', 'verify_code_expire_minutes',
]);

const NUMERIC_RANGES: Record<string, { min: number; max: number; step: number; unit: string }> = {
  upload_max_image_size_mb: { min: 1, max: 200, step: 1, unit: 'MB' },
  upload_max_video_size_mb: { min: 1, max: 2000, step: 1, unit: 'MB' },
  upload_max_audio_size_mb: { min: 1, max: 500, step: 1, unit: 'MB' },
  upload_max_count_per_batch: { min: 1, max: 100, step: 1, unit: '个' },
  image_compress_max_width: { min: 100, max: 8000, step: 100, unit: 'px' },
  image_compress_quality: { min: 1, max: 100, step: 1, unit: '' },
  watermark_font_size: { min: 0, max: 72, step: 1, unit: 'px' },
  watermark_record_digits: { min: 0, max: 10, step: 1, unit: '位' },
  video_transcode_max_width: { min: 100, max: 8000, step: 100, unit: 'px' },
  video_transcode_bitrate: { min: 100, max: 50000, step: 100, unit: 'kbps' },
  smtp_port: { min: 1, max: 65535, step: 1, unit: '' },
  verify_code_expire_minutes: { min: 1, max: 1440, step: 1, unit: '分' },
};

// Enum config keys — show as Select with predefined options
const ENUM_OPTIONS: Record<string, { label: string; value: string }[]> = {
  storage_backend: [
    { label: '本地存储', value: 'local' },
    { label: 'S3 存储', value: 's3' },
    { label: 'Node 图床', value: 'nodeimage' },
  ],
  watermark_position: [
    { label: '左下', value: 'southwest' },
    { label: '右下', value: 'southeast' },
    { label: '左上', value: 'northwest' },
    { label: '右上', value: 'northeast' },
    { label: '居中', value: 'center' },
  ],
  watermark_font_weight: [
    { label: '常规（normal）', value: 'normal' },
    { label: '加粗（bold）', value: 'bold' },
  ],
  sms_provider: [
    { label: '阿里云短信', value: 'aliyun' },
    { label: '腾讯云短信', value: 'tencent' },
    { label: '七牛云短信', value: 'qiniu' },
    { label: '其他', value: 'other' },
  ],
  geocode_provider: [
    { label: '高德地图', value: 'amap' },
    { label: '百度地图', value: 'baidu' },
    { label: '腾讯地图', value: 'tencent' },
  ],
};

// File format keys
const FILE_FORMAT_KEYS = new Set(['allowed_image_types', 'allowed_video_types', 'allowed_audio_types', 'allowed_document_types']);
const FORMAT_PRESETS: Record<string, string[]> = {
  allowed_image_types: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'],
  allowed_video_types: ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.mkv', '.webm'],
  allowed_audio_types: ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.wma'],
  allowed_document_types: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'],
};

// Password/secret keys
const SECRET_KEYS = new Set(['smtp_pass', 'sms_access_key', 'sms_secret_key', 's3_access_key', 's3_secret_key', 'node_image_api_key', 'geocode_api_key']);

const TAB_LABELS = [...configGroups.map(g => g.label), '通知配置', '分类管理', '系统公告'];
const NOTIF_TAB_INDEX = configGroups.length;
const ANN_TAB_INDEX = configGroups.length + 2;

// --- Reusable control components ---

function SwitchField({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-9 h-5 bg-[var(--muted)] rounded-full peer peer-checked:bg-[var(--primary)] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full" />
      {label && <span className="text-xs text-[var(--muted-foreground)] ml-2">{label}</span>}
    </label>
  );
}

function SelectField({ value, options, onChange }: { value: string; options: { label: string; value: string }[]; onChange: (v: string) => void }) {
  return (
    <div className="relative flex-1">
      <select value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] transition-all appearance-none pr-8">
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <svg className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--muted-foreground)]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M6 9l6 6 6-6"/></svg>
    </div>
  );
}

function NumberField({ value, min, max, step, unit, onChange }: { value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(Math.max(min, value - step))}
        className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-sm hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]">−</button>
      <input type="number" min={min} max={max} step={step} value={value}
        onChange={e => { const v = parseFloat(e.target.value); onChange(isNaN(v) ? min : Math.max(min, Math.min(max, v))); }}
        className="w-20 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm text-center outline-none focus:border-[var(--primary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
      <button onClick={() => onChange(Math.min(max, value + step))}
        className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-sm hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]">+</button>
      {unit && <span className="text-xs text-[var(--muted-foreground)] ml-1 min-w-[24px]">{unit}</span>}
    </div>
  );
}

function PasswordField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative flex-1">
      <input type={show ? 'text' : 'password'} value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] transition-all font-mono pr-9" />
      <button type="button" onClick={() => setShow(!show)}
        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">
        {show ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
        )}
      </button>
    </div>
  );
}

function TagSelector({ value, presets, onChange }: { value: string; presets: string[]; onChange: (v: string) => void }) {
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];
  const [input, setInput] = useState('');
  const toggleTag = (tag: string) => {
    const next = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
    onChange(next.join(','));
  };
  const addCustom = () => {
    let t = input.trim().toLowerCase();
    if (!t) return;
    if (!t.startsWith('.')) t = '.' + t;
    if (!tags.includes(t)) { onChange([...tags, t].join(',')); }
    setInput('');
  };
  return (
    <div className="flex-1">
      <div className="flex flex-wrap gap-1.5 mb-2">
        {presets.map(p => (
          <button key={p} type="button" onClick={() => toggleTag(p)}
            className={`px-2 py-0.5 text-xs rounded-md border transition-colors ${
              tags.includes(p)
                ? 'bg-[var(--primary)]/10 border-[var(--primary)] text-[var(--primary)]'
                : 'border-[var(--border)] text-[var(--muted-foreground)] hover:border-[var(--primary)] hover:text-[var(--foreground)]'
            }`}>{p}</button>
        ))}
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md bg-[var(--primary)]/10 text-[var(--primary)] border border-[var(--primary)]/20">
              {t}
              <button type="button" onClick={() => toggleTag(t)} className="hover:opacity-60">&times;</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <input type="text" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
          placeholder="输入自定义后缀后回车" className="flex-1 px-2 py-1 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-xs outline-none focus:border-[var(--primary)]" />
        <button type="button" onClick={addCustom} className="px-2 py-1 text-xs rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors">添加</button>
      </div>
    </div>
  );
}

export default function Config() {
  const [configs, setConfigs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [cats, setCats] = useState<Category[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [catForm, setCatForm] = useState({ name: '', code: '', icon: '', sort_order: 0, description: '' });
  const [newCatName, setNewCatName] = useState('');

  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [annForm, setAnnForm] = useState({ title: '', content: '' });
  const [annSending, setAnnSending] = useState(false);
  const [annLoading, setAnnLoading] = useState(false);
  const refreshSiteConfig = useSiteConfigStore((s) => s.refresh);

  // Notification channel status
  const [channelStatus, setChannelStatus] = useState<{ email: { configured: boolean; label: string }; sms: { configured: boolean; label: string }; all_configured: boolean } | null>(null);
  const [channelStatusLoading, setChannelStatusLoading] = useState(false);

  // Test email/sms
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testSmsPhone, setTestSmsPhone] = useState('');
  const [testSmsSending, setTestSmsSending] = useState(false);

  // Storage connectivity test
  const [testStorageBusy, setTestStorageBusy] = useState(false);

  // Template management
  const [emailTemplates, setEmailTemplates] = useState<any[]>([]);
  const [smsTemplates, setSmsTemplates] = useState<any[]>([]);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateSaving, setTemplateSaving] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null);
  const [templateEditForm, setTemplateEditForm] = useState<Record<string, any>>({});

  // Notification tab collapsible sections
  const [activeNotifSection, setActiveNotifSection] = useState<string | null>('channel');
  const [sendLogs, setSendLogs] = useState<any[]>([]);
  const [sendLogsLoading, setSendLogsLoading] = useState(false);

  const toggleNotifSection = (name: string) => {
    setActiveNotifSection(prev => prev === name ? null : name);
  };

  // Confirm modal states
  const [confirmAnnId, setConfirmAnnId] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState<'first' | 'second' | null>(null);
  const [confirmCatId, setConfirmCatId] = useState<number | null>(null);

  // Validation errors map
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const validateTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { load(); loadCats(); }, []);
  useEffect(() => {
    if (activeTab === ANN_TAB_INDEX) loadAnnouncements();
    else if (activeTab === NOTIF_TAB_INDEX) { loadChannelStatus(); loadEmailTemplates(); loadSmsTemplates(); }
  }, [activeTab]);

  const loadChannelStatus = async () => {
    setChannelStatusLoading(true);
    try {
      const res = await api.get('/admin/notifications/config-status');
      if (res.data.code === 0) setChannelStatus(res.data.data);
    } catch {} finally { setChannelStatusLoading(false); }
  };

  const loadEmailTemplates = async () => {
    try {
      const res = await api.get('/admin/notification-templates/email');
      if (res.data.code === 0) setEmailTemplates(res.data.data);
    } catch {}
  };

  const loadSmsTemplates = async () => {
    try {
      const res = await api.get('/admin/notification-templates/sms');
      if (res.data.code === 0) setSmsTemplates(res.data.data);
    } catch {}
  };

  async function loadAnnouncements() {
    setAnnLoading(true);
    try {
      const res = await api.get('/admin/announcements');
      if (res.data.code === 0) setAnnouncements(res.data.data || []);
    } catch {} finally { setAnnLoading(false); }
  }

  async function handleSendAnnouncement() {
    if (!annForm.title.trim() || !annForm.content.trim()) { toast.error('请填写标题和内容'); return; }
    setAnnSending(true);
    try {
      const res = await api.post('/admin/announcement', annForm);
      if (res.data.code === 0) {
        toast.success('公告已发送');
        setAnnForm({ title: '', content: '' });
        loadAnnouncements();
      } else {
        toast.error(res.data.message || '发送失败');
      }
    } catch { toast.error('发送失败'); } finally { setAnnSending(false); }
  }

  async function handleDeleteAnnouncement(id: number) {
    setConfirmAnnId(id);
  }

  async function execDeleteAnnouncement() {
    if (confirmAnnId === null) return;
    try {
      await api.delete(`/admin/announcements/${confirmAnnId}`);
      toast.success('已删除');
      loadAnnouncements();
    } catch { toast.error('删除失败'); }
    finally { setConfirmAnnId(null); }
  }

  async function load() {
    setLoading(true);
    try {
      const res = await api.get('/admin/config');
      if (res.data.code === 0) {
        const map: Record<string, string> = {};
        (res.data.data || []).forEach((c: ConfigItem) => { map[c.key] = c.value; });
        setConfigs(map);
      }
    } catch {} finally { setLoading(false); }
  }

  async function loadCats() {
    try {
      const res = await api.get('/category');
      if (res.data.code === 0) setCats(res.data.data || []);
    } catch {}
  }

  async function handleSave() {
    const smtpKeys = ['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass'] as const;
    const missing: string[] = [];
    for (const k of smtpKeys) {
      if (!configs[k]?.trim()) missing.push(keyLabels[k] || k);
    }
    if (missing.length > 0) {
      toast.error(`请填写邮件配置必填项: ${missing.join('、')}`);
      return;
    }
    if (configs.smtp_port && (isNaN(parseInt(configs.smtp_port)) || parseInt(configs.smtp_port) < 1 || parseInt(configs.smtp_port) > 65535)) {
      toast.error('SMTP 端口号范围 1~65535');
      return;
    }
    if (configs.mail_from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configs.mail_from)) {
      toast.error('发件地址 (mail_from) 格式不正确');
      return;
    }

    setSaving(true);
    try {
      const res = await api.put('/admin/config', { configs });
      if (res.data.code === 0) { toast.success('配置已保存'); load(); refreshSiteConfig(); }
      else toast.error(res.data.message || '保存失败');
    } catch (err: any) { toast.error(err.response?.data?.message || '保存失败'); }
    finally { setSaving(false); }
  }

  async function handleReset() {
    setConfirmReset('first');
  }

  async function execReset() {
    setResetting(true);
    try {
      const res = await api.post('/admin/reset');
      if (res.data.code === 0) { toast.success('系统已初始化'); load(); loadCats(); }
      else toast.error(res.data.message || '初始化失败');
    } catch (err: any) { toast.error(err.response?.data?.message || '初始化失败'); }
    finally { setResetting(false); setConfirmReset(null); }
  }

  function handleResetSecondConfirm() {
    setConfirmReset('second');
  }

  const handleCatAdd = async () => {
    if (!newCatName.trim()) { toast.error('请输入分类名称'); return; }
    try {
      await api.post('/admin/category', { name: newCatName.trim(), sort_order: cats.length + 1 });
      toast.success('添加成功'); setNewCatName(''); loadCats();
    } catch (err: any) { toast.error(err.response?.data?.message || '添加失败'); }
  };

  const handleCatEdit = (item: Category) => {
    setEditingId(item.id);
    setCatForm({ name: item.name, code: item.code || '', icon: item.icon || '', sort_order: item.sort_order, description: item.description || '' });
  };

  const handleCatSave = async (id: number) => {
    try {
      await api.put(`/admin/category/${id}`, catForm);
      toast.success('保存成功'); setEditingId(null); loadCats();
    } catch (err: any) { toast.error(err.response?.data?.message || '保存失败'); }
  };

  const handleCatDelete = (id: number) => {
    setConfirmCatId(id);
  };

  const execCatDelete = async () => {
    if (confirmCatId === null) return;
    try { await api.delete(`/admin/category/${confirmCatId}`); toast.success('已删除'); loadCats(); }
    catch (err: any) { toast.error(err.response?.data?.message || '删除失败'); }
    finally { setConfirmCatId(null); }
  };

  // --- Test email ---
  const sendTestEmail = useCallback(async () => {
    if (!testEmailAddr.trim()) { toast.error('请输入收件地址'); return; }
    setTestSending(true);
    try {
      const res = await api.post('/admin/test-email', { to: testEmailAddr });
      if (res.data.code === 0) toast.success('测试邮件已发送');
      else toast.error(res.data.message || '发送失败');
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || '发送失败';
      toast.error(msg);
    }
    finally { setTestSending(false); }
  }, [testEmailAddr]);

  // --- Test SMS ---
  const sendTestSms = useCallback(async (scenario?: string, phone?: string) => {
    const p = phone || testSmsPhone;
    if (!p.trim()) { toast.error('请输入手机号'); return; }
    setTestSmsSending(true);
    try {
      const body: Record<string, string> = { phone: p };
      if (scenario) { body.scenario = scenario; body.templateKey = 'sms'; }
      const res = await api.post('/admin/test-sms', body);
      if (res.data.code === 0) toast.success('测试短信已发送');
      else toast.error(res.data.message || '发送失败');
    } catch { toast.error('发送失败'); }
    finally { setTestSmsSending(false); }
  }, [testSmsPhone]);

  const saveTemplate = async (key: string) => {
    setTemplateSaving(key);
    try {
      const isEmail = key.startsWith('email_');
      const body = isEmail ? { subject: templateEditForm.subject, body: templateEditForm.body } : { content: templateEditForm.content };
      const res = await api.put(`/admin/notification-templates/${key}`, body);
      if (res.data.code === 0) {
        toast.success('模板已保存');
        setEditingTemplate(null);
        if (isEmail) loadEmailTemplates(); else loadSmsTemplates();
      } else {
        toast.error(res.data.message || '保存失败');
      }
    } catch { toast.error('保存失败'); } finally { setTemplateSaving(null); }
  };

  const resetTemplate = async (key: string) => {
    try {
      const res = await api.post(`/admin/notification-templates/${key}/reset`);
      if (res.data.code === 0) {
        toast.success('已恢复默认');
        if (key.startsWith('email_')) loadEmailTemplates(); else loadSmsTemplates();
      } else {
        toast.error(res.data.message || '恢复失败');
      }
    } catch { toast.error('恢复失败'); }
  };

  const testSmsTemplate = useCallback(async (scenario: string, phone: string) => {
    if (!phone) { toast.error('请输入手机号'); return; }
    try {
      const res = await api.post('/admin/test-sms', { phone, templateKey: 'sms', scenario });
      if (res.data.code === 0) toast.success('测试短信已发送');
      else toast.error(res.data.message || '发送失败');
    } catch { toast.error('发送失败'); }
  }, []);

  // --- Test storage connectivity ---
  const testStorage = useCallback(async () => {
    setTestStorageBusy(true);
    try {
      const res = await api.post('/admin/test-storage');
      if (res.data.code === 0) toast.success('存储连通性测试通过');
      else toast.error(res.data.message || '连通性测试失败');
    } catch { toast.error('连通性测试失败'); }
    finally { setTestStorageBusy(false); }
  }, []);

  // --- Validation ---
  const validateField = useCallback((key: string, value: string) => {
    const errs = { ...validationErrors };
    if (!value.trim()) {
      delete errs[key];
      setValidationErrors(errs);
      return;
    }
    let error = '';
    if (key === 'smtp_host' && (value.startsWith('http://') || value.startsWith('https://')))
      error = '请输入主机名，不要包含协议前缀';
    else if (key === 'mail_from' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      error = '邮箱格式不正确';
    else if ((key === 's3_endpoint' || key === 'node_image_api_url') && !value.startsWith('http://') && !value.startsWith('https://'))
      error = '请输入完整的 URL（以 http:// 或 https:// 开头）';
    else if (key === 'smtp_port' && (isNaN(parseInt(value)) || parseInt(value) < 1 || parseInt(value) > 65535))
      error = '端口号范围 1~65535';
    else if (key === 'verify_code_expire_minutes' && (isNaN(parseInt(value)) || parseInt(value) < 1))
      error = '必须大于 0';

    if (error) errs[key] = error;
    else delete errs[key];
    setValidationErrors(errs);
  }, [validationErrors]);

  const clearValidationError = useCallback((key: string) => {
    setValidationErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // --- Render generic config field ---
  function renderField(key: string) {
    const val = configs[key] || '';
    const err = validationErrors[key];

    if (BOOLEAN_KEYS.has(key)) {
      return <SwitchField checked={val === 'true'} onChange={v => setConfigs(p => ({ ...p, [key]: v ? 'true' : 'false' }))} />;
    }

    if (FILE_FORMAT_KEYS.has(key)) {
      return (
        <TagSelector value={val} presets={FORMAT_PRESETS[key] || []}
          onChange={v => setConfigs(p => ({ ...p, [key]: v }))} />
      );
    }

    if (ENUM_OPTIONS[key]) {
      return <SelectField value={val || ENUM_OPTIONS[key][0].value} options={ENUM_OPTIONS[key]} onChange={v => setConfigs(p => ({ ...p, [key]: v }))} />;
    }

    if (NUMERIC_KEYS.has(key)) {
      const range = NUMERIC_RANGES[key] || { min: 0, max: 99999, step: 1, unit: '' };
      return (
        <NumberField value={parseFloat(val) || range.min} min={range.min} max={range.max} step={range.step} unit={range.unit}
          onChange={v => setConfigs(p => ({ ...p, [key]: String(v) }))} />
      );
    }

    if (SECRET_KEYS.has(key)) {
      return <PasswordField value={val} onChange={v => setConfigs(p => ({ ...p, [key]: v }))} />;
    }

    return (
      <div className="flex-1">
        <input type="text" value={val} onChange={e => { setConfigs(p => ({ ...p, [key]: e.target.value })); clearValidationError(key); }}
          onBlur={() => validateField(key, val)}
          className={`w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all ${
            err ? 'border-[var(--destructive)] focus:border-[var(--destructive)]' : 'border-[var(--border)] focus:border-[var(--primary)]'
          } bg-[var(--card)]/80 text-[var(--foreground)]`} />
        {err && <p className="text-[10px] text-[var(--destructive)] mt-1">{err}</p>}
      </div>
    );
  }

  const WATERMARK_VARS = [
    { label: '证据编号', name: 'record_no' },
    { label: '房间号', name: 'room' },
    { label: '业主姓名', name: 'user' },
    { label: '日期时间', name: 'datetime' },
    { label: '位置坐标', name: 'location' },
    { label: '情况说明', name: 'remark' },
    { label: '楼栋号', name: 'building' },
    { label: '单元号', name: 'unit' },
    { label: '文件名', name: 'file_name' },
    { label: '文件大小', name: 'file_size' },
    { label: '文件类型', name: 'file_type' },
    { label: '分类名称', name: 'category' },
    { label: '详细地址', name: 'address' },
    { label: '系统名称', name: 'system_name' },
  ];

  const TEMPLATE_PRESETS: { label: string; value: string }[] = [
    {
      label: '详细版',
      value: 'NO.{record_no}\n{room} {user}\n{datetime}\n{location}\n{category}\n{remark}',
    },
    {
      label: '精简版',
      value: 'NO.{record_no} {room} {user}',
    },
    {
      label: '极简版',
      value: '{record_no}',
    },
  ];

  const DEFAULT_TEMPLATE = 'NO.{record_no}\n{room} {user}\n{datetime}\n{location}\n{remark}';

  const DATE_FORMAT_PRESETS = [
    { label: 'YYYY-MM-DD HH:mm:ss', value: 'YYYY-MM-DD HH:mm:ss' },
    { label: 'YYYY年MM月DD日 HH:mm:ss', value: 'YYYY年MM月DD日 HH:mm:ss' },
    { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
    { label: 'MM-DD HH:mm', value: 'MM-DD HH:mm' },
    { label: '仅显示时间 HH:mm:ss', value: 'HH:mm:ss' },
    { label: 'YYYY/MM/DD HH:mm:ss', value: 'YYYY/MM/DD HH:mm:ss' },
    { label: '12 小时制 YYYY-MM-DD hh:mm:ss A', value: 'YYYY-MM-DD hh:mm:ss A' },
    { label: '自定义格式', value: '__custom__' },
  ];

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function insertVar(name: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const cur = configs.watermark_template || '';
    const next = cur.slice(0, start) + `{${name}}` + cur.slice(end);
    setConfigs(p => ({ ...p, watermark_template: next }));
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + name.length + 2;
      ta.setSelectionRange(pos, pos);
    });
  }

  function WatermarkPreview({ template, position, dateFormat, recordPrefix, recordDigits, recordSuffix, showBg, textColor, fontWeight, fontSize, opacity }: {
    template: string; position: string; dateFormat: string; recordPrefix: string; recordDigits: number; recordSuffix: string;
    showBg: boolean; textColor: string; fontWeight: string; fontSize: number; opacity: number;
  }) {
    const lines = useMemo(() => {
      const formattedDatetime = beijingFormat(dateFormat || 'YYYY-MM-DD HH:mm:ss');
      let recordStr = '2024001';
      if (recordDigits > 0) recordStr = recordStr.padStart(recordDigits, '0');
      const formattedRecordNo = `${recordPrefix || 'NO.'}${recordStr}${recordSuffix || ''}`;
      return template
        .replace(/\{record_no\}/g, formattedRecordNo)
        .replace(/\{datetime\}/g, formattedDatetime)
        .replace(/\{location\}/g, 'XX省XX市XX路XX号')
        .replace(/\{address\}/g, 'XX省XX市XX路XX号')
        .replace(/\{room\}/g, '1栋1单元101')
        .replace(/\{user\}/g, '张三')
        .replace(/\{remark\}/g, '垃圾未清理')
        .replace(/\{building\}/g, '1')
        .replace(/\{unit\}/g, '1')
        .replace(/\{file_name\}/g, 'IMG_001.jpg')
        .replace(/\{file_size\}/g, '2.3 MB')
        .replace(/\{file_type\}/g, 'jpg')
        .replace(/\{category\}/g, '环境卫生')
        .replace(/\{system_name\}/g, '物业服务监督系统')
        .replace(/\\n/g, '\n')
        .split('\n')
        .filter(l => l.trim());
    }, [template, dateFormat, recordPrefix, recordDigits, recordSuffix]);
    const adaptiveSize = Math.max(13, Math.min(Math.round(400 / 38), 44));
    const fs = fontSize > 0 ? Math.min(fontSize, adaptiveSize) : adaptiveSize;
    const lineH = Math.round(fs * 1.5);
    const padX = Math.round(fs * 1.2);
    const padY = Math.round(fs * 1.0);
    const radius = Math.round(fs * 0.9);
    const maxChars = Math.max(...lines.map(l => l.length));
    const edgeMargin = Math.max(16, Math.round(fs * 0.8));
    const posStyles: Record<string, { top?: string; bottom?: string; left?: string; right?: string }> = {
      southeast: { bottom: `${edgeMargin}px`, right: `${edgeMargin}px` },
      southwest: { bottom: `${edgeMargin}px`, left: `${edgeMargin}px` },
      northeast: { top: `${edgeMargin}px`, right: `${edgeMargin}px` },
      northwest: { top: `${edgeMargin}px`, left: `${edgeMargin}px` },
      center: { top: '50%', left: '50%' },
    };
    const pos = posStyles[position] || posStyles.southwest;
    if (lines.length === 0) return null;
    return (
      <div style={{
        position: 'absolute', ...pos,
        transform: position === 'center' ? 'translate(-50%,-50%)' : 'none',
        borderRadius: showBg ? `${radius}px` : 0,
        background: showBg ? `linear-gradient(to bottom, rgba(0,0,0,${0.5 * opacity}), rgba(0,0,0,${0.75 * opacity}))` : 'none',
        padding: showBg ? `${padY}px ${padX}px` : 0,
        boxShadow: showBg ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
        border: showBg ? '1px solid rgba(255,255,255,0.08)' : 'none',
        fontSize: `${fs}px`,
        fontWeight,
        lineHeight: `${lineH}px`,
        color: textColor,
        maxWidth: '92%',
        pointerEvents: 'none',
      }}>
        {lines.map((l, i) => <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l}</div>)}
      </div>
    );
  }

  const iconMap: Record<string, string> = {
    default: '📁', trash: '🗑️', edit: '✏️', settings: '⚙️', user: '👤', home: '🏠', alert: '⚠️',
    shield: '🛡️', camera: '📷', video: '🎬', file: '📄', search: '🔍', lock: '🔒', bell: '🔔',
    image: '🖼️', download: '⬇️', upload: '⬆️', star: '⭐', heart: '❤️', check: '✅', cross: '❌',
    info: 'ℹ️', warning: '⚠️', question: '❓', mail: '✉️', phone: '📞', location: '📍', clock: '🕐',
    calendar: '📅', graph: '📊', document: '📃', folder: '📂', link: '🔗', tag: '🏷️', key: '🔑',
    brush: '🖌️', globe: '🌐', cloud: '☁️', printer: '🖨️', cart: '🛒', gift: '🎁', award: '🏆',
    microphone: '🎤', music: '🎵', play: '▶️', pause: '⏸️', stop: '⏹️', refresh: '🔄', history: '🕰️',
  };
  const emojiPickerList = Object.entries(iconMap).filter(([k]) => k !== 'default');

  if (loading) return <div className="text-center py-20 text-[var(--muted-foreground)] text-sm">加载中...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-[var(--foreground)] text-xl font-bold tracking-tight">系统配置</h2>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} disabled={resetting}
            className="px-4 py-2 rounded-lg bg-[var(--destructive)]/10 text-[var(--destructive)] text-sm font-medium hover:bg-[var(--destructive)]/20 transition-colors disabled:opacity-60">
            {resetting ? '初始化中...' : '初始化系统'}
          </button>
          {activeTab < configGroups.length && (
            <button onClick={handleSave} disabled={saving}
              className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:bg-[var(--primary)]/80 transition-colors disabled:opacity-60">
              {saving ? '保存中...' : '保存配置'}
            </button>
          )}
        </div>
      </div>

      <div className="bg-[var(--card)]/80 backdrop-blur-md border border-[var(--border)] rounded-2xl overflow-hidden shadow-sm">
        <div className="flex overflow-x-auto border-b border-[var(--border)] scrollbar-thin">
          {TAB_LABELS.map((label, i) => (
            <button key={label} onClick={() => setActiveTab(i)}
              className={`px-4 py-3 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === i ? 'border-[var(--primary)] text-[var(--primary)]' : 'border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
              }`}>
              {label}
            </button>
          ))}
        </div>

        {activeTab < configGroups.length ? (() => {
          const t = activeTab;
          if (t === 4) {
            return (
              <div className="p-4 space-y-5">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">自动水印</label>
                  <SwitchField checked={configs.watermark_auto_apply === 'true'} onChange={v => setConfigs(p => ({ ...p, watermark_auto_apply: v ? 'true' : 'false' }))}
                    label={configs.watermark_auto_apply === 'true' ? '开启' : '关闭'} />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0 pt-2">水印模板</label>
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap gap-1.5">
                      {WATERMARK_VARS.map(v => (
                        <button key={v.name} onClick={() => insertVar(v.name)}
                          className="px-2 py-0.5 text-[11px] rounded-md border border-[var(--border)] bg-[var(--card)]/60 text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                          {'{'+v.name+'} '}{v.label}
                        </button>
                      ))}
                    </div>
                    <textarea ref={textareaRef} value={configs.watermark_template || ''}
                      onChange={(e) => setConfigs(p => ({ ...p, watermark_template: e.target.value }))}
                      rows={5}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] transition-all font-mono resize-y" />
                    <div className="flex items-center gap-2">
                      {TEMPLATE_PRESETS.map(p => (
                        <button key={p.label} onClick={() => setConfigs(s => ({ ...s, watermark_template: p.value }))}
                          className="px-3 py-1 text-[11px] rounded-lg border border-[var(--border)] bg-[var(--card)]/60 text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">{p.label}</button>
                      ))}
                      <button onClick={() => setConfigs(s => ({ ...s, watermark_template: DEFAULT_TEMPLATE }))}
                        className="px-3 py-1 text-[11px] rounded-lg border border-dashed border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">恢复默认</button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">证据编号格式</label>
                  <input type="text" value={configs.watermark_record_prefix || 'NO.'}
                    onChange={e => setConfigs(p => ({ ...p, watermark_record_prefix: e.target.value }))}
                    placeholder="前缀 (默认 NO.)"
                    className="w-32 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-xs outline-none focus:border-[var(--primary)]" />
                  <NumberField value={parseInt(configs.watermark_record_digits || '0')} min={0} max={10} step={1} unit="位"
                    onChange={v => setConfigs(p => ({ ...p, watermark_record_digits: String(v) }))} />
                  <input type="text" value={configs.watermark_record_suffix || ''}
                    onChange={e => setConfigs(p => ({ ...p, watermark_record_suffix: e.target.value }))}
                    placeholder="后缀"
                    className="w-28 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-xs outline-none focus:border-[var(--primary)]" />
                  <span className="text-[10px] text-[var(--muted-foreground)]">
                    预览: {configs.watermark_record_prefix || 'NO.'}{String(2024001).padStart(parseInt(configs.watermark_record_digits || '0'), '0')}{configs.watermark_record_suffix || ''}
                  </span>
                </div>
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                    <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0 pt-1.5">日期格式</label>
                    <div className="flex-1 space-y-2">
                      <div className="flex flex-wrap gap-1.5">
                        {DATE_FORMAT_PRESETS.map(p => (
                          <button key={p.value} onClick={() => setConfigs(s => ({ ...s, watermark_date_format: p.value === '__custom__' ? (s.watermark_date_format || 'YYYY-MM-DD HH:mm:ss') : p.value }))}
                            className={`px-3 py-1 text-[11px] rounded-lg border transition-colors ${
                              (p.value !== '__custom__' && (configs.watermark_date_format || 'YYYY-MM-DD HH:mm:ss') === p.value)
                                ? 'border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]'
                                : 'border-[var(--border)] bg-[var(--card)]/60 text-[var(--foreground)] hover:bg-[var(--muted)]'
                            }`}>{p.label}</button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <input type="text" value={configs.watermark_date_format || 'YYYY-MM-DD HH:mm:ss'}
                          onChange={e => setConfigs(p => ({ ...p, watermark_date_format: e.target.value }))}
                          placeholder="自定义格式，如 YYYY/MM/DD"
                          className="flex-1 max-w-[280px] px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-xs font-mono outline-none focus:border-[var(--primary)]" />
                        <span className="text-[10px] text-[var(--muted-foreground)]">支持 YYYY MM DD HH mm ss A 等格式</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">水印位置</label>
                  <SelectField value={configs.watermark_position || 'southwest'} options={ENUM_OPTIONS.watermark_position || []} onChange={v => setConfigs(p => ({ ...p, watermark_position: v }))} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">背景与边框</label>
                  <SwitchField checked={configs.watermark_show_bg !== 'false'} onChange={v => setConfigs(p => ({ ...p, watermark_show_bg: v ? 'true' : 'false' }))} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">水印文字颜色</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={configs.watermark_text_color || '#FFFFFF'}
                      onChange={(e) => setConfigs(p => ({ ...p, watermark_text_color: e.target.value }))}
                      className="w-8 h-8 rounded border border-[var(--border)] cursor-pointer bg-transparent p-0.5" />
                    <input type="text" value={configs.watermark_text_color || '#FFFFFF'}
                      onChange={(e) => { const v = e.target.value; if (/^#[0-9a-fA-F]{0,6}$/.test(v)) setConfigs(p => ({ ...p, watermark_text_color: v })); }}
                      className="w-24 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-xs font-mono outline-none focus:border-[var(--primary)]" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">文字粗细</label>
                  <SelectField value={configs.watermark_font_weight === 'bold' ? 'bold' : 'normal'} options={ENUM_OPTIONS.watermark_font_weight || []} onChange={v => setConfigs(p => ({ ...p, watermark_font_weight: v }))} />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">水印字体大小</label>
                  <NumberField value={parseInt(configs.watermark_font_size || '14')} min={0} max={72} step={1} unit="px"
                    onChange={v => setConfigs(p => ({ ...p, watermark_font_size: String(v) }))} />
                  <span className="text-xs text-[var(--muted-foreground)] ml-1">(0 = 自动适配)</span>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">水印透明度</label>
                  <div className="flex items-center gap-2 flex-1 max-w-[360px]">
                    <input type="range" min={0} max={100} value={Math.round(parseFloat(configs.watermark_opacity || '0.8') * 100)}
                      onChange={(e) => setConfigs(p => ({ ...p, watermark_opacity: String(Math.round(parseInt(e.target.value)) / 100) }))}
                      className="flex-1 h-2 rounded-full appearance-none cursor-pointer bg-[var(--muted)] accent-[var(--primary)]" />
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { const cur = parseFloat(configs.watermark_opacity || '0.8'); setConfigs(p => ({ ...p, watermark_opacity: String(Math.max(0, Math.round((cur - 0.01) * 100) / 100)) })); }}
                        className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-sm hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]">−</button>
                      <input type="number" min={0} max={1} step={0.01} value={parseFloat(configs.watermark_opacity || '0.8')}
                        onChange={e => { const v = parseFloat(e.target.value); setConfigs(p => ({ ...p, watermark_opacity: String(isNaN(v) ? 0 : Math.max(0, Math.min(1, Math.round(v * 100) / 100))) })); }}
                        className="w-16 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm text-center outline-none focus:border-[var(--primary)] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                      <button onClick={() => { const cur = parseFloat(configs.watermark_opacity || '0.8'); setConfigs(p => ({ ...p, watermark_opacity: String(Math.min(1, Math.round((cur + 0.01) * 100) / 100)) })); }}
                        className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-sm hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]">+</button>
                    </div>
                    <p className="text-[10px] text-[var(--muted-foreground)]">{keyHelpers.watermark_opacity}</p>
                  </div>
                </div>
                <div className="mt-4 border-t border-[var(--border)] pt-4">
                  <h4 className="text-xs font-semibold text-[var(--foreground)] mb-3">实时预览</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="relative rounded-xl overflow-hidden border border-[var(--border)]" style={{ minHeight: 360, background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(45deg, #fff 25%, transparent 25%, transparent 50%, #fff 50%, #fff 75%, transparent 75%, transparent)', backgroundSize: '20px 20px' }} />
                      <div className="absolute top-2 left-2 text-[10px] text-white/40">浅色背景</div>
                      <WatermarkPreview template={configs.watermark_template || DEFAULT_TEMPLATE} position={configs.watermark_position || 'southwest'} dateFormat={configs.watermark_date_format || 'YYYY-MM-DD HH:mm:ss'} recordPrefix={configs.watermark_record_prefix || 'NO.'} recordDigits={parseInt(configs.watermark_record_digits || '0')} recordSuffix={configs.watermark_record_suffix || ''} showBg={configs.watermark_show_bg !== 'false'} textColor={configs.watermark_text_color || '#FFFFFF'} fontWeight={configs.watermark_font_weight === 'bold' ? 'bold' : 'normal'} fontSize={parseInt(configs.watermark_font_size || '14')} opacity={parseFloat(configs.watermark_opacity || '0.8')} />
                    </div>
                    <div className="relative rounded-xl overflow-hidden border border-[var(--border)] bg-neutral-900" style={{ minHeight: 360 }}>
                      <div className="absolute top-2 left-2 text-[10px] text-white/30">深色背景</div>
                      <WatermarkPreview template={configs.watermark_template || DEFAULT_TEMPLATE} position={configs.watermark_position || 'southwest'} dateFormat={configs.watermark_date_format || 'YYYY-MM-DD HH:mm:ss'} recordPrefix={configs.watermark_record_prefix || 'NO.'} recordDigits={parseInt(configs.watermark_record_digits || '0')} recordSuffix={configs.watermark_record_suffix || ''} showBg={configs.watermark_show_bg !== 'false'} textColor={configs.watermark_text_color || '#FFFFFF'} fontWeight={configs.watermark_font_weight === 'bold' ? 'bold' : 'normal'} fontSize={parseInt(configs.watermark_font_size || '14')} opacity={parseFloat(configs.watermark_opacity || '0.8')} />
                    </div>
                  </div>
                </div>
              </div>
            );
          }
          if (t === 7) {
            return (
              <div className="p-4 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">{keyLabels.storage_backend}</label>
                  <SelectField value={configs.storage_backend || 'local'} options={ENUM_OPTIONS.storage_backend || []} onChange={v => setConfigs(p => ({ ...p, storage_backend: v }))} />
                </div>
                <p className="text-[10px] text-[var(--muted-foreground)] ml-0 sm:ml-40 -mt-2">{keyHelpers.storage_backend}</p>
                {configs.storage_backend === 's3' && (
                  <div className="space-y-3 pl-0 sm:pl-40 border-l-2 border-[var(--border)] ml-0 sm:ml-10 pl-4">
                    {['s3_endpoint', 's3_bucket', 's3_access_key', 's3_secret_key', 's3_region'].map(key => (
                      <div key={key}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <label className="text-xs text-[var(--muted-foreground)] w-32 flex-shrink-0">{keyLabels[key] || key}</label>
                          {renderField(key)}
                        </div>
                        {keyHelpers[key] && <p className="text-[10px] text-[var(--muted-foreground)] mt-1 ml-0 sm:ml-32">{keyHelpers[key]}</p>}
                      </div>
                    ))}
                  </div>
                )}
                {configs.storage_backend === 'nodeimage' && (
                  <div className="space-y-3 pl-0 sm:pl-40 border-l-2 border-[var(--border)] ml-0 sm:ml-10 pl-4">
                    {['node_image_api_url', 'node_image_api_key'].map(key => (
                      <div key={key}>
                        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                          <label className="text-xs text-[var(--muted-foreground)] w-32 flex-shrink-0">{keyLabels[key] || key}</label>
                          {renderField(key)}
                        </div>
                        {keyHelpers[key] && <p className="text-[10px] text-[var(--muted-foreground)] mt-1 ml-0 sm:ml-32">{keyHelpers[key]}</p>}
                      </div>
                    ))}
                  </div>
                )}
                <div className="pt-3 border-t border-[var(--border)]">
                  <button onClick={testStorage} disabled={testStorageBusy}
                    className="px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium hover:bg-[var(--primary)]/20 transition-colors disabled:opacity-60">
                    {testStorageBusy ? '测试中...' : '测试存储连通性'}
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div className="p-4 space-y-4">
              {configGroups[t].keys.map(key => (
                <div key={key}>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <label className="text-xs text-[var(--muted-foreground)] w-40 flex-shrink-0">{keyLabels[key] || key}</label>
                    {renderField(key)}
                  </div>
                  {keyHelpers[key] && <p className="text-[10px] text-[var(--muted-foreground)] mt-1 ml-0 sm:ml-40">{keyHelpers[key]}</p>}
                </div>
              ))}
            </div>
          );
        })() : activeTab === NOTIF_TAB_INDEX ? (
          <div className="p-4 space-y-4">
            <div>
              <button onClick={() => toggleNotifSection('channel')}
                className="flex items-center gap-2 w-full text-sm font-semibold text-[var(--foreground)] py-2">
                <svg className={`transition-transform ${activeNotifSection === 'channel' ? 'rotate-90' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
                通道配置
              </button>
              {activeNotifSection === 'channel' && (
                <div className="space-y-4 mt-2">
                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <h5 className="text-xs font-semibold text-[var(--foreground)] mb-3">邮件服务 (SMTP)</h5>
                    <div className="space-y-3">
                      {['smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'mail_from'].map(key => (
                        <div key={key}>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-xs text-[var(--muted-foreground)] w-36 flex-shrink-0">{keyLabels[key] || key}</label>
                            {renderField(key)}
                          </div>
                          {keyHelpers[key] && <p className="text-[10px] text-[var(--muted-foreground)] mt-1 ml-0 sm:ml-36">{keyHelpers[key]}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 items-center mt-3 pt-3 border-t border-[var(--border)]">
                      <input type="email" value={testEmailAddr} onChange={e => setTestEmailAddr(e.target.value)}
                        placeholder="输入收件地址测试" className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
                      <button onClick={sendTestEmail} disabled={testSending}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium hover:bg-[var(--primary)]/20 transition-colors disabled:opacity-60">
                        {testSending ? '发送中...' : '发送测试邮件'}
                      </button>
                    </div>
                  </div>
                  <div className="rounded-xl border border-[var(--border)] p-4">
                    <h5 className="text-xs font-semibold text-[var(--foreground)] mb-3">短信服务 (SMS)</h5>
                    <div className="space-y-3">
                      {['sms_provider', 'sms_access_key', 'sms_secret_key', 'sms_sign_name', 'sms_template_code'].map(key => (
                        <div key={key}>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="text-xs text-[var(--muted-foreground)] w-36 flex-shrink-0">{keyLabels[key] || key}</label>
                            {renderField(key)}
                          </div>
                          {keyHelpers[key] && <p className="text-[10px] text-[var(--muted-foreground)] mt-1 ml-0 sm:ml-36">{keyHelpers[key]}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2 items-center mt-3 pt-3 border-t border-[var(--border)]">
                      <input type="tel" value={testSmsPhone} onChange={e => setTestSmsPhone(e.target.value)}
                        placeholder="输入手机号测试" className="flex-1 max-w-xs px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
                      <button onClick={() => sendTestSms()} disabled={testSmsSending}
                        className="px-4 py-2 rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] text-sm font-medium hover:bg-[var(--primary)]/20 transition-colors disabled:opacity-60">
                        {testSmsSending ? '发送中...' : '发送测试短信'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)]">
              <button onClick={() => toggleNotifSection('prefs')}
                className="flex items-center gap-2 w-full text-sm font-semibold text-[var(--foreground)] py-2">
                <svg className={`transition-transform ${activeNotifSection === 'prefs' ? 'rotate-90' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
                偏好设置
              </button>
              {activeNotifSection === 'prefs' && (
                <div className="space-y-3 mt-2">
                  {['verify_code_expire_minutes', 'site_url'].map(key => (
                    <div key={key}>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="text-xs text-[var(--muted-foreground)] w-36 flex-shrink-0">{keyLabels[key] || key}</label>
                        {renderField(key)}
                      </div>
                      {keyHelpers[key] && <p className="text-[10px] text-[var(--muted-foreground)] mt-1 ml-0 sm:ml-36">{keyHelpers[key]}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)]">
              <button onClick={() => toggleNotifSection('email_templates')}
                className="flex items-center gap-2 w-full text-sm font-semibold text-[var(--foreground)] py-2">
                <svg className={`transition-transform ${activeNotifSection === 'email_templates' ? 'rotate-90' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
                邮件模板管理
              </button>
              {activeNotifSection === 'email_templates' && (
                <div className="space-y-3 mt-2">
                  {emailTemplates.map((tpl: any) => (
                    <div key={tpl.key} className="rounded-xl border border-[var(--border)] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[var(--foreground)]">{tpl.label}</span>
                        <div className="flex gap-1">
                          {tpl.isDefault && <span className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--primary)]/10 text-[var(--primary)]">默认</span>}
                        </div>
                      </div>
                      {editingTemplate === tpl.key ? (
                        <div className="space-y-2">
                          <div>
                            <span className="text-[10px] text-[var(--muted-foreground)]">主题</span>
                            <input type="text" value={templateEditForm.subject || ''}
                              onChange={e => setTemplateEditForm(f => ({ ...f, subject: e.target.value }))}
                              className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
                          </div>
                          <div>
                            <span className="text-[10px] text-[var(--muted-foreground)]">内容 (HTML)</span>
                            <textarea value={templateEditForm.body || ''}
                              onChange={e => setTemplateEditForm(f => ({ ...f, body: e.target.value }))}
                              rows={6}
                              className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-xs font-mono outline-none focus:border-[var(--primary)] resize-y" />
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] text-[var(--muted-foreground)]">可用变量: </span>
                            {tpl.availableVars?.map((v: string) => (
                              <button key={v} onClick={() => setTemplateEditForm((f: any) => ({ ...f, body: (f.body || '') + v }))}
                                className="px-1.5 py-0.5 text-[10px] rounded border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--muted-foreground)]">{v}</button>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => saveTemplate(tpl.key)} disabled={templateSaving === tpl.key}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-60">
                              {templateSaving === tpl.key ? '保存中...' : '保存'}
                            </button>
                            <button onClick={() => setEditingTemplate(null)}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-medium">取消</button>
                            <button onClick={() => { resetTemplate(tpl.key); setEditingTemplate(null); }}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--destructive)]/10 text-[var(--destructive)] font-medium hover:bg-[var(--destructive)]/20">恢复默认</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs text-[var(--muted-foreground)] mb-1">主题: {tpl.subject}</div>
                          <div className="text-xs text-[var(--muted-foreground)] line-clamp-2 font-mono bg-[var(--card)]/50 rounded-lg p-2">{tpl.body}</div>
                          <button onClick={() => { setEditingTemplate(tpl.key); setTemplateEditForm({ subject: tpl.subject, body: tpl.body }); }}
                            className="mt-2 px-3 py-1 text-xs rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors">编辑</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)]">
              <button onClick={() => toggleNotifSection('sms_templates')}
                className="flex items-center gap-2 w-full text-sm font-semibold text-[var(--foreground)] py-2">
                <svg className={`transition-transform ${activeNotifSection === 'sms_templates' ? 'rotate-90' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M9 18l6-6-6-6"/></svg>
                短信模板管理
              </button>
              {activeNotifSection === 'sms_templates' && (
                <div className="space-y-3 mt-2">
                  {smsTemplates.map((tpl: any) => (
                    <div key={tpl.key} className="rounded-xl border border-[var(--border)] p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[var(--foreground)]">{tpl.label}</span>
                        <div className="flex gap-1">
                          {tpl.isDefault && <span className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--primary)]/10 text-[var(--primary)]">默认</span>}
                          {tpl.content && <span className={`px-1.5 py-0.5 text-[10px] rounded ${(tpl.content.length || 0) > (tpl.maxLength || 70) ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}`}>{tpl.content.length || 0}/{tpl.maxLength || 70}</span>}
                        </div>
                      </div>
                      {editingTemplate === tpl.key ? (
                        <div className="space-y-2">
                          <textarea value={templateEditForm.content || ''}
                            onChange={e => setTemplateEditForm(f => ({ ...f, content: e.target.value }))}
                            rows={3}
                            className="w-full px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] resize-y" />
                          <div className="flex flex-wrap gap-1">
                            <span className="text-[10px] text-[var(--muted-foreground)]">可用变量: </span>
                            {tpl.availableVars?.map((v: string) => (
                              <button key={v} onClick={() => setTemplateEditForm((f: any) => ({ ...f, content: (f.content || '') + v }))}
                                className="px-1.5 py-0.5 text-[10px] rounded border border-[var(--border)] hover:bg-[var(--muted)] text-[var(--muted-foreground)]">{v}</button>
                            ))}
                          </div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => saveTemplate(tpl.key)} disabled={templateSaving === tpl.key}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium disabled:opacity-60">
                              {templateSaving === tpl.key ? '保存中...' : '保存'}
                            </button>
                            <button onClick={() => setEditingTemplate(null)}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-medium">取消</button>
                            <button onClick={() => { resetTemplate(tpl.key); setEditingTemplate(null); }}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--destructive)]/10 text-[var(--destructive)] font-medium hover:bg-[var(--destructive)]/20">恢复默认</button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="text-xs text-[var(--muted-foreground)] mb-1">内容:</div>
                          <div className="text-xs text-[var(--muted-foreground)] line-clamp-2 bg-[var(--card)]/50 rounded-lg p-2">{tpl.content}</div>
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => { setEditingTemplate(tpl.key); setTemplateEditForm({ content: tpl.content }); }}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--primary)]/10 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors">编辑</button>
                            <button onClick={() => sendTestSms(tpl.scenario, testSmsPhone)}
                              className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors">发送测试</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] pt-2">
              <h4 className="text-xs font-semibold text-[var(--foreground)] mb-2">通知渠道状态</h4>
              {channelStatusLoading ? (
                <div className="text-center py-4 text-[var(--muted-foreground)] text-xs">检测中...</div>
              ) : channelStatus ? (
                <div className="space-y-2">
                  <div className={`rounded-xl p-3 border ${channelStatus.email.configured ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--foreground)]">{channelStatus.email.label}</span>
                      <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${channelStatus.email.configured ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>{channelStatus.email.configured ? '已配置' : '未配置'}</span>
                    </div>
                  </div>
                  <div className={`rounded-xl p-3 border ${channelStatus.sms.configured ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--foreground)]">{channelStatus.sms.label}</span>
                      <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${channelStatus.sms.configured ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>{channelStatus.sms.configured ? '已配置' : '未配置'}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-4 text-[var(--muted-foreground)] text-xs">检测失败</div>
              )}
              <div className="mt-2">
                <button onClick={async () => {
                  setSendLogsLoading(true);
                  try {
                    const res = await api.get('/admin/notifications/send-logs');
                    if (res.data.code === 0) setSendLogs(res.data.data || []);
                  } catch {} finally { setSendLogsLoading(false); }
                }} className="text-xs text-[var(--primary)] hover:underline">
                  查看发送日志
                </button>
              </div>
              {sendLogsLoading && <div className="text-center py-4 text-[var(--muted-foreground)] text-xs">加载中...</div>}
              {!sendLogsLoading && sendLogs.length > 0 && (
                <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                  {sendLogs.map((log: any, i: number) => (
                    <div key={log.id || i} className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] bg-[var(--card)]/50 px-2 py-1 rounded-lg">
                      <span>{log.channel}</span>
                      <span className={log.status === 'sent' ? 'text-green-500' : 'text-red-500'}>{log.status === 'sent' ? '成功' : '失败'}</span>
                      <span>{(log.created_at || '').slice(0, 16)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === ANN_TAB_INDEX ? (
          <div className="p-4 space-y-4">
            <div className="space-y-3 bg-[var(--card)]/50 rounded-xl p-4 border border-[var(--border)]">
              <h4 className="text-sm font-semibold text-[var(--foreground)]">发布新公告</h4>
              <input type="text" placeholder="公告标题 *" value={annForm.title}
                onChange={e => setAnnForm(p => ({...p, title: e.target.value}))}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
              <textarea placeholder="公告内容 *" value={annForm.content}
                onChange={e => setAnnForm(p => ({...p, content: e.target.value}))} rows={4}
                className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--card)]/80 text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)] resize-none" />
              <button onClick={handleSendAnnouncement} disabled={annSending}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium disabled:opacity-60">
                {annSending ? '发送中...' : '发送给所有业主'}
              </button>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-[var(--foreground)] mb-3">发送记录</h4>
              {annLoading ? (
                <div className="text-center py-8 text-[var(--muted-foreground)] text-xs">加载中...</div>
              ) : announcements.length === 0 ? (
                <div className="text-center py-8 text-[var(--muted-foreground)] text-xs">暂无发送记录</div>
              ) : (
                <div className="space-y-2">
                  {announcements.map((a: any) => (
                    <div key={a.id} className="flex items-start gap-3 bg-[var(--card)]/50 rounded-xl p-4 border border-[var(--border)]">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[var(--foreground)]">{a.title}</span>
                          <span className="text-[10px] text-[var(--muted-foreground)]">{(a.created_at || '').slice(0, 16)}</span>
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)] mt-1 whitespace-pre-wrap line-clamp-2">{a.content}</div>
                      </div>
                      <button onClick={() => handleDeleteAnnouncement(a.id)}
                        className="px-2 py-1 rounded-lg bg-[var(--destructive)]/10 hover:bg-[var(--destructive)]/20 flex-shrink-0" title="删除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-[var(--destructive)]"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="flex gap-2 flex-wrap">
              <input type="text" placeholder="分类名称 *" value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleCatAdd()}
                className="flex-1 min-w-[120px] px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
              <button onClick={handleCatAdd}
                className="px-4 py-2 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium">添加</button>
            </div>
            <div className="space-y-2">
              {cats.map((item) => (
                <div key={item.id} className="bg-[var(--card)]/70 rounded-xl p-4 border border-[var(--border)]">
                  {editingId === item.id ? (
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <input value={catForm.name} onChange={e => setCatForm(p => ({...p, name: e.target.value}))}
                          placeholder="分类名称" className="flex-1 min-w-[100px] px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
                        <input value={catForm.code} onChange={e => setCatForm(p => ({...p, code: e.target.value}))}
                          placeholder="类别编码" className="w-28 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
                        <div className="flex items-center gap-1">
                          <span className="text-lg flex-shrink-0">{iconMap[catForm.icon] || iconMap.default}</span>
                          <div className="relative group">
                            <input value={catForm.icon} onChange={e => setCatForm(p => ({...p, icon: e.target.value}))}
                              placeholder="图标标识" className="w-20 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-xs outline-none" />
                            <div className="absolute top-full left-0 mt-1 z-10 hidden group-focus-within:block hover:block p-2 rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-xl" style={{ width: 280, maxHeight: 160, overflowY: 'auto' }}>
                              <div className="flex flex-wrap gap-1">
                                {emojiPickerList.map(([k, emoji]) => (
                                  <button key={k} type="button" onClick={() => setCatForm(p => ({...p, icon: k}))}
                                    className={`w-8 h-8 flex items-center justify-center rounded-lg text-base hover:bg-[var(--muted)] transition-colors ${catForm.icon === k ? 'bg-[var(--primary)]/10 ring-1 ring-[var(--primary)]' : ''}`}
                                    title={k}>{emoji}</button>
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setCatForm(p => ({...p, sort_order: Math.max(0, p.sort_order - 1)}))}
                            className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-sm hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]">−</button>
                          <input type="number" min={0} value={catForm.sort_order} onChange={e => setCatForm(p => ({...p, sort_order: Math.max(0, parseInt(e.target.value) || 0)}))}
                            className="w-16 px-2 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                          <button onClick={() => setCatForm(p => ({...p, sort_order: p.sort_order + 1}))}
                            className="w-7 h-7 rounded-lg border border-[var(--border)] flex items-center justify-center text-sm hover:bg-[var(--muted)] transition-colors text-[var(--foreground)]">+</button>
                          <span className="text-xs text-[var(--muted-foreground)]">排序</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <input value={catForm.description} onChange={e => setCatForm(p => ({...p, description: e.target.value}))}
                          placeholder="说明" className="flex-1 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm outline-none focus:border-[var(--primary)]" />
                        <button onClick={() => handleCatSave(item.id)} className="px-4 py-1.5 text-xs rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] font-medium">保存</button>
                        <button onClick={() => setEditingId(null)} className="px-4 py-1.5 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] font-medium">取消</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 group">
                      <span className="text-2xl flex-shrink-0 text-[var(--foreground)]">{iconMap[item.icon || ''] || iconMap.default}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[var(--foreground)] text-sm font-medium">{item.name}</span>
                          {item.code && <span className="text-[var(--muted-foreground)] text-xs font-mono">{item.code}</span>}
                          <span className="text-[var(--muted-foreground)] text-xs">排序: {item.sort_order}</span>
                        </div>
                        {item.description && <div className="text-[var(--muted-foreground)] text-xs mt-0.5 truncate">{item.description}</div>}
                      </div>
                      <button onClick={() => handleCatEdit(item)} className="px-3 py-1 text-xs rounded-lg bg-[var(--muted)] text-[var(--foreground)] hover:bg-[var(--accent)] flex-shrink-0">编辑</button>
                      <button onClick={() => handleCatDelete(item.id)}
                        className="px-2 py-1 rounded-lg bg-[var(--destructive)]/10 hover:bg-[var(--destructive)]/20 flex-shrink-0" title="删除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="text-[var(--destructive)]"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {cats.length === 0 && <div className="text-center py-8 text-[var(--muted-foreground)] text-sm">暂无分类</div>}
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmAnnId !== null}
        title="确认删除"
        message="确定删除此公告？"
        onConfirm={execDeleteAnnouncement}
        onCancel={() => setConfirmAnnId(null)}
        danger />

      <ConfirmModal
        open={confirmReset === 'first'}
        title="⚠️ 确认初始化系统"
        message="此操作将清空所有数据（用户、媒体、审核、白名单等），仅保留默认管理员账户 admin。此操作不可撤销！"
        onConfirm={handleResetSecondConfirm}
        onCancel={() => setConfirmReset(null)}
        danger />

      <ConfirmModal
        open={confirmReset === 'second'}
        title="⚠️ 再次确认"
        message="真的要清空所有数据吗？此操作不可撤销！"
        onConfirm={execReset}
        onCancel={() => setConfirmReset(null)}
        danger />

      <ConfirmModal
        open={confirmCatId !== null}
        title="确认删除"
        message="确定删除该分类？"
        onConfirm={execCatDelete}
        onCancel={() => setConfirmCatId(null)}
        danger />
    </div>
  );
}
