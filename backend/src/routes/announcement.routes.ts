import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { announcements, users } from '../db/schema';
import { eq, desc } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { beijingTime } from '../utils/time';
import { sendSystemAnnouncement } from '../services/notification';

export default async function announcementRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.post('/api/admin/announcement', async (req, reply) => {
    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const { title, content } = req.body as any;
    if (!title || !title.trim()) return fail('请输入公告标题');
    if (!content || !content.trim()) return fail('请输入公告内容');
    const db = getDb();
    const now = beijingTime();
    const result = await db.insert(announcements).values({
      title: title.trim(),
      content: content.trim(),
      created_by: currentUser.sub,
      created_at: now,
    }).returning();
    await sendSystemAnnouncement(title.trim(), content.trim());
    return success(result[0], '公告已发送');
  });

  app.get('/api/admin/announcements', async (req, reply) => {
    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const db = getDb();
    const rows = await db.select({
      id: announcements.id,
      title: announcements.title,
      content: announcements.content,
      created_at: announcements.created_at,
    }).from(announcements).orderBy(desc(announcements.created_at));
    return success(rows);
  });

  app.delete('/api/admin/announcements/:id', async (req, reply) => {
    const currentUser = req.user as any;
    if (currentUser.role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const id = parseInt((req.params as any).id);
    const db = getDb();
    await db.delete(announcements).where(eq(announcements.id, id));
    return success(null, '已删除');
  });
}
