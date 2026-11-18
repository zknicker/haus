import { TRPCError } from '@trpc/server';
import { RealtimeRefusalError } from '../../realtime/refusal.ts';
import { ServerSlugTakenError } from '../../servers/create-server.ts';
import { ServerDeleteDeniedError } from '../../servers/delete-server.ts';
import { ServerAccessDeniedError, ServerNotFoundError } from '../../servers/server-access.ts';
import { findUserById } from '../../users/haus-user.ts';
import { humanProcedure } from '../trpc.ts';

/**
 * Server work for one authenticated Haus user, with Server domain refusals
 * reported as the tRPC codes the App reacts to.
 */
export const serverProcedure = humanProcedure.use(async ({ next }) => {
    const result = await next();

    if (result.ok) {
        return result;
    }

    // A coded realtime refusal is already final; remapping by its cause would
    // drop the `hausRefusal` the App keys on.
    if (result.error instanceof RealtimeRefusalError) {
        throw result.error;
    }

    const { cause } = result.error;

    if (cause instanceof ServerAccessDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    if (cause instanceof ServerNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof ServerSlugTakenError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof ServerDeleteDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    throw result.error;
});

/**
 * Reads and Server-scoped mutations resolve the existing Haus User. A human
 * who has never created or joined a Server has none yet, and asking never
 * mints one.
 */
export const memberProcedure = serverProcedure.use(async ({ ctx, next }) => {
    const member = await findUserById(ctx.hausDb, ctx.userId!);

    return await next({ ctx: { ...ctx, member } });
});
