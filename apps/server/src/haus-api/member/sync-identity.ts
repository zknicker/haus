import { syncHumanIdentityInputSchema } from '@haus/api';
import { syncHumanIdentity } from '../../servers/human-profile.ts';
import { serverMemberProcedure } from './procedure.ts';
import { announceHumanProfileChange } from './profile-signals.ts';

/**
 * The App syncs a human's editable profile on load. Only a sync that wrote
 * something announces the profile change.
 */
export const syncHumanIdentityProcedure = serverMemberProcedure
    .input(syncHumanIdentityInputSchema)
    .mutation(async ({ ctx, input }) => {
        if (await syncHumanIdentity(ctx.hausDb, ctx.member, input)) {
            await announceHumanProfileChange(ctx.hausDb, ctx.member);
        }
    });
