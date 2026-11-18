import { chatSchema, ensureAgentDmInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentDmPeerNotFoundError, ensureAgentDmRecord } from '../../chats/ensure-agent-dm.ts';
import { prepareLifecycleEvent } from '../../chats/lifecycle-events.ts';
import { listChats } from '../../chats/list-chats.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { chatProcedure } from './procedure.ts';

export const ensureAgentDmProcedure = chatProcedure
    .input(ensureAgentDmInputSchema)
    .output(chatSchema)
    .mutation(async ({ ctx, input }) => {
        if (!ctx.member) {
            throw new TRPCError({ code: 'UNAUTHORIZED' });
        }
        try {
            const ensured = await ctx.hausDb.transaction(async (tx) => {
                const chat = await ensureAgentDmRecord(tx, {
                    ...input,
                    userId: ctx.member!.id,
                });
                const event = chat.created
                    ? prepareLifecycleEvent(
                          { chatId: chat.id, serverId: input.serverId },
                          'created'
                      )
                    : null;
                return { chat, event };
            });
            const visible = (await listChats(ctx.hausDb, ctx.member, input.serverId)).find(
                (candidate) => candidate.id === ensured.chat.id
            );
            if (!visible) {
                throw new Error('Failed to open the Agent DM after creating it.');
            }
            if (ensured.event) {
                publishRealtime(ensured.event);
            }
            return visible;
        } catch (cause) {
            if (cause instanceof AgentDmPeerNotFoundError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
