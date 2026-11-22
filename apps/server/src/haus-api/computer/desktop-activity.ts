import { computerUseDeviceInputSchema, desktopActivitySchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import {
    DesktopDeviceMissingError,
    readDesktopActivity,
} from '../../computer-use/desktop-activity.ts';
import { memberProcedure } from '../server/procedure.ts';

export const desktopActivityProcedure = memberProcedure
    .input(computerUseDeviceInputSchema)
    .output(desktopActivitySchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readDesktopActivity(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof DesktopDeviceMissingError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
