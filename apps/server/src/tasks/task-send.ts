import { formatTaskTarget, type TaskDeliveryMode } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { sendAgentMessage } from '../chats/send-agent-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { agentsTable, tasksTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { restoreLockedTask } from './task-archive.ts';
import { requireTaskPlace, TaskInvariantError, TaskRefusalError } from './task-errors.ts';
import { lockTask, readTask } from './task-read.ts';
import { unfollowAsCaptain } from './task-start-record.ts';

type Tx = Parameters<Parameters<HausDatabase['transaction']>[0]>[0];

export async function sendToTask(
    db: HausDatabase,
    agentDelivery: AgentDelivery,
    input: {
        body: string;
        delivery: TaskDeliveryMode;
        runId: string;
        senderAgentId: string;
        serverId: string;
        taskId: string;
    }
) {
    return await db.transaction(async (tx) => {
        const { serverId } = input;
        await lockServerRow(tx, serverId);
        const sender = await requireSender(tx, input);
        const target = await lockTask(tx, serverId, input.taskId);
        requireTaskPlace(target);
        if (!target.agentId) {
            throw new TaskInvariantError('This Task has no agent of its own to message.');
        }
        if (target.agentId === sender.id) {
            throw new TaskInvariantError('That is your own Task. Post in your chat instead.');
        }
        const restored = await admitSender(tx, sender, target);
        const sent = await sendAgentMessage(
            tx,
            {
                agentId: sender.id,
                attachmentIds: [],
                chatId: target.chatId,
                completesReply: false,
                content: input.body,
                delivery: input.delivery,
                nonce: createOpaqueId('non'),
                runId: input.runId,
                serverId,
                target: formatTaskTarget(target.shortId),
            },
            agentDelivery
        );
        if (sender.id === target.captainId) {
            await unfollowAsCaptain(tx, { captainId: sender.id, chatId: target.chatId, serverId });
        }
        return {
            ...sent,
            events: [...(restored?.events ?? []), ...sent.events],
            sessions: restored?.sessions ?? [],
            task: await readTask(tx, serverId, target.id),
        };
    });
}

async function requireSender(tx: Tx, input: { senderAgentId: string; serverId: string }) {
    const [sender] = await tx
        .select({ handle: agentsTable.handle, id: agentsTable.id, kind: agentsTable.kind })
        .from(agentsTable)
        .where(
            and(eq(agentsTable.serverId, input.serverId), eq(agentsTable.id, input.senderAgentId))
        )
        .limit(1);
    if (!sender) {
        throw new TaskInvariantError('The sending agent no longer exists.');
    }
    return sender;
}

async function admitSender(
    tx: Tx,
    sender: { id: string; kind: 'captain' | 'task' },
    target: Awaited<ReturnType<typeof lockTask>> & { chatId: string }
) {
    if (sender.kind === 'captain') {
        return target.archivedAt ? await restoreLockedTask(tx, target) : null;
    }
    const [own] = await tx
        .select({ projectId: tasksTable.projectId })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, target.serverId), eq(tasksTable.agentId, sender.id)))
        .limit(1);
    if (own?.projectId !== target.projectId) {
        throw new TaskInvariantError(
            'A Task messages only Tasks of its own Project. File an Issue for work elsewhere.'
        );
    }
    if (target.archivedAt) {
        throw new TaskRefusalError(
            'TASK_ARCHIVED',
            'That Task is archived. Only a person or a Captain brings it back.'
        );
    }
    return null;
}
