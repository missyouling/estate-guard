import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import rateLimit from '@fastify/rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { env } from './env';
import { success, fail } from './utils/response';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({
    logger: env.NODE_ENV !== 'production' ? { transport: { target: 'pino-pretty' } } : true,
    bodyLimit: 220 * 1024 * 1024,
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: '7d' },
  });

  await app.register(multipart, {
    limits: {
      fileSize: 220 * 1024 * 1024,
      files: 10,
    },
  });

  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
  });

  app.decorate('authenticate', async (request: any, reply: any) => {
    try {
      await request.jwtVerify();
    } catch (err) {
      reply.status(401).send(fail('未登录或登录已过期'));
    }
  });

  const uploadsPath = path.join(__dirname, '..', 'uploads');
  const publicPath = path.join(__dirname, '..', 'public');

  await app.register(fastifyStatic, {
    root: uploadsPath,
    prefix: '/files/',
    decorateReply: false,
  });

  await app.register(fastifyStatic, {
    root: publicPath,
    prefix: '/',
    decorateReply: false,
    wildcard: false,
  });

  app.get('/api/health', async () => {
    return success({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/')) {
      reply.status(404).send(fail('接口不存在'));
      return;
    }
    const indexPath = path.join(publicPath, 'index.html');
    try {
      const fs = await import('fs');
      if (fs.existsSync(indexPath)) {
        const html = fs.readFileSync(indexPath, 'utf-8');
        return reply.type('text/html').send(html);
      }
    } catch {}
    reply.status(404).send(fail('Not Found'));
  });

  return app;
}
