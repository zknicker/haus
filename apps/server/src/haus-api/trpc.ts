import { appProtocolVersion } from '@haus/api';
import { initTRPC, TRPCError } from '@trpc/server';
import {
    type ClerkSessionIdentity,
    ClerkSessionUnavailableError,
} from '../identity/clerk-sessions.ts';
import type { HausContext } from './context.ts';

const t = initTRPC.context<HausContext>().create();

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
 * Verifies the Clerk session and carries its external subject for this request
 * only. Every Server operation — queries, mutations, and each subscription
 * start — is judged against a current token, so an expired session cannot ride
 * an already-open WebSocket. It deliberately touches no database: minting a
 * User is part of Server creation's transaction, never a side effect of
 * reading.
 */
export const humanProcedure = appProcedure.use(async ({ ctx, next }) => {
    // A WebSocket operation is judged against the socket's newest token, which
    // the App refreshes in place (`session.refresh`).
    const token = ctx.socketSession ? ctx.socketSession.token : ctx.clerkSessionToken;

    if (!token) {
        throw unauthorized();
    }

    let identity: ClerkSessionIdentity;

    try {
        identity = await ctx.clerkSessions.verify(token);
    } catch (cause) {
        // The signing keys never resolved, so this token was never judged.
        // Reporting it as a refusal would sign the human out over a Server
        // availability failure.
        if (cause instanceof ClerkSessionUnavailableError) {
            throw new TRPCError({
                cause,
                code: 'SERVICE_UNAVAILABLE',
                message: cause.message,
            });
        }

        throw unauthorized(cause);
    }

    ctx.socketSession?.observe(token, identity);
    return await next({ ctx: { ...ctx, clerkUserId: identity.clerkUserId } });
});

export function unauthorized(cause?: unknown) {
    return new TRPCError({
        cause,
        code: 'UNAUTHORIZED',
        message: 'Sign in to use this Haus server.',
    });
}
