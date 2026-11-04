import { TRPCError } from '@trpc/server';
import {
    BoardConflictError,
    BoardInvariantError,
    BoardNotFoundError,
} from '../../boards/board-errors.ts';
import {
    TaskConflictError,
    TaskInvariantError,
    TaskNotFoundError,
} from '../../tasks/task-errors.ts';
import { memberProcedure } from '../server/procedure.ts';

/** Board and Task domain refusals as the tRPC codes the App reacts to. */
export function toBoardTaskError(cause: unknown): TRPCError | null {
    if (cause instanceof BoardNotFoundError || cause instanceof TaskNotFoundError) {
        return new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (cause instanceof BoardConflictError || cause instanceof TaskConflictError) {
        return new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    if (cause instanceof BoardInvariantError || cause instanceof TaskInvariantError) {
        return new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }
    return null;
}

export const boardProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    throw toBoardTaskError(result.error.cause) ?? result.error;
});
