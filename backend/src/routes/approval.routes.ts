import { beijingTime } from '../utils/time';
import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { approvals, whitelist, configs, users, changeLogs } from '../db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { decrypt, encrypt, maskIdCard, maskPhone } from '../services/crypto';
import { sendVerificationCode } from '../services/mailer';
import { createNotification } from './notification.routes';
import { sendNotificationToUser, sendNotificationToUnregistered, getChannelConfigMap } from '../services/notification';
import crypto from 'crypto';

function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskPhoneDisplay(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function maskIdCardDisplay(card: string): string {
  if (!card || card.length < 15) return card;
  return card.slice(0, 4) + '**********' + card.slice(-4);
}

export default async function approvalRoutes(app: FastifyInstance) {

  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
  });

  app.get('/api/admin/approvals', async (req) => {
    const query = req.query as any;
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '20'), 100);
    const offset = (page - 1) * limit;
    const db = getDb();

    let conditions = [sql`1=1`];
    if (query.status && query.status !== 'all') {
      conditions.push(eq(approvals.status, query.status));
    }
    if (query.apply_type) {
      conditions.push(eq(approvals.apply_type, query.apply_type));
    }
    if (query.keyword) {
      const kw = `%${String(query.keyword).toLowerCase()}%`;
      conditions.push(sql`(LOWER(name) LIKE ${kw} OR room_number LIKE ${kw} OR LOWER(apply_reason) LIKE ${kw})`);
    }
    if (query.date_from) {
      conditions.push(sql`created_at >= ${query.date_from}`);
    }
    if (query.date_to) {
      conditions.push(sql`created_at <= ${query.date_to + ' 23:59:59'}`);
    }
    if (query.building) {
      conditions.push(sql`room_number LIKE ${query.building + '-%'}`);
    }

    const all = await db.select().from(approvals).where(and(...conditions)).orderBy(approvals.created_at);

    const total = all.length;
    const items = all.slice(offset, offset + limit).map(a => ({
      ...a,
      id_card: maskIdCard(decrypt(a.id_card)),
      phone: maskPhone(decrypt(a.phone)),
      apply_reason: a.apply_reason || '',
    }));

    const countRes = await db.select({
      status: approvals.status,
      count: sql<number>`COUNT(*)`.as('count'),
    }).from(approvals).groupBy(approvals.status);

    const counts: Record<string, number> = {};
    for (const r of countRes) counts[r.status] = r.count;

    return success({ items, total, page, limit, counts });
  });

  app.post('/api/admin/approvals/batch', async (req) => {
    const { ids, action, reject_reason } = req.body as any;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return fail('请选择申请');
    if (!['approve', 'reject'].includes(action)) return fail('无效操作');

    const db = getDb();
    const userId = (req.user as any).sub;
    const now = beijingTime();
    const userRows = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const userName = userRows[0]?.name || '管理员';

    if (action === 'approve') {
      const configRows = await db.select().from(configs);
      const cfgMap: Record<string, string> = {};
      for (const r of configRows) cfgMap[r.key] = r.value;
      const expireMinutes = parseInt(cfgMap.verify_code_expire_minutes || '30');

      for (const id of ids) {
        const item = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
        if (!item[0] || item[0].status !== 'pending') continue;

        const code = generateCode();
        const activationToken = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + expireMinutes * 60000).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
        const siteUrl = cfgMap.site_url || 'http://localhost:11111';
        const activationLink = `${siteUrl}/activate?token=${activationToken}`;

        await db.update(approvals).set({
          status: 'approved',
          verify_code: code,
          activation_token: activationToken,
          code_expires_at: expiresAt,
          reviewed_by: userId,
          reviewed_name: userName,
          reviewed_at: now,
        }).where(eq(approvals.id, id));

        const toEmail = item[0].email || '';
        const toPhone = item[0].phone ? decrypt(item[0].phone) : '';

        // Handle different apply types
        if (item[0].apply_type === 'delete') {
          // Delete property: remove from whitelist
          try {
            const mismatchFields = item[0].mismatch_fields ? JSON.parse(item[0].mismatch_fields) : {};
            const delId = mismatchFields.del_id;
            if (delId) {
              await db.delete(whitelist).where(eq(whitelist.id, delId));
              // Update users table if this was their only/main property
              const allWl = await db.select().from(whitelist);
              const fullIdCard = decrypt(item[0].id_card);
              const remaining = allWl.filter(w => {
                try { return decrypt(w.id_card) === fullIdCard; } catch { return false; }
              });
              const allUsers = await db.select().from(users);
              for (const uu of allUsers) {
                try {
                  if (decrypt(uu.id_card || '') === fullIdCard) {
                    await db.update(users).set({
                      room_number: remaining.length > 0 ? remaining[0].room : null,
                      updated_at: now,
                    }).where(eq(users.id, uu.id));
                  }
                } catch {}
              }
            }
          } catch {}

          const reason = item[0].apply_reason || '房产删除';
          await sendNotificationToUnregistered(toEmail, toPhone,
            '房产删除申请已通过', `您的房产删除申请已通过审核。${reason}`);

          await sendNotificationToUser(1, '房产删除已通过',
            `${item[0].name} 的房产删除申请已通过，房号: ${item[0].room_number}。`,
            'approval', '');
        } else if (item[0].apply_type === 'change') {
          // Property change: add new or update existing
          const mismatchFields = item[0].mismatch_fields ? JSON.parse(item[0].mismatch_fields) : {};
          const oldId = mismatchFields.old_id;

          if (oldId) {
            // Modify existing property: update room number
            await db.update(whitelist).set({
              room: item[0].room_number,
              updated_at: now,
              updated_by: userId,
            }).where(eq(whitelist.id, oldId));
          } else {
            // Add new property: insert whitelist entry
            await db.insert(whitelist).values({
              name: item[0].name,
              id_card: item[0].id_card,
              phone: item[0].phone,
              email: item[0].email || null,
              room: item[0].room_number,
              status: 'active',
              created_by: userId,
            });
          }

          const allUsers = await db.select({ id: users.id, id_card: users.id_card }).from(users);
          const fullIdCard = decrypt(item[0].id_card);
          const matchedUser = allUsers.find(u => { try { return decrypt(u.id_card || '') === fullIdCard; } catch { return false; } });
          if (matchedUser) {
            // Update user's room_number to the latest property
            const allWl = await db.select().from(whitelist);
            const myRooms = allWl.filter(w => {
              try { return decrypt(w.id_card) === fullIdCard; } catch { return false; }
            });
            await db.update(users).set({
              room_number: myRooms.length > 0 ? myRooms[myRooms.length - 1].room : item[0].room_number,
              updated_at: now,
            }).where(eq(users.id, matchedUser.id));

            await sendNotificationToUser(matchedUser.id, '房产变更已通过',
              `您的房产变更申请已通过审核，涉及房号: ${item[0].room_number}。`,
              'approval', '');
          }

        } else {
          // Register: insert into whitelist and send single unified activation email
          await db.insert(whitelist).values({
            name: item[0].name,
            id_card: item[0].id_card,
            phone: item[0].phone,
            email: item[0].email || null,
            room: item[0].room_number,
            status: 'pending',
            created_by: userId,
          });

          if (toEmail) {
            try { await sendVerificationCode(toEmail, code, item[0].name, activationLink); } catch {}
          }
        }

        await db.insert(changeLogs).values({
          target_type: item[0].apply_type === 'register' ? 'whitelist' : 'approval',
          target_id: id,
          field: 'status', new_value: 'approved',
          operator_id: userId, operator_name: userName,
          created_at: now,
        });
      }
      return success(null, `已批量通过 ${ids.length} 条申请`);
    } else {
      for (const id of ids) {
        const item = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
        if (!item[0] || item[0].status !== 'pending') continue;

        await db.update(approvals).set({
          status: 'rejected',
          reviewed_by: userId,
          reviewed_name: userName,
          reviewed_at: now,
          remark: reject_reason?.trim() || null,
        }).where(eq(approvals.id, id));

        const toEmail = item[0].email || '';
        const toPhone = item[0].phone ? decrypt(item[0].phone) : '';
        const reason = reject_reason?.trim() || '未通过审核';

        await sendNotificationToUnregistered(toEmail, toPhone,
          '申请未通过', `很抱歉，您的申请未通过审核。\n原因: ${reason}`);

        if (item[0].id_card) {
          const allUsers = await db.select({ id: users.id, id_card: users.id_card }).from(users);
          const fullIdCard = decrypt(item[0].id_card);
          const matchedUser = allUsers.find(u => { try { return decrypt(u.id_card || '') === fullIdCard; } catch { return false; } });
          if (matchedUser) {
            const typeLabel = item[0].apply_type === 'delete' ? '房产删除' :
              item[0].apply_type === 'change' ? '房产变更' : '注册';
            await sendNotificationToUser(matchedUser.id, `${typeLabel}申请未通过`,
              `您的${typeLabel}申请未通过审核。\n原因: ${reason}`,
              'approval', '');
          }
        }

        await db.insert(changeLogs).values({
          target_type: 'approval', target_id: id,
          field: 'status', new_value: 'rejected',
          old_value: 'pending',
          operator_id: userId, operator_name: userName,
          created_at: now,
        });
      }
      return success(null, `已批量拒绝 ${ids.length} 条申请`);
    }
  });

  app.patch('/api/admin/approvals/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const { action, remark, reject_reason, mismatch_fields } = req.body as any;
    if (!['approve', 'reject', 'withdraw'].includes(action)) return fail('无效操作');

    const db = getDb();
    const item = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
    if (!item[0]) return fail('记录不存在');

    if (action === 'withdraw') {
      if (item[0].status === 'pending') return fail('待审核记录无法撤回，请直接审核');
      await db.update(approvals).set({
        status: 'pending', reviewed_by: null, reviewed_at: null,
        verify_code: null, code_expires_at: null, remark: null,
        reviewed_name: null,
      }).where(eq(approvals.id, id));
      return success(null, '已撤回');
    }

    if (item[0].status !== 'pending') return fail('已处理过');

    const now = beijingTime();
    const userId = (req.user as any).sub;
    const userRows = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const userName = userRows[0]?.name || '管理员';

    if (action === 'approve') {
      const code = generateCode();
      const activationToken = crypto.randomUUID();
      const configRows = await db.select().from(configs);
      const cfgMap: Record<string, string> = {};
      for (const r of configRows) cfgMap[r.key] = r.value;
      const expireMinutes = parseInt(cfgMap.verify_code_expire_minutes || '30');
      const expiresAt = new Date(Date.now() + expireMinutes * 60000).toLocaleString('sv-SE', { timeZone: 'Asia/Shanghai' }).replace('T', ' ');
      const siteUrl = cfgMap.site_url || 'http://localhost:11111';
      const activationLink = `${siteUrl}/activate?token=${activationToken}`;

      await db.update(approvals).set({
        status: 'approved',
        verify_code: code,
        code_expires_at: expiresAt,
        activation_token: activationToken,
        reviewed_by: userId,
        reviewed_name: userName,
        reviewed_at: now,
        mismatch_fields: mismatch_fields || null,
      }).where(eq(approvals.id, id));

      const toEmail = item[0].email || '';
      const toPhone = item[0].phone ? decrypt(item[0].phone) : '';

      if (item[0].apply_type === 'delete') {
        try {
          const mf = item[0].mismatch_fields ? JSON.parse(item[0].mismatch_fields) : {};
          const delId = mf.del_id;
          if (delId) {
            await db.delete(whitelist).where(eq(whitelist.id, delId));
            const allWl = await db.select().from(whitelist);
            const fullIdCard = decrypt(item[0].id_card);
            const remaining = allWl.filter(w => { try { return decrypt(w.id_card) === fullIdCard; } catch { return false; } });
            const allUsers = await db.select().from(users);
            for (const uu of allUsers) {
              try {
                if (decrypt(uu.id_card || '') === fullIdCard) {
                  await db.update(users).set({ room_number: remaining.length > 0 ? remaining[0].room : null, updated_at: now }).where(eq(users.id, uu.id));
                }
              } catch {}
            }
          }
        } catch {}
        await sendNotificationToUnregistered(toEmail, toPhone, '房产删除已通过', `您的房产删除申请已通过审核。`);
        const allUsers = await db.select({ id: users.id, id_card: users.id_card }).from(users);
        const fullIdCard2 = decrypt(item[0].id_card);
        const matchedUser2 = allUsers.find(u => { try { return decrypt(u.id_card || '') === fullIdCard2; } catch { return false; } });
        if (matchedUser2) {
          await sendNotificationToUser(matchedUser2.id, '房产删除已通过', `您的房产删除申请已通过审核，房号: ${item[0].room_number}。`, 'approval', '');
        }
      } else if (item[0].apply_type === 'change') {
        const mf = item[0].mismatch_fields ? JSON.parse(item[0].mismatch_fields) : {};
        const oldId = mf.old_id;
        if (oldId) {
          await db.update(whitelist).set({ room: item[0].room_number, updated_at: now, updated_by: userId }).where(eq(whitelist.id, oldId));
        } else {
          await db.insert(whitelist).values({
            name: item[0].name, id_card: item[0].id_card, phone: item[0].phone,
            email: item[0].email || null, room: item[0].room_number, status: 'active', created_by: userId,
          });
        }
        const allUsers = await db.select({ id: users.id, id_card: users.id_card }).from(users);
        const fullIdCard = decrypt(item[0].id_card);
        const matchedUser = allUsers.find(u => { try { return decrypt(u.id_card || '') === fullIdCard; } catch { return false; } });
        if (matchedUser) {
          const allWl = await db.select().from(whitelist);
          const myRooms = allWl.filter(w => { try { return decrypt(w.id_card) === fullIdCard; } catch { return false; } });
          await db.update(users).set({ room_number: myRooms.length > 0 ? myRooms[myRooms.length - 1].room : item[0].room_number, updated_at: now }).where(eq(users.id, matchedUser.id));
          await sendNotificationToUser(matchedUser.id, '房产变更已通过', `您的房产变更申请已通过审核，涉及房号: ${item[0].room_number}。`, 'approval', '');
        }
      } else {
        await db.insert(whitelist).values({
          name: item[0].name, id_card: item[0].id_card, phone: item[0].phone,
          email: item[0].email || null, room: item[0].room_number, status: 'pending', created_by: userId,
        });
        if (toEmail) { try { await sendVerificationCode(toEmail, code, item[0].name, activationLink); } catch {} }
      }

      await db.insert(changeLogs).values({
        target_type: item[0].apply_type === 'register' ? 'whitelist' : 'approval', target_id: id,
        field: 'status', new_value: 'approved',
        operator_id: userId, operator_name: userName,
        created_at: now,
      });
    } else {
      const reason = reject_reason?.trim() || remark?.trim() || '未通过审核';
      await db.update(approvals).set({
        status: 'rejected',
        reviewed_by: userId,
        reviewed_name: userName,
        reviewed_at: now,
        remark: reason,
        mismatch_fields: mismatch_fields || null,
      }).where(eq(approvals.id, id));

      const toEmail = item[0].email || '';
      const toPhone = item[0].phone ? decrypt(item[0].phone) : '';
      await sendNotificationToUnregistered(toEmail, toPhone,
        '申请未通过', `很抱歉，您的申请未通过审核。\n原因: ${reason}`);

      if (item[0].id_card) {
        const allUsers = await db.select({ id: users.id, id_card: users.id_card }).from(users);
        const fullIdCard = decrypt(item[0].id_card);
        const matchedUser = allUsers.find(u => { try { return decrypt(u.id_card || '') === fullIdCard; } catch { return false; } });
        if (matchedUser) {
          const typeLabel = item[0].apply_type === 'delete' ? '房产删除' :
            item[0].apply_type === 'change' ? '房产变更' : '注册';
          await sendNotificationToUser(matchedUser.id, `${typeLabel}申请未通过`,
            `您的${typeLabel}申请未通过审核。\n原因: ${reason}`,
            'approval', '');
        }
      }

      await db.insert(changeLogs).values({
        target_type: 'approval', target_id: id,
        field: 'status', new_value: 'rejected',
        old_value: 'pending',
        operator_id: userId, operator_name: userName,
        created_at: now,
      });
    }

    return success(null, action === 'approve' ? '已通过，验证码已发送' : '已拒绝');
  });
}
