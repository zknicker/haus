import { agentDeliveryControlInputSchema, agentDeliveryStateSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { readAgentDeliveryState } from '../../server-agents/agent-delivery-control.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentDeliveryStateProcedure = memberProcedure
    .input(agentDeliveryControlInputSchema)
    .output(agentDeliveryStateSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readAgentDeliveryState(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
