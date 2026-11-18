import { TRPCError } from '@trpc/server';
import { publishRealtime } from '../../realtime/topic.ts';
import type { TaskWriteResult } from '../../tasks/task-assignment.ts';
import {
    TaskConflictError,
    TaskInvariantError,
    TaskKeyConflictError,
    TaskNotFoundError,
} from '../../tasks/task-errors.ts';
import type { HausContext } from '../context.ts';
import { memberProcedure } from '../server/procedure.ts';

export const taskProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    throw toTaskError(result.error.cause) ?? result.error;
});

/**
 * After a Task write commits: publish its events and wake the Agents its
 * assignment change enqueued. The response never waits on the wake.
 */
export function commitTaskWrite(
    ctx: Pick<HausContext, 'agentDelivery' | 'postCommitWork'>,
    result: TaskWriteResult
) {
    publishRealtime(result.events);
    void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, result.wakes);
    return { task: result.task };
}

function toTaskError(cause: unknown): TRPCError | null {
    if (cause instanceof TaskNotFoundError) {
        return new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (cause instanceof TaskConflictError || cause instanceof TaskKeyConflictError) {
        return new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    if (cause instanceof TaskInvariantError) {
        return new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }
    return null;
}
