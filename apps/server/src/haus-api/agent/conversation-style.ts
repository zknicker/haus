import { agentConversationStyleSchema, agentDetailInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { readAgentConversationStyle } from '../../server-agents/agent-conversation-style.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentConversationStyleProcedure = memberProcedure
    .input(agentDetailInputSchema)
    .output(agentConversationStyleSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readAgentConversationStyle(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
