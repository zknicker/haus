import { leaveServerInputSchema, removedServerMemberSchema } from '@haus/api';
import { removeServerMember } from '../../servers/remove-member.ts';
import { announceDeparture } from './departure-signals.ts';
import { serverMemberProcedure } from './procedure.ts';

/**
 * Leaving is removal on your own behalf. The target is never taken from input,
 * so a human can only ever leave as themselves.
 */
export const leaveServerProcedure = serverMemberProcedure
    .input(leaveServerInputSchema)
    .output(removedServerMemberSchema)
    .mutation(async ({ ctx, input }) => {
        const departure = await removeServerMember(ctx.hausDb, ctx.member, {
            confirmation: input.confirmation,
            serverId: input.serverId,
        });

        announceDeparture(departure);
        return { serverId: departure.serverId, userId: departure.userId };
    });
