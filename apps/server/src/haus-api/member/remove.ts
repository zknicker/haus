import { removedServerMemberSchema, removeServerMemberInputSchema } from '@haus/api';
import { removeServerMember } from '../../servers/remove-member.ts';
import { announceDeparture } from './departure-signals.ts';
import { serverMemberProcedure } from './procedure.ts';

export const removeMemberProcedure = serverMemberProcedure
    .input(removeServerMemberInputSchema)
    .output(removedServerMemberSchema)
    .mutation(async ({ ctx, input }) => {
        const departure = await removeServerMember(ctx.hausDb, ctx.member, input);

        announceDeparture(departure);
        return { serverId: departure.serverId, userId: departure.userId };
    });
