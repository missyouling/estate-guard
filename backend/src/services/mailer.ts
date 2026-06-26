import nodemailer from 'nodemailer';
import net from 'net';
import { getDb } from '../db';
import { configs } from '../db/schema';

async function getMailConfig() {
  const db = getDb();
  const all = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const c of all) map[c.key] = c.value;
  return {
    host: map.smtp_host || '',
    port: parseInt(map.smtp_port || '465', 10),
    user: map.smtp_user || '',
    pass: map.smtp_pass || '',
    from: map.mail_from || map.smtp_user || '',
    site_url: map.site_url || 'http://localhost:11111',
  };
}

let transporterCache: nodemailer.Transporter | null = null;
let lastConfigHash = '';

function getTlsOptions(port: number): { secure: boolean; tls?: Record<string, any>; requireTls?: boolean } {
  if (port === 465) {
    return { secure: true, tls: { rejectUnauthorized: false } };
  }
  if (port === 587) {
    return { secure: false, requireTls: true, tls: { rejectUnauthorized: false } };
  }
  // port 25 or any other — plain
  return { secure: false, requireTls: false, tls: { rejectUnauthorized: false } };
}

async function getTransporter() {
  const config = await getMailConfig();
  const hash = JSON.stringify(config);
  if (transporterCache && hash === lastConfigHash) return { transporter: transporterCache, config };
  lastConfigHash = hash;
  const { secure, tls, requireTls } = getTlsOptions(config.port);
  transporterCache = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure,
    requireTLS: requireTls,
    auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
    tls,
  } as any);
  return { transporter: transporterCache, config };
}

export function clearTransporterCache() {
  transporterCache = null;
  lastConfigHash = '';
}

export async function checkSmtpConnectivity(): Promise<string | null> {
  const config = await getMailConfig();
  if (!config.host) return 'SMTP 主机未配置';
  return new Promise((resolve) => {
    const sock = new net.Socket();
    sock.setTimeout(5000);
    sock.on('connect', () => { sock.destroy(); resolve(null); });
    sock.on('error', (err) => { sock.destroy(); resolve(`无法连接 ${config.host}:${config.port} — ${err.message}`); });
    sock.on('timeout', () => { sock.destroy(); resolve(`连接 ${config.host}:${config.port} 超时，请检查防火墙或主机地址`); });
    sock.connect(config.port, config.host);
  });
}

export function smtpErrorToMessage(err: any, config: { host: string; port: number; user: string }): string {
  const rawMessage = typeof err === 'string' ? err : (err?.message || err?.code || '');
  const msg = rawMessage.toLowerCase();
  const code = err?.code || '';
  if (msg.includes('eauth') || msg.includes('auth') || msg.includes('535') || msg.includes('login'))
    return `SMTP 认证失败 (${config.user})，请检查账号和授权码是否正确`;
  if (msg.includes('timeout') || msg.includes('etimedout') || msg.includes('econnrefused'))
    return `SMTP 连接超时或被拒绝 (${config.host}:${config.port})，请检查主机地址、端口和防火墙`;
  if (msg.includes('econnreset'))
    return `SMTP 连接被重置 (${config.host}:${config.port})，协议不匹配，请检查端口对应的加密方式（465=SSL, 587=STARTTLS, 25=非加密）`;
  if (msg.includes('dns') || msg.includes('enotfound') || msg.includes('getaddrinfo'))
    return `DNS 解析失败，无法解析主机名 ${config.host}`;
  if (msg.includes('553') || msg.includes('spam') || msg.includes('blocked'))
    return `邮件被服务商拒绝发送 (code: ${code})，请检查发件地址是否在白名单中`;
  if (msg.includes('550'))
    return `邮件被拒收 (550)，收件地址可能不存在或服务商策略限制`;
  return `发送失败: ${rawMessage || '未知错误'}`;
}

async function sendWithRetry(transporter: nodemailer.Transporter, from: string, to: string, subject: string, html: string, retries = 1): Promise<Error | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail({ from, to, subject, html });
      return null;
    } catch (err: any) {
      if (attempt < retries) continue;
      console.error('[Mailer] sendWithRetry failed:', err?.message || err, 'SMTP code:', err?.code);
      const opts = (transporter as any).options || {};
      console.error('[Mailer] Config (sanitized):', JSON.stringify({ host: opts.host, port: opts.port, user: opts.auth?.user, secure: opts.secure, requireTls: opts.requireTLS }, null, 2));
      return err instanceof Error ? err : new Error(String(err?.message || err || '邮件发送失败'));
    }
  }
  return new Error('邮件发送失败');
}

