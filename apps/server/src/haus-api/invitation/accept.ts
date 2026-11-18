import { acceptedServerInvitationSchema, serverInvitationTokenInputSchema } from '@haus/api';
import { invitationUpdatedTopic, memberUpdatedTopic } from '../../realtime/topics.ts';
import { acceptServerInvitation } from '../../servers/accept-invitation.ts';
import { invitationProcedure } from './procedure.ts';

export const acceptInvitationProcedure = invitationProcedure
    .input(serverInvitationTokenInputSchema)
    .output(acceptedServerInvitationSchema)
    .mutation(async ({ ctx, input }) => {
        const accepted = await acceptServerInvitation(ctx.hausDb, ctx.userId!, input.token);

        // A new member changes the directory and retires an invitation, so any
        // members page already open elsewhere refreshes instead of going stale.
        invitationUpdatedTopic.announce({ serverId: accepted.serverId });
        memberUpdatedTopic.announce({ memberId: accepted.userId, serverId: accepted.serverId });
        return { serverId: accepted.serverId, serverSlug: accepted.serverSlug };
    });
