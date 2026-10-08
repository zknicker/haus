import { createRouter } from '../trpc.ts';
import { changeMemberRoleProcedure } from './change-role.ts';
import { getMemberProcedure } from './get.ts';
import { leaveServerProcedure } from './leave.ts';
import { listMembersProcedure } from './list.ts';
import { removeMemberProcedure } from './remove.ts';
import { setHumanTimezoneProcedure } from './set-timezone.ts';
import { syncHumanIdentityProcedure } from './sync-identity.ts';
import { updateHumanProfileProcedure } from './update-profile.ts';

export const memberRouter = createRouter({
    changeRole: changeMemberRoleProcedure,
    get: getMemberProcedure,
    leave: leaveServerProcedure,
    list: listMembersProcedure,
    remove: removeMemberProcedure,
    setTimezone: setHumanTimezoneProcedure,
    syncIdentity: syncHumanIdentityProcedure,
    updateProfile: updateHumanProfileProcedure,
});
