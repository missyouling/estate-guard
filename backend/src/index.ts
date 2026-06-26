import { buildApp } from './app';
import { env } from './env';
import { runMigrations } from './db/migrate';
import { getDb } from './db';
import { runSeed, seedTestData } from './db/seed';
import { syncEnvConfigs } from './db/seed';

import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import uploadRoutes from './routes/upload.routes';
import mediaRoutes from './routes/media.routes';
import categoryRoutes from './routes/category.routes';
import whitelistRoutes from './routes/whitelist.routes';
import approvalRoutes from './routes/approval.routes';
import configRoutes from './routes/config.routes';
import exportRoutes from './routes/export.routes';
import adminRoutes from './routes/admin.routes';
import shareRoutes from './routes/share.routes';
import notificationRoutes from './routes/notification.routes';
import dashboardRoutes from './routes/dashboard.routes';
import announcementRoutes from './routes/announcement.routes';
import geocodeRoutes from './routes/geocode.routes';
import { updateActivity } from './services/onlineStatus';
import { runPendingMigrations } from './services/pendingMigrations';

async function main() {
  console.log('[Init] Running database migrations...');
  runMigrations(env.DB_PATH);
  console.log('[Init] Migrations done');
  runPendingMigrations(env.DB_PATH);
  console.log('[Init] Pending migrations done');

  getDb(env.DB_PATH);
  console.log('[Init] Database connected');

  await runSeed(env.DB_PATH);
  syncEnvConfigs(env.DB_PATH);

  if (process.env.GENERATE_TEST_DATA === 'true') {
    await seedTestData(env.DB_PATH);
  }

  const app = await buildApp();

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(uploadRoutes);
  await app.register(mediaRoutes);
  await app.register(categoryRoutes);
  await app.register(whitelistRoutes);
  await app.register(approvalRoutes);
  await app.register(configRoutes);
  await app.register(exportRoutes);
  await app.register(adminRoutes);
  await app.register(shareRoutes);
  await app.register(notificationRoutes);
  await app.register(dashboardRoutes);
  await app.register(announcementRoutes);
  await app.register(geocodeRoutes);

  app.addHook('onRequest', async (req) => {
    try {
      await req.jwtVerify();
      updateActivity((req.user as any).sub);
    } catch {}
  });

  app.get('/api/online-status', async (req) => {
    try { await req.jwtVerify(); } catch { return { code: 1, message: '未登录' }; }
    const { getOnlineStatus } = await import('./services/onlineStatus');
    const userIds = ((req.query as any).userIds || '').split(',').map(Number).filter(Boolean);
    return { code: 0, data: getOnlineStatus(userIds) };
  });

  console.log('[Init] All routes registered');

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    console.log(`[Server] Running on http://0.0.0.0:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
