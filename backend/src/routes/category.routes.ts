import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { categories } from '../db/schema';
import { eq } from 'drizzle-orm';
import { success, fail } from '../utils/response';

export default async function categoryRoutes(app: FastifyInstance) {

  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/category', async () => {
    const db = getDb();
    const rows = await db.select().from(categories).orderBy(categories.sort_order);
    return success(rows);
  });

  app.post('/api/admin/category', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const { name, code, icon, parent_id, sort_order, description } = req.body as any;
    if (!name) return fail('名称必填');
    const db = getDb();
    await db.insert(categories).values({
      name, code: code || null, icon: icon || null, parent_id: parent_id || null,
      sort_order: sort_order || 0, description: description || null,
    });
    return success(null, '已添加');
  });

  app.put('/api/admin/category/:id', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const id = parseInt((req.params as any).id);
    const { name, code, icon, parent_id, sort_order, description } = req.body as any;
    const db = getDb();
    await db.update(categories).set({
      name, code: code || null, icon: icon || null, parent_id: parent_id || null,
      sort_order, description: description || null,
    }).where(eq(categories.id, id));
    return success(null, '已更新');
  });

  app.delete('/api/admin/category/:id', async (req, reply) => {
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
    const id = parseInt((req.params as any).id);
    const db = getDb();
    await db.delete(categories).where(eq(categories.id, id));
    return success(null, '已删除');
  });
}
