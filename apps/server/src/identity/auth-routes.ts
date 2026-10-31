import { type AppAuthError, nativeAppSessionRequestSchema } from '@haus/api/app-session';
import { and, eq, gt } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';
import { browserAuthIntentsTable, nativeAuthIntentsTable } from '../postgres/schema.ts';
import {
    type AuthRouteDependencies,
    clearResumeCookie,
    clearStateCookie,
    hasSameOriginProvenance,
    readCookie,
    replyAuthError,
    requestHeader,
    resumeCookieName,
    setResumeCookie,
    stateCookieName,
} from './auth-http.ts';
import { registerAuthStartRoute } from './auth-start-route.ts';
import { registerDevelopmentAuthRoutes } from './development-auth-routes.ts';
import { hashHausToken } from './haus-sessions.ts';

const callbackQuerySchema = z
    .object({
        code: z.string().min(1).max(4096).optional(),
        error: z.string().min(1).max(128).optional(),
        error_description: z.string().max(2048).optional(),
        state: z.string().min(1).max(512),
    })
    .strict()
    .refine((query) => Boolean(query.code) !== Boolean(query.error));

const logoutBodySchema = z
    .object({
        client: z.enum(['desktop', 'ios']).optional(),
        sessionToken: z.string().min(1).optional(),
    })
    .strict();

const safeOAuthErrors = new Set([
    'access_denied',
    'authorization_pending',
    'interaction_required',
    'invalid_request',
    'login_required',
    'server_error',
    'temporarily_unavailable',
    'unauthorized_client',
]);

export function registerAuthRoutes(app: FastifyInstance, dependencies: AuthRouteDependencies) {
    registerAuthStartRoute(app, dependencies);
    registerDevelopmentAuthRoutes(app, dependencies);

    app.get('/auth/complete', async (request, reply) => {
        const state = parseState(request.query);
        const cookieState = readCookie(request, stateCookieName(dependencies.appOrigin));
        if (!(state && cookieState) || state !== cookieState) {
            return replyAuthError(reply, null);
        }

        const admission = await verifyCloudflareAdmission(request, reply, dependencies);
        if (!admission) {
            return;
        }

        const now = new Date();
        const [intent] = await dependencies.hausDb
            .delete(browserAuthIntentsTable)
            .where(
                and(
                    eq(browserAuthIntentsTable.stateHash, hashHausToken(state)),
                    gt(browserAuthIntentsTable.expiresAt, now)
                )
            )
            .returning({ returnTo: browserAuthIntentsTable.returnTo });
        if (!intent) {
            return sendAuthError(
                reply,
                'auth_invalid_grant',
                'This sign-in link expired. Start again.',
                400
            );
        }

        try {
            const issued = await dependencies.hausSessions.create(admission);
            setResumeCookie(
                reply,
                dependencies.appOrigin,
                issued.resumeToken,
                issued.sessionExpiresAt
            );
            clearStateCookie(reply, dependencies.appOrigin);
            reply.header('cache-control', 'no-store');
            return reply
                .code(303)
                .redirect(new URL(intent.returnTo, dependencies.appOrigin).toString());
        } catch (cause) {
            return replyAuthError(reply, cause);
        }
    });

    app.get('/auth/session', async (request, reply) => {
        if (!hasSameOriginProvenance(request, dependencies.appOrigin)) {
            return sendAuthError(reply, 'auth_required', 'Sign in to use this Haus server.', 403);
        }
        const admission = await verifyCloudflareAdmission(request, reply, dependencies);
        if (!admission) {
            return;
        }
        try {
            const issued = await dependencies.hausSessions.resume(
                readCookie(request, resumeCookieName(dependencies.appOrigin)),
                admission
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

    app.post('/auth/session', async (request, reply) => {
        const parsed = nativeAppSessionRequestSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAuthError(reply, 'auth_required', 'Invalid sign-in request.', 400);
        }
        const admission = await verifyCloudflareAdmission(request, reply, dependencies);
        if (!admission) {
            return;
        }
        try {
            const session = await dependencies.hausSessions.resumeNative(parsed.data, admission);
            dependencies.sessionConnections.renew(
                session.session.sessionId,
                Date.parse(session.session.expiresAt)
            );
            reply.header('cache-control', 'no-store');
            return reply.send(session);
        } catch (cause) {
            return replyAuthError(reply, cause);
        }
    });

    app.post('/auth/logout', async (request, reply) => {
        if (!hasSameOriginProvenance(request, dependencies.appOrigin)) {
            return sendAuthError(reply, 'auth_required', 'Sign in to use this Haus server.', 403);
        }
        const parsed = logoutBodySchema.safeParse(request.body ?? {});
        if (!parsed.success) {
            return sendAuthError(reply, 'auth_required', 'Invalid sign-out request.', 400);
        }
        const resumeToken =
            parsed.data.sessionToken ??
            readCookie(request, resumeCookieName(dependencies.appOrigin));
        const sessionId = await dependencies.hausSessions.revoke(resumeToken);
        if (sessionId) {
            dependencies.sessionConnections.revoke(sessionId);
        }
        clearResumeCookie(reply, dependencies.appOrigin);
        reply.header('cache-control', 'no-store');
        return reply.code(204).send();
    });

    app.get('/auth/callback', async (request, reply) => {
        const parsed = callbackQuerySchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAuthError(
                reply,
                'auth_invalid_grant',
                'This sign-in response is invalid. Start again.',
                400
            );
        }
        const now = new Date();
        const [intent] = await dependencies.hausDb
            .delete(nativeAuthIntentsTable)
            .where(
                and(
                    eq(nativeAuthIntentsTable.stateHash, hashHausToken(parsed.data.state)),
                    gt(nativeAuthIntentsTable.expiresAt, now)
                )
            )
            .returning({
                nativeRedirectUri: nativeAuthIntentsTable.nativeRedirectUri,
                nativeState: nativeAuthIntentsTable.nativeState,
            });
        if (!intent) {
            return sendAuthError(
                reply,
                'auth_invalid_grant',
                'This sign-in response expired. Start again.',
                400
            );
        }

        const destination = new URL(intent.nativeRedirectUri);
        if (parsed.data.code) {
            destination.searchParams.set('code', parsed.data.code);
        } else {
            destination.searchParams.set(
                'error',
                safeOAuthErrors.has(parsed.data.error ?? '') ? parsed.data.error! : 'access_denied'
            );
        }
        destination.searchParams.set('state', intent.nativeState);
        reply.header('cache-control', 'no-store');
        reply.header('referrer-policy', 'no-referrer');
        return reply.code(302).redirect(destination.toString());
    });
}

async function verifyCloudflareAdmission(
    request: FastifyRequest,
    reply: FastifyReply,
    dependencies: AuthRouteDependencies
) {
    const assertion = requestHeader(request, 'cf-access-jwt-assertion');
    if (!assertion) {
        replyAuthError(reply, null);
        return null;
    }
    try {
        return await dependencies.cloudflareAdmissions.verify(assertion);
    } catch (cause) {
        replyAuthError(reply, cause);
        return null;
    }
}

function parseState(query: unknown) {
    const parsed = z.object({ state: z.string().min(1).max(512) }).safeParse(query);
    return parsed.success ? parsed.data.state : null;
}

function sendAuthError(
    reply: FastifyReply,
    error: AppAuthError['error'],
    message: string,
    status: number
) {
    reply.header('cache-control', 'no-store');
    return reply.code(status).send({ error, message } satisfies AppAuthError);
}
