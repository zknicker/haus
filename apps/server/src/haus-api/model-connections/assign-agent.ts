import {
    modelConnectionAgentAssignmentSchema,
    modelConnectionAssignAgentInputSchema,
} from '@haus/api';
import { assignAgentModelConnection } from '../../model-connections/agent-model-connection.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const assignAgentModelConnectionProcedure = modelConnectionProcedure
    .input(modelConnectionAssignAgentInputSchema)
    .output(modelConnectionAgentAssignmentSchema)
    .mutation(async ({ ctx, input }) => {
        const assignment = await assignAgentModelConnection(ctx.hausDb, ctx.member, input);
        agentUpdatedTopic.announce({ agentId: input.agentId, serverId: input.serverId });
        return assignment;
    });
