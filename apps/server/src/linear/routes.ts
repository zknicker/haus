import type { FastifyInstance } from 'fastify';

/** The public Linear edges (specs/linear-app.md#webhooks, #binding-and-authority). */
export const linearRoutePaths = {
    /** One Agent identity's webhook. */
    identityWebhook: '/api/linear/webhook/:identityId',
    /** Every install's OAuth redirect: workspace and identity installs alike. */
    oauthCallback: '/linear/oauth/callback',
    /** The Haus app's workspace webhook. */
    webhook: '/api/linear/webhook',
} as const;

/**
 * Registers the Linear edges ahead of tRPC, without Clerk. Until ingest and
 * binding land, each answers `501` and reads nothing: bodies are drained
 * unparsed so no payload can turn into a different error.
 */
export function registerLinearRoutes(app: FastifyInstance) {
    return app.register(async (scope) => {
        scope.removeAllContentTypeParsers();
        scope.addContentTypeParser('*', (_request, payload, done) => {
            payload.resume();
            done(null, undefined);
        });
        const notImplemented = { code: 'linear_not_implemented' } as const;
        scope.post(linearRoutePaths.webhook, (_request, reply) =>
            reply.code(501).send(notImplemented)
        );
        scope.post(linearRoutePaths.identityWebhook, (_request, reply) =>
            reply.code(501).send(notImplemented)
        );
        scope.get(linearRoutePaths.oauthCallback, (_request, reply) =>
            reply.code(501).send(notImplemented)
        );
    });
}
