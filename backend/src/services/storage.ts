import fs from 'fs';
import path from 'path';
import { env } from '../env';
import { getDb } from '../db';
import { configs } from '../db/schema';

const uploadDir = env.UPLOAD_DIR || './uploads';

export interface StorageBackend {
  put(key: string, sourcePath: string): Promise<{ url: string }>;
  getUrl(key: string): string;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

export class LocalStorage implements StorageBackend {
  async put(key: string, sourcePath: string): Promise<{ url: string }> {
    const dest = path.join(uploadDir, key);
    const dir = path.dirname(dest);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(sourcePath, dest);
    return { url: `/files/${key.replace(/\\/g, '/')}` };
  }

  getUrl(key: string): string {
    return `/files/${key.replace(/\\/g, '/')}`;
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(uploadDir, key);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  async exists(key: string): Promise<boolean> {
    return fs.existsSync(path.join(uploadDir, key));
  }
}

class S3Storage implements StorageBackend {
  private client: any = null;

  async init() {
    if (this.client) return;
    const { S3Client, PutObjectCommand, DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const db = getDb();
    const rows = await db.select().from(configs);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    this.client = new S3Client({
      endpoint: map.s3_endpoint || undefined,
      region: map.s3_region || 'auto',
      credentials: {
        accessKeyId: map.s3_access_key || '',
        secretAccessKey: map.s3_secret_key || '',
      },
    });
  }

  async put(key: string, sourcePath: string): Promise<{ url: string }> {
    await this.init();
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const db = getDb();
    const rows = await db.select().from(configs);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    const fileContent = fs.readFileSync(sourcePath);
    const mimeType = (() => {
      const ext = path.extname(key).toLowerCase();
      const types: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.pdf': 'application/pdf',
      };
      return types[ext] || 'application/octet-stream';
    })();
    await this.client.send(new PutObjectCommand({
      Bucket: map.s3_bucket,
      Key: key,
      Body: fileContent,
      ACL: 'public-read',
      ContentType: mimeType,
    }));

    const endpoint = map.s3_endpoint || '';
    const bucket = map.s3_bucket;
    const url = endpoint
      ? `${endpoint}/${bucket}/${key}`
      : `https://${bucket}.s3.${map.s3_region || 'auto'}.amazonaws.com/${key}`;

    return { url };
  }

  getUrl(key: string): string {
    return `/files/${key.replace(/\\/g, '/')}`;
  }

  async delete(key: string): Promise<void> {
    await this.init();
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const db = getDb();
    const rows = await db.select().from(configs);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;

    await this.client.send(new DeleteObjectCommand({
      Bucket: map.s3_bucket,
      Key: key,
    }));
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

class NodeImageStorage implements StorageBackend {
  private async getConfig() {
    const db = getDb();
    const rows = await db.select().from(configs);
    const map: Record<string, string> = {};
    for (const r of rows) map[r.key] = r.value;
    return {
      apiUrl: map.node_image_api_url || 'https://api.nodeimage.com',
      apiKey: map.node_image_api_key || '',
    };
  }

  async put(key: string, sourcePath: string): Promise<{ url: string }> {
    const cfg = await this.getConfig();
    if (!cfg.apiKey) throw new Error('Node图床API Key未配置，请在系统配置中填写');
    const fileContent = fs.readFileSync(sourcePath);
    const ext = path.extname(key).toLowerCase().replace('.', '') || 'jpg';

    try {
      const formData = new FormData();
      const blob = new Blob([fileContent]);
      formData.append('image', blob, `${key}`);

      const res = await fetch(`${cfg.apiUrl}/api/upload`, {
        method: 'POST',
        headers: {
          'X-API-Key': cfg.apiKey,
          'User-Agent': 'PropertySupervision/1.0',
        },
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        if (text.includes('Just a moment') || text.includes('cloudflare')) {
          throw new Error('图床服务当前不可用(Cloudflare防护)，请稍后重试或切换为本地存储');
        }
        throw new Error(`图床上传失败 (${res.status}): ${text.slice(0, 100)}`);
      }
      const data = await res.json() as any;
      const url = data?.data?.url || data?.url || data?.data?.links?.url || '';
      if (!url) throw new Error('图床返回数据中无URL');
      return { url };
    } catch (err: any) {
      throw new Error(`图床上传失败: ${err.message}`);
    }
  }

  getUrl(key: string): string {
    return `/files/${key.replace(/\\/g, '/')}`;
  }

  async delete(key: string): Promise<void> {
    const cfg = await this.getConfig();
    const imageId = key.split('/').pop()?.replace(/\.[^.]+$/, '') || key;
    try {
      await fetch(`${cfg.apiUrl}/api/image/${imageId}`, {
        method: 'DELETE',
        headers: { 'X-API-Key': cfg.apiKey },
      });
    } catch {}
  }

  async exists(): Promise<boolean> {
    return false;
  }
}

let storageInstance: StorageBackend | null = null;
let storageBackendCache: string | null = null;

export async function getStorage(): Promise<StorageBackend> {
  const db = getDb();
  const rows = await db.select().from(configs);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  const backend = map.storage_backend || env.STORAGE_BACKEND || 'local';

  if (storageInstance && storageBackendCache === backend) return storageInstance;

  storageBackendCache = backend;

  if (backend === 's3') {
    storageInstance = new S3Storage();
  } else if (backend === 'nodeimage') {
    storageInstance = new NodeImageStorage();
  } else {
    storageInstance = new LocalStorage();
  }

  return storageInstance;
}
