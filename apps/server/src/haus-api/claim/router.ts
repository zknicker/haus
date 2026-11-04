import { createRouter } from '../trpc.ts';
import { assignClaimProcedure } from './assign.ts';
import { claimAssigneesProcedure } from './assignees.ts';
import { createClaimProcedure } from './create.ts';
import { listClaimsProcedure } from './list.ts';
import { onClaimChangedProcedure } from './on-changed.ts';
import { promoteClaimProcedure } from './promote.ts';
import { updateClaimProcedure } from './update.ts';

export const claimRouter = createRouter({
    assign: assignClaimProcedure,
    assignees: claimAssigneesProcedure,
    create: createClaimProcedure,
    list: listClaimsProcedure,
    onChanged: onClaimChangedProcedure,
    promote: promoteClaimProcedure,
    update: updateClaimProcedure,
});
