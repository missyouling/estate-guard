import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { whitelist, users, changeLogs, propertyFiles } from '../db/schema';
import { eq, and, sql, inArray, desc } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { encrypt, decrypt, maskIdCard, maskPhone } from '../services/crypto';
import { isValidIdCard, isValidPhone } from '../utils/validator';
import { parse } from 'csv-parse/sync';
import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { beijingTime } from '../utils/time';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

function savePropertyFile(content: Buffer, originalName: string): string {
  const ext = path.extname(originalName).toLowerCase() || '.jpg';
  const filename = `prop_${uuid()}${ext}`;
  const destDir = path.join(uploadDir, 'properties');
  fs.mkdirSync(destDir, { recursive: true });
  const destPath = path.join(destDir, filename);
  fs.writeFileSync(destPath, content);
  return `/files/properties/${filename}`;
}

export default async function whitelistRoutes(app: FastifyInstance) {

  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
    if ((req.user as any).role !== 'admin') return reply.status(403).send(fail('需要管理员权限'));
  });

  app.get('/api/admin/whitelist', async (req) => {
    const query = req.query as any;
    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '50'), 500);
    const offset = (page - 1) * limit;
    const db = getDb();

    let conditions = [sql`1=1`];
    if (query.status && query.status !== 'all') {
      conditions.push(eq(whitelist.status, query.status));
    }
    if (query.keyword) {
      const kw = `%${String(query.keyword).toLowerCase()}%`;
      conditions.push(sql`(LOWER(name) LIKE ${kw} OR room LIKE ${kw} OR LOWER(remark) LIKE ${kw})`);
    }
    if (query.building) {
      conditions.push(sql`room LIKE ${query.building + '-%'}`);
    }

    const all = await db.select().from(whitelist).where(and(...conditions)).orderBy(desc(whitelist.created_at));
    const allUsers = await db.select().from(users);
    const registeredPhones = new Set(allUsers.map(u => decrypt(u.phone || '')));
    const registeredIdCards = new Set(allUsers.map(u => decrypt(u.id_card || '')));

    const idCardCount: Record<string, number> = {};
    for (const w of all) {
      const c = decrypt(w.id_card);
      idCardCount[c] = (idCardCount[c] || 0) + 1;
    }

    const total = all.length;
    const items = all.slice(offset, offset + limit).map(w => {
      const phoneDecrypted = decrypt(w.phone);
      const idCardDecrypted = decrypt(w.id_card);
      const hasUser = registeredPhones.has(phoneDecrypted) || registeredIdCards.has(idCardDecrypted);
      return {
        id: w.id,
        name: w.name,
        id_card: idCardDecrypted,
        phone: phoneDecrypted,
        room: w.room,
        email: w.email || '',
        remark: w.remark,
        property_info: w.property_info,
        property_count: idCardCount[idCardDecrypted] || 1,
        status: hasUser ? 'registered' : (w.status || 'pending'),
        ip_address: w.ip_address || '',
        created_by: w.created_by,
        created_at: w.created_at,
        updated_at: w.updated_at,
      };
    });

    return success({ items, total, page, limit });
  });

  app.get('/api/admin/whitelist/export', async (req) => {
    const db = getDb();
    const all = await db.select().from(whitelist).orderBy(desc(whitelist.created_at));
    const allUsers = await db.select().from(users);
    const registeredPhones = new Set(allUsers.map(u => decrypt(u.phone || '')));
    const registeredIdCards = new Set(allUsers.map(u => decrypt(u.id_card || '')));

    const items = all.map(w => {
      const phoneDecrypted = decrypt(w.phone);
      const idCardDecrypted = decrypt(w.id_card);
      const hasUser = registeredPhones.has(phoneDecrypted) || registeredIdCards.has(idCardDecrypted);
      return {
        name: w.name, id_card: idCardDecrypted, phone: phoneDecrypted,
        room: w.room, email: w.email || '', remark: w.remark,
        status: hasUser ? '已注册' : (w.status === 'disabled' ? '已禁用' : '待注册'),
        created_at: w.created_at,
      };
    });
    return success(items);
  });

  app.get('/api/admin/whitelist/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const db = getDb();
    const item = await db.select().from(whitelist).where(eq(whitelist.id, id)).limit(1);
    if (!item[0]) return fail('记录不存在');

    const allUsers = await db.select().from(users);
    const registeredPhones = new Set(allUsers.map(u => decrypt(u.phone || '')));
    const registeredIdCards = new Set(allUsers.map(u => decrypt(u.id_card || '')));
    const phoneDecrypted = decrypt(item[0].phone);
    const idCardDecrypted = decrypt(item[0].id_card);
    const hasUser = registeredPhones.has(phoneDecrypted) || registeredIdCards.has(idCardDecrypted);

    return success({
      ...item[0],
      id_card: idCardDecrypted,
      phone: phoneDecrypted,
      status: hasUser ? 'registered' : (item[0].status || 'pending'),
    });
  });

  app.post('/api/admin/whitelist', async (req) => {
    let name = '', id_card = '', phone = '', room = '', remark = '', property_info = '', email = '';
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          switch (part.fieldname) {
            case 'name': name = String(part.value).trim(); break;
            case 'id_card': id_card = String(part.value).trim().toUpperCase(); break;
            case 'phone': phone = String(part.value).trim(); break;
            case 'room': room = String(part.value).trim(); break;
            case 'email': email = String(part.value).trim(); break;
            case 'remark': remark = String(part.value).trim(); break;
            case 'property_info': property_info = String(part.value).trim(); break;
          }
        } else if (part.type === 'file' && part.fieldname === 'property_file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          property_info = savePropertyFile(Buffer.concat(chunks), part.filename || 'property.jpg');
        }
      }
    } else {
      const body = req.body as any;
      name = body.name?.trim() || '';
      id_card = body.id_card?.trim()?.toUpperCase() || '';
      phone = body.phone?.trim() || '';
      room = body.room?.trim() || '';
      remark = body.remark?.trim() || '';
      email = body.email?.trim() || '';
      property_info = body.property_info?.trim() || '';
    }

    if (!name || !id_card || !phone || !room) return fail('请填写所有必填字段');
    const idCardStr = String(id_card).trim().toUpperCase();
    const phoneStr = String(phone).trim();
    if (!isValidIdCard(idCardStr)) return fail('身份证号格式不正确');
    if (!isValidPhone(phoneStr)) return fail('手机号格式不正确');

    const db = getDb();
    const allExisting = await db.select().from(whitelist);
    const dupByNameCard = allExisting.find(w => w.name === name.trim() && decrypt(w.id_card) === idCardStr);
    if (dupByNameCard) return fail('该业主（相同姓名和身份证号）已存在');
    const dupByPhone = allExisting.find(w => decrypt(w.phone) === phoneStr);
    if (dupByPhone) return fail('该手机号已绑定其他业主，请勿重复使用');

    const now = beijingTime();
    const userId = (req.user as any).sub;

    const insertResult = await db.insert(whitelist).values({
      name: name.trim(),
      id_card: encrypt(idCardStr),
      phone: encrypt(phoneStr),
      room: room.trim(),
      remark: remark?.trim() || null,
      email: email?.trim() || null,
      property_info: property_info?.trim() || null,
      status: 'pending',
      ip_address: req.ip || '',
      created_by: userId,
      created_at: now,
    });
    const newId = Number(insertResult.lastInsertRowid);

    const userRows = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const userName = userRows[0]?.name || '管理员';
    await db.insert(changeLogs).values({
      target_type: 'whitelist', target_id: newId, field: 'create',
      new_value: `添加白名单: ${name.trim()} / ${room.trim()}`,
      operator_id: userId, operator_name: userName,
      created_at: now,
    });

    return success(null, '已添加');
  });

  app.post('/api/admin/whitelist/import', async (req) => {
    try {
      const parts = req.parts();
      let csvContent = '';
      for await (const part of parts) {
        if (part.type === 'file' && part.fieldname === 'file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          csvContent = Buffer.concat(chunks).toString('utf-8');
        }
      }

      if (!csvContent) return fail('请上传 CSV 文件');

      const records: any[] = parse(csvContent, {
        columns: true, skip_empty_lines: true, bom: true,
      });

      const results: { name: string; id_card: string; phone: string; room: string; success: boolean; reason?: string }[] = [];
      const db = getDb();
      const userId = (req.user as any).sub;
      const now = beijingTime();

      for (const row of records) {
        const name = String(row['姓名'] || row['name'] || '').trim();
        const id_card = String(row['身份证号'] || row['id_card'] || '').trim().toUpperCase();
        const phone = String(row['手机号'] || row['phone'] || '').trim();
        const room = String(row['房号'] || row['room'] || '').trim();
        const remark = String(row['备注'] || row['remark'] || '').trim();
        const email = String(row['邮箱'] || row['email'] || '').trim();

        if (!name || !id_card || !phone || !room) {
          results.push({ name, id_card, phone, room, success: false, reason: '必填字段缺失' });
          continue;
        }
        if (!isValidIdCard(id_card) || !isValidPhone(phone)) {
          results.push({ name, id_card, phone, room, success: false, reason: '格式不正确' });
          continue;
        }

        const allExisting = await db.select().from(whitelist);
        if (allExisting.find(w => w.name === name && decrypt(w.id_card) === id_card)) {
          results.push({ name, id_card, phone, room, success: false, reason: '姓名+身份证已存在' });
          continue;
        }
        if (allExisting.find(w => decrypt(w.phone) === phone)) {
          results.push({ name, id_card, phone, room, success: false, reason: '手机号已被占用' });
          continue;
        }

        await db.insert(whitelist).values({
          name, id_card: encrypt(id_card), phone: encrypt(phone),
          room, remark: remark || null, email: email || null,
          status: 'pending', created_by: userId, created_at: now,
        });
        results.push({ name, id_card, phone, room, success: true });
      }

      const successCount = results.filter(r => r.success).length;
      return success({
        imported: successCount,
        total: results.length,
        details: results,
      }, `成功导入 ${successCount}/${results.length} 条记录`);
    } catch (err: any) {
      return fail('导入失败: ' + err.message);
    }
  });

  app.patch('/api/admin/whitelist/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const contentType = req.headers['content-type'] || '';
    const db = getDb();
    const old = await db.select().from(whitelist).where(eq(whitelist.id, id)).limit(1);
    if (!old[0]) return fail('记录不存在');
    const userId = (req.user as any).sub;
    const userRows = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const userName = userRows[0]?.name || '管理员';
    const now = beijingTime();

    const updateData: any = { updated_at: now, updated_by: userId };
    const changes: { field: string; old_value: string; new_value: string }[] = [];

    if (contentType.includes('multipart')) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          switch (part.fieldname) {
            case 'name': {
              const v = String(part.value).trim();
              if (v && v !== old[0].name) {
                changes.push({ field: '姓名', old_value: old[0].name, new_value: v });
                updateData.name = v;
              }
              break;
            }
            case 'id_card': {
              const v = encrypt(String(part.value).trim().toUpperCase());
              if (decrypt(old[0].id_card) !== decrypt(v)) {
                changes.push({ field: '身份证号', old_value: decrypt(old[0].id_card), new_value: decrypt(v) });
                updateData.id_card = v;
              }
              break;
            }
            case 'phone': {
              const v = encrypt(String(part.value).trim());
              if (decrypt(old[0].phone) !== decrypt(v)) {
                changes.push({ field: '手机号', old_value: decrypt(old[0].phone), new_value: decrypt(v) });
                updateData.phone = v;
              }
              break;
            }
            case 'room': {
              const v = String(part.value).trim();
              if (v && v !== old[0].room) {
                changes.push({ field: '房号', old_value: old[0].room, new_value: v });
                updateData.room = v;
              }
              break;
            }
            case 'email': {
              const v = String(part.value).trim();
              if (v !== (old[0].email || '')) {
                changes.push({ field: '邮箱', old_value: old[0].email || '', new_value: v });
                updateData.email = v || null;
              }
              break;
            }
            case 'remark': {
              const v = String(part.value).trim();
              if (v !== (old[0].remark || '')) {
                changes.push({ field: '备注', old_value: old[0].remark || '', new_value: v });
                updateData.remark = v || null;
              }
              break;
            }
            case 'status': {
              const v = String(part.value).trim();
              if (v !== (old[0].status || '')) {
                changes.push({ field: '状态', old_value: old[0].status || '', new_value: v });
                updateData.status = v;
              }
              break;
            }
          }
        } else if (part.type === 'file' && part.fieldname === 'property_file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          const url = savePropertyFile(Buffer.concat(chunks), part.filename || 'property.jpg');
          changes.push({ field: '房产信息', old_value: old[0].property_info || '', new_value: url });
          updateData.property_info = url;
        }
      }
    } else {
      const body = req.body as any;
      if (body.name && body.name !== old[0].name) {
        changes.push({ field: '姓名', old_value: old[0].name, new_value: body.name });
        updateData.name = body.name.trim();
      }
      if (body.id_card) {
        const newCard = encrypt(String(body.id_card).trim().toUpperCase());
        if (decrypt(old[0].id_card) !== decrypt(newCard)) {
          changes.push({ field: '身份证号', old_value: decrypt(old[0].id_card), new_value: decrypt(newCard) });
          updateData.id_card = newCard;
        }
      }
      if (body.phone) {
        const newPhone = encrypt(String(body.phone).trim());
        if (decrypt(old[0].phone) !== decrypt(newPhone)) {
          changes.push({ field: '手机号', old_value: decrypt(old[0].phone), new_value: decrypt(newPhone) });
          updateData.phone = newPhone;
        }
      }
      if (body.room !== undefined && body.room !== old[0].room) {
        changes.push({ field: '房号', old_value: old[0].room, new_value: body.room });
        updateData.room = body.room.trim();
      }
      if (body.email !== undefined) {
        const v = body.email.trim();
        if (v !== (old[0].email || '')) {
          changes.push({ field: '邮箱', old_value: old[0].email || '', new_value: v });
          updateData.email = v || null;
        }
      }
      if (body.remark !== undefined) {
        const v = body.remark.trim();
        if (v !== (old[0].remark || '')) {
          changes.push({ field: '备注', old_value: old[0].remark || '', new_value: v });
          updateData.remark = v || null;
        }
      }
      if (body.status) {
        updateData.status = body.status;
      }
      if (body.property_info !== undefined) {
        updateData.property_info = body.property_info;
      }
    }

    if (Object.keys(updateData).length <= 2) return fail('无修改内容');

    await db.update(whitelist).set(updateData).where(eq(whitelist.id, id));

    for (const c of changes) {
      await db.insert(changeLogs).values({
        target_type: 'whitelist', target_id: id,
        field: c.field, old_value: c.old_value, new_value: c.new_value,
        operator_id: userId, operator_name: userName,
        created_at: now,
      });
    }

    return success(null, '已更新');
  });

  app.post('/api/admin/whitelist/batch', async (req) => {
    const { ids, action, value } = req.body as any;
    if (!ids || !Array.isArray(ids) || ids.length === 0) return fail('请选择记录');
    const db = getDb();
    const userId = (req.user as any).sub;
    const userRows = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const userName = userRows[0]?.name || '管理员';
    const now = beijingTime();

    if (action === 'enable') {
      for (const id of ids) {
        await db.update(whitelist).set({ status: 'pending', updated_at: now, updated_by: userId }).where(eq(whitelist.id, id));
        await db.insert(changeLogs).values({
          target_type: 'whitelist', target_id: id,
          field: '状态', old_value: 'disabled', new_value: 'pending',
          operator_id: userId, operator_name: userName, created_at: now,
        });
      }
      return success(null, `已启用 ${ids.length} 条记录`);
    } else if (action === 'disable') {
      for (const id of ids) {
        await db.update(whitelist).set({ status: 'disabled', updated_at: now, updated_by: userId }).where(eq(whitelist.id, id));
        await db.insert(changeLogs).values({
          target_type: 'whitelist', target_id: id,
          field: '状态', old_value: 'pending', new_value: 'disabled',
          operator_id: userId, operator_name: userName, created_at: now,
        });
      }
      return success(null, `已禁用 ${ids.length} 条记录`);
    } else if (action === 'delete') {
      for (const id of ids) {
        await db.delete(whitelist).where(eq(whitelist.id, id));
      }
      return success(null, `已删除 ${ids.length} 条记录`);
    }

    return fail('无效操作');
  });

  app.delete('/api/admin/whitelist/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const db = getDb();
    await db.delete(whitelist).where(eq(whitelist.id, id));
    return success(null, '已删除');
  });

  app.get('/api/admin/whitelist/:id/changelogs', async (req) => {
    const id = parseInt((req.params as any).id);
    const db = getDb();
    const rows = await db.select().from(changeLogs)
      .where(and(eq(changeLogs.target_type, 'whitelist'), eq(changeLogs.target_id, id)))
      .orderBy(desc(changeLogs.created_at));
    return success(rows);
  });

  app.get('/api/admin/whitelist/:id/property-files', async (req) => {
    const id = parseInt((req.params as any).id);
    const db = getDb();
    const rows = await db.select().from(propertyFiles)
      .where(eq(propertyFiles.owner_id, id))
      .orderBy(desc(propertyFiles.created_at));
    return success(rows);
  });

  app.post('/api/admin/whitelist/:id/property-files', async (req) => {
    const ownerId = parseInt((req.params as any).id);
    const parts = req.parts();
    let remark = '';
    let fileBuffer: Buffer | null = null;
    let fileName = '';

    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'remark') {
        remark = String(part.value).trim();
      } else if (part.type === 'file') {
        fileName = part.filename || 'property.jpg';
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) chunks.push(chunk);
        fileBuffer = Buffer.concat(chunks);
      }
    }

    if (!fileBuffer) return fail('请上传文件');
    const url = savePropertyFile(fileBuffer, fileName);

    const db = getDb();
    await db.insert(propertyFiles).values({
      owner_id: ownerId,
      filename: path.basename(url),
      original_name: fileName,
      url,
      remark: remark || null,
      uploaded_by: (req.user as any).sub,
    });

    return success(null, '已上传');
  });

  app.delete('/api/admin/whitelist/property-files/:id', async (req) => {
    const id = parseInt((req.params as any).id);
    const db = getDb();
    await db.delete(propertyFiles).where(eq(propertyFiles.id, id));
    return success(null, '已删除');
  });

  app.get('/api/admin/whitelist/:id/properties', async (req) => {
    const id = parseInt((req.params as any).id);
    const db = getDb();
    const item = await db.select().from(whitelist).where(eq(whitelist.id, id)).limit(1);
    if (!item[0]) return fail('记录不存在');
    const idCardDecrypted = decrypt(item[0].id_card);
    const allWl = await db.select().from(whitelist);
    const allFiles = await db.select().from(propertyFiles);
    const sameOwner = allWl.filter(w => {
      try { return decrypt(w.id_card) === idCardDecrypted; } catch { return false; }
    });
    const allUsers = await db.select().from(users);
    const registeredPhones = new Set(allUsers.map(u => decrypt(u.phone || '')));
    const registeredIdCards = new Set(allUsers.map(u => decrypt(u.id_card || '')));
    const result = sameOwner.map(w => {
      const docs = allFiles.filter(f => f.owner_id === w.id);
      const wPhone = decrypt(w.phone);
      const wCard = decrypt(w.id_card);
      const hasUser = registeredPhones.has(wPhone) || registeredIdCards.has(wCard);
      const coOwners = allWl.filter(x => {
        try { return x.id !== w.id && decrypt(x.id_card) === idCardDecrypted; } catch { return false; }
      }).map(x => ({ id: x.id, name: x.name, room: x.room, phone: maskPhone(decrypt(x.phone)), id_card: maskIdCard(decrypt(x.id_card)) }));
      return {
        id: w.id, name: w.name, room: w.room,
        id_card: maskIdCard(wCard), phone: maskPhone(wPhone),
        email: w.email, property_info: w.property_info,
        status: hasUser ? 'registered' : (w.status || 'pending'),
        docs, co_owners: coOwners, created_at: w.created_at,
      };
    });
    return success(result);
  });

  app.get('/api/admin/whitelist/bound-owner', async (req) => {
    const db = getDb();
    const userId = (req.user as any).sub;
    const configRows = await db.select().from((await import('../db/schema')).configs).where(eq((await import('../db/schema')).configs.key, 'bound_owner_id'));
    const boundId = parseInt(configRows[0]?.value || '0');
    if (!boundId) return success(null);
    const wl = await db.select().from(whitelist).where(eq(whitelist.id, boundId)).limit(1);
    if (!wl[0]) return success(null);
    const allUsers = await db.select().from(users);
    const registeredPhones = new Set(allUsers.map(u => decrypt(u.phone || '')));
    const registeredIdCards = new Set(allUsers.map(u => decrypt(u.id_card || '')));
    const wPhone = decrypt(wl[0].phone);
    const wCard = decrypt(wl[0].id_card);
    const hasUser = registeredPhones.has(wPhone) || registeredIdCards.has(wCard);
    const communityRows = await db.select().from((await import('../db/schema')).configs).where(eq((await import('../db/schema')).configs.key, 'community_name'));
    const communityName = communityRows[0]?.value || '';
    return success({
      id: wl[0].id, name: wl[0].name, room: wl[0].room,
      id_card: maskIdCard(wCard), phone: maskPhone(wPhone),
      email: wl[0].email,
      status: hasUser ? 'registered' : (wl[0].status || 'pending'),
      community_name: communityName,
    });
  });

  app.post('/api/admin/whitelist/search', async (req) => {
    const { name, id_card } = req.body as any;
    if (!name || !id_card) return fail('请提供姓名和身份证号');
    const db = getDb();
    const allWl = await db.select().from(whitelist);
    const match = allWl.find(w => w.name === name.trim() && decrypt(w.id_card) === id_card.trim().toUpperCase());
    if (!match) return success({ found: false, data: null });
    return success({
      found: true,
      data: {
        id: match.id, name: match.name, room: match.room,
        id_card: maskIdCard(decrypt(match.id_card)),
        phone: maskPhone(decrypt(match.phone)),
        email: match.email, status: match.status,
      },
    });
  });

  app.post('/api/admin/whitelist/create-and-bind', async (req) => {
    let name = '', id_card = '', phone = '', room = '', remark = '', property_info = '', email = '';
    const contentType = req.headers['content-type'] || '';

    if (contentType.includes('multipart')) {
      const parts = req.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          switch (part.fieldname) {
            case 'name': name = String(part.value).trim(); break;
            case 'id_card': id_card = String(part.value).trim().toUpperCase(); break;
            case 'phone': phone = String(part.value).trim(); break;
            case 'room': room = String(part.value).trim(); break;
            case 'email': email = String(part.value).trim(); break;
            case 'remark': remark = String(part.value).trim(); break;
            case 'property_info': property_info = String(part.value).trim(); break;
          }
        } else if (part.type === 'file' && part.fieldname === 'property_file') {
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          property_info = savePropertyFile(Buffer.concat(chunks), part.filename || 'property.jpg');
        }
      }
    } else {
      const body = req.body as any;
      name = body.name?.trim() || '';
      id_card = body.id_card?.trim()?.toUpperCase() || '';
      phone = body.phone?.trim() || '';
      room = body.room?.trim() || '';
      email = body.email?.trim() || '';
      remark = body.remark?.trim() || '';
      property_info = body.property_info || '';
    }

    if (!name || !id_card || !phone || !room) return fail('请填写所有必填字段');
    if (!isValidIdCard(id_card)) return fail('身份证号格式不正确');
    if (!isValidPhone(phone)) return fail('手机号格式不正确');

    const db = getDb();
    const allExisting = await db.select().from(whitelist);
    const dupByNameCard = allExisting.find(w => w.name === name && decrypt(w.id_card) === id_card);
    if (dupByNameCard) return fail('该业主（相同姓名和身份证号）已存在');

    const now = beijingTime();
    const userId = (req.user as any).sub;

    const insertResult = await db.insert(whitelist).values({
      name, id_card: encrypt(id_card), phone: encrypt(phone),
      room, email: email || null, remark: remark || null,
      property_info: property_info || null,
      status: 'active', ip_address: req.ip || '',
      created_by: userId, created_at: now,
    });
    const newId = Number(insertResult.lastInsertRowid);

    const userRows = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    const userName = userRows[0]?.name || '管理员';
    await db.insert(changeLogs).values({
      target_type: 'whitelist', target_id: newId, field: 'create',
      new_value: `添加白名单(绑定): ${name} / ${room}`,
      operator_id: userId, operator_name: userName,
      created_at: now,
    });

    // Auto-bind
    const configTable = (await import('../db/schema')).configs;
    const existing = await db.select().from(configTable).where(eq(configTable.key, 'bound_owner_id')).limit(1);
    if (existing[0]) {
      await db.update(configTable).set({ value: String(newId), updated_by: userId, updated_at: now }).where(eq(configTable.key, 'bound_owner_id'));
    } else {
      await db.insert(configTable).values({ key: 'bound_owner_id', value: String(newId), updated_by: userId, updated_at: now });
    }

    return success({ id: newId, name, room, id_card: maskIdCard(id_card), phone: maskPhone(phone), email }, '已添加并绑定业主身份');
  });

  app.post('/api/admin/whitelist/bind-owner', async (req) => {
    const { whitelist_id } = req.body as any;
    if (!whitelist_id) return fail('参数错误');
    const db = getDb();
    const wl = await db.select().from(whitelist).where(eq(whitelist.id, whitelist_id)).limit(1);
    if (!wl[0]) return fail('业主记录不存在');
    const configTable = (await import('../db/schema')).configs;
    const now = beijingTime();
    const existing = await db.select().from(configTable).where(eq(configTable.key, 'bound_owner_id')).limit(1);
    if (existing[0]) {
      await db.update(configTable).set({ value: String(whitelist_id), updated_by: (req.user as any).sub, updated_at: now }).where(eq(configTable.key, 'bound_owner_id'));
    } else {
      await db.insert(configTable).values({ key: 'bound_owner_id', value: String(whitelist_id), updated_by: (req.user as any).sub, updated_at: now });
    }
    // Mark whitelist entry as registered
    if (wl[0].status === 'pending') {
      await db.update(whitelist).set({ status: 'active', updated_at: now }).where(eq(whitelist.id, whitelist_id));
    }
    return success(null, '已绑定业主身份');
  });

  app.post('/api/admin/whitelist/unbind-owner', async (req) => {
    const db = getDb();
    const configTable = (await import('../db/schema')).configs;
    const now = beijingTime();
    // Find current bound owner
    const boundRow = await db.select().from(configTable).where(eq(configTable.key, 'bound_owner_id')).limit(1);
    const oldBoundId = parseInt(boundRow[0]?.value || '0');
    // Revert status to pending (only if currently active)
    if (oldBoundId) {
      const wl = await db.select().from(whitelist).where(eq(whitelist.id, oldBoundId)).limit(1);
      if (wl[0] && wl[0].status === 'active') {
        await db.update(whitelist).set({ status: 'pending', updated_at: now }).where(eq(whitelist.id, oldBoundId));
      }
    }
    await db.update(configTable).set({ value: '', updated_by: (req.user as any).sub, updated_at: now }).where(eq(configTable.key, 'bound_owner_id'));
    return success(null, '已解绑');
  });
}
