import { eq } from 'drizzle-orm';
import { getDb } from '../db';
import { configs } from '../db/schema';

export type EmailScenario = 'register_code' | 'email_change' | 'phone_change_email' | 'approve' | 'reject' | 'identity_verify';
export type SmsScenario = 'register_code' | 'phone_change' | 'approve' | 'reject';

const EMAIL_DEFAULTS: Record<EmailScenario, { subject: string; body: string }> = {
  register_code: {
    subject: '{{系统名称}} - 注册验证码',
    body: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
<h2 style="color:#1d1d1f;font-size:20px;">注册验证</h2>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">{{用户名}}，您好</p>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您的注册验证码为：</p>
<div style="margin:24px 0;text-align:center;">
<span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#007AFF;">{{验证码}}</span>
</div>
<p style="color:#86868B;font-size:12px;">验证码有效期 {{有效期}} 分钟，请勿转发给他人。</p>
<hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
<p style="color:#86868B;font-size:11px;">{{系统名称}} · 自动发送，请勿回复</p>
</div>`,
  },
  email_change: {
    subject: '{{系统名称}} - 邮箱修改验证',
    body: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
<h2 style="color:#1d1d1f;font-size:20px;">邮箱修改验证</h2>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">{{用户名}}，您好</p>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您正在修改绑定邮箱，验证码为：</p>
<div style="margin:24px 0;text-align:center;">
<span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#007AFF;">{{验证码}}</span>
</div>
<p style="color:#86868B;font-size:12px;">验证码有效期 {{有效期}} 分钟，请勿转发给他人。</p>
<hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
<p style="color:#86868B;font-size:11px;">{{系统名称}} · 自动发送，请勿回复</p>
</div>`,
  },
  phone_change_email: {
    subject: '{{系统名称}} - 手机号修改验证',
    body: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
<h2 style="color:#1d1d1f;font-size:20px;">手机号修改验证</h2>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">{{用户名}}，您好</p>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您正在修改绑定手机号，验证码为：</p>
<div style="margin:24px 0;text-align:center;">
<span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#007AFF;">{{验证码}}</span>
</div>
<p style="color:#86868B;font-size:12px;">验证码有效期 {{有效期}} 分钟，请勿转发给他人。</p>
<hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
<p style="color:#86868B;font-size:11px;">{{系统名称}} · 自动发送，请勿回复</p>
</div>`,
  },
  approve: {
    subject: '{{系统名称}} - 注册审核通过',
    body: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
<h2 style="color:#34C759;font-size:20px;">注册审核通过</h2>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">{{用户名}}，您好</p>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您的注册申请已通过审核，请点击下方按钮激活账号：</p>
<div style="margin:24px 0;text-align:center;">
<a href="{{激活链接}}" style="display:inline-block;background:#007AFF;color:#fff;padding:14px 40px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">点击激活账号</a>
</div>
<p style="color:#86868B;font-size:12px;text-align:center;">或复制以下链接到浏览器：<br><span style="color:#007AFF;font-size:11px;">{{激活链接}}</span></p>
<p style="color:#86868B;font-size:12px;text-align:center;">如无法点击链接，也可使用验证码：<strong style="font-size:18px;color:#1d1d1f;letter-spacing:2px;">{{验证码}}</strong></p>
<hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
<p style="color:#86868B;font-size:11px;">验证码有效期 {{有效期}} 分钟，请勿转发给他人。</p>
<p style="color:#86868B;font-size:11px;">{{系统名称}} · 自动发送，请勿回复</p>
</div>`,
  },
  reject: {
    subject: '{{系统名称}} - 注册审核未通过',
    body: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
<h2 style="color:#FF3B30;font-size:20px;">审核未通过</h2>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">{{用户名}}，您好</p>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">很抱歉，您的注册申请未通过审核。</p>
<div style="background:#fef2f2;padding:16px;border-radius:12px;margin:16px 0;border-left:3px solid #FF3B30;">
<p style="color:#991b1b;font-size:13px;margin:0;">原因：{{驳回原因}}</p>
</div>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您可以登录系统重新提交注册申请。</p>
<p style="color:#86868B;font-size:12px;">如有疑问请联系物业服务中心。</p>
<hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
<p style="color:#86868B;font-size:11px;">{{系统名称}} · 自动发送，请勿回复</p>
</div>`,
  },
  identity_verify: {
    subject: '{{系统名称}} - 身份验证',
    body: `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
<h2 style="color:#1d1d1f;font-size:20px;">身份验证</h2>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">{{用户名}}，您好</p>
<p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您正在进行身份验证，验证码为：</p>
<div style="margin:24px 0;text-align:center;">
<span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#007AFF;">{{验证码}}</span>
</div>
<p style="color:#86868B;font-size:12px;">验证码有效期 {{有效期}} 分钟，请勿转发给他人。</p>
<hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
<p style="color:#86868B;font-size:11px;">{{系统名称}} · 自动发送，请勿回复</p>
</div>`,
  },
};

const SMS_DEFAULTS: Record<SmsScenario, string> = {
  register_code: '您的注册验证码为：{{验证码}}，有效期{{有效期}}分钟，请勿转发给他人。',
  phone_change: '您正在修改绑定手机号，验证码为：{{验证码}}，有效期{{有效期}}分钟。',
  approve: '您的注册申请已通过审核，请点击链接激活账号：{{激活链接}}',
  reject: '您的注册申请未通过审核，原因：{{驳回原因}}。详情请登录系统查看。',
};

const EMAIL_CONFIG_KEYS: Record<EmailScenario, string> = {
  register_code: 'email_template_register_code',
  email_change: 'email_template_email_change',
  phone_change_email: 'email_template_phone_change',
  approve: 'email_template_approve',
  reject: 'email_template_reject',
  identity_verify: 'email_template_identity_verify',
};

const SMS_CONFIG_KEYS: Record<SmsScenario, string> = {
  register_code: 'sms_template_register_code',
  phone_change: 'sms_template_phone_change',
  approve: 'sms_template_approve',
  reject: 'sms_template_reject',
};

export function getEmailConfigKey(scenario: EmailScenario): string {
  return EMAIL_CONFIG_KEYS[scenario];
}

export function getSmsConfigKey(scenario: SmsScenario): string {
  return SMS_CONFIG_KEYS[scenario];
}

export function getEmailDefault(scenario: EmailScenario): { subject: string; body: string } {
  return EMAIL_DEFAULTS[scenario];
}

export function getSmsDefault(scenario: SmsScenario): string {
  return SMS_DEFAULTS[scenario];
}

export function getEmailScenarios(): { key: string; label: string; scenario: EmailScenario }[] {
  return [
    { key: EMAIL_CONFIG_KEYS.register_code, label: '注册验证码', scenario: 'register_code' },
    { key: EMAIL_CONFIG_KEYS.email_change, label: '修改邮箱验证', scenario: 'email_change' },
    { key: EMAIL_CONFIG_KEYS.phone_change_email, label: '修改手机号验证（邮件通道）', scenario: 'phone_change_email' },
    { key: EMAIL_CONFIG_KEYS.approve, label: '注册审核通过', scenario: 'approve' },
    { key: EMAIL_CONFIG_KEYS.reject, label: '注册审核驳回', scenario: 'reject' },
    { key: EMAIL_CONFIG_KEYS.identity_verify, label: '身份验证', scenario: 'identity_verify' },
  ];
}

export function getSmsScenarios(): { key: string; label: string; scenario: SmsScenario }[] {
  return [
    { key: SMS_CONFIG_KEYS.register_code, label: '注册验证码', scenario: 'register_code' },
    { key: SMS_CONFIG_KEYS.phone_change, label: '修改手机号验证码', scenario: 'phone_change' },
    { key: SMS_CONFIG_KEYS.approve, label: '注册审核通过通知', scenario: 'approve' },
    { key: SMS_CONFIG_KEYS.reject, label: '注册审核驳回通知', scenario: 'reject' },
  ];
}

export function getAvailableVars(type: 'email' | 'sms'): string[] {
  if (type === 'email') {
    return ['{{用户名}}', '{{验证码}}', '{{有效期}}', '{{激活链接}}', '{{驳回原因}}', '{{系统名称}}'];
  }
  return ['{{验证码}}', '{{有效期}}', '{{激活链接}}', '{{驳回原因}}'];
}

export async function loadEmailTemplate(scenario: EmailScenario): Promise<{ subject: string; body: string }> {
  const key = EMAIL_CONFIG_KEYS[scenario];
  const db = getDb();
  const rows = await db.select().from(configs).where(eq(configs.key, key)).limit(1);
  if (rows.length && rows[0].value) {
    try {
      const parsed = JSON.parse(rows[0].value);
      if (parsed.subject && parsed.body) return parsed;
    } catch {}
  }
  return EMAIL_DEFAULTS[scenario];
}

export async function loadSmsTemplate(scenario: SmsScenario): Promise<string> {
  const key = SMS_CONFIG_KEYS[scenario];
  const db = getDb();
  const rows = await db.select().from(configs).where(eq(configs.key, key)).limit(1);
  if (rows.length && rows[0].value) return rows[0].value;
  return SMS_DEFAULTS[scenario];
}

export function renderEmailTemplate(template: { subject: string; body: string }, vars: Record<string, string>): { subject: string; html: string } {
  let subject = template.subject;
  let body = template.body;
  for (const [k, v] of Object.entries(vars)) {
    const r = new RegExp(`\\{\\{${k}\\}\\}`, 'g');
    subject = subject.replace(r, v);
    body = body.replace(r, v);
  }
  return { subject, html: body };
}

export function renderSmsTemplate(template: string, vars: Record<string, string>): string {
  let text = template;
  for (const [k, v] of Object.entries(vars)) {
    const r = new RegExp(`\\{\\{${k}\\}\\}`, 'g');
    text = text.replace(r, v);
  }
  return text;
}

export function getEmailTemplateDefaults(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [scenario, tpl] of Object.entries(EMAIL_DEFAULTS)) {
    result[EMAIL_CONFIG_KEYS[scenario as EmailScenario]] = JSON.stringify(tpl);
  }
  return result;
}

export function getSmsTemplateDefaults(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [scenario, tpl] of Object.entries(SMS_DEFAULTS)) {
    result[SMS_CONFIG_KEYS[scenario as SmsScenario]] = tpl;
  }
  return result;
}
