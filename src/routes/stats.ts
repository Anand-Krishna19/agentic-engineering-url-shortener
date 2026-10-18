import { FastifyInstance } from 'fastify';

export async function statsRoutes(fastify: FastifyInstance) {
    fastify.get('/v1/links/:code/stats', async (request) => {
        const { code } = request.params as { code: string };
        // Minimal implementation: return 0 or query DB if analytics table exists
        return { code, redirect_count: 0 };
    });
}