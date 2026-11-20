import { modelConnectionListSchema, modelConnectionTargetInputSchema } from '@haus/api';
import { removeModelConnection } from '../../model-connections/write-model-connections.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { modelConnectionProcedure } from './procedure.ts';

export const removeModelConnectionProcedure = modelConnectionProcedure
    .input(modelConnectionTargetInputSchema)
    .output(modelConnectionListSchema)
    .mutation(async ({ ctx, input }) => {
        const { detachedAgentIds, list } = await removeModelConnection(
            ctx.hausDb,
            ctx.member,
            input
        );
        await ctx.modelConnections.connectionsChanged(input.serverId);
        for (const agentId of detachedAgentIds) {
            agentUpdatedTopic.announce({ agentId, serverId: input.serverId });
        }
        return list;
    });
