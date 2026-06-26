import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { notifications, notificationSendLogs } from '../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { checkChannelConfig, getSendLogs, getUserNotificationPrefs } from '../services/notification';
import type { ApiResponse } from '../utils/response';

export async function createNotification(userId: number, title: string, content: string, type: string = 'info', link?: string) {
  try {
    const db = getDb();
    await db.insert(notifications).values({ user_id: userId, title, content, type, link: link || null });
  } catch {}
}

export async function createContactNotification(title: string, content: string) {
  await createNotification(1, title, content, 'contact');
}

export default async function notificationRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/notifications', async (req) => {
    const userId = (req.user as any).sub;
    const { type, limit: limitStr, offset: offsetStr } = req.query as any;
    const db = getDb();
    const conditions = [eq(notifications.user_id, userId), sql`type != 'contact'`];
    if (type && type !== 'all') {
      conditions.push(eq(notifications.type, type));
    }
    const rows = await db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.created_at))
      .limit(parseInt(limitStr) || 50).offset(parseInt(offsetStr) || 0);
    return success(rows);
  });

  app.get('/api/notifications/types', async (req) => {
    const userId = (req.user as any).sub;
    const db = getDb();
    const sqlite = (db as any).session?.client;
    if (!sqlite) return success({ system: 0, approval: 0, share: 0, security: 0, total_unread: 0 });
    const rows = sqlite.prepare(`
      SELECT type, COUNT(*) as total, SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) as unread
      FROM notifications WHERE user_id = ? AND type != 'contact'
      GROUP BY type
    `).all(userId) as any[];
    const result: Record<string, number> = { system: 0, approval: 0, share: 0, security: 0, total_unread: 0 };
    let totalUnread = 0;
    for (const r of rows) {
      result[r.type] = (r.unread || 0);
      totalUnread += (r.unread || 0);
    }
    result.total_unread = totalUnread;
    return success(result);
  });

  app.get('/api/notifications/unread-count', async (req) => {
    const userId = (req.user as any).sub;
    const db = getDb();
    const result = await db.select({ count: sql<number>`count(*)` }).from(notifications)
      .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, 0), sql`type != 'contact'`));
    return success({ count: Number(result[0]?.count || 0) });
  });

  app.patch('/api/notifications/:id/read', async (req) => {
    const id = parseInt((req.params as any).id);
    const db = getDb();
    await db.update(notifications).set({ is_read: 1 }).where(eq(notifications.id, id));
    return success(null, 'ok');
  });

  app.post('/api/notifications/mark-all-read', async (req) => {
    const userId = (req.user as any).sub;
    const db = getDb();
    await db.update(notifications).set({ is_read: 1 })
      .where(and(eq(notifications.user_id, userId), eq(notifications.is_read, 0), sql`type != 'contact'`));
    return success(null, 'ok');
  });

  app.post('/api/feedback', async (req) => {
    const userId = (req.user as any).sub;
    const { content } = req.body as any;
    if (!content || !content.trim()) return fail('请输入反馈内容');
    const { users } = await import('../db/schema');
    const db = getDb();
    const userArr = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const userName = userArr[0]?.name || userArr[0]?.username || '未知用户';
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await createNotification(1, `系统反馈: ${userName}`, `[uid=${userId}]${content.trim()}`, 'feedback');
    await db.insert(notifications).values({
      user_id: userId, title: '系统反馈', content: content.trim(), type: 'feedback',
      created_at: now, is_read: 1,
    });
    return success(null, '反馈已提交');
  });

  app.post('/api/notifications/:id/reply', async (req) => {
    const userId = (req.user as any).sub;
    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') return fail('仅管理员可回复');
    const notifId = parseInt((req.params as any).id);
    const { content } = req.body as any;
    if (!content || !content.trim()) return fail('请输入回复内容');
    const db = getDb();
    const rows = await db.select().from(notifications).where(eq(notifications.id, notifId)).limit(1);
    if (!rows[0]) return fail('通知不存在');
    const originalContent = rows[0].content || '';
    const uidMatch = originalContent.match(/\[uid=(\d+)\]/);
    if (!uidMatch) return fail('无法找到原始反馈用户');
    const targetUserId = parseInt(uidMatch[1]);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const replyContent = content.trim();
    await db.insert(notifications).values({
      user_id: targetUserId, title: '管理员回复', content: replyContent, type: 'feedback',
      created_at: now,
    });
    const updatedContent = originalContent + `\n\n【管理员回复 ${now.slice(0, 16)}】\n${replyContent}`;
    await db.update(notifications).set({ content: updatedContent, is_read: 1 }).where(eq(notifications.id, notifId));
    await db.update(notifications).set({ is_read: 1 }).where(
      and(eq(notifications.user_id, targetUserId), eq(notifications.type, 'feedback'), eq(notifications.title, '系统反馈'))
    );
    return success(null, '回复已发送');
  });

  app.delete('/api/notifications/:id', async (req) => {
    const userId = (req.user as any).sub;
    const notifId = parseInt((req.params as any).id);
    const db = getDb();
    const rows = await db.select().from(notifications).where(eq(notifications.id, notifId)).limit(1);
    if (!rows[0]) return fail('通知不存在');
    if (rows[0].user_id !== userId && (req.user as any).role !== 'admin') return fail('无权删除');
    await db.delete(notifications).where(eq(notifications.id, notifId));
    return success(null, '已删除');
  });

  app.post('/api/notifications/clear-read', async (req) => {
    const userId = (req.user as any).sub;
    const db = getDb();
    await db.delete(notifications).where(
      and(eq(notifications.user_id, userId), eq(notifications.is_read, 1), sql`type != 'contact'`)
    );
    return success(null, '已清空');
  });

  app.delete('/api/notifications/group/:uid', async (req) => {
    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') return fail('仅管理员可删除');
    const targetUid = parseInt((req.params as any).uid);
    if (!targetUid) return fail('无效用户ID');
    const db = getDb();
    const adminId = 1;
    await db.delete(notifications).where(
      and(eq(notifications.user_id, adminId), sql`type = 'feedback'`, sql`content LIKE ${`[uid=${targetUid}]%`}`)
    );
    await db.delete(notifications).where(
      and(eq(notifications.user_id, targetUid), eq(notifications.type, 'feedback'))
    );
    return success(null, '会话已删除');
  });

  app.get('/api/admin/notifications/send-logs', async (req) => {
    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') return fail('仅管理员可查看');
    const { limit: limitStr, offset: offsetStr } = req.query as any;
    const logs = await getSendLogs(parseInt(limitStr) || 100, parseInt(offsetStr) || 0);
    return success(logs);
  });

  app.get('/api/admin/notifications/config-status', async (req) => {
    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') return fail('仅管理员可查看');
    const emailOk = await checkChannelConfig('email');
    const smsOk = await checkChannelConfig('sms');
    return success({
      email: { configured: emailOk, label: '邮件服务' },
      sms: { configured: smsOk, label: '短信服务' },
      all_configured: emailOk || smsOk,
    });
  });

  app.get('/api/user/notification-prefs', async (req) => {
    const userId = (req.user as any).sub;
    const prefs = await getUserNotificationPrefs(userId);
    return success(prefs);
  });

  app.patch('/api/user/notification-prefs', async (req) => {
    const userId = (req.user as any).sub;
    const { email_enabled, sms_enabled } = req.body as any;
    const db = getDb();
    const existing = await db.select().from((await import('../db/schema')).userNotificationPrefs)
      .where(eq((await import('../db/schema')).userNotificationPrefs.user_id, userId)).limit(1);
    if (existing.length > 0) {
      await db.update((await import('../db/schema')).userNotificationPrefs)
        .set({
          email_enabled: email_enabled ? 1 : 0,
          sms_enabled: sms_enabled ? 1 : 0,
          updated_at: new Date().toISOString().replace('T', ' ').slice(0, 19),
        })
        .where(eq((await import('../db/schema')).userNotificationPrefs.user_id, userId));
    } else {
      await db.insert((await import('../db/schema')).userNotificationPrefs).values({
        user_id: userId,
        email_enabled: email_enabled ? 1 : 0,
        sms_enabled: sms_enabled ? 1 : 0,
      });
    }
    return success(null, '已更新');
  });
}
