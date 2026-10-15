import { triggerResultSchema, triggerSetStatusInputSchema } from '@haus/api';
import { setOperatorTriggerStatus } from '../../triggers/operator-triggers.ts';
import { triggerClock, triggerProcedure } from './procedure.ts';

/** Arm or disable. Setting the status a Trigger already has returns it unchanged. */
export const setTriggerStatusProcedure = triggerProcedure
    .input(triggerSetStatusInputSchema)
    .output(triggerResultSchema)
    .mutation(async ({ ctx, input }) => {
        const { entered, trigger } = await setOperatorTriggerStatus(
            ctx.hausDb,
            ctx.member,
            { ...input, origin: ctx.requestOrigin },
            triggerClock
        );
        if (entered.length > 0) {
            const owners = new Set(entered.map((notice) => notice.ownerAgentId));
            void ctx.postCommitWork.wakeAgents(
                ctx.agentDelivery,
                [...owners].map((agentId) => ({ agentId, serverId: input.serverId }))
            );
        }
        return { trigger };
    });
