import { agentDreamsInputSchema, agentDreamsPageSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { listAgentDreams } from '../../server-agents/read-agent-dreams.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentDreamsProcedure = memberProcedure
    .input(agentDreamsInputSchema)
    .output(agentDreamsPageSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await listAgentDreams(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
