import { agentConversationStyleSchema, updateAgentConversationStyleInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { updateAgentConversationStyle } from '../../server-agents/agent-conversation-style.ts';
import { memberProcedure } from '../server/procedure.ts';
import { emitServerUpdated } from '../server-events.ts';

export const updateAgentConversationStyleProcedure = memberProcedure
    .input(updateAgentConversationStyleInputSchema)
    .output(agentConversationStyleSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const style = await updateAgentConversationStyle(ctx.hausDb, ctx.member, input);
            emitServerUpdated({ agentId: input.agentId, scope: 'agent', serverId: input.serverId });
            return style;
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
