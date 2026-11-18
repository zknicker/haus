import { triggerDeleteInputSchema, triggerDeleteResultSchema } from '@haus/api';
import { deleteOperatorTrigger } from '../../triggers/operator-triggers.ts';
import { triggerClock, triggerProcedure } from './procedure.ts';

/** Removal stops new fires; retained history and Chat provenance stay readable. */
export const deleteTriggerProcedure = triggerProcedure
    .input(triggerDeleteInputSchema)
    .output(triggerDeleteResultSchema)
    .mutation(async ({ ctx, input }) =>
        deleteOperatorTrigger(
            ctx.hausDb,
            ctx.member,
            { ...input, origin: ctx.requestOrigin },
            triggerClock
        )
    );
