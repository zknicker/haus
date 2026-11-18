import { formatTaskTarget } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { resolveTaskTargetChat } from '../agent-api/resolve-task-target.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { CloudAgentAgentNotFoundError, CloudAgentTaskRequiredError } from './errors.ts';

/** The Task a launch attaches to: its id, its own Chat, and its `task:SEC-12` target. */
export interface CloudAgentLaunchTask {
    chatId: string;
    target: string;
    taskId: string;
}

/**
 * Cloud work attaches to a Task and reports to it (ADR 0052 decision 6): the
 * launch Message posts into the Task's Chat, and Run notices land there. A
 * launch naming no Task, or one the Agent cannot reach, is refused.
 */
export async function requireLaunchTask(
    db: Pick<HausDatabase, 'select'>,
    runner: ResolvedRunner,
    taskKey: string | undefined
): Promise<CloudAgentLaunchTask> {
    if (!taskKey) {
        throw new CloudAgentTaskRequiredError();
    }
    const task = await resolveTaskTargetChat(db, runner, taskKey);
    if (!task) {
        throw new CloudAgentTaskRequiredError(
            `Task ${taskKey} does not exist, has no conversation yet, or is in a Channel this Agent has not joined. Launch the cloud agent on a Task you can reach.`
        );
    }
    return { chatId: task.chatId, target: formatTaskTarget(taskKey), taskId: task.taskId };
}

/** Cloud Agent work is owned by the Computer that holds the provider access. */
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
        throw new CloudAgentAgentNotFoundError();
    }
    return agent.computerId;
}
