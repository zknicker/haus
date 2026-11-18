import { agentListInputSchema, agentListSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { listAgents } from '../../server-agents/list-agents.ts';
import { memberProcedure } from '../server/procedure.ts';

export const listAgentsProcedure = memberProcedure
    .input(agentListInputSchema)
    .output(agentListSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await listAgents(ctx.hausDb, ctx.member, input.serverId);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
