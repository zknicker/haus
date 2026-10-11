import { triggerResultSchema, triggerUpdateInputSchema } from '@haus/api';
import { updateOperatorTrigger } from '../../triggers/operator-triggers.ts';
import { triggerClock, triggerProcedure } from './procedure.ts';

export const updateTriggerProcedure = triggerProcedure
    .input(triggerUpdateInputSchema)
    .output(triggerResultSchema)
    .mutation(async ({ ctx, input }) =>
        updateOperatorTrigger(
            ctx.hausDb,
            ctx.member,
            { ...input, origin: ctx.requestOrigin },
            triggerClock,
            ctx.githubApp?.transport
        )
    );
