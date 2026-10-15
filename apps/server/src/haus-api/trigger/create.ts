import { triggerCreateInputSchema, triggerCreateResultSchema } from '@haus/api';
import { createOperatorTrigger } from '../../triggers/operator-trigger-create.ts';
import { triggerAuthoring, triggerClock, triggerProcedure } from './procedure.ts';

/**
 * A webhook create is the only operator response besides `rotate` that carries
 * a readable secret; a `github` or `linear` create answers with the Trigger alone.
 */
export const createTriggerProcedure = triggerProcedure
    .input(triggerCreateInputSchema)
    .output(triggerCreateResultSchema)
    .mutation(async ({ ctx, input }) =>
        createOperatorTrigger(
            ctx.hausDb,
            ctx.member,
            { ...input, origin: ctx.requestOrigin },
            triggerClock,
            triggerAuthoring(ctx)
        )
    );
