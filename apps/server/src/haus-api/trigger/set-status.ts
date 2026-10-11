import { triggerResultSchema, triggerSetStatusInputSchema } from '@haus/api';
import { problemWakes } from '../../github/trigger-problems.ts';
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
            void ctx.postCommitWork.wakeAgents(
                ctx.agentDelivery,
                problemWakes(input.serverId, entered)
            );
        }
        return { trigger };
    });
