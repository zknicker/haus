import { agentHomeSchema, agentSetHomeInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { setAgentHome } from '../../projects/agent-home.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import { projectProcedure } from '../project/procedure.ts';

export const setAgentHomeProcedure = projectProcedure
    .input(agentSetHomeInputSchema)
    .output(agentHomeSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            const { events, home } = await setAgentHome(ctx.hausDb, ctx.member, input);
            publishRealtime(events);
            agentUpdatedTopic.announce({ agentId: input.agentId, serverId: input.serverId });
            return home;
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
