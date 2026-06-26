import { beijingTime } from '../utils/time';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { getDb } from '../db';
import { users, whitelist, approvals, configs, loginLogs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { isValidIdCard, isValidPhone } from '../utils/validator';
import { encrypt, decrypt, maskIdCard } from '../services/crypto';
import { sendVerificationCode } from '../services/mailer';
import { createNotification, createContactNotification } from './notification.routes';
import { sendNotificationToUser } from '../services/notification';
import path from 'path';
import fs from 'fs';

export default async function authRoutes(app: FastifyInstance) {

  app.post('/api/auth/login', async (req, reply) => {
    const { account, password } = req.body as any;
    if (!account || !password) return reply.send(fail('请输入账号和密码'));

    const db = getDb();
    const allUsers = await db.select().from(users).where(eq(users.status, 'active'));

    let matchedUser = null;
    for (const u of allUsers) {
      const decryptedPhone = decrypt(u.phone || '');
      const decryptedIdCard = decrypt(u.id_card || '');

      let matched =
        u.username === account ||
        u.name === account ||
        decryptedPhone === account ||
        decryptedIdCard === account;

      if (!matched && u.role === 'admin') {
        try {
          const boundRow = await db.select().from(configs).where(eq(configs.key, 'bound_owner_id')).limit(1);
          if (boundRow[0]?.value) {
            const wl = await db.select().from(whitelist).where(eq(whitelist.id, parseInt(boundRow[0].value))).limit(1);
            if (wl[0]) {
              const wlPhone = decrypt(wl[0].phone || '');
              const wlIdCard = decrypt(wl[0].id_card || '');
              matched = wl[0].name === account || wlPhone === account || wlIdCard === account;
            }
          }
        } catch {}
      }

      if (matched) {
        const valid = await bcrypt.compare(password, u.password_hash);
        if (valid) matchedUser = u;
        break;
      }
    }

    if (!matchedUser) return reply.send(fail('账号或密码错误'));

    const token = app.jwt.sign(
      { sub: matchedUser.id, role: matchedUser.role as 'admin' | 'owner' },
      { expiresIn: '7d' },
    );

    const ua = req.headers['user-agent'] || '';
    const device = ua.includes('MiniProgram') ? '微信小程序' : ua.includes('Mobile') ? '手机网页' : '电脑网页';
    try {
      const db = getDb();
      const sqlite = (db as any).session?.client;
      if (sqlite) {
        sqlite.prepare('INSERT INTO login_logs (user_id, ip, device, created_at) VALUES (?, ?, ?, ?)')
          .run(matchedUser.id, req.ip || '', device, beijingTime());
      }
    } catch {}

    const avatarPath = path.join(process.env.UPLOAD_DIR || './uploads', 'avatars', `${matchedUser.id}.jpg`);
    const avatarUrl = fs.existsSync(avatarPath) ? `/files/avatars/${matchedUser.id}.jpg` : null;

    return reply.send(success({
      token,
      user: {
        id: matchedUser.id,
        username: matchedUser.username,
        role: matchedUser.role,
        name: matchedUser.name,
        phone: decrypt(matchedUser.phone || ''),
        id_card: maskIdCard(decrypt(matchedUser.id_card || '')),
        email: matchedUser.email,
        room_number: matchedUser.room_number,
        avatar_url: avatarUrl,
        status: matchedUser.status,
        register_method: matchedUser.register_method,
        created_at: matchedUser.created_at,
      },
    }));
  });

  app.post('/api/auth/check-whitelist', async (req, reply) => {
    const { name, id_card, phone } = req.body as any;
    if (!name || !id_card || !phone) return reply.send(fail('请填写完整信息'));

    const idCardStr = String(id_card).trim().toUpperCase();
    const phoneStr = String(phone).trim();

    if (!isValidIdCard(idCardStr)) return reply.send(fail('身份证号格式不正确'));
    if (!isValidPhone(phoneStr)) return reply.send(fail('手机号格式不正确'));

    const db = getDb();

    const allUsers = await db.select().from(users);
    for (const u of allUsers) {
      const decrypted = decrypt(u.id_card || '');
      if (decrypted === idCardStr) {
        return reply.send(success({
          registered: true,
          registered_at: u.created_at,
          message: `该身份证号已于 ${u.created_at} 注册过`,
        }));
      }
    }

    const allWhitelist = await db.select().from(whitelist);
    const matched = allWhitelist.find((w) => {
      const decryptedIdCard = decrypt(w.id_card);
      const decryptedPhone = decrypt(w.phone);
      return w.name === name.trim() && decryptedIdCard === idCardStr && decryptedPhone === phoneStr;
    });

    if (matched) {
      const roomOccupants = allWhitelist.filter(w => w.room === matched.room).length;
      return reply.send(success({
        matched: true,
        room: matched.room,
        message: `白名单匹配成功，可以立即注册。该房号共有 ${roomOccupants} 位业主。`,
      }));
    }

    const nameMatch = allWhitelist.some(w => w.name === name.trim());
    const idCardMatch = allWhitelist.some(w => decrypt(w.id_card) === idCardStr);
    const phoneMatch = allWhitelist.some(w => decrypt(w.phone) === phoneStr);
    const partialMatches = [nameMatch && '姓名', idCardMatch && '身份证号', phoneMatch && '手机号'].filter(Boolean);

    if (partialMatches.length > 0) {
      return reply.send(success({
        require_manual: true,
        partial_matches: partialMatches,
        message: `系统中已有匹配记录：${partialMatches.join('、')}。请确认所有信息与物业登记一致，重新录入未匹配项目后重试，或提交人工审核。`,
      }));
    }

    return reply.send(success({
      require_manual: true,
      message: '未匹配白名单，请上传房产证进行人工审核',
    }));
  });

  app.post('/api/auth/register-whitelist', async (req, reply) => {
    const { name, id_card, phone, email, password } = req.body as any;
    if (!name || !id_card || !phone || !password) return reply.send(fail('请填写完整信息'));
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.send(fail('请输入有效的电子邮箱'));
    if (password.length < 6) return reply.send(fail('密码至少6位'));

    const idCardStr = String(id_card).trim().toUpperCase();
    const phoneStr = String(phone).trim();

    if (!isValidIdCard(idCardStr)) return reply.send(fail('身份证号格式不正确'));
    if (!isValidPhone(phoneStr)) return reply.send(fail('手机号格式不正确'));

    const db = getDb();

    const allWhitelist = await db.select().from(whitelist);
    const matched = allWhitelist.find((w) => {
      return decrypt(w.id_card) === idCardStr && decrypt(w.phone) === phoneStr;
    });

    if (!matched) return reply.send(fail('未在白名单中，请走人工审核通道'));

    const allUsers = await db.select().from(users);
    for (const u of allUsers) {
      if (decrypt(u.id_card || '') === idCardStr) {
        return reply.send(fail(`该身份证号已于 ${u.created_at} 注册过`));
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = beijingTime();

    const result = await db.insert(users).values({
      role: 'owner',
      name: name.trim(),
      id_card: encrypt(idCardStr),
      phone: encrypt(phoneStr),
      email: email.trim() || null,
      room_number: matched.room,
      password_hash: passwordHash,
      status: 'active',
      register_method: 'whitelist',
      created_at: now,
      updated_at: now,
    });

    const token = app.jwt.sign(
      { sub: Number(result.lastInsertRowid), role: 'owner' as const },
      { expiresIn: '7d' },
    );

    const newUserId = Number(result.lastInsertRowid);
    await sendNotificationToUser(newUserId, '欢迎注册',
      '您的账户已成功开通，欢迎使用物业服务监督系统。',
      'system', '/');
    return reply.send(success({
      token,
      user: { id: newUserId, role: 'owner', name: name.trim(), status: 'active', register_method: 'whitelist', avatar_url: null },
    }));
  });

  app.post('/api/auth/register-manual', async (req, reply) => {
    try {
      const parts = req.parts();
      let name = '', id_card = '', phone = '', email = '', room_number = '', remark = '', apply_reason = '';
      let deedFilename = '';
      let deedBuffer: Buffer | null = null;

      for await (const part of parts) {
        if (part.type === 'field') {
          switch (part.fieldname) {
            case 'name': name = String(part.value).trim(); break;
            case 'id_card': id_card = String(part.value).trim().toUpperCase(); break;
            case 'phone': phone = String(part.value).trim(); break;
            case 'email': email = String(part.value).trim(); break;
            case 'room_number': room_number = String(part.value).trim(); break;
            case 'remark': remark = String(part.value).trim(); break;
            case 'apply_reason': apply_reason = String(part.value).trim(); break;
          }
        } else if (part.type === 'file') {
          deedFilename = part.filename || 'deed.jpg';
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          deedBuffer = Buffer.concat(chunks);
        }
      }

      if (!name || !id_card || !phone || !email || !room_number) return reply.send(fail('请填写所有必填字段'));
      if (!isValidIdCard(id_card)) return reply.send(fail('身份证号格式不正确'));
      if (!isValidPhone(phone)) return reply.send(fail('手机号格式不正确'));
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return reply.send(fail('邮箱格式不正确'));
      if (!deedBuffer) return reply.send(fail('请上传房产证或购房合同'));

      const db = getDb();
      const allUsers = await db.select().from(users);
      for (const u of allUsers) {
        if (decrypt(u.id_card || '') === id_card) {
          return reply.send(fail(`该身份证号已于 ${u.created_at} 注册过`));
        }
      }

      const ext = deedFilename.split('.').pop() || 'jpg';
      const deedKey = `documents/deed_${Date.now()}.${ext}`;
      const fs = await import('fs');
      const path = await import('path');
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const deedPath = path.join(uploadDir, deedKey);
      fs.mkdirSync(path.dirname(deedPath), { recursive: true });
      fs.writeFileSync(deedPath, deedBuffer);

      const now = beijingTime();
      await db.insert(approvals).values({
        name,
        id_card: encrypt(id_card),
        phone: encrypt(phone),
        email: email || null,
        room_number,
        property_deed_url: `/files/${deedKey.replace(/\\/g, '/')}`,
        status: 'pending',
        notify_method: email ? 'email' : 'email',
        apply_reason: apply_reason || null,
        created_at: now,
      });

      await createNotification(1, '新的注册申请', `${name} (${room_number}) 提交了注册申请，请前往审核管理处理`, 'approval');

      return reply.send(success(null, '申请已提交，请留意审核通知'));
    } catch (err: any) {
      return reply.status(500).send(fail('提交失败: ' + err.message));
    }
  });

  app.post('/api/auth/preverify-token', async (req, reply) => {
    const { token } = req.body as any;
    if (!token) return reply.send(fail('缺少激活令牌'));

    const db = getDb();
    const allApprovals = await db.select().from(approvals);

    const matched = allApprovals.find((a) => a.activation_token === token);
    if (!matched) return reply.send(fail('无效的激活链接'));

    if (matched.status !== 'approved') {
      return reply.send(fail('审核未通过，无法激活'));
    }

    if (!matched.activation_token || !matched.verify_code) {
      return reply.send(fail('该账号已完成激活，请直接登录'));
    }

    if (matched.code_expires_at && matched.code_expires_at < beijingTime()) {
      return reply.send(fail('激活链接已过期，请重新提交注册申请'));
    }

    const allUsers = await db.select().from(users);
    for (const u of allUsers) {
      if (decrypt(u.id_card || '') === decrypt(matched.id_card)) {
        return reply.send(fail(`该身份证号已于 ${u.created_at} 注册过，请直接登录`));
      }
    }

    return reply.send(success({
      name: matched.name,
      room_number: matched.room_number,
    }));
  });

  app.post('/api/auth/verify-by-token', async (req, reply) => {
    const { token, password } = req.body as any;
    if (!token) return reply.send(fail('缺少激活令牌'));
    if (!password || password.length < 6) return reply.send(fail('密码至少6位'));

    const db = getDb();
    const allApprovals = await db.select().from(approvals);

    const matched = allApprovals.find((a) => a.activation_token === token);
    if (!matched) return reply.send(fail('无效的激活链接'));

    if (matched.status !== 'approved') {
      return reply.send(fail('审核未通过，无法激活'));
    }

    if (!matched.activation_token || !matched.verify_code) {
      return reply.send(fail('该账号已完成激活，请直接登录'));
    }

    if (matched.code_expires_at && matched.code_expires_at < beijingTime()) {
      return reply.send(fail('激活链接已过期，请重新提交注册申请'));
    }

    const allUsers = await db.select().from(users);
    for (const u of allUsers) {
      if (decrypt(u.id_card || '') === decrypt(matched.id_card)) {
        return reply.send(fail(`该身份证号已于 ${u.created_at} 注册过，请直接登录`));
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = beijingTime();

    const insertResult = await db.insert(users).values({
      role: 'owner',
      name: matched.name,
      id_card: matched.id_card,
      phone: matched.phone,
      email: matched.email,
      room_number: matched.room_number,
      password_hash: passwordHash,
      property_deed_url: matched.property_deed_url,
      status: 'active',
      register_method: 'manual_verify',
      created_at: now,
      updated_at: now,
    });

    // Mark token and code as used (mutual exclusion: both paths invalidated)
    await db.update(approvals).set({
      verify_code: null,
      activation_token: null,
      code_expires_at: null,
    }).where(eq(approvals.id, matched.id));

    const newUserId = Number(insertResult.lastInsertRowid);
    await sendNotificationToUser(newUserId, '欢迎注册',
      '您的账户已成功开通，欢迎使用物业服务监督系统。',
      'system', '/');
    return reply.send(success(null, '注册成功，请登录'));
  });

  app.post('/api/auth/verify-code', async (req, reply) => {
    const { id_card, verify_code, password } = req.body as any;
    if (!id_card || !verify_code || !password) return reply.send(fail('请填写完整信息'));
    if (password.length < 6) return reply.send(fail('密码至少6位'));

    const idCardNormalized = String(id_card).trim().toUpperCase();
    const codeNormalized = String(verify_code).trim();

    const db = getDb();
    const allApprovals = await db.select().from(approvals).where(eq(approvals.status, 'approved'));

    const matched = allApprovals.find((a) => decrypt(a.id_card) === idCardNormalized);
    if (!matched) return reply.send(fail('未找到待激活的审核记录'));

    if (!matched.verify_code) {
      return reply.send(fail('该账号已完成激活，请直接登录'));
    }

    if (matched.code_expires_at && matched.code_expires_at < beijingTime()) {
      return reply.send(fail('验证码已过期，请联系管理员重新发送'));
    }

    if (matched.verify_code !== codeNormalized) {
      return reply.send(fail('验证码不正确'));
    }

    const allUsers = await db.select().from(users);
    for (const u of allUsers) {
      if (decrypt(u.id_card || '') === idCardNormalized) {
        return reply.send(fail(`该身份证号已于 ${u.created_at} 注册过，请直接登录`));
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = beijingTime();

    const insertResult = await db.insert(users).values({
      role: 'owner',
      name: matched.name,
      id_card: matched.id_card,
      phone: matched.phone,
      email: matched.email,
      room_number: matched.room_number,
      password_hash: passwordHash,
      property_deed_url: matched.property_deed_url,
      status: 'active',
      register_method: 'manual_verify',
      created_at: now,
      updated_at: now,
    });

    // Mark code and token as used (mutual exclusion: both paths invalidated)
    await db.update(approvals).set({
      verify_code: null,
      activation_token: null,
      code_expires_at: null,
    }).where(eq(approvals.id, matched.id));

    const newUserId = Number(insertResult.lastInsertRowid);
    await sendNotificationToUser(newUserId, '欢迎注册',
      '您的账户已成功开通，欢迎使用物业服务监督系统。',
      'system', '/');
    return reply.send(success(null, '注册成功，请登录'));
  });

  app.post('/api/auth/refresh', async (req, reply) => {
    try {
      await req.jwtVerify();
      const token = app.jwt.sign(
        { sub: req.user.sub, role: req.user.role as 'admin' | 'owner' },
        { expiresIn: '7d' },
      );
      return reply.send(success({ token }));
    } catch {
      return reply.status(401).send(fail('登录已过期'));
    }
  });

  app.post('/api/contact', async (req, reply) => {
    try {
      const { title, content, name, phone, email } = req.body as any;
      if (!name || !phone) return reply.send(fail('请填写姓名和手机号'));
      if (!title || !content) return reply.send(fail('请填写问题标题和描述'));
      const contactInfo = `姓名:${name} 手机:${phone}${email ? ` 邮箱:${email}` : ''}`;
      await createContactNotification(`用户反馈: ${title}`, `描述: ${content}\n${contactInfo}`);
      return reply.send(success(null, '提交成功，管理员收到后会与您联系'));
    } catch (err: any) {
      return reply.send(fail('提交失败'));
    }
  });
}
