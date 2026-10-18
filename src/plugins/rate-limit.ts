import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Clock, WallClock } from '../kernel/clock/clock.js';

const requestCounts = new Map<string, { count: number; resetAt: number }>();

export async function rateLimitPlugin(fastify: FastifyInstance, clock: Clock = new WallClock()) {
    fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
        const ip = request.ip || 'unknown';
        const now = clock.now().getTime();
        const record = requestCounts.get(ip) || { count: 0, resetAt: now + 60000 }; // 1 minute window

        if (now > record.resetAt) {
            record.count = 1;
            record.resetAt = now + 60000;
        } else {
            record.count++;
        }

        requestCounts.set(ip, record);

        if (record.count > 100) { // Simple threshold
            return reply.code(429).send({ error: 'Too Many Requests', reason: 'rate_limited' });
        }
    });
}