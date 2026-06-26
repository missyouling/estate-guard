import { beijingTime } from '../utils/time';
import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { configs } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { sendTestEmail } from '../services/mailer';
import { notifyConfigChanged } from '../services/notification';
import {
  getEmailScenarios, getSmsScenarios, getEmailDefault, getSmsDefault,
  getEmailConfigKey, getSmsConfigKey, getAvailableVars,
  EmailScenario, SmsScenario,
  loadEmailTemplate, loadSmsTemplate,
  renderEmailTemplate, renderSmsTemplate,
} from '../services/templateRenderer';
import { sendRawSms } from '../services/notification';

export default async function configRoutes(app: FastifyInstance) {

  app.get('/api/config/public', async (req, reply) => {
    const db = getDb();
    const rows = await db.select().from(configs).where(
      inArray(configs.key, ['community_name', 'site_name'])
    );
    const data: Record<string, string> = {};
    for (const row of rows) data[row.key] = row.value;
    return success(data);
  });

  app.addHook('onRequest', async (req, reply) => {
    if ((req as any).url?.startsWith('/api/config/public')) return;
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/admin/config', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const db = getDb();
    const rows = await db.select().from(configs);
    return success(rows.map(r => ({ key: r.key, value: r.value })));
  });

  app.put('/api/admin/config', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const body = req.body as any;
    const data = body.configs as Record<string, string>;
    if (!data || typeof data !== 'object') return fail('无效数据');

    const db = getDb();
    const userId = (req.user as any).sub;
    const now = beijingTime();

    for (const [key, value] of Object.entries(data)) {
      const existing = await db.select().from(configs).where(eq(configs.key, key));
      if (existing.length > 0) {
        await db.update(configs).set({ value: String(value), updated_by: userId, updated_at: now }).where(eq(configs.key, key));
      } else {
        await db.insert(configs).values({ key, value: String(value), updated_by: userId, updated_at: now });
      }
    }

    notifyConfigChanged();

    return success(null, '配置已保存');
  });

  app.post('/api/admin/test-email', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const { to } = req.body as any;
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return reply.send(fail('收件邮箱地址格式无效'));

    console.log('[Config] Test email requested to:', to);
    const err = await sendTestEmail(to);
    if (err) {
      console.error('[Config] Test email FAILED:', err);
      return reply.send(fail(err));
    }
    console.log('[Config] Test email sent successfully to:', to);
    return reply.send(success(null, '测试邮件已发送'));
  });

  app.post('/api/admin/test-sms', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const { phone, templateKey, scenario } = req.body as any;
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) return reply.send(fail('手机号格式无效'));

    let message = '这是一条测试短信，来自物业服务监督系统。';
    if (templateKey && scenario) {
      const text = await loadSmsTemplate(scenario as SmsScenario);
      message = renderSmsTemplate(text, { 验证码: '123456', 有效期: '5', 激活链接: '', 驳回原因: '' });
    }

    console.log('[Config] Test SMS requested to:', phone);
    const err = await sendRawSms(phone, message);
    if (err) {
      console.error('[Config] Test SMS FAILED:', err);
      return reply.send(fail(err));
    }
    console.log('[Config] Test SMS sent successfully to:', phone);
    return reply.send(success(null, '测试短信已发送'));
  });

  app.get('/api/admin/notification-templates/email', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const db = getDb();
    const scenarios = getEmailScenarios();
    const keys = scenarios.map(s => s.key);
    const rows = await db.select().from(configs).where(inArray(configs.key, keys));
    const valueMap: Record<string, string> = {};
    for (const r of rows) valueMap[r.key] = r.value;

    const result = scenarios.map(s => {
      const dbValue = valueMap[s.key];
      let subject: string;
      let body: string;
      if (dbValue) {
        try {
          const parsed = JSON.parse(dbValue);
          subject = parsed.subject || getEmailDefault(s.scenario).subject;
          body = parsed.body || getEmailDefault(s.scenario).body;
        } catch {
          const def = getEmailDefault(s.scenario);
          subject = def.subject;
          body = def.body;
        }
      } else {
        const def = getEmailDefault(s.scenario);
        subject = def.subject;
        body = def.body;
      }
      return {
        key: s.key,
        scenario: s.scenario,
        label: s.label,
        subject,
        body,
        isDefault: !dbValue,
        availableVars: getAvailableVars('email'),
      };
    });
    return success(result);
  });

  app.get('/api/admin/notification-templates/sms', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const db = getDb();
    const scenarios = getSmsScenarios();
    const keys = scenarios.map(s => s.key);
    const rows = await db.select().from(configs).where(inArray(configs.key, keys));
    const valueMap: Record<string, string> = {};
    for (const r of rows) valueMap[r.key] = r.value;

    const result = scenarios.map(s => {
      const dbValue = valueMap[s.key];
      const content = dbValue || getSmsDefault(s.scenario);
      return {
        key: s.key,
        scenario: s.scenario,
        label: s.label,
        content,
        isDefault: !dbValue,
        availableVars: getAvailableVars('sms'),
        maxLength: 70,
      };
    });
    return success(result);
  });

  app.put('/api/admin/notification-templates/:key', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const key = (req.params as any).key;
    const body = req.body as any;
    const db = getDb();
    const userId = (req.user as any).sub;
    const now = beijingTime();

    const value = key.startsWith('email_') ? JSON.stringify({ subject: body.subject, body: body.body }) : String(body.content || '');

    const existing = await db.select().from(configs).where(eq(configs.key, key)).limit(1);
    if (existing.length > 0) {
      await db.update(configs).set({ value, updated_by: userId, updated_at: now }).where(eq(configs.key, key));
    } else {
      await db.insert(configs).values({ key, value, updated_by: userId, updated_at: now });
    }
    return success(null, '模板已保存');
  });

  app.post('/api/admin/notification-templates/:key/reset', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const key = (req.params as any).key;
    const db = getDb();
    await db.delete(configs).where(eq(configs.key, key));
    return success(null, '模板已恢复默认');
  });
}
