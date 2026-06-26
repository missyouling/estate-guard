import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { media, categories, users, configs } from '../db/schema';
import { and, desc, sql, eq, inArray } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import { generateEvidencePdf } from '../services/exportPdf';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';

export default async function exportRoutes(app: FastifyInstance) {

  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/admin/export/evidence', async (req) => {
    const query = req.query as any;
    const db = getDb();

    let conditions = [eq(media.status, 'active')];
    if ((req.user as any).role !== 'admin') conditions.push(eq(media.user_id, (req.user as any).sub));
    if (query.category_id) conditions.push(eq(media.category_id, parseInt(query.category_id)));
    if (query.date_from) conditions.push(sql`${media.uploaded_at} >= ${query.date_from}`);
    if (query.date_to) conditions.push(sql`${media.uploaded_at} <= ${query.date_to}`);
    if (query.type) conditions.push(eq(media.type, query.type));

    const page = parseInt(query.page || '1');
    const limit = Math.min(parseInt(query.limit || '100'), 200);
    const offset = (page - 1) * limit;

    const allItems = await db.select().from(media).where(and(...conditions)).orderBy(desc(media.uploaded_at));
    const total = allItems.length;
    const pageItems = allItems.slice(offset, offset + limit);

    const catRows = await db.select().from(categories);
    const catMap = new Map(catRows.map(c => [c.id, c.name]));

    const userRows = await db.select().from(users);
    const userMap = new Map(userRows.map(u => [u.id, u.name]));

    const result = pageItems.map(item => {
      const url = item.url || '';
      let storageLabel = '本地存储';
      if (url.startsWith('http://') || url.startsWith('https://')) {
        if (url.includes('s3.') || url.includes('amazonaws.com')) storageLabel = '对象存储';
        else storageLabel = '图床';
      }
      return {
        id: item.id,
        record_no: item.record_no,
        type: item.type,
        category_name: catMap.get(item.category_id || 0) || '',
        original_name: item.original_name,
        url: item.url,
        thumbnail_url: item.thumbnail_url,
        address: item.address,
        user_name: userMap.get(item.user_id) || '',
        storage_location: storageLabel,
        watermark_applied: item.watermark_applied,
        file_hash: item.file_hash,
        uploaded_at: item.uploaded_at,
        size_bytes: item.size_bytes,
      };
    });

    return success({ items: result, total, page, limit });
  });

  app.post('/api/admin/export/evidence', async (req, reply) => {
    const { category_id, date_from, date_to, type, record_nos } = req.body as any;
    const db = getDb();

    let conditions = [eq(media.status, 'active')];
    if (category_id) conditions.push(eq(media.category_id, parseInt(category_id)));
    if (date_from) conditions.push(sql`${media.uploaded_at} >= ${date_from}`);
    if (date_to) conditions.push(sql`${media.uploaded_at} <= ${date_to}`);
    if (type) conditions.push(eq(media.type, type));
    if (record_nos && Array.isArray(record_nos) && record_nos.length > 0) {
      conditions.push(inArray(media.record_no, record_nos));
    }

    const items = await db.select().from(media).where(and(...conditions)).orderBy(desc(media.uploaded_at));

    const catRows = await db.select().from(categories);
    const catMap = new Map(catRows.map(c => [c.id, c.name]));

    const pdfItems = items.map(item => ({
      record_no: item.record_no,
      thumbnail_url: item.thumbnail_url || '',
      type: item.type,
      category_name: catMap.get(item.category_id || 0) || '',
      uploaded_at: item.uploaded_at,
      address: item.address || '',
      user_name: '',
      remark: item.remark || '',
    }));

    const catName = category_id ? (catMap.get(parseInt(category_id)) || '') : '';

    const doc = generateEvidencePdf(pdfItems, {
      categoryName: catName,
      dateFrom: date_from || '',
      dateTo: date_to || '',
    });

    const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="evidence_${new Date().toISOString().slice(0, 10)}.pdf"`);
    return reply.send(pdfBuffer);
  });

  app.post('/api/admin/export/download', async (req, reply) => {
    try {
      const { urls } = req.body as any;
      if (!urls || !Array.isArray(urls) || urls.length === 0) return reply.send(fail('无文件'));

      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const tmpDir = path.join(uploadDir, 'temp');
      fs.mkdirSync(tmpDir, { recursive: true });
      const zipPath = path.join(tmpDir, `dl_${Date.now()}.zip`);
      const fileList = urls.map((f: any) => {
        const urlPath = (f.url || '').replace(/^\/files\//, '');
        return path.join(uploadDir, urlPath);
      }).filter((p: string) => fs.existsSync(p));

      if (fileList.length === 0) return reply.send(fail('文件不存在'));
      if (fileList.length === 1) {
        return reply.send(fs.createReadStream(fileList[0]));
      }

      execSync(`cd "${uploadDir}" && zip -j "${zipPath}" ${fileList.map((f: string) => `"${path.relative(uploadDir, f)}"`).join(' ')} 2>/dev/null`, { timeout: 30000 });
      if (!fs.existsSync(zipPath)) return reply.send(fail('打包失败'));

      const stream = fs.createReadStream(zipPath);
      stream.on('end', () => { try { fs.unlinkSync(zipPath); } catch {} });
      reply.header('Content-Type', 'application/zip');
      reply.header('Content-Disposition', 'attachment; filename="证据文件.zip"');
      return reply.send(stream);
    } catch (err: any) {
      console.error('[Download] Error:', err.message, err.stack);
      return reply.status(500).send(fail('下载失败: ' + err.message));
    }
  });
}
