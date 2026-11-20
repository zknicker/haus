import type { WorkerTurnInput } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { sendChatMessage } from '../chats/send-message.ts';
import type { MessageRouter } from '../message-routing/jev.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { tasksTable } from '../postgres/schema.ts';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';
import type { HausUser } from '../users/haus-user.ts';
import { withDispatch } from './dispatch-worker-turns.ts';
import { WorkerNotFoundError } from './errors.ts';
import { queueWorkerFollowUp } from './queue-worker-follow-up.ts';
import { lockWorker, requireOpenWorker } from './stop-worker-turns.ts';
import type { WorkerEffects, WorkerFrame } from './worker-effects.ts';
import { requireWorker } from './worker-shape.ts';
import { canSeeWorker } from './worker-visibility.ts';

export async function sendPersonFollowUp(
    db: HausDatabase,
    member: HausUser,
    input: { nonce: string; serverId: string; text: string; workerId: string },
    agentDelivery: AgentDelivery,
    storage: ArtifactStorage | null,
    messageRouter?: MessageRouter
) {
    const viewer = { kind: 'user', userId: member.id } as const;
    if (!(await canSeeWorker(db, { ...input, viewer }))) {
        throw new WorkerNotFoundError();
    }
    const worker = requireOpenWorker(await lockWorker(db, input.serverId, input.workerId));
    const taskChatId = await readTaskChatId(db, input.serverId, worker.taskId ?? '');
    const frames: WorkerFrame[] = [];
    const workerEvents: PreparedRealtimeEvent[] = [];
    const workerWakes: WorkerEffects['wakes'] = [];
    const sent = await sendChatMessage(
        db,
        member,
        {
            attachmentIds: [],
            chatId: taskChatId,
            content: input.text,
            nonce: input.nonce,
            serverId: input.serverId,
        },
        agentDelivery,
        messageRouter,
        {
            body: { kind: 'worker-follow-up', workerId: worker.id },
            record: async (tx, messageId) => {
                const followUp: WorkerTurnInput = {
                    at: new Date().toISOString(),
                    author: { id: member.id, kind: 'user' },
                    kind: 'follow-up',
                    messageId,
                    text: input.text,
                };
                const queued = await queueWorkerFollowUp(tx, {
                    followUp,
                    interrupt: false,
                    nonce: null,
                    worker: requireOpenWorker(await lockWorker(tx, input.serverId, worker.id)),
                });
                const dispatched = await withDispatch(tx, storage, input.serverId, {
                    ...queued.effects,
                    workerIds: [worker.id],
                });
                frames.push(...dispatched.frames);
                workerEvents.push(...dispatched.events);
                workerWakes.push(...dispatched.wakes);
            },
        }
    );
    return {
        effects: {
            events: [...sent.events, ...workerEvents],
            frames,
            wakes: [...sent.wakes, ...workerWakes],
        },
        messageId: sent.receipt.message.id,
        worker: await requireWorker(db, input.serverId, worker.id),
    };
}

async function readTaskChatId(db: HausDatabase, serverId: string, taskId: string) {
    const [task] = await db
        .select({ chatId: tasksTable.chatId })
        .from(tasksTable)
        .where(and(eq(tasksTable.serverId, serverId), eq(tasksTable.id, taskId)))
        .limit(1);
    if (!task?.chatId) {
        throw new WorkerNotFoundError();
    }
    return task.chatId;
}
