import { setHumanTimezoneInputSchema } from '@haus/api';
import { setHumanTimezone } from '../../servers/human-profile.ts';
import { serverMemberProcedure } from './procedure.ts';
import { announceHumanProfileChange } from './profile-signals.ts';

/** A human sets only their own timezone; the caller identifies the target. */
export const setHumanTimezoneProcedure = serverMemberProcedure
    .input(setHumanTimezoneInputSchema)
    .mutation(async ({ ctx, input }) => {
        await setHumanTimezone(ctx.hausDb, ctx.member, input);
        await announceHumanProfileChange(ctx.hausDb, ctx.member);
    });
