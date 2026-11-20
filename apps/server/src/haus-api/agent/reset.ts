import { agentDeliveryStateSchema, agentResetInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { artifactAccess } from '../../artifacts/access.ts';
import { agentUpdatedTopic } from '../../realtime/topics.ts';
import { AgentConfigDeniedError } from '../../server-agents/agent-config-errors.ts';
import {
    assertAgentResetAccess,
    readAgentDeliveryState,
} from '../../server-agents/agent-delivery-control.ts';
import { artifactProcedure } from '../artifact/procedure.ts';

export const resetAgentProcedure = artifactProcedure
    .input(agentResetInputSchema)
    .output(agentDeliveryStateSchema)
    .mutation(async ({ ctx, input }) => {
        try {
            await assertAgentResetAccess(ctx.hausDb, ctx.member, input);
            await ctx.agentDelivery.reset(
                input.kind === 'full'
                    ? {
                          ...input,
                          kind: 'full',
                          resetBy: (
                              await artifactAccess(ctx.hausDb, {
                                  kind: 'human',
                                  member: ctx.member,
                                  serverId: input.serverId,
                              })
                          ).authorKey,
                      }
                    : { ...input, kind: 'session' }
            );
            if (input.kind === 'full') {
                await ctx.managedSkills.seedAgent(
                    { agentId: input.agentId, serverId: input.serverId },
                    ctx.postCommitWork
                );
            }
            agentUpdatedTopic.announce({
                agentId: input.agentId,
                serverId: input.serverId,
            });
            return await readAgentDeliveryState(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof AgentConfigDeniedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            throw cause;
        }
    });
