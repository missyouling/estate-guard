import { beijingTime } from '../utils/time';
import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { users, whitelist, approvals, changeLogs, loginLogs, propertyFiles } from '../db/schema';
import { eq, desc, and, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { success, fail } from '../utils/response';
import { decrypt, encrypt, maskIdCard, maskPhone } from '../services/crypto';
import path from 'path';
import fs from 'fs';
import { createNotification } from './notification.routes';
import { sendNotificationToUser, sendRawSms, checkChannelConfig } from '../services/notification';
import { sendVerificationCode } from '../services/mailer';

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

let emailVerifyCodes: Record<string, { code: string; expiry: number }> = {};

export default async function userRoutes(app: FastifyInstance) {
  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/user/me', async (req) => {
    const db = getDb();
    const u = await db.select().from(users).where(eq(users.id, (req.user as any).sub)).limit(1);
    if (!u[0]) return fail('用户不存在');
    const avatarDir = path.join(process.env.UPLOAD_DIR || './uploads', 'avatars');
    const avatarPath = path.join(avatarDir, `${u[0].id}.jpg`);
    const avatarUrl = fs.existsSync(avatarPath) ? `/files/avatars/${u[0].id}.jpg` : null;
    return success({
      id: u[0].id,
      username: u[0].username,
      role: u[0].role,
      name: u[0].name,
      phone: decrypt(u[0].phone || ''),
      id_card: maskIdCard(decrypt(u[0].id_card || '')),
      email: u[0].email,
      room_number: u[0].room_number,
      status: u[0].status,
      register_method: u[0].register_method,
      avatar_url: avatarUrl,
      created_at: u[0].created_at,
    });
  });

  app.get('/api/user/profile', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');

    // Admin binding: if admin has bound_owner_id, return that whitelist entry's info instead
    let effectiveName = u[0].name;
    let effectiveIdCard = u[0].id_card || '';
    let effectivePhone = u[0].phone || '';
    let effectiveRoom = u[0].room_number || '';
    let boundOwnerInfo: any = null;

    if (u[0].role === 'admin') {
      const configTable = (await import('../db/schema')).configs;
      const boundRow = await db.select().from(configTable).where(eq(configTable.key, 'bound_owner_id')).limit(1);
      const boundId = parseInt(boundRow[0]?.value || '0');
      if (boundId) {
        const wl = await db.select().from(whitelist).where(eq(whitelist.id, boundId)).limit(1);
        if (wl[0]) {
          effectiveName = wl[0].name;
          effectiveIdCard = wl[0].id_card;
          effectivePhone = wl[0].phone;
          effectiveRoom = wl[0].room;
          boundOwnerInfo = { id: wl[0].id, room: wl[0].room, name: wl[0].name };
        }
      }
    }

    const fullIdCard = decrypt(effectiveIdCard);
    const allWhitelist = await db.select().from(whitelist);
    const myWhitelist = allWhitelist.filter(w => {
      try { return decrypt(w.id_card) === fullIdCard; } catch { return false; }
    });
    const whitelistIds = myWhitelist.map(w => w.id);
    const configRows = await db.select().from((await import('../db/schema')).configs).where(eq((await import('../db/schema')).configs.key, 'community_name'));
    const communityName = configRows[0]?.value || '';
    const avatarDir = path.join(process.env.UPLOAD_DIR || './uploads', 'avatars');
    const avatarPath = path.join(avatarDir, `${userId}.jpg`);
    const avatarUrl = fs.existsSync(avatarPath) ? `/files/avatars/${userId}.jpg` : null;
    return success({
      id: u[0].id, username: u[0].username, role: u[0].role, name: effectiveName,
      phone: decrypt(effectivePhone),
      id_card: maskIdCard(fullIdCard), id_card_raw: fullIdCard,
      email: u[0].email, room_number: effectiveRoom,
      community_name: communityName,
      properties: myWhitelist.map(w => ({ room: w.room, status: w.status })),
      status: u[0].status, register_method: u[0].register_method,
      avatar_url: avatarUrl, created_at: u[0].created_at,
      whitelist_ids: whitelistIds,
      bound_owner: boundOwnerInfo,
    });
  });

  app.post('/api/user/verify-identity', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const { type, code } = req.body as any;
    if (!type || !code) return fail('请提供验证方式及凭证');
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');
    if (type === 'password') {
      const valid = await bcrypt.compare(code, u[0].password_hash);
      if (!valid) return fail('密码错误');
    } else if (type === 'sms') {
      const storedCode = (req as any).session?.verifyCode;
      if (!storedCode || storedCode !== code || (storedCode && Date.now() > (req as any).session?.verifyCodeExpiry)) {
        return fail('验证码错误或已过期');
      }
    } else {
      return fail('不支持的验证方式');
    }
    const fullIdCard = decrypt(u[0].id_card || '');
    return success({ id_card: fullIdCard, phone: decrypt(u[0].phone || '') });
  });

  app.post('/api/user/send-verify-code', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const { phone } = req.body as any;
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');
    const targetPhone = phone || decrypt(u[0].phone || '');
    if (!targetPhone || !/^1[3-9]\d{9}$/.test(targetPhone)) return fail('手机号无效');
    const configured = await checkChannelConfig('sms');
    if (!configured) return fail('短信服务未配置，请使用密码验证');
    const code = generateCode();
    (req as any).session = (req as any).session || {};
    (req as any).session.verifyCode = code;
    (req as any).session.verifyCodeExpiry = Date.now() + 300000;
    const err = await sendRawSms(targetPhone, code);
    if (err) return fail(err);
    return success(null, '验证码已发送');
  });

  app.get('/api/user/sms-status', async () => {
    const configured = await checkChannelConfig('sms');
    return success({ configured });
  });

  app.post('/api/user/send-email-code', async (req) => {
    const { email } = req.body as any;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('邮箱格式不正确');
    const code = generateCode();
    try {
      await sendVerificationCode(email, code);
      emailVerifyCodes[email] = { code, expiry: Date.now() + 600000 };
      setTimeout(() => { delete emailVerifyCodes[email]; }, 600000);
      return success(null, '验证码已发送至邮箱');
    } catch (err: any) {
      return fail(err.message || '邮件发送失败');
    }
  });

  app.patch('/api/user/email', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const { email, code } = req.body as any;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('邮箱格式不正确');
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');

    if (u[0].email) {
      if (!code) return fail('请先验证原邮箱，输入您收到的验证码');
      const stored = emailVerifyCodes[u[0].email];
      if (!stored || stored.code !== code || Date.now() > stored.expiry) {
        return fail('验证码错误或已过期，请重新获取');
      }
      delete emailVerifyCodes[u[0].email];
    } else {
      if (!code) return fail('请先验证新邮箱，输入您收到的验证码');
      const stored = emailVerifyCodes[email];
      if (!stored || stored.code !== code || Date.now() > stored.expiry) {
        return fail('验证码错误或已过期，请重新获取');
      }
      delete emailVerifyCodes[email];
    }

    const oldVal = u[0].email || '';
    await db.update(users).set({ email, updated_at: beijingTime() }).where(eq(users.id, userId));
    const fullIdCard = decrypt(u[0].id_card || '');
    const allWl = await db.select().from(whitelist);
    for (const w of allWl) {
      try { if (decrypt(w.id_card) === fullIdCard) { await db.update(whitelist).set({ email }).where(eq(whitelist.id, w.id)); } } catch {}
    }
    await db.insert(changeLogs).values({
      target_type: 'user', target_id: userId, field: 'email',
      old_value: oldVal || '(空)', new_value: email,
      operator_id: userId, operator_name: u[0].name,
      created_at: beijingTime(),
    });
    try {
      await createNotification(userId, '邮箱已更新', `您的绑定邮箱已变更为 ${email}`, 'info');
    } catch {}
    return success({ email }, '邮箱已更新');
  });

  app.patch('/api/user/phone', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const { phone, code, email_code } = req.body as any;
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) return fail('手机号格式不正确');
    if (!code && !email_code) return fail('请提供短信验证码或邮箱验证码');
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');
    if (code) {
      const storedCode = (req as any).session?.verifyCode;
      if (!storedCode || storedCode !== code || (storedCode && Date.now() > (req as any).session?.verifyCodeExpiry)) {
        return fail('短信验证码错误或已过期');
      }
    } else if (email_code) {
      const targetEmail = u[0].email;
      if (!targetEmail) return fail('未绑定邮箱，无法使用邮箱验证');
      const stored = emailVerifyCodes[targetEmail];
      if (!stored || stored.code !== email_code || Date.now() > stored.expiry) {
        return fail('邮箱验证码错误或已过期');
      }
      delete emailVerifyCodes[targetEmail];
    }
    const allUsers = await db.select().from(users);
    const dup = allUsers.find(x => x.id !== userId && decrypt(x.phone || '') === phone);
    if (dup) return fail('该手机号已被使用');
    const oldPhone = decrypt(u[0].phone || '');
    const newEncrypted = encrypt(phone);
    await db.update(users).set({ phone: newEncrypted, updated_at: beijingTime() }).where(eq(users.id, userId));
    const fullIdCard = decrypt(u[0].id_card || '');
    const allWl = await db.select().from(whitelist);
    for (const w of allWl) {
      try { if (decrypt(w.id_card) === fullIdCard) { await db.update(whitelist).set({ phone: newEncrypted }).where(eq(whitelist.id, w.id)); } } catch {}
    }
    await db.insert(changeLogs).values({
      target_type: 'user', target_id: userId, field: 'phone',
      old_value: maskPhone(oldPhone), new_value: maskPhone(phone),
      operator_id: userId, operator_name: u[0].name,
      created_at: beijingTime(),
    });
    try {
      await createNotification(userId, '手机号已更新', `您的绑定手机号已变更为 ${maskPhone(phone)}`, 'info');
    } catch {}
    return success({ phone: maskPhone(phone) }, '手机号已更新');
  });

  app.get('/api/user/username-check', async (req) => {
    const username = (req.query as any).username;
    if (!username) return success({ available: false });
    const db = getDb();
    const existing = await db.select().from(users).where(eq(users.username, String(username).trim())).limit(1);
    return success({ available: !existing[0] });
  });

  app.patch('/api/user/me', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const body = req.body as any;
    const updateData: Record<string, any> = {};
    const now = beijingTime();

    if (body.username !== undefined) {
      const username = String(body.username).trim();
      if (!username) return fail('用户名不能为空');
      if (username.length < 4 || username.length > 20) return fail('用户名长度为 4-20 个字符');
      if (!/^[a-zA-Z][a-zA-Z0-9_]{3,19}$/.test(username)) return fail('用户名仅支持字母、数字、下划线，字母开头');
      const existing = await db.select().from(users).where(eq(users.username, username)).limit(1);
      if (existing[0] && existing[0].id !== userId) return fail('用户名已被占用');
      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (u[0]) {
        const oldUsername = u[0].username || '';
        updateData.username = username;
        await db.insert(changeLogs).values({
          target_type: 'user', target_id: userId, field: 'username',
          old_value: oldUsername || '(未设置)', new_value: username,
          operator_id: userId, operator_name: u[0].name,
          created_at: now,
        });
      }
    }

    if (body.old_password && body.new_password) {
      const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!u[0]) return fail('用户不存在');
      const valid = await bcrypt.compare(body.old_password, u[0].password_hash);
      if (!valid) return fail('当前密码错误');
      if (body.new_password.length < 6) return fail('新密码至少6位');
      updateData.password_hash = await bcrypt.hash(body.new_password, 12);
      await sendNotificationToUser(userId, '密码修改成功',
        '您的登录密码已于 ' + beijingTime().slice(0, 16) + ' 修改成功。如非本人操作，请立即联系管理员。',
        'security', '');
    }

    if (Object.keys(updateData).length === 0) return fail('无修改内容');
    updateData.updated_at = now;
    await db.update(users).set(updateData).where(eq(users.id, userId));
    return success(null, '信息已更新');
  });

  app.post('/api/user/avatar', async (req) => {
    const userId = (req.user as any).sub;
    const data = await req.file();
    if (!data) return fail('请上传头像文件');
    const buffer = await data.toBuffer();
    const avatarDir = path.join(process.env.UPLOAD_DIR || './uploads', 'avatars');
    if (!fs.existsSync(avatarDir)) fs.mkdirSync(avatarDir, { recursive: true });
    const filePath = path.join(avatarDir, `${userId}.jpg`);
    fs.writeFileSync(filePath, buffer);
    return success(`/files/avatars/${userId}.jpg`, '头像已更新');
  });

  app.get('/api/user/stats', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const { media } = await import('../db/schema');
    const all = await db.select().from(media).where(eq(media.user_id, userId));
    return success({
      total: all.length, images: all.filter(m => m.type === 'image').length,
      videos: all.filter(m => m.type === 'video').length, audio: all.filter(m => m.type === 'audio').length,
    });
  });

  app.get('/api/user/login-history', async (req) => {
    const userId = (req.user as any).sub;
    const db = getDb();
    const rows = await db.select().from(loginLogs)
      .where(eq(loginLogs.user_id, userId))
      .orderBy(desc(loginLogs.created_at))
      .limit(50);
    return success(rows);
  });

  app.post('/api/user/kill-session', async (req) => {
    const userId = (req.user as any).sub;
    const { logId } = req.body as any;
    return success(null, '下线请求已记录');
  });

  app.get('/api/user/properties', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');

    // Check admin binding
    let effectiveIdCard = u[0].id_card || '';
    if (u[0].role === 'admin') {
      const configTable = (await import('../db/schema')).configs;
      const boundRow = await db.select().from(configTable).where(eq(configTable.key, 'bound_owner_id')).limit(1);
      const boundId = parseInt(boundRow[0]?.value || '0');
      if (boundId) {
        const wl = await db.select().from(whitelist).where(eq(whitelist.id, boundId)).limit(1);
        if (wl[0]) effectiveIdCard = wl[0].id_card;
      }
    }

    const fullIdCard = decrypt(effectiveIdCard);
    const allWl = await db.select().from(whitelist);
    const matched = allWl.filter(w => {
      try { return decrypt(w.id_card) === fullIdCard; } catch { return false; }
    });
    const allFileRows = await db.select().from(propertyFiles);
    const allApprovals = await db.select().from((await import('../db/schema')).approvals);
    const result = matched.map(w => {
      const propInfo = w.property_info ? (() => { try { return JSON.parse(w.property_info); } catch { return {}; } })() : {};
      const docs = allFileRows.filter(f => f.owner_id === w.id);
      const relatedApprovals = allApprovals.filter(a =>
        a.apply_type !== 'register' && a.room_number === w.room && a.name === w.name
      ).sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      const latestApproval = relatedApprovals[0];
      let approvalStatus: string | undefined;
      let rejectionReason: string | undefined;
      if (latestApproval) {
        if (latestApproval.status === 'approved') approvalStatus = 'approved';
        else if (latestApproval.status === 'rejected') {
          approvalStatus = 'rejected';
          rejectionReason = latestApproval.reject_reason_preset || latestApproval.remark || undefined;
        } else approvalStatus = 'pending';
      }
      return {
        id: w.id, name: w.name, room: w.room,
        id_card: maskIdCard(decrypt(w.id_card)),
        phone: maskPhone(decrypt(w.phone)),
        email: w.email, property_info: propInfo,
        status: w.status, docs,
        approval_status: approvalStatus,
        rejection_reason: rejectionReason,
        approval_created_at: latestApproval?.created_at,
      };
    });
    return success(result);
  });

  app.post('/api/user/properties/:id/documents', async (req) => {
    const userId = (req.user as any).sub;
    const ownerId = parseInt((req.params as any).id);
    const data = await req.file();
    if (!data) return fail('请上传文件');
    const buffer = await data.toBuffer();
    const filename = `${Date.now()}_${data.filename || 'doc'}`;
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const docDir = path.join(uploadDir, 'property_docs');
    if (!fs.existsSync(docDir)) fs.mkdirSync(docDir, { recursive: true });
    const filePath = path.join(docDir, filename);
    fs.writeFileSync(filePath, buffer);
    const db = getDb();
    await db.insert(propertyFiles).values({
      owner_id: ownerId, filename, original_name: data.filename || filename,
      url: `/files/property_docs/${filename}`, uploaded_by: userId,
    });
    return success(null, '证照已上传，待管理员审核');
  });

  app.post('/api/user/property-change-request', async (req, reply) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');

    if (!u[0].id_card) return fail('请先完成身份认证后再提交房产申请');

    let action = '';
    let room = '';
    let whitelistId = 0;
    const deedUrls: string[] = [];
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          switch (part.fieldname) {
            case 'action': action = String(part.value); break;
            case 'room': room = String(part.value); break;
            case 'whitelist_id': whitelistId = parseInt(String(part.value) || '0'); break;
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
          const ext = path.extname(part.filename || '.jpg').toLowerCase();
          if (!allowed.includes(ext)) {
            // Skip invalid files
            for await (const _ of part.file) { /* drain */ }
            continue;
          }
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          const fileBuffer = Buffer.concat(chunks);
          const filename = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${part.filename || 'deed'}`;
          const uploadDir = process.env.UPLOAD_DIR || './uploads';
          const deedDir = path.join(uploadDir, 'property_deeds');
          if (!fs.existsSync(deedDir)) fs.mkdirSync(deedDir, { recursive: true });
          const filePath = path.join(deedDir, filename);
          fs.writeFileSync(filePath, fileBuffer);
          deedUrls.push(`/files/property_deeds/${filename}`);
        }
      }
    } else {
      const body = req.body as any;
      action = body.action || '';
      room = body.room || '';
      whitelistId = parseInt(body.whitelist_id || '0');
    }

    if (!action || !['add', 'modify'].includes(action)) return fail('请选择操作类型');
    if (!room || !room.trim()) return fail('请输入房号');
    const trimmedRoom = room.trim();

    // Room number validation
    const { isValidRoom, getRoomErrorMessage } = await import('../utils/roomValidator');
    const roomErr = getRoomErrorMessage(trimmedRoom);
    if (roomErr) return fail(roomErr);
    if (!isValidRoom(trimmedRoom)) return fail('房号格式不正确，请参考示例: 3-101 或 4-2-102');

    // Verify the whitelist entry belongs to this user (for modify)
    if (action === 'modify') {
      if (!whitelistId) return fail('请选择要变更的房产');
      const wl = await db.select().from(whitelist).where(eq(whitelist.id, whitelistId)).limit(1);
      if (!wl[0]) return fail('房产记录不存在');
      const fullIdCard = decrypt(u[0].id_card || '');
      const wlIdCard = decrypt(wl[0].id_card);
      if (fullIdCard !== wlIdCard) return fail('无权操作此房产');
      if (wl[0].room === trimmedRoom) return fail('新房号与原房号相同');
    }

    // Check for duplicate (for add)
    if (action === 'add') {
      const fullIdCard = decrypt(u[0].id_card || '');
      const allWl = await db.select().from(whitelist);
      const myRooms = allWl.filter(w => {
        try { return decrypt(w.id_card) === fullIdCard; } catch { return false; }
      }).map(w => w.room);
      if (myRooms.includes(trimmedRoom)) return fail(`房号 ${trimmedRoom} 已在您名下，无需重复添加`);
    }

    const now = beijingTime();
    const mismatchFields = whitelistId ? JSON.stringify({ old_id: whitelistId }) : '';
    const deedUrl = deedUrls.join(',') || '';
    const sqlite = (db as any).session?.client;
    if (sqlite) {
      sqlite.prepare(`INSERT INTO approvals (name, id_card, phone, email, room_number, property_deed_url, mismatch_fields, status, apply_type, apply_reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`).run(
        u[0].name, u[0].id_card, u[0].phone, u[0].email,
        trimmedRoom, deedUrl || '', mismatchFields,
        action === 'add' ? 'change' : 'change', action === 'add' ? '新增房产' : '产权变更', now
      );
    }
    await createNotification(1, '新的房产变更申请',
      `${u[0].name} 提交了房产变更申请: ${action === 'add' ? '新增房产' : '产权变更'} ${trimmedRoom}`, 'approval');
    return success(null, action === 'add' ? '新增房产申请已提交，等待管理员审核' : '产权变更申请已提交，等待管理员审核');
  });

  app.post('/api/user/property-delete-request', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const { whitelist_id, reason } = req.body as any;
    if (!whitelist_id) return fail('参数错误');
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');
    if (!u[0].id_card) return fail('请先完成身份认证后再提交房产申请');
    const wl = await db.select().from(whitelist).where(eq(whitelist.id, whitelist_id)).limit(1);
    if (!wl[0]) return fail('房产记录不存在');
    const fullIdCard = decrypt(u[0].id_card || '');
    const wlIdCard = decrypt(wl[0].id_card);
    if (fullIdCard !== wlIdCard) return fail('无权操作此房产');
    const now = beijingTime();
    const sqlite = (db as any).session?.client;
    if (sqlite) {
      sqlite.prepare(`INSERT INTO approvals (name, id_card, phone, email, room_number, property_deed_url, status, apply_type, apply_reason, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', 'delete', ?, ?)`).run(
        u[0].name, u[0].id_card, u[0].phone, u[0].email,
        wl[0].room, '', '删除房产: ' + (reason || ''), now
      );
    }
    await createNotification(1, '新的房产删除申请',
      `${u[0].name} 提交了房产删除申请: ${wl[0].room}`, 'approval');
    return success(null, '删除申请已提交，等待管理员审核');
  });

  app.get('/api/user/property-approvals', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');
    const sqlite = (db as any).session?.client;
    if (!sqlite) return fail('数据库错误');
    const fullIdCard = decrypt(u[0].id_card || '');
    const allWl = await db.select().from(whitelist);
    const myIds = allWl.filter(w => {
      try { return decrypt(w.id_card) === fullIdCard; } catch { return false; }
    });
    const myRooms = myIds.map(w => w.room);
    if (myRooms.length === 0) return success([]);
    const placeholders = myRooms.map(() => '?').join(',');
    const rows = sqlite.prepare(`SELECT * FROM approvals WHERE room_number IN (${placeholders}) AND apply_type != 'register' ORDER BY created_at DESC`).all(...myRooms) as any[];
    return success(rows);
  });

  app.get('/api/user/change-history', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const u = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u[0]) return fail('用户不存在');
    const fullIdCard = decrypt(u[0].id_card || '');
    const allWl = await db.select().from(whitelist);
    const whitelistIds = allWl.filter(w => {
      try { return decrypt(w.id_card) === fullIdCard; } catch { return false; }
    }).map(w => w.id);
    const userLogs = await db.select().from(changeLogs)
      .where(eq(changeLogs.target_id, userId))
      .orderBy(desc(changeLogs.created_at));
    const approvalLogs: any[] = [];
    const sqlite2 = (db as any).session?.client;
    if (sqlite2) {
      const rows = sqlite2.prepare('SELECT * FROM approvals WHERE name = ? ORDER BY created_at DESC').all(u[0].name);
      approvalLogs.push(...rows);
    }
    const result: any[] = [];
    for (const log of userLogs) {
      result.push({
        id: log.id, type: 'info_change', field: log.field,
        old_value: log.old_value, new_value: log.new_value,
        operator_name: log.operator_name || '自助修改',
        status: 'approved', created_at: log.created_at,
      });
    }
    for (const a of approvalLogs) {
      result.push({
        id: `a_${a.id}`, type: a.apply_type === 'register' ? 'register' : 'property_change',
        field: a.apply_type === 'register' ? '注册申请' : '房产变更',
        operator_name: a.reviewed_name || '', status: a.status,
        remark: a.remark || a.reject_reason_preset || '',
        created_at: a.created_at,
      });
    }
    result.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return success(result.slice(0, 50));
  });
}
