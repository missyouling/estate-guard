import nodemailer from 'nodemailer';
import { getDb } from '../db';
import { configs, notifications, notificationSendLogs, userNotificationPrefs } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { beijingTime } from '../utils/time';
import { clearTransporterCache as clearMailerCache } from './mailer';

function isEmailConfigured(configMap: Record<string, string>): boolean {
  return !!(configMap.smtp_host && configMap.smtp_user && configMap.smtp_pass);
}

function isSmsConfigured(configMap: Record<string, string>): boolean {
  return !!(configMap.sms_provider && configMap.sms_access_key && configMap.sms_secret_key);
}

function getSiteUrl(configMap: Record<string, string>): string {
  return configMap.site_url || 'http://localhost:11111';
}

export async function getChannelConfigMap(): Promise<Record<string, string>> {
  const db = getDb();
  const all = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const c of all) map[c.key] = c.value;
  return map;
}

export function notifyConfigChanged() {
  clearMailerCache();
}

function getTlsOptions(port: number): { secure: boolean; tls?: Record<string, any>; requireTls?: boolean } {
  if (port === 465) return { secure: true, tls: { rejectUnauthorized: false } };
  if (port === 587) return { secure: false, requireTls: true, tls: { rejectUnauthorized: false } };
  return { secure: false, requireTls: false, tls: { rejectUnauthorized: false } };
}

let notificationTransporterCache: nodemailer.Transporter | null = null;
let notificationLastConfigHash = '';

async function getNotificationTransporter() {
  const map = await getChannelConfigMap();
  const cfg = {
    host: map.smtp_host || '',
    port: parseInt(map.smtp_port || '465', 10),
    user: map.smtp_user || '',
    pass: map.smtp_pass || '',
    from: map.mail_from || map.smtp_user || '',
  };
  const hash = JSON.stringify(cfg);
  if (notificationTransporterCache && hash === notificationLastConfigHash) return { transporter: notificationTransporterCache, config: cfg };
  notificationLastConfigHash = hash;
  const { secure, tls, requireTls } = getTlsOptions(cfg.port);
  notificationTransporterCache = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure,
    requireTLS: requireTls,
    auth: cfg.user && cfg.pass ? { user: cfg.user, pass: cfg.pass } : undefined,
    tls,
  } as any);
  return { transporter: notificationTransporterCache, config: cfg };
}

export async function sendRawSms(phone: string, message: string): Promise<string | null> {
  try {
    const map = await getChannelConfigMap();
    if (!isSmsConfigured(map)) return '短信服务未配置';
    const provider = map.sms_provider || '';
    const accessKey = map.sms_access_key || '';
    const secretKey = map.sms_secret_key || '';
    const signName = map.sms_sign_name || '';
    const templateCode = map.sms_template_code || '';

    if (provider === 'aliyun') {
      try {
        const createRequire = (await import('module')).createRequire;
        const localRequire = createRequire(import.meta.url);
        const Core = localRequire('@alicloud/pop-core');
        const client = new Core({
          accessKeyId: accessKey,
          accessKeySecret: secretKey,
          endpoint: 'https://dysmsapi.aliyuncs.com',
          apiVersion: '2017-05-25',
        });
        await client.request('SendSms', {
          PhoneNumbers: phone,
          SignName: signName,
          TemplateCode: templateCode,
          TemplateParam: JSON.stringify({ code: message }),
        });
      } catch (smsErr: any) {
        console.error('[Notification] Aliyun SMS failed:', smsErr?.message || smsErr, 'phone:', phone?.slice(0, 3) + '****' + phone?.slice(-4));
        return '阿里云短信发送失败';
      }
    } else {
      return `短信服务商 ${provider} 暂未实现`;
    }
    return null;
  } catch (err: any) {
    return err.message || '发送短信失败';
  }
}

async function sendRawEmailWithRetry(to: string, subject: string, html: string, retries = 1): Promise<string | null> {
  const { transporter, config } = await getNotificationTransporter();
  if (!config.host || !config.user || !config.pass) return '邮件服务未配置';
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail({ from: config.from, to, subject, html });
      return null;
    } catch (err: any) {
      if (attempt < retries) continue;
      console.error('[Notification] sendRawEmailWithRetry failed:', err?.message || err, 'to:', to, 'subject:', subject);
      console.error('[Notification] SMTP config (sanitized):', JSON.stringify({ host: config.host, port: config.port, user: config.user }));
      return err.message || '发送邮件失败';
    }
  }
  return '发送邮件失败';
}

export async function checkChannelConfig(channel: 'email' | 'sms'): Promise<boolean> {
  const map = await getChannelConfigMap();
  if (channel === 'email') return isEmailConfigured(map);
  if (channel === 'sms') return isSmsConfigured(map);
  return false;
}

export async function getUserNotificationPrefs(userId: number): Promise<{ email_enabled: boolean; sms_enabled: boolean }> {
  const db = getDb();
  const rows = await db.select().from(userNotificationPrefs).where(eq(userNotificationPrefs.user_id, userId)).limit(1);
  if (rows.length === 0) return { email_enabled: false, sms_enabled: false };
  return { email_enabled: !!rows[0].email_enabled, sms_enabled: !!rows[0].sms_enabled };
}

