import { updateHumanProfileInputSchema } from '@haus/api';
import { updateHumanProfile } from '../../servers/human-profile.ts';
import { serverMemberProcedure } from './procedure.ts';
import { announceHumanProfileChange } from './profile-signals.ts';

/** A human edits only their own profile; the caller identifies the target. */
export const updateHumanProfileProcedure = serverMemberProcedure
    .input(updateHumanProfileInputSchema)
    .mutation(async ({ ctx, input }) => {
        await updateHumanProfile(ctx.hausDb, ctx.member, input);
        await announceHumanProfileChange(ctx.hausDb, ctx.member);
    });
