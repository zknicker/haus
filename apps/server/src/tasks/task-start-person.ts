import type { TaskStartInput } from '@haus/api';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { sendChatMessage } from '../chats/send-message.ts';
import { readTaskSession, taskMayUse } from '../computer-access/task-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentModelCatalog } from '../server-agents/agent-model-catalog.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { memberTaskActor, requireTaskActor } from './task-actor.ts';
import { TaskInvariantError } from './task-errors.ts';
import { requireStartOrigin } from './task-origin.ts';
import { requireFilingProject } from './task-project.ts';
import { chooseTaskSession } from './task-session-choice.ts';
import { startedResult } from './task-start.ts';
import { insertStartedTask, queueTaskTurn, readStartedByRequest } from './task-start-record.ts';
import { autoTaskTitle } from './task-title.ts';
import type { TaskWriteResult } from './task-write-result.ts';

/**
 * `task.start`: a person starts a Task in a Project with their prompt as its first message
 * (specs/tasks.md#a-person-starts-a-task). It has no Captain; its Machine access is the
 * person's own grant there.
 */
export async function startPersonTask(
    db: HausDatabase,
    deps: { agentDelivery: AgentDelivery; catalog: AgentModelCatalog },
    member: HausUser | null,
    input: TaskStartInput
) {
    const starter = memberTaskActor(member);
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        await requireTaskActor(tx, serverId, starter);
        const repeated = await readStartedByRequest(tx, { ...input, starter });
        if (repeated) {
            return await startedResult(tx, serverId, repeated);
        }
        const project = await requireFilingProject(tx, input);
        const origin = input.origin
            ? await requireStartOrigin(tx, { ...input.origin, serverId })
            : null;
        const session = await chooseTaskSession(tx, deps.catalog, {
            captain: null,
            ...(input.computerId === undefined ? {} : { machine: { computerId: input.computerId } }),
            model: input.model,
            projectId: project.projectId,
            serverId,
        });
        const record = await insertStartedTask(tx, {
            captainId: null,
            origin,
            projectId: project.projectId,
            requestId: input.requestId,
            serverId,
            session,
            starter,
            title: input.title ?? autoTaskTitle(input.prompt),
            titleCustom: input.title !== undefined,
        });
        await requireStarterMachine(tx, { agentId: record.agentId, serverId });
        const prompt = await sendChatMessage(
            tx,
            member,
            {
                attachmentIds: [],
                chatId: record.chatId,
                content: input.prompt,
                nonce: `task-prompt:${record.taskId}`,
                serverId,
            },
            deps.agentDelivery
        );
        await queueTaskTurn(tx, deps.agentDelivery, {
            agentId: record.agentId,
            chatId: record.chatId,
            message: prompt.receipt.message,
            serverId,
            source: 'human',
        });
        const started = await startedResult(tx, serverId, record.taskId);
        const result: TaskWriteResult = {
            ...started,
            events: [...started.events, ...prompt.events],
            wakes: [{ agentId: record.agentId, serverId }, ...prompt.wakes],
        };
        return result;
    });
}

async function requireStarterMachine(
    tx: HausDatabase,
    input: { agentId: string; serverId: string }
) {
    const task = await readTaskSession(tx, input);
    if (!(task && (await taskMayUse(tx, task, () => Promise.resolve(false))))) {
        throw new TaskInvariantError(
            'You can start a Task only on a Machine you attached, or one that allows All Captains on this Server.'
        );
    }
}
