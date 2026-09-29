import { pushDeviceResultSchema, pushUnregisterDeviceInputSchema } from '@haus/api';
import { unregisterPushDevice } from '../../push/push-devices.ts';
import { pushProcedure } from './procedure.ts';

export const unregisterDeviceProcedure = pushProcedure
    .input(pushUnregisterDeviceInputSchema)
    .output(pushDeviceResultSchema)
    .mutation(async ({ ctx, input }) => {
        await unregisterPushDevice(ctx.hausDb, ctx.member.id, input.token);
        return { ok: true as const };
    });
