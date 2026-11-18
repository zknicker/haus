import { chatEngagementsInputSchema, chatEngagementsSchema } from '@haus/api';
import { readChatEngagements } from '../../agent-delivery/chat-engagement.ts';
import { requireChatAccess } from '../../chats/chat-access.ts';
import { chatProcedure } from './procedure.ts';

export const listChatEngagementsProcedure = chatProcedure
    .input(chatEngagementsInputSchema)
    .output(chatEngagementsSchema)
    .query(async ({ ctx, input }) => {
        await requireChatAccess(ctx.hausDb, ctx.member, input);
        return { engagements: await readChatEngagements(ctx.hausDb, input) };
    });
