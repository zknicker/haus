import { publishRealtime } from '../../realtime/topic.ts';
import type { TaskWriteResult } from '../../tasks/task-assignment.ts';
import { toBoardTaskError } from '../board/procedure.ts';
import type { HausContext } from '../context.ts';
import { memberProcedure } from '../server/procedure.ts';

export const taskProcedure = memberProcedure.use(async ({ next }) => {
    const result = await next();
    if (result.ok) {
        return result;
    }
    throw toBoardTaskError(result.error.cause) ?? result.error;
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
