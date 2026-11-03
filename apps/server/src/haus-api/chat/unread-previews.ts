import { chatUnreadPreviewListSchema, chatUnreadPreviewsInputSchema } from '@haus/api';
import { listUnreadPreviews } from '../../chats/list-unread-previews.ts';
import { chatProcedure } from './procedure.ts';

export const listUnreadPreviewsProcedure = chatProcedure
    .input(chatUnreadPreviewsInputSchema)
    .output(chatUnreadPreviewListSchema)
    .query(async ({ ctx, input }) => ({
        previews: await listUnreadPreviews(ctx.hausDb, ctx.member, input.serverId),
    }));
