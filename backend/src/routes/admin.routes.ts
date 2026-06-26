import { beijingTime } from '../utils/time';
import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { users, media, approvals, configs } from '../db/schema';
import { eq, and, sql as drizzleSql } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { decrypt, maskIdCard, maskPhone } from '../services/crypto';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import { sendNotificationToUser } from '../services/notification';
import { getEmailTemplateDefaults, getSmsTemplateDefaults } from '../services/templateRenderer';

export default async function adminRoutes(app: FastifyInstance) {

  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
  });

  app.get('/api/admin/users', async (req) => {
    const query = req.query as any;
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 200);
    const offset = (page - 1) * limit;
    const db = getDb();
    const all = await db.select().from(users);
    const total = all.length;
    const items = all.slice(offset, offset + limit).map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      name: u.name,
      id_card: maskIdCard(decrypt(u.id_card || '')),
      phone: maskPhone(decrypt(u.phone || '')),
      email: u.email,
      room_number: u.room_number,
      status: u.status,
      register_method: u.register_method,
      created_at: u.created_at,
    }));
    return success({ items, total, page, limit });
  });

  app.patch('/api/admin/users/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const body = req.body as any;
    const db = getDb();
    const updateData: any = {};

    if (body.status) updateData.status = body.status;
    if (body.password) {
      updateData.password_hash = await bcrypt.hash(body.password, 12);
    }
    if (body.role) updateData.role = body.role;

    if (Object.keys(updateData).length === 0) return fail('无修改内容');
    updateData.updated_at = beijingTime();
    await db.update(users).set(updateData).where(eq(users.id, id));
    if (body.status) {
      const statusLabel: Record<string, string> = { active: '已启用', disabled: '已停用', pending: '待审核' };
      await sendNotificationToUser(id, '账号状态变更',
        `您的账号状态已变更为「${statusLabel[body.status] || body.status}」。如有疑问请联系管理员。`,
        'security', '');
    }
    if (body.password) {
      await sendNotificationToUser(id, '密码已重置',
        '管理员已重置您的登录密码，请使用新密码登录并及时修改。',
        'security', '');
    }
    return success(null, '已更新');
  });

  app.get('/api/admin/media', async (req) => {
    const query = req.query as any;
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const offset = (page - 1) * limit;
    const db = getDb();

    let conditions = [eq(media.status, 'active')];
    if (query.user_id) conditions.push(eq(media.user_id, parseInt(query.user_id)));
    if (query.type) conditions.push(eq(media.type, query.type));

    const totalResult = await db.select({ count: drizzleSql<number>`count(*)` }).from(media).where(and(...conditions));
    const total = Number(totalResult[0]?.count || 0);
    const items = await db.select().from(media).where(and(...conditions)).orderBy(media.uploaded_at).limit(limit).offset(offset);
    return success({ items, total, page, limit });
  });

  app.post('/api/admin/reset', async () => {
    const db = getDb();
    const sqlite = (db as any).session?.client as Database.Database;

    if (!sqlite) return fail('数据库连接失败');

    const adminUser = sqlite.prepare(
      'SELECT id, username, role, name, id_card, phone, password_hash, status, register_method, created_at FROM users WHERE username = ?'
    ).get('admin') as any;

    sqlite.prepare('DELETE FROM shares').run();
    sqlite.prepare('DELETE FROM audit_logs').run();
    sqlite.prepare('DELETE FROM media').run();
    sqlite.prepare('DELETE FROM approvals').run();
    sqlite.prepare('DELETE FROM whitelist').run();
    sqlite.prepare('DELETE FROM users').run();
    sqlite.prepare('DELETE FROM configs').run();

    if (adminUser) {
      sqlite.prepare(
        'INSERT INTO users (id, username, role, name, id_card, phone, password_hash, status, register_method, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
      ).run(adminUser.id, adminUser.username, adminUser.role, adminUser.name,
            adminUser.id_card, adminUser.phone, adminUser.password_hash,
            adminUser.status, adminUser.register_method, adminUser.created_at);
    }

    const defaultConfigs: Record<string, string> = {
      upload_max_image_size_mb: '20', upload_max_video_size_mb: '200',
      upload_max_audio_size_mb: '50', upload_max_count_per_batch: '9',
      image_compress_max_width: '1920', image_compress_quality: '80',
      video_transcode_max_width: '1920', video_transcode_bitrate: '2000k',
      watermark_template: 'NO.{record_no}\n{room} {user}\n{datetime}\n{location}\n{remark}',
      watermark_position: 'southwest', watermark_font_size: '0',
      watermark_opacity: '0.8', watermark_auto_apply: 'true',
      watermark_date_format: 'YYYY-MM-DD HH:mm:ss',
      watermark_record_prefix: 'NO.', watermark_record_digits: '0', watermark_record_suffix: '',
      smtp_host: 'smtp.qq.com', smtp_port: '465',
      smtp_user: '', smtp_pass: '', mail_from: '',
      verify_code_expire_minutes: '30', storage_backend: 'local',
      s3_endpoint: '', s3_bucket: '', s3_access_key: '', s3_secret_key: '',       s3_region: 'auto',
      node_image_api_url: 'https://api.nodeimage.com',
      node_image_api_key: '',
      allowed_image_types: '["jpg","jpeg","png","gif","webp","bmp"]',
      allowed_video_types: '["mp4","mov","avi","mkv","webm"]',
      allowed_audio_types: '["mp3","wav","m4a","ogg","aac"]',
      allowed_document_types: '["jpg","jpeg","png","pdf"]',
      geocode_provider: 'amap', geocode_api_key: '',
      sms_provider: '', sms_access_key: '', sms_secret_key: '',
      sms_sign_name: '', sms_template_code: '',
      site_url: 'http://localhost:11111',
      ...getEmailTemplateDefaults(),
      ...getSmsTemplateDefaults(),
    };
    const upsert = sqlite.prepare('INSERT OR IGNORE INTO configs (key, value) VALUES (?, ?)');
    for (const [k, v] of Object.entries(defaultConfigs)) upsert.run(k, v);

    return success(null, '系统已初始化，仅保留管理员账户和默认配置');
  });
}
