import { computerStewardsSchema, computerUseDeviceInputSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import {
    DesktopDeviceMissingError,
    readComputerStewards,
} from '../../computer-use/desktop-activity.ts';
import { memberProcedure } from '../server/procedure.ts';

export const computerStewardsProcedure = memberProcedure
    .input(computerUseDeviceInputSchema)
    .output(computerStewardsSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readComputerStewards(ctx.hausDb, ctx.member, input);
        } catch (cause) {
            if (cause instanceof DesktopDeviceMissingError) {
                throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
            }
            throw cause;
        }
    });
