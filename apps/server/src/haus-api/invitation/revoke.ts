import { revokeServerInvitationInputSchema, serverInvitationSchema } from '@haus/api';
import { invitationUpdatedTopic } from '../../realtime/topics.ts';
import { revokeServerInvitation } from '../../servers/revoke-invitation.ts';
import { invitationProcedure } from './procedure.ts';

export const revokeInvitationProcedure = invitationProcedure
    .input(revokeServerInvitationInputSchema)
    .output(serverInvitationSchema)
    .mutation(async ({ ctx, input }) => {
        const revoked = await revokeServerInvitation(ctx.hausDb, ctx.member, input);

        invitationUpdatedTopic.announce({ serverId: input.serverId });
        return revoked;
    });
