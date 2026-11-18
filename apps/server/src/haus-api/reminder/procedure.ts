import { TRPCError } from '@trpc/server';
import { ReminderVersionConflictError } from '../../reminders/mutations.ts';
import {
    ReminderNotFoundError,
    ReminderOperatorAccessDeniedError,
} from '../../reminders/operator-reminders.ts';
import { ReminderCommandConflictError } from '../../reminders/reminder-model.ts';
import { memberProcedure } from '../server/procedure.ts';

export const reminderProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    const { cause } = result.error;
    if (cause instanceof ReminderOperatorAccessDeniedError) {
        throw new TRPCError({ cause, code: 'FORBIDDEN', message: cause.message });
    }
    if (cause instanceof ReminderNotFoundError) {
        throw new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (
        cause instanceof ReminderCommandConflictError ||
        cause instanceof ReminderVersionConflictError
    ) {
        throw new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    throw result.error;
});
