import { formatTaskTarget } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { resolveTaskTargetChat } from '../agent-api/resolve-task-target.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { WorkerAgentNotFoundError, WorkerTaskRequiredError } from './errors.ts';

export interface WorkerLaunchTask {
    chatId: string;
    target: string;
    taskId: string;
}

export async function requireLaunchTask(
    db: Pick<HausDatabase, 'select'>,
    runner: ResolvedRunner,
    taskKey: string | undefined
): Promise<WorkerLaunchTask> {
    if (!taskKey) {
        throw new WorkerTaskRequiredError();
    }
    const task = await resolveTaskTargetChat(db, runner, taskKey);
    if (!task) {
        throw new WorkerTaskRequiredError(
            `Task ${taskKey} does not exist or has no conversation yet. Launch the Worker on a Task with a conversation.`
        );
    }
    return { chatId: task.chatId, target: formatTaskTarget(taskKey), taskId: task.taskId };
}

export async function requireAssignedComputer(
    db: Pick<HausDatabase, 'select'>,
    runner: ResolvedRunner
): Promise<string> {
    const [agent] = await db
        .select({ computerId: agentsTable.computerId })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, runner.serverId), eq(agentsTable.id, runner.agentId)))
        .limit(1);
    if (!agent?.computerId) {
        throw new WorkerAgentNotFoundError();
    }
    return agent.computerId;
}
