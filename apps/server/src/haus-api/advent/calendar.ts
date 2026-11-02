import { adventCalendarInputSchema, adventCalendarSchema } from '@haus/api';
import { TRPCError } from '@trpc/server';
import { readAdventCalendar } from '../../advent/read-advent-calendar.ts';
import { AdventDoorLockedError, AdventTimeZoneError } from '../../advent/season.ts';
import { memberProcedure } from '../server/procedure.ts';

export const adventCalendarProcedure = memberProcedure
    .input(adventCalendarInputSchema)
    .output(adventCalendarSchema)
    .query(async ({ ctx, input }) => {
        try {
            return await readAdventCalendar(ctx.hausDb, ctx.member, input, {
                // Development auth exists only on a dev or test Server
                // (`HAUS_DEV_STACK=1`), never in production; there the App's
                // debug date may preview doors out of season.
                preview: ctx.developmentAuth !== null && process.env.NODE_ENV !== 'production',
            });
        } catch (cause) {
            if (cause instanceof AdventDoorLockedError) {
                throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
            }
            if (cause instanceof AdventTimeZoneError) {
                throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
            }
            throw cause;
        }
    });
