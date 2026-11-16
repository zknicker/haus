import { TRPCError } from '@trpc/server';
import { ClaimClosedAssignError } from '../../claims/assign-claim.ts';
import { ClaimConflictError, ClaimNotFoundError } from '../../claims/claim-errors.ts';
import { ClaimMessageNotFoundError, UnclaimableMessageError } from '../../claims/promote-claim.ts';
import { InvalidClaimAssigneeError } from '../../claims/resolve-claim-assignee.ts';
import {
    TaskLabelAdminRequiredError,
    TaskLabelConflictError,
} from '../../task-labels/task-labels.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const claimProcedure = chatProcedure.use(async ({ next }) => {
    const result = await next();

    if (result.ok) {
        return result;
    }

    const { cause } = result.error;

    if (cause instanceof ClaimMessageNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof ClaimNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof ClaimConflictError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof ClaimClosedAssignError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof InvalidClaimAssigneeError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    if (cause instanceof TaskLabelAdminRequiredError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    if (cause instanceof TaskLabelConflictError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof UnclaimableMessageError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    throw result.error;
});
