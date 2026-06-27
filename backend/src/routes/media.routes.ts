import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { media, categories, configs } from '../db/schema';
import { eq, desc, and, sql as drizzleSql, inArray } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { getStorage } from '../services/storage';

export default async function mediaRoutes(app: FastifyInstance) {

  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/media', async (req) => {
    const query = req.query as any;
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const offset = (page - 1) * limit;
    const db = getDb();
    const userId = (req.user as any).sub;
    const role = (req.user as any).role;

    let conditions = [eq(media.status, 'active')];
    if (role !== 'admin') conditions.push(eq(media.user_id, userId));
    if (query.type) conditions.push(eq(media.type, query.type));
    if (query.category_id) conditions.push(eq(media.category_id, parseInt(query.category_id)));

    const totalResult = await db.select({ count: drizzleSql<number>`count(*)` }).from(media).where(and(...conditions));
    const total = Number(totalResult[0]?.count || 0);

    const items = await db.select().from(media).where(and(...conditions)).orderBy(desc(media.uploaded_at)).limit(limit).offset(offset);

    const catRows = await db.select().from(categories);
    const catMap = new Map(catRows.map(c => [c.id, c.name]));

    return success({
      items: items.map(item => ({ ...item, category_name: catMap.get(item.category_id || 0) || '' })),
      total, page, limit,
    });
  });

  app.get('/api/media/wall', async (req) => {
    const query = req.query as any;
    const view = query.view || 'grid';
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 200);
    const offset = (page - 1) * limit;
    const db = getDb();
    const userId = (req.user as any).sub;
    const role = (req.user as any).role;

    let conditions = [eq(media.status, 'active')];
    if (query.category_id) conditions.push(eq(media.category_id, parseInt(query.category_id)));
    const allowedTypes = ['image', 'video', 'audio'];
    if (query.type) {
      const types = String(query.type).split(',').map(t => t.trim()).filter(Boolean)
        .filter(t => allowedTypes.includes(t));
      if (types.length > 0) conditions.push(inArray(media.type, types));
    } else {
      conditions.push(inArray(media.type, allowedTypes));
    }
    if (query.date_from) conditions.push(drizzleSql`${media.uploaded_at} >= ${query.date_from}`);
    if (query.date_to) conditions.push(drizzleSql`${media.uploaded_at} <= ${query.date_to}`);

    const allItems = await db.select().from(media).where(and(...conditions)).orderBy(desc(media.uploaded_at));

    const catRows = await db.select().from(categories);
    const catMap = new Map(catRows.map(c => [c.id, c.name]));

    const enriched = allItems.map(item => ({ ...item, category_name: catMap.get(item.category_id || 0) || '' }));

    if (view === 'timeline') {
      const groups: Record<string, any[]> = {};
      for (const item of enriched) {
        const date = (item.uploaded_at || '').split(' ')[0];
        if (!groups[date]) groups[date] = [];
        groups[date].push(item);
      }
      const timeline = Object.entries(groups)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, items]) => ({ date, items }));
      return success({ timeline, total: allItems.length });
    }

    const paged = enriched.slice(offset, offset + limit);
    return success({ items: paged, total: allItems.length, page, limit });
  });

  app.get('/api/media/:id', async (req) => {
    const db = getDb();
    const item = await db.select().from(media).where(eq(media.id, parseInt((req.params as any).id))).limit(1);
    if (!item[0]) return fail('记录不存在');
    return success(item[0]);
  });

  app.delete('/api/media/:id', async (req) => {
    const db = getDb();
    const id = parseInt((req.params as any).id);
    const userId = (req.user as any).sub;
    const role = (req.user as any).role;

    const item = await db.select().from(media).where(eq(media.id, id)).limit(1);
    if (!item[0]) return fail('记录不存在');
    if (role !== 'admin' && item[0].user_id !== userId) return fail('无权限');

    await db.update(media).set({ status: 'deleted' }).where(eq(media.id, id));
    return success(null, '已删除');
  });

  app.patch('/api/media/:id', async (req) => {
    const db = getDb();
    const id = parseInt((req.params as any).id);
    const userId = (req.user as any).sub;
    const role = (req.user as any).role;
    const body = req.body as any;

    const item = await db.select().from(media).where(eq(media.id, id)).limit(1);
    if (!item[0]) return fail('记录不存在');
    if (role !== 'admin' && item[0].user_id !== userId) return fail('无权限');

    const updateData: any = {};
    if (body.category_id !== undefined) updateData.category_id = body.category_id;
    if (body.remark !== undefined) updateData.remark = body.remark;
    if (body.status !== undefined && role === 'admin') updateData.status = body.status;

    if (Object.keys(updateData).length === 0) return fail('无修改内容');
    await db.update(media).set(updateData).where(eq(media.id, id));
    return success(null, '已更新');
  });
}
