import { triggerTestInputSchema, triggerTestResultSchema } from '@haus/api';
import { testOperatorTrigger } from '../../triggers/operator-trigger-test.ts';
import { triggerClock, triggerProcedure } from './procedure.ts';

/** Fires the Trigger through the same path, limiter, and envelope a real delivery takes. */
export const testTriggerProcedure = triggerProcedure
    .input(triggerTestInputSchema)
    .output(triggerTestResultSchema)
    .mutation(async ({ ctx, input }) =>
        testOperatorTrigger(
            ctx.hausDb,
            {
                delivery: ctx.agentDelivery,
                limiter: ctx.triggerRateLimiter,
                postCommitWork: ctx.postCommitWork,
                runtime: ctx.runtime,
            },
            ctx.member,
            { ...input, origin: ctx.requestOrigin },
            triggerClock
        )
    );
