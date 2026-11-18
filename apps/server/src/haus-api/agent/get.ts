import { agentDetailInputSchema, agentSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { getAgent } from '../../server-agents/get-agent.ts';
import { memberProcedure } from '../server/procedure.ts';

export const getAgentProcedure = memberProcedure
    .input(agentDetailInputSchema)
    .output(agentSchema)
    .query(async ({ ctx, input }) => {
        const agent = await getAgent(ctx.hausDb, ctx.member, input.serverId, input.agentId);
        if (!agent) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Agent not found.' });
        }
        return agent;
    });
