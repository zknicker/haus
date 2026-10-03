import { agentDetailInputSchema, agentPersonalitySchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { readAgentPersonality } from '../../server-agents/read-agent-personality.ts';
import { memberProcedure } from '../server/procedure.ts';

export const agentPersonalityProcedure = memberProcedure
    .input(agentDetailInputSchema)
    .output(agentPersonalitySchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readAgentPersonality(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
