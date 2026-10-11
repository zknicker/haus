import type { FastifyInstance, FastifyReply } from 'fastify';

/** The public GitHub App edges. Each answers 501 until its slice replaces it. */
export const githubRoutePaths = {
    /** Installation setup redirect (Slice B: `github/setup-route.ts`). */
    setup: '/github/setup',
    /** The development App's delivery sink (Slice C: `github/sink-route.ts`). */
    sink: '/api/github/sink',
    /** Every installation's app webhook (Slice C: `github/webhook-route.ts`). */
    webhook: '/api/github/webhook',
} as const;

/**
 * Registers the GitHub App's HTTP edges ahead of tRPC, without Clerk. Stubs
 * answer `501 not_implemented` so nothing upstream mistakes them for success.
 */
export function registerGithubRoutes(app: FastifyInstance) {
    app.get(githubRoutePaths.setup, (_request, reply) => notImplemented(reply));
    app.post(githubRoutePaths.sink, (_request, reply) => notImplemented(reply));
    app.post(githubRoutePaths.webhook, (_request, reply) => notImplemented(reply));
}

function notImplemented(reply: FastifyReply) {
    return reply.code(501).send({ code: 'not_implemented' });
}