export async function sendTestEmail(to: string): Promise<string | null> {
  const { transporter, config } = await getTransporter();
  if (!config.host || !config.user || !config.pass) return '邮件服务未配置，请先填写 SMTP 参数';

  const connectivityErr = await checkSmtpConnectivity();
  if (connectivityErr) return connectivityErr;

  const subject = '物业服务监督系统 - 测试邮件';
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
    <h2 style="color:#34C759;font-size:20px;">测试邮件发送成功</h2>
    <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">这是一封来自物业服务监督系统的测试邮件。</p>
    <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">收到此邮件说明 SMTP 配置正确，邮件服务正常运行。</p>
    <table style="font-size:12px;color:#86868B;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:4px 8px;border:1px solid #e5e5e7;">SMTP 主机</td><td style="padding:4px 8px;border:1px solid #e5e5e7;">${config.host}</td></tr>
      <tr><td style="padding:4px 8px;border:1px solid #e5e5e7;">SMTP 端口</td><td style="padding:4px 8px;border:1px solid #e5e5e7;">${config.port}</td></tr>
      <tr><td style="padding:4px 8px;border:1px solid #e5e5e7;">发件地址</td><td style="padding:4px 8px;border:1px solid #e5e5e7;">${config.from}</td></tr>
    </table>
    <hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
    <p style="color:#86868B;font-size:11px;">物业服务监督系统 · 自动发送，请勿回复</p>
  </div>`;
  const err = await sendWithRetry(transporter, config.from, to, subject, html);
  if (err) {
    const msg = smtpErrorToMessage(err, config);
    console.error('[Mailer] sendTestEmail failed:', msg, '| original:', err.message);
    return msg;
  }
  return null;
}

export async function sendVerificationCode(to: string, code: string, name?: string, activationLink?: string) {
  const { transporter, config } = await getTransporter();
  const subject = '物业服务监督系统 - 注册审核通过';
  const linkHtml = activationLink
    ? `<div style="margin:24px 0;text-align:center;">
        <a href="${activationLink}" style="display:inline-block;background:#007AFF;color:#fff;padding:14px 40px;border-radius:10px;text-decoration:none;font-size:16px;font-weight:600;">点击激活账号</a>
       </div>
       <p style="color:#86868B;font-size:12px;text-align:center;">或复制以下链接到浏览器：<br><span style="color:#007AFF;font-size:11px;">${activationLink}</span></p>
       <p style="color:#86868B;font-size:12px;text-align:center;">如无法点击链接，也可使用验证码：<strong style="font-size:18px;color:#1d1d1f;letter-spacing:2px;">${code}</strong></p>`
    : `<div style="margin:24px 0;text-align:center;">
        <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#007AFF;">${code}</span>
       </div>`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
      <h2 style="color:#1d1d1f;font-size:20px;">注册审核通过</h2>
      <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">${name ? name + '，您好' : '您好'}</p>
      <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您的注册申请已通过审核，请点击下方按钮激活账号：</p>
      ${linkHtml}
      <hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
      <p style="color:#86868B;font-size:11px;">验证码有效期 30 分钟，请勿转发给他人。</p>
      <p style="color:#86868B;font-size:11px;">如您未提交注册申请，请忽略此邮件。</p>
      <p style="color:#86868B;font-size:11px;">物业服务监督系统 · 自动发送，请勿回复</p>
    </div>
  `;
  const err = await sendWithRetry(transporter, config.from, to, subject, html);
  if (err) {
    const msg = smtpErrorToMessage(err, config);
    console.error('[Mailer] sendVerificationCode failed:', msg, '| original:', err.message);
    throw new Error(msg);
  }
}

export async function sendRejectionNotice(to: string, reason: string, name?: string) {
  const { transporter, config } = await getTransporter();
  const subject = '物业服务监督系统 - 注册审核未通过';
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
      <h2 style="color:#FF3B30;font-size:20px;">审核未通过</h2>
      <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">${name ? name + '，您好' : '您好'}</p>
      <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">很抱歉，您的注册申请未通过审核。</p>
      <div style="background:#fef2f2;padding:16px;border-radius:12px;margin:16px 0;border-left:3px solid #FF3B30;">
        <p style="color:#991b1b;font-size:13px;margin:0;">原因：${reason}</p>
      </div>
      <p style="color:#1d1d1f;font-size:14px;line-height:1.6;">您可以登录系统重新提交注册申请。</p>
      <p style="color:#86868B;font-size:12px;">如有疑问请联系物业服务中心。</p>
      <hr style="border:none;border-top:1px solid #e5e5e7;margin:20px 0;">
      <p style="color:#86868B;font-size:11px;">物业服务监督系统 · 自动发送，请勿回复</p>
    </div>
  `;
  const err = await sendWithRetry(transporter, config.from, to, subject, html);
  if (err) {
    const msg = smtpErrorToMessage(err, config);
    console.error('[Mailer] sendRejectionNotice failed:', msg, '| original:', err.message);
    throw new Error(msg);
  }
}
