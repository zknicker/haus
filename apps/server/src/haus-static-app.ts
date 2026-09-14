import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export async function registerHausStaticApp(app: FastifyInstance, staticAppRoot: string) {
    await app.register(fastifyStatic, {
        root: staticAppRoot,
        setHeaders(reply, filePath) {
            if (filePath.endsWith('/index.html') || filePath.endsWith('/haus-app-build.json')) {
                reply.header('cache-control', 'no-store');
            }
        },
    });

    const sendPrivacyPage = (_request: FastifyRequest, reply: FastifyReply) =>
        reply
            .header(
                'content-security-policy',
                "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
            )
            .header('referrer-policy', 'no-referrer')
            .header('x-content-type-options', 'nosniff')
            .sendFile('privacy.html');
    app.get('/privacy', sendPrivacyPage);
    app.get('/privacy/', sendPrivacyPage);

    app.setNotFoundHandler((request, reply) => {
        if (request.method === 'GET' && request.headers.accept?.includes('text/html')) {
            return reply.sendFile('index.html');
        }

        return reply.code(404).send({
            error: 'Not Found',
            message: `Route ${request.method}:${request.url} not found`,
            statusCode: 404,
        });
    });
}
