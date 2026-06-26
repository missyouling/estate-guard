import { FastifyInstance } from 'fastify';
import { geocodeLocation } from '../services/geocoder';

export default async function (app: FastifyInstance) {
  app.post('/api/geocode', async (req, reply) => {
    try {
      await req.jwtVerify();
    } catch {
      return reply.status(401).send({ code: 1, message: '未登录' });
    }

    const { latitude, longitude } = req.body as any;
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return { code: 1, message: '参数错误' };
    }

    const address = await geocodeLocation(latitude, longitude);
    return { code: 0, data: { address } };
  });
}
