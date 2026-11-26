import { TRPCError } from '@trpc/server';
import { ChatArchivedError, ChatNotFoundError } from '../../chats/chat-access.ts';
import { publishRealtime } from '../../realtime/topic.ts';
import { memberTaskActor } from '../../tasks/task-actor.ts';
import {
    TaskConflictError,
    TaskInvariantError,
    TaskNotFoundError,
    TaskProjectArchivedError,
} from '../../tasks/task-errors.ts';
import { withVisibleOrigins } from '../../tasks/task-read.ts';
import { announceTaskSessions } from '../../tasks/task-session.ts';
import type { TaskWriteResult } from '../../tasks/task-write-result.ts';
import type { HausUser } from '../../users/haus-user.ts';
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
 * After a Task write commits: publish its events, stop closed Workers, and wake
 * the Agents it enqueued, then answer with the Task as the writer sees it.
 * The response never waits on the wake.
 */
export async function commitTaskWrite(
    ctx: Pick<
        HausContext,
        | 'agentDelivery'
        | 'computerConnections'
        | 'hausDb'
        | 'invocations'
        | 'postCommitWork'
        | 'runnerLink'
    > & {
        member: HausUser | null;
    },
    result: TaskWriteResult
) {
    publishRealtime(result.events);
    for (const { computerId, frame } of result.workerFrames ?? []) {
        ctx.computerConnections.send(computerId, frame);
    }
    announceTaskSessions(
        { invocations: ctx.invocations, runner: ctx.runnerLink },
        result.sessions ?? []
    );
    void ctx.postCommitWork.wakeAgents(ctx.agentDelivery, result.wakes);
    const [task] = await withVisibleOrigins(ctx.hausDb, memberTaskActor(ctx.member), [result.task]);
    if (!task) {
        throw new Error(`Task ${result.task.id} vanished from its own write result.`);
    }
    return { task };
}

function toTaskError(cause: unknown): TRPCError | null {
    if (cause instanceof TaskNotFoundError) {
        return new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (cause instanceof TaskConflictError) {
        return new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    if (cause instanceof TaskInvariantError) {
        return new TRPCError({ cause, code: 'BAD_REQUEST', message: cause.message });
    }
    if (cause instanceof TaskProjectArchivedError) {
        return new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    if (cause instanceof ChatNotFoundError) {
        return new TRPCError({ cause, code: 'NOT_FOUND', message: cause.message });
    }
    if (cause instanceof ChatArchivedError) {
        return new TRPCError({ cause, code: 'CONFLICT', message: cause.message });
    }
    return null;
}
