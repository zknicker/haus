import { and, eq, isNull } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    messageTasksTable,
    serverMembershipsTable,
} from '../postgres/schema.ts';
import { assignTask, type TaskAssigneeInput, TaskClosedAssignError } from '../tasks/assign-task.ts';
import { TaskConflictError, TaskNotFoundError } from '../tasks/claim-task.ts';
import { InvalidTaskAssigneeError } from '../tasks/resolve-task-assignee.ts';
import { messageSelection } from './message-view.ts';
import { resolveAgentTarget } from './resolve-target.ts';
import { AgentTaskError } from './task-error.ts';
import { findAgentTasks } from './task-lookup.ts';
import { stripAt, taskRow } from './task-row.ts';

/**
 * `haus task assign` / `unassign`: an Agent hands a task to any member of its
 * Chat, or to nobody. Status never moves; `claim` stays the "I'm starting"
 * verb. The shared assignment path delivers to an assigned Agent exactly as an
 * App assignment does.
 */
export async function assignAgentTask(
    db: HausDatabase,
    runner: ResolvedRunner,
    agentDelivery: AgentDelivery,
    input: { assignee: null | string; expectedRevision?: number; number: number; target: string }
) {
    const chatId = await resolveAgentTarget(db, runner, input.target);
    const [found] = await findAgentTasks(db, runner, chatId, { numbers: [input.number] });
    const assignee = input.assignee
        ? await resolveAssigneeHandle(db, runner, input.assignee)
        : null;
    const result = await assignTask(db, { agentId: runner.agentId, kind: 'agent' }, agentDelivery, {
        assignee,
        expectedVersion: input.expectedRevision,
        messageId: found.messageId,
        serverId: runner.serverId,
    }).catch((cause: unknown) => {
        if (cause instanceof InvalidTaskAssigneeError) {
            throw notAssignable(input.assignee ?? '');
        }
        if (
            cause instanceof TaskConflictError ||
            cause instanceof TaskClosedAssignError ||
            cause instanceof TaskNotFoundError
        ) {
            throw new AgentTaskError(cause.message);
        }
        throw cause;
    });
    const [message] = await db
        .select(messageSelection)
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, runner.serverId),
                eq(chatMessagesTable.id, found.messageId)
            )
        );
    const [record] = await db
        .select()
        .from(messageTasksTable)
        .where(
            and(
                eq(messageTasksTable.serverId, runner.serverId),
                eq(messageTasksTable.messageId, found.messageId)
            )
        );
    if (!(message && record)) {
        throw new AgentTaskError('That task no longer exists.');
    }
    return {
        events: result.events,
        task: await taskRow(db, runner, message, record),
        wakes: result.wakes,
    };
}

/**
 * A handle names one active Agent or one active person. Missing, ambiguous,
 * and out-of-Chat handles all answer the same way, so assignment cannot be
 * used to probe who exists.
 */
async function resolveAssigneeHandle(
    db: HausDatabase,
    runner: ResolvedRunner,
    value: string
): Promise<Exclude<TaskAssigneeInput, null>> {
    const handle = stripAt(value.trim());
    const agents = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, runner.serverId),
                eq(agentsTable.handle, handle),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(2);
    const humans = await db
        .select({ userId: serverMembershipsTable.userId })
        .from(serverMembershipsTable)
        .where(
            and(
                eq(serverMembershipsTable.serverId, runner.serverId),
                eq(serverMembershipsTable.handle, handle),
                isNull(serverMembershipsTable.revokedAt)
            )
        )
        .limit(2);
    const [agent] = agents;
    const [human] = humans;
    if (agents.length + humans.length !== 1) {
        throw notAssignable(value);
    }
    return agent
        ? { agentId: agent.id, kind: 'agent' }
        : { kind: 'human', userId: human?.userId ?? '' };
}

function notAssignable(value: string) {
    return new AgentTaskError(`@${stripAt(value.trim())} is not assignable in this chat.`);
}
