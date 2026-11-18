import { compositionPublishedSchema, compositionPublishInputSchema } from '@haus/api';
import { requireChatWriteAccess } from '../../chats/chat-access.ts';
import { publishChatComposition } from '../../chats/composition-hub.ts';
import { chatProcedure } from './procedure.ts';

export const publishCompositionProcedure = chatProcedure
    .input(compositionPublishInputSchema)
    .output(compositionPublishedSchema)
    .mutation(async ({ ctx, input }) => {
        await requireChatWriteAccess(ctx.hausDb, ctx.member, input);

        if (!ctx.member) {
            throw new Error('A Server member is required to publish a composition.');
        }

        publishChatComposition({
            actorUserId: ctx.member.id,
            chatId: input.chatId,
            compositionId: input.compositionId,
            emittedAt: new Date().toISOString(),
            serverId: input.serverId,
            text: input.text,
        });
        return { accepted: true as const };
    });