async function logSend(notificationId: number | null | undefined, userId: number | null | undefined, channel: string, status: string, errorMessage?: string) {
  try {
    const db = getDb();
    await db.insert(notificationSendLogs).values({
      notification_id: notificationId ?? undefined,
      user_id: userId ?? undefined,
      channel,
      status,
      error_message: errorMessage || undefined,
    });
  } catch {}
}

async function createNotificationRecord(userId: number, title: string, content: string, type: string = 'system', link?: string): Promise<number | null | undefined> {
  try {
    const db = getDb();
    const result = await db.insert(notifications).values({
      user_id: userId, title, content, type, link: link || undefined,
    }).returning({ id: notifications.id });
    return result[0]?.id ?? null;
  } catch {
    return null;
  }
}

interface SendResult {
  channel: string;
  success: boolean;
  error?: string;
}

function errStr(e: string | null | undefined): string | undefined {
  return e || undefined;
}

export async function sendNotificationToUser(
  userId: number,
  title: string,
  content: string,
  type: string = 'system',
  link?: string,
): Promise<SendResult[]> {
  const results: SendResult[] = [];

  const notifId = await createNotificationRecord(userId, title, content, type, link);
  await logSend(notifId, userId, 'system', 'sent');
  results.push({ channel: 'system', success: true });

  const prefs = await getUserNotificationPrefs(userId);
  const user = await getDb().select().from((await import('../db/schema')).users).where(eq((await import('../db/schema')).users.id, userId)).limit(1);
  const userData = user[0];

  if (prefs.email_enabled && userData?.email) {
    const err = await sendRawEmailWithRetry(userData.email, title, `<div style="font-family:-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:20px;"><h2 style="color:#007AFF;">${title}</h2><p style="color:#1d1d1f;line-height:1.6;">${content.replace(/\n/g, '<br>')}</p></div>`);
    await logSend(notifId, userId, 'email', err ? 'failed' : 'sent', errStr(err));
    results.push({ channel: 'email', success: !err, error: errStr(err) });
  }

  if (prefs.sms_enabled && userData?.phone) {
    const err = await sendRawSms(userData.phone, `${title}\n${content}`);
    await logSend(notifId, userId, 'sms', err ? 'failed' : 'sent', errStr(err));
    results.push({ channel: 'sms', success: !err, error: errStr(err) });
  }

  return results;
}

export async function sendNotificationToUnregistered(
  email?: string,
  phone?: string,
  title?: string,
  content?: string,
  activationLink?: string,
): Promise<SendResult[]> {
  const results: SendResult[] = [];
  const map = await getChannelConfigMap();
  const emailOk = isEmailConfigured(map);
  const smsOk = isSmsConfigured(map);
  const siteUrl = getSiteUrl(map);

  let sent = false;

  // SMS priority (short message with code/link)
  if (smsOk && phone) {
    const smsText = `${title || '通知'}\n${content || ''}${activationLink ? `\n激活链接: ${activationLink}` : ''}`;
    const err = await sendRawSms(phone, smsText);
    await logSend(undefined, undefined, 'sms', err ? 'failed' : 'sent', errStr(err));
    results.push({ channel: 'sms', success: !err, error: errStr(err) });
    sent = !err;
  }

  // Email fallback (always try if email provided) — with rich HTML and activation link
  if (emailOk && email) {
    const subject = title || '物业服务监督系统通知';
    const linkHtml = activationLink
      ? `<div style="margin:20px 0;text-align:center;"><a href="${activationLink}" style="display:inline-block;background:#007AFF;color:#fff;padding:12px 32px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:600;">点击激活账号</a></div><p style="color:#86868B;font-size:12px;text-align:center;">或复制以下链接到浏览器打开：<br><span style="color:#007AFF;">${activationLink}</span></p>`
      : '';
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
      <h2 style="color:#1d1d1f;font-size:20px;">${subject}</h2>
      <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">${(content || '').replace(/\n/g, '<br>')}</p>
      ${linkHtml}
      <hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
      <p style="color:#86868B;font-size:11px;">物业服务监督系统 · 自动发送，请勿回复</p>
    </div>`;
    const err = await sendRawEmailWithRetry(email, subject, html);
    await logSend(undefined, undefined, 'email', err ? 'failed' : 'sent', errStr(err));
    results.push({ channel: 'email', success: !err, error: errStr(err) });
    sent = sent || !err;
  }

  if (!sent) {
    await logSend(undefined, undefined, 'system', 'failed', '邮件和短信均未配置或发送失败');
    results.push({ channel: 'system', success: false, error: '通知发送失败' });
    await sendNotificationToUser(1, '系统告警: 通知渠道未配置',
      '邮件服务和短信服务均未配置，外部通知将无法发送。请尽快在"系统设置-通知配置"中完成渠道配置。', 'system', '/admin/config');
  }

  return results;
}

export async function sendSystemAnnouncement(title: string, content: string): Promise<void> {
  const db = getDb();
  const allUsers = await db.select().from((await import('../db/schema')).users).where(eq((await import('../db/schema')).users.status, 'active'));
  for (const u of allUsers) {
    await sendNotificationToUser(u.id, title, content, 'system', '/');
  }
}

export async function getSendLogs(limit: number = 100, offset: number = 0) {
  const db = getDb();
  const rows = await db.select().from(notificationSendLogs)
    .orderBy(sql`created_at DESC`)
    .limit(limit).offset(offset);
  return rows;
}
