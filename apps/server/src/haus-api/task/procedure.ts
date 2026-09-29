import { TRPCError } from '@trpc/server';
import { TaskClosedAssignError } from '../../tasks/assign-task.ts';
import { TaskMessageNotFoundError, UntaskableMessageError } from '../../tasks/promote-task.ts';
import { InvalidTaskAssigneeError } from '../../tasks/resolve-task-assignee.ts';
import { TaskConflictError, TaskNotFoundError } from '../../tasks/task-errors.ts';
import { TaskLabelAdminRequiredError, TaskLabelConflictError } from '../../tasks/task-labels.ts';
import { chatProcedure } from '../chat/procedure.ts';

export const taskProcedure = chatProcedure.use(async ({ next }) => {
    const result = await next();

    if (result.ok) {
        return result;
    }

    const { cause } = result.error;

    if (cause instanceof TaskMessageNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof TaskNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }

    if (cause instanceof TaskConflictError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof TaskClosedAssignError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof InvalidTaskAssigneeError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    if (cause instanceof TaskLabelAdminRequiredError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }

    if (cause instanceof TaskLabelConflictError) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }

    if (cause instanceof UntaskableMessageError) {
        throw new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }

    throw result.error;
});
