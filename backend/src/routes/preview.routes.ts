import { FastifyInstance } from 'fastify';
import { getDb } from '../db';
import { configs } from '../db/schema';
import { eq } from 'drizzle-orm';
import { success, fail } from '../utils/response';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const PREVIEW_SIGN_SECRET = process.env.JWT_SECRET || 'preview-sign-secret';
const LIBREOFFICE_SECRET = process.env.LIBREOFFICE_SECRET || 'lo-default-secret';
const LIBREOFFICE_URL = process.env.LIBREOFFICE_URL || 'http://libreoffice:3001';

// LibreOffice health cache — refresh every 30s
let loHealthCache: { reachable: boolean; timestamp: number } = { reachable: false, timestamp: 0 };
const LO_HEALTH_TTL = 30_000;

interface ConfigMap { [key: string]: string; }

async function getConfigMap(): Promise<ConfigMap> {
  const db = getDb();
  const rows = await db.select().from(configs);
  const map: ConfigMap = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

function signUrl(filePath: string, expiresAt: number): string {
  const payload = `${filePath}|${expiresAt}`;
  const sig = crypto.createHmac('sha256', PREVIEW_SIGN_SECRET).update(payload).digest('hex').slice(0, 16);
  return Buffer.from(`${payload}|${sig}`).toString('base64url');
}

function verifySignedToken(token: string): { filePath: string; valid: boolean; reason?: string } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString();
    const parts = decoded.split('|');
    if (parts.length < 3) return { filePath: '', valid: false, reason: 'token格式无效' };
    const sig = parts.pop()!;
    const payload = parts.join('|');
    const expiresAt = parseInt(parts[1], 10);
    if (isNaN(expiresAt) || Date.now() > expiresAt) return { filePath: '', valid: false, reason: '预览链接已过期' };
    const expectedSig = crypto.createHmac('sha256', PREVIEW_SIGN_SECRET).update(payload).digest('hex').slice(0, 16);
    if (sig !== expectedSig) return { filePath: '', valid: false, reason: '签名无效' };
    return { filePath: parts[0], valid: true };
  } catch {
    return { filePath: '', valid: false, reason: 'token解析失败' };
  }
}

// Extensions supported natively by the frontend (zero server cost)
const FRONTEND_EXTENSIONS = new Set([
  'jpg','jpeg','png','gif','webp','bmp','svg','ico','tif','tiff',
  'mp4','mov','avi','mkv','webm','flv','wmv','m4v','3gp',
  'mp3','wav','m4a','ogg','aac','wma','flac',
  'pdf','docx','xlsx','pptx','txt','csv','md','json','xml','html','htm',
]);

// Extensions that require LibreOffice conversion to PDF
const LIBREOFFICE_EXTENSIONS = new Set([
  'doc','xls','ppt','rtf','odt','ods','odp','wps','et','dps','sxw','sxc','sxi',
]);

// All extensions allowed at all (security whitelist)
const ALLOWED_EXTENSIONS = new Set([
  ...FRONTEND_EXTENSIONS, ...LIBREOFFICE_EXTENSIONS,
  'zip','rar','7z','tar','gz','bz2',
]);

