import { socketSessionRefreshInputSchema, socketSessionRefreshResultSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { HausAuthError, type HausSessionIdentity } from '../../identity/haus-sessions.ts';
import { publicProcedure, unauthorized } from '../trpc.ts';

/**
 * Swaps a rotated Haus access token into the open App socket, so token rotation
 * never costs a reconnect (docs/api/auth.md, "Socket sessions"). Deliberately
 * not a human procedure: the socket's current token may be the expiring one
 * this call replaces. The new token is verified on its own and must name the
 * Haus user and session the socket is already bound to.
 */
export const refreshSocketSessionProcedure = publicProcedure
    .input(socketSessionRefreshInputSchema)
    .output(socketSessionRefreshResultSchema)
    .mutation(async ({ ctx, input }) => {
        const session = ctx.socketSession;
        if (!session) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Only an App WebSocket refreshes its session in place.',
            });
        }

        let identity: HausSessionIdentity;
        try {
            identity = await ctx.hausSessions.authenticate(input.sessionToken);
        } catch (cause) {
            if (cause instanceof HausAuthError && cause.code === 'auth_unavailable') {
                throw new TRPCError({ cause, code: 'SERVICE_UNAVAILABLE', message: cause.message });
            }
            throw unauthorized(cause);
        }

        const result = session.refresh(input.sessionToken, identity);
        if (result === 'unbound') {
            throw new TRPCError({
                code: 'CONFLICT',
                message: 'This socket has no verified session to refresh. Reconnect.',
            });
        }
        if (result === 'identity-mismatch') {
            throw new TRPCError({
                code: 'FORBIDDEN',
                message: 'A socket refreshes only its own Haus session. Reconnect.',
            });
        }
        ctx.sessionConnections.track({
            close: () => session.close(),
            key: session,
            onClose: (listener) => session.onClose(listener),
            sessionId: identity.sessionId,
            expiresAt: identity.accessTokenExpiresAt,
        });
        return { ok: true as const };
    });
