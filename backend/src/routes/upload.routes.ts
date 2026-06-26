import { FastifyInstance } from 'fastify';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { getDb } from '../db';
import { media, configs, users, categories } from '../db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import { success, fail } from '../utils/response';
import { getStorage, LocalStorage, StorageBackend } from '../services/storage';

function localUrl(key: string) { return `/files/${key.replace(/\\/g, '/')}`; }
import { getNextRecordNo } from '../services/recordNo';
import { processImage } from '../services/imageProcessor';
import { geocodeLocation } from '../services/geocoder';
import { beijingTime } from '../utils/time';
import { embedFileMetadata } from '../services/metadata';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

async function getUploadConfig() {
  const db = getDb();
  const rows = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

export default async function uploadRoutes(app: FastifyInstance) {

  app.addHook('onRequest', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
  });

  app.get('/api/upload/config', async () => {
    const cfg = await getUploadConfig();
    return success({
      maxImageSizeMb: parseInt(cfg.upload_max_image_size_mb || '20'),
      maxVideoSizeMb: parseInt(cfg.upload_max_video_size_mb || '200'),
      maxAudioSizeMb: parseInt(cfg.upload_max_audio_size_mb || '50'),
      maxCountPerBatch: parseInt(cfg.upload_max_count_per_batch || '9'),
      allowedImageTypes: JSON.parse(cfg.allowed_image_types || '["jpg","jpeg","png","gif","webp"]'),
      allowedVideoTypes: JSON.parse(cfg.allowed_video_types || '["mp4","mov","avi","webm"]'),
      allowedAudioTypes: JSON.parse(cfg.allowed_audio_types || '["mp3","wav","m4a"]'),
    });
  });

  app.post('/api/upload/image', async (req, reply) => {
    return handleUpload(req, reply, 'image');
  });

  app.post('/api/upload/video', async (req, reply) => {
    return handleUpload(req, reply, 'video');
  });

  app.post('/api/upload/audio', async (req, reply) => {
    return handleUpload(req, reply, 'audio');
  });

  app.post('/api/upload/document', async (req, reply) => {
    return handleUpload(req, reply, 'document');
  });

  async function handleUpload(req: any, reply: any, type: string) {
    try {
      const cfg = await getUploadConfig();
      const parts = req.parts();
      let fileBuffer: Buffer | null = null;
      let originalName = '';
      let mimeType = '';
      let categoryId: number | null = null;
      let latitude: number | null = null;
      let longitude: number | null = null;
      let address = '';
      let remark = '';

      for await (const part of parts) {
        if (part.type === 'field') {
          switch (part.fieldname) {
            case 'category_id': categoryId = parseInt(String(part.value)) || null; break;
            case 'latitude': latitude = parseFloat(String(part.value)) || null; break;
            case 'longitude': longitude = parseFloat(String(part.value)) || null; break;
            case 'address': address = String(part.value).trim(); break;
            case 'remark': remark = String(part.value).trim(); break;
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          originalName = part.filename || 'untitled';
          mimeType = part.mimetype;
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) chunks.push(chunk);
          fileBuffer = Buffer.concat(chunks);
        }
      }

      if (!fileBuffer) return reply.send(fail('请选择文件'));

      const ext = path.extname(originalName).toLowerCase().replace('.', '');
      const sizeLimit = type === 'image' ? parseInt(cfg.upload_max_image_size_mb || '20') * 1024 * 1024
        : type === 'video' ? parseInt(cfg.upload_max_video_size_mb || '200') * 1024 * 1024
        : type === 'audio' ? parseInt(cfg.upload_max_audio_size_mb || '50') * 1024 * 1024
        : 50 * 1024 * 1024;

      if (fileBuffer.length > sizeLimit) {
        return reply.send(fail(`文件大小超出限制 (${(sizeLimit / 1024 / 1024).toFixed(0)}MB)`));
      }

      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

      const storageId = uuid();
      const tempDir = path.join(uploadDir, 'temp');
      fs.mkdirSync(tempDir, { recursive: true });
      const tempPath = path.join(tempDir, `${storageId}.${ext}`);
      fs.writeFileSync(tempPath, fileBuffer);

      const recordNo = await getNextRecordNo();

      let geoAddress = address;
      if (!geoAddress && latitude && longitude) {
        geoAddress = await geocodeLocation(latitude, longitude);
      }

      const dbForUser = getDb();
      const userRow = await dbForUser.select().from(users).where(eq(users.id, (req.user as any).sub)).limit(1);
      const userName = userRow[0]?.name || '';
      const userRoom = userRow[0]?.room_number || '';

      const building = userRoom.match(/^(\d+)栋(\d+)单元/)?.[1] || '';
      const unit = userRoom.match(/^(\d+)栋(\d+)单元/)?.[2] || '';

      let categoryName = '';
      if (categoryId) {
        const catRow = await dbForUser.select().from(categories).where(eq(categories.id, categoryId)).limit(1);
        categoryName = catRow[0]?.name || '';
      }

      const siteConfigRow = await dbForUser.select().from(configs).where(eq(configs.key, 'site_name')).limit(1);
      const systemName = siteConfigRow[0]?.value || '';

      let finalUrl = '';
      let thumbnailUrl = '';
      let width = 0;
      let height = 0;
      let duration = 0;
      let watermarkApplied = false;
      let compressed = false;

      const storage = await getStorage();

      if (type === 'image') {
        const imageExt = 'jpg';
        const uploadKey = `images/${storageId}.${imageExt}`;

        const result = await processImage(tempPath, path.join(uploadDir, 'images'), `${storageId}.jpg`, {
          recordNo, latitude, longitude, address: geoAddress, room_number: userRoom, user_name: userName, remark,
          building, unit, file_name: originalName, file_size: fileBuffer.length, file_type: ext, category: categoryName, system_name: systemName,
        });

        const outputFile = path.join(uploadDir, 'images', `${storageId}.jpg`);
        try {
          await storage.put(uploadKey, outputFile);
        } catch (storeErr: any) {
          console.error('[Upload] Storage failed:', storeErr.message);
        }
        finalUrl = localUrl(uploadKey);

        const thumbSrc = path.join(uploadDir, 'thumbnails', `${storageId}_thumb.jpg`);
        if (fs.existsSync(thumbSrc)) {
          try {
            await storage.put(`thumbnails/${storageId}_thumb.jpg`, thumbSrc);
            thumbnailUrl = localUrl(`thumbnails/${storageId}_thumb.jpg`);
          } catch {}
        }

        width = result.width;
        height = result.height;
        watermarkApplied = result.watermarkApplied;
        compressed = true;

        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } else {
        const subDir = type === 'video' ? 'videos' : type === 'audio' ? 'audio' : 'documents';
        const destDir = path.join(uploadDir, subDir);
        fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, `${storageId}.${ext}`);
        fs.renameSync(tempPath, destPath);

        if (type === 'video') {
          embedFileMetadata(destPath, ext, {
            record_no: recordNo, user_name: userName, category_name: categoryName, uploaded_at: beijingTime(),
          });
          try {
            const { spawnSync } = await import('child_process');
            const thumbDir = path.join(uploadDir, 'thumbnails');
            fs.mkdirSync(thumbDir, { recursive: true });
            const thumbPath = path.join(thumbDir, `${storageId}_thumb.jpg`);
            spawnSync('ffmpeg', [
              '-y', '-i', destPath, '-vframes', '1', '-ss', '0',
              '-vf', 'scale=400:400:force_original_aspect_ratio=increase,crop=400:400',
              '-q:v', '3', thumbPath,
            ], { timeout: 10000 });
            if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 0) {
              const storage = await getStorage();
              await storage.put(`thumbnails/${storageId}_thumb.jpg`, thumbPath);
              thumbnailUrl = localUrl(`thumbnails/${storageId}_thumb.jpg`);
              try { fs.unlinkSync(thumbPath); } catch {}
            }
          } catch { /* video thumb optional */ }
        } else if (type === 'audio') {
          embedFileMetadata(destPath, ext, {
            record_no: recordNo, user_name: userName, category_name: categoryName, uploaded_at: beijingTime(),
          });
          try {
            const thumbDir = path.join(uploadDir, 'thumbnails');
            fs.mkdirSync(thumbDir, { recursive: true });
            const thumbPath = path.join(thumbDir, `${storageId}_thumb.jpg`);
            const audioSvg = Buffer.from(`
              <svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
                <rect width="400" height="400" fill="#1a1a2e"/>
                <g transform="translate(200,200)">
                  <circle r="80" fill="none" stroke="#007AFF" stroke-width="3" opacity="0.3"/>
                  <circle r="55" fill="none" stroke="#007AFF" stroke-width="2.5" opacity="0.5"/>
                  <path d="M-15,-25 L-15,25 M0,-38 L0,38 M15,-20 L15,20" stroke="white" stroke-width="3" stroke-linecap="round" fill="none"/>
                  <text y="100" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#666">AUDIO</text>
                </g>
              </svg>`);
            const sharp = (await import('sharp')).default;
            await sharp(audioSvg).jpeg({ quality: 80 }).toFile(thumbPath);
            try {
              await storage.put(`thumbnails/${storageId}_thumb.jpg`, thumbPath);
              thumbnailUrl = localUrl(`thumbnails/${storageId}_thumb.jpg`);
            } catch {
              thumbnailUrl = localUrl(`thumbnails/${storageId}_thumb.jpg`);
            }
            try { fs.unlinkSync(thumbPath); } catch {}
          } catch { /* audio thumb optional */ }
        }

        try {
          await storage.put(`${subDir}/${storageId}.${ext}`, destPath);
        } catch (storeErr: any) {
          console.error('[Upload] Storage failed:', storeErr.message);
        }
        finalUrl = localUrl(`${subDir}/${storageId}.${ext}`);
      }

      const now = beijingTime();
      const db = getDb();
      await db.insert(media).values({
        record_no: recordNo,
        user_id: (req.user as any).sub,
        category_id: categoryId,
        type,
        filename: `${storageId}.${ext}`,
        original_name: originalName,
        url: finalUrl,
        thumbnail_url: thumbnailUrl || null,
        size_bytes: fileBuffer.length,
        mime_type: mimeType,
        width: width || null,
        height: height || null,
        duration: duration || null,
        latitude,
        longitude,
        address: geoAddress || null,
        file_hash: fileHash,
        watermark_applied: watermarkApplied ? 1 : 0,
        compressed: compressed ? 1 : 0,
        status: 'active',
        remark: remark || null,
        uploaded_at: now,
      });

      return reply.send(success({
        record_no: recordNo,
        url: finalUrl,
        thumbnail_url: thumbnailUrl || null,
        width: width || null,
        height: height || null,
        size_bytes: fileBuffer.length,
      }, '上传成功'));
    } catch (err: any) {
      console.error('[Upload] Error:', err.message, err.stack);
      return reply.status(500).send(fail('上传失败: ' + err.message));
    }
  }

  app.post('/api/upload/chat-image', async (req, reply) => {
    try {
      const data = await req.file();
      if (!data) return reply.send(fail('请选择文件'));
      const fileBuffer = await data.toBuffer();
      const originalName = data.filename || 'chat.jpg';
      const ext = path.extname(originalName).toLowerCase().replace('.', '') || 'jpg';
      if (fileBuffer.length > 20 * 1024 * 1024) return reply.send(fail('图片大小不能超过 20MB'));
      const storageId = uuid();
      const storage = await getStorage();
      const subDir = 'chat';
      const uploadKey = `${subDir}/${storageId}.${ext}`;
      const chatDir = path.join(uploadDir, 'chat');
      fs.mkdirSync(chatDir, { recursive: true });
      const destPath = path.join(chatDir, `${storageId}.${ext}`);
      fs.writeFileSync(destPath, fileBuffer);
      try {
        await storage.put(uploadKey, destPath);
      } catch {}
      const finalUrl = localUrl(uploadKey);
      return reply.send(success({ url: finalUrl, size_bytes: fileBuffer.length }, '上传成功'));
    } catch (err: any) {
      return reply.status(500).send(fail('上传失败: ' + err.message));
    }
  });
}
