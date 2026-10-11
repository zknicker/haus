import type { FastifyInstance } from 'fastify';

/**
 * `POST /api/github/sink`: where the development App posts, so GitHub records
 * its deliveries for development stacks to pull
 * (specs/github-triggers.md#recovery-and-the-development-pull). It answers
 * `204` to anything and reads nothing: the body is drained unparsed, so no
 * size limit or content type can turn a delivery into an error.
 */
export function registerGithubSinkRoute(app: FastifyInstance, path: string) {
    return app.register(async (scope) => {
        scope.removeAllContentTypeParsers();
        scope.addContentTypeParser('*', (_request, payload, done) => {
            payload.resume();
            done(null, undefined);
        });
        scope.post(path, (_request, reply) => reply.code(204).send());
    });
}
