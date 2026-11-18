import { agentConnectionAdminSchema, setAgentConnectionAdminInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { setAgentConnectionAdmin } from '../../server-agents/agent-connection-admin.ts';
import { memberProcedure } from '../server/procedure.ts';

export const setAgentConnectionAdminProcedure = memberProcedure
    .input(setAgentConnectionAdminInputSchema)
    .output(agentConnectionAdminSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const result = await setAgentConnectionAdmin(ctx.hausDb, ctx.member, input);
            agentUpdatedTopic.announce({ agentId: input.agentId, serverId: input.serverId });
            return result;
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
