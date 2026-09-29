import { pushDeviceResultSchema, pushRegisterDeviceInputSchema } from '@haus/api';
import { registerPushDevice } from '../../push/push-devices.ts';
import { pushProcedure } from './procedure.ts';

export const registerDeviceProcedure = pushProcedure
    .input(pushRegisterDeviceInputSchema)
    .output(pushDeviceResultSchema)
    .mutation(async ({ ctx, input }) => {
        await registerPushDevice(ctx.hausDb, ctx.member.id, input);
        return { ok: true as const };
    });
