import { formatTaskTarget } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { sendAgentMessage } from '../chats/send-agent-message.ts';
import { isAgentAllowedOn } from '../computer-access/agent-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import type { AgentModelCatalog } from '../server-agents/agent-model-catalog.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { requireTaskActor } from './task-actor.ts';
import { TaskInvariantError } from './task-errors.ts';
import { prepareTaskCreatedEvent } from './task-events.ts';
import { requireStartOrigin } from './task-origin.ts';
import { readTask } from './task-read.ts';
import { chooseTaskSession } from './task-session-choice.ts';
import { assignStartIssue, readStartIssue } from './task-start-issue.ts';
import {
    insertStartedTask,
    queueTaskTurn,
    readStartedByRequest,
    unfollowAsCaptain,
} from './task-start-record.ts';
import { autoTaskTitle } from './task-title.ts';
import type { TaskWriteResult } from './task-write-result.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export interface StartCrewTaskInput {
    brief: string;
    captainId: string;
    hold: (tx: Tx, chatId: string) => Promise<unknown>;
    issue?: string;
    machine?: string;
    model?: string;
    origin: { chatId: string; messageId: string } | null;
    requestId?: string;
    runId: string;
    serverId: string;
    targetChatId: string | null;
    title?: string;
}

export async function startCrewTask(
    db: HausDatabase,
    deps: { agentDelivery: AgentDelivery; catalog: AgentModelCatalog },
    input: StartCrewTaskInput
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        const starter = { agentId: input.captainId, kind: 'agent' } as const;
        await requireTaskActor(tx, serverId, starter);
        const captain = await requireCaptain(tx, input);
        const repeated = await readStartedByRequest(tx, { ...input, starter });
        if (repeated) {
            return {
                kind: 'started',
                result: await startedResult(tx, serverId, repeated),
            } as const;
        }
        const held = input.targetChatId ? await input.hold(tx, input.targetChatId) : null;
        if (held) {
            return { held, kind: 'held' } as const;
        }
        const issue = input.issue
            ? await readStartIssue(tx, {
                  captainId: captain.id,
                  code: input.issue,
                  homeProjectId: captain.homeProjectId,
                  serverId,
              })
            : null;
        const origin = input.origin
            ? await requireStartOrigin(tx, { ...input.origin, serverId })
            : null;
        const session = await chooseTaskSession(tx, deps.catalog, {
            captain,
            ...(input.machine === undefined ? {} : { machine: { name: input.machine } }),
            ...(input.model === undefined ? {} : { model: input.model }),
            projectId: captain.homeProjectId,
            serverId,
        });
        if (!(await isAgentAllowedOn(tx, { ...session, agentId: captain.id, serverId }))) {
            throw new TaskInvariantError(
                'You don’t have Agent access to that Machine, so no Task started. Its attacher can give you access in Settings → Devices.'
            );
        }
        const record = await insertStartedTask(tx, {
            captainId: captain.id,
            origin,
            projectId: captain.homeProjectId,
            requestId: input.requestId ?? null,
            serverId,
            session,
            starter,
            title: input.title ?? autoTaskTitle(input.brief),
            titleCustom: input.title !== undefined,
        });
        const brief = await sendAgentMessage(
            tx,
            {
                agentId: captain.id,
                attachmentIds: [],
                chatId: record.chatId,
                completesReply: false,
                content: input.brief,
                nonce: `task-brief:${record.taskId}`,
                runId: input.runId,
                serverId,
                target: formatTaskTarget(record.shortId),
            },
            deps.agentDelivery
        );
        await unfollowAsCaptain(tx, { captainId: captain.id, chatId: record.chatId, serverId });
        await queueTaskTurn(tx, deps.agentDelivery, {
            agentId: record.agentId,
            chatId: record.chatId,
            message: {
                content: brief.message.content,
                id: brief.receipt.messageId,
                sequence: brief.receipt.sequence,
            },
            serverId,
            source: `agent:${captain.handle}`,
        });
        const issueEvents = issue
            ? await assignStartIssue(tx, issue, { captainId: captain.id, taskId: record.taskId })
            : [];
        const started = await startedResult(tx, serverId, record.taskId);
        const result: TaskWriteResult = {
            ...started,
            events: [...started.events, ...brief.events, ...issueEvents],
            wakes: [{ agentId: record.agentId, serverId }, ...brief.wakes],
        };
        return { kind: 'started', result } as const;
    });
}

export async function startedResult(tx: Tx, serverId: string, taskId: string) {
    const task = await readTask(tx, serverId, taskId);
    const result: TaskWriteResult = { events: [prepareTaskCreatedEvent(task)], task, wakes: [] };
    return result;
}

async function requireCaptain(tx: Tx, input: { captainId: string; serverId: string }) {
    const [captain] = await tx
        .select({
            crewComputerId: agentsTable.crewComputerId,
            crewModel: agentsTable.crewModel,
            desiredModelId: agentsTable.desiredModelId,
            desiredRuntimeId: agentsTable.desiredRuntimeId,
            handle: agentsTable.handle,
            homeProjectId: agentsTable.homeProjectId,
            id: agentsTable.id,
            kind: agentsTable.kind,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.captainId)))
        .limit(1);
    if (captain?.kind !== 'captain') {
        throw new TaskInvariantError('Tasks never start Tasks. Ask your Captain to start one.');
    }
    if (!captain.homeProjectId) {
        throw new TaskInvariantError('You have no home Project to start a Task in.');
    }
    return { ...captain, homeProjectId: captain.homeProjectId };
}
