import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { seedDevelopmentHeartbeats } from '../../development/seed-heartbeats.ts';
import { requireServerMembership } from '../../servers/server-access.ts';
import { memberProcedure } from '../server/procedure.ts';
import { assertHeartbeatTestAllowed } from './heartbeat-test-routes.ts';

/**
 * Applies the heartbeat and dream demo seed to an existing development database,
 * replacing a previous run of the same seed and touching nothing else. Gated like
 * the heartbeat test routes: never in production, only from localhost.
 */
export const seedHeartbeatsRoute = memberProcedure
    .input(z.object({ serverId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
        assertHeartbeatTestAllowed(ctx.requestHost);
        await requireServerMembership(ctx.hausDb, ctx.member, input.serverId);
        if (!ctx.member) {
            throw new TRPCError({ code: 'FORBIDDEN', message: 'No operator for this session.' });
        }
        const result = await seedDevelopmentHeartbeats(ctx.hausDb, {
            refresh: true,
            serverId: input.serverId,
            userId: ctx.member.id,
        });
        if (!result.seeded) {
            throw new TRPCError({
                code: 'PRECONDITION_FAILED',
                message:
                    'This Server is not the development demo workspace (Blippy, Tiny, and Cove with their Chats).',
            });
        }
        return result;
    });
