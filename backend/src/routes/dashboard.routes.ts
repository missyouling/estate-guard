import { beijingTime } from '../utils/time';
import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { users, media, approvals, categories as categoriesTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { success, fail } from '../utils/response';

export default async function dashboardRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/dashboard', async (req) => {
    const db = getDb();
    const allUsers = await db.select().from(users);
    const allMedia = await db.select().from(media).where(eq(media.status, 'active'));
    const allApprovals = await db.select().from(approvals);

    const today = beijingTime().split(' ')[0];
    const todayUploads = allMedia.filter(m => (m.uploaded_at || '').startsWith(today));

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    const yesterdayUploads = allMedia.filter(m => (m.uploaded_at || '').startsWith(yesterday));

    const days = Math.min(Math.max(parseInt(String((req.query as any).days || '7'), 10), 1), 30);

    const dailyMap: Record<string, number> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
      dailyMap[d] = 0;
    }
    for (const m of allMedia) {
      const d = (m.uploaded_at || '').split(' ')[0];
      if (d && dailyMap[d] !== undefined) dailyMap[d]++;
    }

    const daily = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    const typeDistribution = [
      { type: 'image', count: allMedia.filter(m => m.type === 'image').length },
      { type: 'video', count: allMedia.filter(m => m.type === 'video').length },
      { type: 'audio', count: allMedia.filter(m => m.type === 'audio').length },
      { type: 'document', count: allMedia.filter(m => m.type === 'document').length },
    ];

    const roomMap: Record<string, number> = {};
    for (const u of allUsers) {
      if (u.room_number) {
        const building = u.room_number.split('-')[0];
        if (building) roomMap[building] = 0;
      }
    }
    const userIdSet = new Set(allUsers.map(u => u.id));
    for (const m of allMedia) {
      if (!userIdSet.has(m.user_id)) continue;
      const u = allUsers.find(uu => uu.id === m.user_id);
      if (!u?.room_number) continue;
      const building = u.room_number.split('-')[0];
      if (building) roomMap[building] = (roomMap[building] || 0) + 1;
    }

    const roomDistribution = Object.entries(roomMap)
      .filter(([, c]) => c > 0)
      .map(([building, count]) => ({ building, count }))
      .sort((a, b) => b.count - a.count);

    const categoriesRows = await db.select().from(categoriesTable);
    const catMap = new Map(categoriesRows.map(c => [c.id, c.name]));
    const catDistribution: Record<string, number> = {};
    for (const m of allMedia) {
      const catName = catMap.get(m.category_id || 0) || '未分类';
      catDistribution[catName] = (catDistribution[catName] || 0) + 1;
    }
    const categoryDistribution = Object.entries(catDistribution)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const auditStatusDistribution = [
      { status: 'pending', label: '待审核', count: allApprovals.filter(a => a.status === 'pending').length },
      { status: 'approved', label: '已通过', count: allApprovals.filter(a => a.status === 'approved').length },
      { status: 'rejected', label: '已驳回', count: allApprovals.filter(a => a.status === 'rejected').length },
    ];

    const categoryTop5 = categoryDistribution.slice(0, 5);

    const currentMonth = today.slice(0, 7);
    const monthlyActiveUsers = new Set(allMedia.filter(m => (m.uploaded_at || '').startsWith(currentMonth)).map(m => m.user_id)).size;

    const prevMonth = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 7);
    const prevMonthActive = new Set(allMedia.filter(m => (m.uploaded_at || '').startsWith(prevMonth)).map(m => m.user_id)).size;

    const todayComparison = yesterdayUploads.length > 0
      ? Math.round(((todayUploads.length - yesterdayUploads.length) / yesterdayUploads.length) * 100)
      : todayUploads.length > 0 ? 100 : 0;

    const activeComparison = prevMonthActive > 0
      ? Math.round(((monthlyActiveUsers - prevMonthActive) / prevMonthActive) * 100)
      : monthlyActiveUsers > 0 ? 100 : 0;

    return success({
      totalUsers: allUsers.length,
      totalMedia: allMedia.length,
      todayUploads: todayUploads.length,
      pendingApprovals: allApprovals.filter(a => a.status === 'pending').length,
      daily,
      typeDistribution,
      roomDistribution,
      categoryDistribution,
      auditStatusDistribution,
      categoryTop5,
      monthlyActiveUsers,
      todayComparison,
      activeComparison,
    });
  });
}
