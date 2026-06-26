import { FastifyRequest, FastifyReply } from 'fastify';
import { fail } from '../utils/response';

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch (err) {
    return reply.status(401).send(fail('未登录或登录已过期'));
  }
}

export function adminMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (request.user?.role !== 'admin') {
    return reply.status(403).send(fail('需要管理员权限'));
  }
}
