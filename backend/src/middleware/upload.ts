import { FastifyRequest, FastifyReply } from 'fastify';
import { fail } from '../utils/response';

export async function uploadGuard(request: FastifyRequest, reply: FastifyReply) {
  const contentType = request.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    return reply.status(400).send(fail('请求格式错误，请使用 multipart/form-data'));
  }
}