async function checkKkFileView(cfg: ConfigMap): Promise<boolean> {
  if (cfg.kkfileview_enabled !== 'true' || !cfg.kkfileview_url) return false;
  try {
    const baseUrl = cfg.kkfileview_url.replace(/\/+$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${baseUrl}/index.html`, { signal: controller.signal, method: 'HEAD' });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function getFileHash(filePath: string): Promise<string | null> {
  // Derive physical path: /files/documents/uuid.docx → /app/uploads/documents/uuid.docx
  const relativePath = filePath.replace('/files/', '');
  const fullPath = path.resolve('/app/uploads', relativePath);
  try {
    if (!fs.existsSync(fullPath)) return null;
    const stat = fs.statSync(fullPath);
    return crypto.createHash('md5').update(`${filePath}:${stat.size}:${stat.mtimeMs}`).digest('hex');
  } catch {
    return null;
  }
}

export default async function previewRoutes(app: FastifyInstance) {

  app.get('/api/preview/config', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
    const cfg = await getConfigMap();
    return reply.send(success({
      kkfileview: { enabled: cfg.kkfileview_enabled === 'true', url: cfg.kkfileview_url || '' },
      libreoffice: { enabled: true },
    }));
  });

  // Three-tier preview URL resolution
  app.get('/api/preview/url', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
    const query = req.query as any;
    const filePath = query.path as string;
    const mediaId = query.media_id as string;
    if (!filePath) return reply.send(fail('缺少文件路径'));

    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    if (!ALLOWED_EXTENSIONS.has(ext)) return reply.send(fail('不支持的文件格式'));

    const cfg = await getConfigMap();

    // Tier 1: kkFileView (enabled + healthy)
    const kkReachable = await checkKkFileView(cfg);
    if (kkReachable) {
      const fullUrl = filePath.startsWith('http') ? filePath
        : `${(req.protocol || 'http')}://${req.hostname}${filePath}`;
      const encodedUrl = encodeURIComponent(fullUrl);
      const expiresAt = Date.now() + 30 * 60 * 1000;
      const token = signUrl(filePath, expiresAt);
      const baseUrl = cfg.kkfileview_url!.replace(/\/+$/, '');
      const kkUrl = `${baseUrl}/onlinePreview?url=${encodedUrl}&fullfilename=${encodeURIComponent(filePath.split('/').pop() || 'file')}`;
      return reply.send(success({
        mode: 'kkfileview',
        url: kkUrl,
        token,
        expires_at: expiresAt,
      }));
    }

    // Tier 2: Frontend native rendering (zero server cost)
    if (FRONTEND_EXTENSIONS.has(ext)) {
      return reply.send(success({ mode: 'frontend' }));
    }

    // Tier 3: LibreOffice conversion
    if (LIBREOFFICE_EXTENSIONS.has(ext)) {
      const fileHash = await getFileHash(filePath);
      const loEnabled = cfg.libreoffice_enabled !== 'false';
      if (loEnabled) {
        let lastError = '';
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), attempt === 0 ? 30000 : 15000);
            const convertRes = await fetch(`${LIBREOFFICE_URL}/convert`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${LIBREOFFICE_SECRET}`,
              },
              body: JSON.stringify({
                filePath,
                fileHash: fileHash || undefined,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeout);
            if (convertRes.ok) {
              const data = await convertRes.json() as any;
              if (data.pdfUrl) {
                return reply.send(success({
                  mode: 'pdf',
                  url: data.pdfUrl,
                  from: 'libreoffice',
                }));
              }
              lastError = '转换服务返回异常';
            } else if (convertRes.status === 404) {
              lastError = 'NOT_FOUND';
              break; // No retry for missing files
            } else if (convertRes.status === 503) {
              lastError = '转换服务繁忙，请稍后重试';
              break; // Queue full, no retry
            } else {
              const errData = await convertRes.json().catch(() => ({})) as any;
              lastError = errData.error || `转换失败 (${convertRes.status})`;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              lastError = '转换超时，文档过大或格式异常';
            } else if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
              lastError = '转换服务暂不可用';
              break;
            } else {
              lastError = `转换异常: ${err.message || '未知错误'}`;
            }
          }
        }
        return reply.send(success({
          mode: 'fallback',
          reason: lastError.includes('NOT_FOUND') ? '文件不存在或已被删除' :
                  lastError.includes('加密') || lastError.includes('损坏') ? '该文档已加密或损坏，暂不支持在线预览' :
                  lastError.includes('暂不可用') || lastError.includes('繁忙') ? '文档预览生成失败，请稍后重试或下载查看' :
                  '文档预览生成失败，请稍后重试或下载查看',
        }));
      }
    }

    // Fallback: unsupported format
    return reply.send(success({ mode: 'fallback', reason: '该文件类型暂不支持在线预览，请下载查看' }));
  });

  app.get('/api/preview/health', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
    const cfg = await getConfigMap();
    const kkEnabled = cfg.kkfileview_enabled === 'true';
    let kkReachable = false;
    if (kkEnabled && cfg.kkfileview_url) {
      try {
        const baseUrl = cfg.kkfileview_url.replace(/\/+$/, '');
        const res = await fetch(`${baseUrl}/index.html`, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
        kkReachable = res.ok;
      } catch {}
    }
    const now = Date.now();
    if (now - loHealthCache.timestamp > LO_HEALTH_TTL) {
      try {
        const res = await fetch(`${LIBREOFFICE_URL}/health`, { signal: AbortSignal.timeout(3000) });
        loHealthCache = { reachable: res.ok, timestamp: now };
      } catch {
        loHealthCache = { reachable: false, timestamp: now };
      }
    }
    return reply.send(success({
      kkfileview: { enabled: kkEnabled, reachable: kkReachable },
      libreoffice: { enabled: true, reachable: loHealthCache.reachable },
    }));
  });

  app.get('/api/preview/verify', async (req, reply) => {
    try { await req.jwtVerify(); } catch { return reply.status(401).send(fail('未登录')); }
    const query = req.query as any;
    const token = query.token as string;
    if (!token) return reply.send(fail('缺少token'));
    const result = verifySignedToken(token);
    if (!result.valid) return reply.send(fail(result.reason || '验证失败'));
    return reply.send(success({ path: result.filePath }));
  });
}
