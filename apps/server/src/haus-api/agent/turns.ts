import { agentTurnsInputSchema, agentTurnsSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { listAgentTurns } from '../../server-agents/list-agent-turns.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentTurnsProcedure = memberProcedure
    .input(agentTurnsInputSchema)
    .output(agentTurnsSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await listAgentTurns(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
