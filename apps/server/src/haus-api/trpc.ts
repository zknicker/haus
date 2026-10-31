import { appProtocolVersion } from '@haus/api';
import { initTRPC, TRPCError } from '@trpc/server';
import { artifactErrorData } from '../artifacts/error-data.ts';
import type { HausSessionIdentity } from '../identity/haus-sessions.ts';
import { HausAuthError } from '../identity/haus-sessions.ts';
import { realtimeRefusalData } from '../realtime/refusal.ts';
import type { HausContext } from './context.ts';

/**
 * Keepalive for HTTP (SSE) subscriptions, which the iOS App uses. Pings let the
 * client hold a short idle timeout and notice a dead socket within one window
 * (`TRPCSessions.streamIdleTimeout`). The WebSocket transport ignores this; it
 * has its own liveness.
 */
export const sseKeepalive = {
    client: { reconnectAfterInactivityMs: 45_000 },
    ping: { enabled: true, intervalMs: 15_000 },
} as const;

const t = initTRPC.context<HausContext>().create({
    sse: sseKeepalive,
    // Realtime refusals carry their class so the App can tell a membership loss
    // from a role refusal or a transient failure (specs/realtime-events.md).
    errorFormatter: ({ error, shape }) => ({
        ...shape,
        data: { ...shape.data, ...realtimeRefusalData(error), ...artifactErrorData(error) },
    }),
});

export const createRouter = t.router;
const appProcedure = t.procedure.use(({ ctx, next }) => {
    if (ctx.appProtocol.productVersion && ctx.appProtocol.protocolVersion === appProtocolVersion) {
        return next();
    }

    throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Update required: this Haus App no longer matches the Server protocol.',
    });
});

export const computerProcedure = appProcedure;
export const publicProcedure = appProcedure;

/**
 * Verifies a short-lived Haus access token on every operation. Identity is a
 * canonical user id resolved from the persisted session, never a provider id.
 */
export const humanProcedure = appProcedure.use(async ({ ctx, next }) => {
    const token = ctx.socketSession ? ctx.socketSession.token : ctx.sessionToken;

    if (!token) {
        throw unauthorized();
    }

    let identity: HausSessionIdentity;
    try {
        identity = await ctx.hausSessions.authenticate(token);
    } catch (cause) {
        if (cause instanceof HausAuthError && cause.code === 'auth_unavailable') {
            throw new TRPCError({
                cause,
                code: 'SERVICE_UNAVAILABLE',
                message: cause.message,
            });
        }
        throw unauthorized(cause);
    }

    ctx.socketSession?.observe(token, identity);
    if (ctx.socketSession && ctx.socketSession.token === token) {
        ctx.sessionConnections.track({
            close: () => ctx.socketSession?.close(),
            key: ctx.socketSession,
            onClose: (listener) => ctx.socketSession?.onClose(listener) ?? (() => undefined),
            sessionId: identity.sessionId,
            expiresAt: identity.accessTokenExpiresAt,
        });
    } else if (ctx.httpSessionConnection) {
        ctx.sessionConnections.track({
            close: () => ctx.httpSessionConnection?.end(),
            key: ctx.httpSessionConnection,
            onClose: (listener) =>
                ctx.httpSessionConnection?.onClose(listener) ?? (() => undefined),
            sessionId: identity.sessionId,
            expiresAt: identity.accessTokenExpiresAt,
        });
    }
    return await next({
        ctx: {
            ...ctx,
            sessionId: identity.sessionId,
            userId: identity.userId,
        },
    });
});

export function unauthorized(cause?: unknown) {
    return new TRPCError({
        cause,
        code: 'UNAUTHORIZED',
        message: 'Sign in to use this Haus server.',
    });
}
