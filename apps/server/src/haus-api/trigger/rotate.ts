import { triggerRotateInputSchema, triggerSecretResultSchema } from '@haus/api';
import { rotateOperatorTriggerSecret } from '../../triggers/operator-triggers.ts';
import { triggerCurlCommand } from '../../triggers/trigger-url.ts';
import { triggerClock, triggerProcedure } from './procedure.ts';

export const rotateTriggerProcedure = triggerProcedure
    .input(triggerRotateInputSchema)
    .output(triggerSecretResultSchema)
    .mutation(async ({ ctx, input }) => {
        const rotated = await rotateOperatorTriggerSecret(
            ctx.hausDb,
            ctx.member,
            { ...input, origin: ctx.requestOrigin },
            triggerClock
        );
        return {
            curl: triggerCurlCommand(rotated.trigger.url, rotated.secret),
            secret: rotated.secret,
            trigger: rotated.trigger,
            url: rotated.trigger.url,
        };
    });
