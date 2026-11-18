import { createdServerInvitationSchema, createServerInvitationInputSchema } from '@haus/api';
import { invitationUpdatedTopic } from '../../realtime/topics.ts';
import { createServerInvitation } from '../../servers/create-invitation.ts';
import { invitationProcedure } from './procedure.ts';

export const createInvitationProcedure = invitationProcedure
    .input(createServerInvitationInputSchema)
    .output(createdServerInvitationSchema)
    .mutation(async ({ ctx, input }) => {
        const created = await createServerInvitation(ctx.hausDb, ctx.member, input);

        invitationUpdatedTopic.announce({ serverId: input.serverId });
        return created;
    });
