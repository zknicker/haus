import { agentRunTriggerInputSchema, agentRunTriggerSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { readAgentRunTrigger } from '../../server-agents/read-agent-run-trigger.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentRunTriggerProcedure = memberProcedure
    .input(agentRunTriggerInputSchema)
    .output(agentRunTriggerSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readAgentRunTrigger(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
