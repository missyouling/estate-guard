import { FastifyInstance } from 'fastify';
import { randomBytes, createHash } from 'crypto';
import { getDb } from '../db';
import { media as mediaTable, shares, users, shareAccessLogs } from '../db/schema';
import { eq, inArray, desc, and, sql } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { beijingTime } from '../utils/time';
import { sendNotificationToUser, sendNotificationToUnregistered } from '../services/notification';

const PASSWORD_ATTEMPT_LIMIT = 5;
const PASSWORD_LOCK_MINUTES = 30;

export default async function shareRoutes(app: FastifyInstance) {

  app.post('/api/media/share', async (req, reply) => {
    try {
      await req.jwtVerify();
      const userId = (req.user as any).sub;
      const { media_ids, password, expire_days, expire_at, allow_download, max_access_count, force_watermark, remark } = req.body as any;
      if (!media_ids || !Array.isArray(media_ids) || media_ids.length === 0) return reply.send(fail('请选择文件'));
      const db = getDb();
      const token = randomBytes(24).toString('hex');
      const hashedPassword = password ? createHash('sha256').update(password).digest('hex') : null;
      let expiresAt: string;
      if (expire_at) {
        expiresAt = expire_at;
      } else if (expire_days && expire_days > 0) {
        const expireDate = new Date(Date.now() + expire_days * 86400000);
        expiresAt = expireDate.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
      } else {
        const expireDate = new Date('2099-12-31T23:59:59');
        expiresAt = expireDate.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
      }
      const ip = req.ip || '';
      const sqlite = (db as any).session?.client;
      if (sqlite) {
        sqlite.prepare(`INSERT INTO shares (token, user_id, media_ids, password, password_hash, expires_at, ip_address, download_count, last_access_at, status, allow_download, max_access_count, force_watermark, remark, password_attempts, locked_until)
          VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL, 'active', ?, ?, ?, ?, 0, NULL)`).run(
          token, userId, JSON.stringify(media_ids), password || null, hashedPassword, expiresAt, ip,
          allow_download ? 1 : 0, max_access_count || null, force_watermark !== false ? 1 : 0, remark || null
        );
      }
      await sendNotificationToUser(userId, '分享创建成功',
        `新分享已创建${password ? '，密码: ' + password : '，无需密码'}，有效期至 ${expiresAt.slice(0, 16)}。`,
        'share', '/shares');
      return reply.send(success({ token }));
    } catch (err: any) {
      return reply.status(500).send(fail('创建分享失败: ' + err.message));
    }
  });

  app.get('/api/share/:token', async (req, reply) => {
    try {
      const { token } = req.params as any;
      const { password } = req.query as any;
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.send(fail('数据库连接失败'));
      const share = sqlite.prepare('SELECT * FROM shares WHERE token = ?').get(token) as any;
      if (!share) return reply.send(fail('分享链接无效或已过期'));
      if (share.status === 'disabled') return reply.send(fail('分享链接已失效'));
      if (new Date(share.expires_at) < new Date()) return reply.send(fail('分享链接已过期'));
      if (share.locked_until && new Date(share.locked_until) > new Date()) {
        return reply.status(429).send(fail('密码错误次数过多，链接已被临时锁定，请稍后再试'));
      }
      if (share.max_access_count && (share.visit_count || 0) >= share.max_access_count) {
        return reply.send(fail('分享链接访问次数已达上限'));
      }
      if (share.password_hash) {
        if (!password) return reply.status(401).send(fail('需要密码'));
        const hashed = createHash('sha256').update(String(password)).digest('hex');
        if (hashed !== share.password_hash) {
          const attempts = (share.password_attempts || 0) + 1;
          if (attempts >= PASSWORD_ATTEMPT_LIMIT) {
            const lockUntil = new Date(Date.now() + PASSWORD_LOCK_MINUTES * 60000);
            const lockStr = lockUntil.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
            sqlite.prepare('UPDATE shares SET password_attempts = ?, locked_until = ? WHERE token = ?').run(attempts, lockStr, token);
            return reply.status(429).send(fail(`密码错误次数过多，链接已被锁定 ${PASSWORD_LOCK_MINUTES} 分钟`));
          }
          sqlite.prepare('UPDATE shares SET password_attempts = ? WHERE token = ?').run(attempts, token);
          return reply.status(401).send(fail('密码错误'));
        }
        sqlite.prepare('UPDATE shares SET password_attempts = 0, locked_until = NULL WHERE token = ?').run(token);
      }
      const mediaIds = JSON.parse(share.media_ids);
      const rows = await db.select().from(mediaTable).where(inArray(mediaTable.id, mediaIds));
      const now = beijingTime();
      sqlite.prepare('UPDATE shares SET visit_count = visit_count + 1, last_access_at = ? WHERE token = ?').run(now, token);
      sqlite.prepare('INSERT INTO share_access_logs (share_id, ip, action) VALUES (?, ?, ?)').run(share.id, req.ip || '', 'view');
      return reply.send(success({
        files: rows,
        allow_download: !!share.allow_download,
        force_watermark: !!share.force_watermark,
      }));
    } catch (err: any) {
      return reply.status(500).send(fail('获取分享失败: ' + err.message));
    }
  });

  app.get('/api/share/:token/download', async (req, reply) => {
    try {
      const { token } = req.params as any;
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.send(fail('数据库连接失败'));
      const share = sqlite.prepare('SELECT * FROM shares WHERE token = ?').get(token) as any;
      if (!share) return reply.send(fail('分享链接无效'));
      if (share.status === 'disabled') return reply.send(fail('分享链接已失效'));
      if (new Date(share.expires_at) < new Date()) return reply.send(fail('分享链接已过期'));
      if (!share.allow_download) return reply.send(fail('此分享未允许下载'));
      if (share.locked_until && new Date(share.locked_until) > new Date()) {
        return reply.status(429).send(fail('链接已被临时锁定'));
      }
      if (share.max_access_count && (share.download_count || 0) >= share.max_access_count) {
        return reply.send(fail('下载次数已达上限'));
      }
      const mediaIds = JSON.parse(share.media_ids);
      const rows = await db.select().from(mediaTable).where(inArray(mediaTable.id, mediaIds));
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const tmpDir = path.join(uploadDir, 'temp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, `share_dl_${Date.now()}.zip`);
      const filePaths = rows.map(m => path.join(uploadDir, (m.url || '').replace(/^\/files\//, ''))).filter(p => fs.existsSync(p));
      if (filePaths.length === 0) return reply.send(fail('文件不存在'));
      const now = beijingTime();
      sqlite.prepare('UPDATE shares SET download_count = download_count + 1, last_access_at = ? WHERE token = ?').run(now, token);
      sqlite.prepare('INSERT INTO share_access_logs (share_id, ip, action) VALUES (?, ?, ?)').run(share.id, req.ip || '', 'download');
      if (filePaths.length === 1) {
        reply.header('Content-Disposition', `attachment; filename="${path.basename(filePaths[0])}"`);
        return reply.send(fs.createReadStream(filePaths[0]));
      }
      execSync(`cd "${uploadDir}" && zip -j "${zipPath}" ${filePaths.map(p => `"${path.relative(uploadDir, p)}"`).join(' ')} 2>/dev/null`, { timeout: 30000 });
      const stream = fs.createReadStream(zipPath);
      stream.on('end', () => { try { fs.unlinkSync(zipPath); } catch {} });
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', 'attachment; filename="分享文件.zip"');
      return reply.send(stream);
    } catch (err: any) {
      return reply.status(500).send(fail('下载失败: ' + err.message));
    }
  });

  app.get('/api/admin/shares', async (req, reply) => {
    try {
      await req.jwtVerify();
      const userId = (req.user as any).sub;
      const isAdmin = (req.user as any).role === 'admin';
      const db = getDb();
      let query = db.select().from(shares).orderBy(desc(shares.created_at));
      let allShares = await query;
      if (!isAdmin) allShares = allShares.filter(s => s.user_id === userId);
      const allUsers = await db.select().from(users);
      const userMap = new Map(allUsers.map(u => [u.id, u.name]));
      const result = allShares.map(s => {
        const expired = new Date(s.expires_at) < new Date();
        let status = s.status;
        if (status === 'active' && expired) status = 'expired';
        return {
          id: s.id,
          token: s.token,
          user_name: userMap.get(s.user_id || 0) || '未知',
          media_count: JSON.parse(s.media_ids).length,
          password: s.password || '',
          password_hash: s.password_hash,
          visit_count: s.visit_count || 0,
          download_count: s.download_count || 0,
          allow_download: !!s.allow_download,
          max_access_count: s.max_access_count,
          force_watermark: !!s.force_watermark,
          remark: s.remark || '',
          last_access_at: s.last_access_at,
          status,
          ip_address: s.ip_address || '',
          expires_at: s.expires_at,
          created_at: s.created_at,
        };
      });
      return success(result);
    } catch (err: any) {
      return reply.status(500).send(fail('查询失败: ' + err.message));
    }
  });

  app.get('/api/admin/shares/:id/files', async (req, reply) => {
    try {
      await req.jwtVerify();
      const id = parseInt((req.params as any).id);
      const db = getDb();
      const share = (await db.select().from(shares).where(eq(shares.id, id)))[0];
      if (!share) return reply.send(fail('分享不存在'));
      const mediaIds = JSON.parse(share.media_ids);
      const rows = await db.select().from(mediaTable).where(inArray(mediaTable.id, mediaIds));
      return success(rows.map(m => ({
        id: m.id, record_no: m.record_no, original_name: m.original_name,
        type: m.type, url: m.url, thumbnail_url: m.thumbnail_url,
        category_name: null, uploaded_at: m.uploaded_at,
      })));
    } catch (err: any) {
      return reply.status(500).send(fail('查询失败: ' + err.message));
    }
  });

  app.get('/api/admin/shares/:id/logs', async (req, reply) => {
    try {
      await req.jwtVerify();
      const id = parseInt((req.params as any).id);
      const db = getDb();
      const rows = await db.select().from(shareAccessLogs)
        .where(eq(shareAccessLogs.share_id, id))
        .orderBy(desc(shareAccessLogs.created_at));
      return success(rows);
    } catch (err: any) {
      return reply.status(500).send(fail('查询失败: ' + err.message));
    }
  });

  app.patch('/api/admin/shares/:id/status', async (req, reply) => {
    try {
      await req.jwtVerify();
      if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
      const id = parseInt((req.params as any).id);
      const { status } = req.body as any;
      if (!['active', 'disabled'].includes(status)) return reply.send(fail('无效状态'));
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.status(500).send(fail('DB error'));
      sqlite.prepare('UPDATE shares SET status = ? WHERE id = ?').run(status, id);
      return success(null, status === 'active' ? '已恢复' : '已失效');
    } catch (err: any) {
      return reply.status(500).send(fail('操作失败: ' + err.message));
    }
  });

  app.patch('/api/admin/shares/:id/renew', async (req, reply) => {
    try {
      await req.jwtVerify();
      if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
      const id = parseInt((req.params as any).id);
      const { days } = req.body as any;
      const d = parseInt(days) || 7;
      const db = getDb();
      const share = (await db.select().from(shares).where(eq(shares.id, id)))[0];
      if (!share) return reply.send(fail('分享不存在'));
      const oldExpiry = new Date(share.expires_at);
      const now = new Date();
      const base = oldExpiry > now ? oldExpiry : now;
      const newExpiry = new Date(base.getTime() + d * 86400000);
      const expiresAt = newExpiry.toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.status(500).send(fail('DB error'));
      sqlite.prepare('UPDATE shares SET expires_at = ?, status = ? WHERE id = ?').run(expiresAt, 'active', id);
      return success({ expires_at: expiresAt }, `已续期 ${d} 天`);
    } catch (err: any) {
      return reply.status(500).send(fail('续期失败: ' + err.message));
    }
  });

  app.patch('/api/admin/shares/:id', async (req, reply) => {
    try {
      await req.jwtVerify();
      if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
      const id = parseInt((req.params as any).id);
      const { password, expires_at, allow_download, max_access_count, force_watermark, remark } = req.body as any;
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.status(500).send(fail('DB error'));
      const updates: string[] = [];
      const params: any[] = [];
      if (password !== undefined) {
        updates.push('password = ?, password_hash = ?');
        params.push(password || null, password ? createHash('sha256').update(password).digest('hex') : null);
      }
      if (expires_at !== undefined) { updates.push('expires_at = ?'); params.push(expires_at); }
      if (allow_download !== undefined) { updates.push('allow_download = ?'); params.push(allow_download ? 1 : 0); }
      if (max_access_count !== undefined) { updates.push('max_access_count = ?'); params.push(max_access_count); }
      if (force_watermark !== undefined) { updates.push('force_watermark = ?'); params.push(force_watermark ? 1 : 0); }
      if (remark !== undefined) { updates.push('remark = ?'); params.push(remark); }
      if (updates.length > 0) {
        params.push(id);
        sqlite.prepare(`UPDATE shares SET ${updates.join(', ')} WHERE id = ?`).run(...params);
      }
      return success(null, '已更新');
    } catch (err: any) {
      return reply.status(500).send(fail('更新失败: ' + err.message));
    }
  });

  app.delete('/api/admin/shares/:id', async (req, reply) => {
    try {
      await req.jwtVerify();
      if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
      const id = parseInt((req.params as any).id);
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.status(500).send(fail('DB error'));
      sqlite.prepare('DELETE FROM shares WHERE id = ?').run(id);
      return success(null, '已删除');
    } catch (err: any) {
      return reply.status(500).send(fail('删除失败: ' + err.message));
    }
  });

  app.post('/api/admin/shares/batch-delete', async (req, reply) => {
    try {
      await req.jwtVerify();
      if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
      const { ids } = req.body as any;
      if (!ids || !Array.isArray(ids) || ids.length === 0) return reply.send(fail('请选择分享记录'));
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.status(500).send(fail('DB error'));
      for (const id of ids) sqlite.prepare('DELETE FROM shares WHERE id = ?').run(id);
      return success(null, `已删除 ${ids.length} 条`);
    } catch (err: any) {
      return reply.status(500).send(fail('批量删除失败: ' + err.message));
    }
  });

  app.post('/api/admin/shares/batch-status', async (req, reply) => {
    try {
      await req.jwtVerify();
      if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
      const { ids, status } = req.body as any;
      if (!ids || !Array.isArray(ids) || ids.length === 0) return reply.send(fail('请选择分享记录'));
      if (!['active', 'disabled'].includes(status)) return reply.send(fail('无效状态'));
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (!sqlite) return reply.status(500).send(fail('DB error'));
      for (const id of ids) sqlite.prepare('UPDATE shares SET status = ? WHERE id = ?').run(status, id);
      return success(null, `已更新 ${ids.length} 条`);
    } catch (err: any) {
      return reply.status(500).send(fail('批量操作失败: ' + err.message));
    }
  });
}
