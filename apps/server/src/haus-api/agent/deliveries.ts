import { agentDeliveriesInputSchema, agentDeliveriesSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { listAgentDeliveries } from '../../server-agents/list-agent-deliveries.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentDeliveriesProcedure = memberProcedure
    .input(agentDeliveriesInputSchema)
    .output(agentDeliveriesSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await listAgentDeliveries(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
