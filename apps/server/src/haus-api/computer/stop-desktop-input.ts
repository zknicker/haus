import { computerUseDeviceInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import {
    DesktopDeviceMissingError,
    requireDesktopDevice,
} from '../../computer-use/desktop-activity.ts';
import { memberProcedure } from '../server/procedure.ts';

export const stopDesktopInputProcedure = memberProcedure
    .input(computerUseDeviceInputSchema)
    .output(z.object({ stopped: z.number().int().nonnegative() }).strict())
    .mutation(async ({ ctx, input }) => {
        try {
            await requireDesktopDevice(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof DesktopDeviceMissingError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
        return { stopped: ctx.invocations.stopDesktop(input) };
    });
