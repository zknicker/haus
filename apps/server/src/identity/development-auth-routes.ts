import { nativeAppSessionRequestSchema } from '@haus/api/app-session';
import type { FastifyInstance } from 'fastify';
import {
    type AuthRouteDependencies,
    isLoopbackRequest,
    readCookie,
    replyAuthError,
    resumeCookieName,
    setResumeCookie,
} from './auth-http.ts';

export function registerDevelopmentAuthRoutes(
    app: FastifyInstance,
    dependencies: AuthRouteDependencies
) {
    app.get('/auth/dev/session', async (request, reply) => {
        if (!(dependencies.developmentAuth && isLoopbackRequest(request))) {
            return reply.code(404).send({
                error: 'auth_required',
                message: 'Local sign-in is unavailable.',
            });
        }
        try {
            const resumeToken = readCookie(request, resumeCookieName(dependencies.appOrigin));
            const issued = resumeToken
                ? await dependencies.hausSessions.resumeDevelopment(
                      dependencies.developmentAuth.userId,
                      dependencies.developmentAuth.identitySubject,
                      resumeToken
                  )
                : await dependencies.hausSessions.issueDevelopment(
                      dependencies.developmentAuth.userId,
                      dependencies.developmentAuth.identitySubject
                  );
            dependencies.sessionConnections.renew(
                issued.appSession.sessionId,
                Date.parse(issued.appSession.expiresAt)
            );
            setResumeCookie(
                reply,
                dependencies.appOrigin,
                issued.resumeToken,
                issued.sessionExpiresAt
            );
            reply.header('cache-control', 'no-store');
            return reply.send(issued.appSession);
        } catch (cause) {
            return replyAuthError(reply, cause);
        }
    });

    app.post('/auth/dev/session', async (request, reply) => {
        if (!(dependencies.developmentAuth && isLoopbackRequest(request))) {
            return reply.code(404).send({
                error: 'auth_required',
                message: 'Local sign-in is unavailable.',
            });
        }
        const parsed = nativeAppSessionRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return reply.code(400).send({
                error: 'auth_required',
                message: 'Invalid sign-in request.',
            });
        }
        try {
            const issued = parsed.data.sessionToken
                ? await dependencies.hausSessions.resumeDevelopment(
                      dependencies.developmentAuth.userId,
                      dependencies.developmentAuth.identitySubject,
                      parsed.data.sessionToken
                  )
                : await dependencies.hausSessions.issueDevelopment(
                      dependencies.developmentAuth.userId,
                      dependencies.developmentAuth.identitySubject
                  );
            dependencies.sessionConnections.renew(
                issued.appSession.sessionId,
                Date.parse(issued.appSession.expiresAt)
            );
            reply.header('cache-control', 'no-store');
            return reply.send({
                session: issued.appSession,
                sessionExpiresAt: issued.sessionExpiresAt,
                sessionToken: issued.resumeToken,
            });
        } catch (cause) {
            return replyAuthError(reply, cause);
        }
    });
}
