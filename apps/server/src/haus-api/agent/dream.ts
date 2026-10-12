import { agentDreamDetailSchema, agentDreamInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { readAgentDream } from '../../server-agents/read-agent-dreams.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentDreamProcedure = memberProcedure
    .input(agentDreamInputSchema)
    .output(agentDreamDetailSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readAgentDream(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
