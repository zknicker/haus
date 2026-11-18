import { serverInvitationPreviewSchema, serverInvitationTokenInputSchema } from '@haus/api';
import { previewServerInvitation } from '../../servers/preview-invitation.ts';
import { invitationProcedure } from './procedure.ts';

export const previewInvitationProcedure = invitationProcedure
    .input(serverInvitationTokenInputSchema)
    .output(serverInvitationPreviewSchema)
    .query(
        async ({ ctx, input }) =>
            await previewServerInvitation(ctx.hausDb, ctx.userId!, input.token)
    );
