import { formatTaskKey, GENERAL_TASK_KEY, type TaskActor } from '@haus/api';
import { eq, sql } from 'drizzle-orm';

import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentTaskFollowsTable,
    chatMessagesTable,
    chatsTable,
    taskFollowsTable,
    taskKeysTable,
    taskMessageLinksTable,
    tasksTable,
} from '../postgres/schema.ts';
import { seedDemoTaskWork } from './seed-demo-task-work.ts';

type Tx = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

interface DemoTask {
    assignee: TaskActor;
    conversation?: readonly { author: TaskActor; content: string }[];
    createdBy: TaskActor;
    messageId: string;
    origin: { chatId: string; messageId: string };
    priority: 'high' | 'medium';
    state: 'done' | 'open' | 'todo';
    title: string;
}

export interface SeededDemoTask {
    chatId: string;
    id: string;
    messageCount: number;
    number: number;
}

export async function seedServerDemoTasks(
    tx: Tx,
    input: {
        agents: { blippyId: string; tinyId: string };
        channels: { allId: string; demoId: string };
        computerId: string;
        keyId: string;
        messages: {
            auditTaskMessageId: string;
            planMessageId: string;
            polishMessageId: string;
            shipTaskMessageId: string;
            sizeCapMessageId: string;
        };
        serverId: string;
        userId: string;
    }
): Promise<void> {
    const { agents, channels, messages } = input;
    const blippy = { agentId: agents.blippyId, kind: 'agent' } as const;
    const tiny = { agentId: agents.tinyId, kind: 'agent' } as const;
    const owner = { kind: 'user', userId: input.userId } as const;
    const inAll = (messageId: string) => ({ chatId: channels.allId, messageId });
    const [ship] = await seedDemoTasks(tx, {
        keyId: input.keyId,
        serverId: input.serverId,
        tasks: [
            {
                assignee: blippy,
                conversation: [
                    { author: blippy, content: 'Taking this. Upload, crop, and save in one pass.' },
                    { author: owner, content: 'Keep the crop square for now.' },
                    {
                        author: blippy,
                        content: 'Square it is. Handing the build to a cloud agent.',
                    },
                ],
                createdBy: blippy,
                messageId: messages.shipTaskMessageId,
                origin: inAll(messages.shipTaskMessageId),
                priority: 'high',
                state: 'open',
                title: 'Ship the avatar upload flow end to end',
            },
            {
                assignee: tiny,
                createdBy: tiny,
                messageId: messages.auditTaskMessageId,
                origin: inAll(messages.auditTaskMessageId),
                priority: 'medium',
                state: 'todo',
                title: 'Audit the member directory for stale copy',
            },
            {
                assignee: owner,
                conversation: [
                    { author: tiny, content: '5 MB covers every phone photo I tried.' },
                    { author: owner, content: 'Let me check what the iPhone sends first.' },
                ],
                createdBy: tiny,
                messageId: messages.sizeCapMessageId,
                origin: inAll(messages.planMessageId),
                priority: 'high',
                state: 'todo',
                title: 'Pick the upload size cap',
            },
            {
                assignee: owner,
                createdBy: blippy,
                messageId: messages.polishMessageId,
                origin: { chatId: channels.demoId, messageId: messages.polishMessageId },
                priority: 'medium',
                state: 'todo',
                title: 'Sign off on the core flow polish list',
            },
            {
                assignee: tiny,
                conversation: [
                    { author: tiny, content: 'Drafted the welcome copy and posted it in #all.' },
                    { author: owner, content: 'Reads well. Ship it.' },
                    { author: tiny, content: 'Shipped. Marking this done.' },
                ],
                createdBy: tiny,
                messageId: messages.planMessageId,
                origin: inAll(messages.planMessageId),
                priority: 'medium',
                state: 'done',
                title: 'Write the onboarding welcome copy',
            },
        ],
    });
    if (!ship) {
        throw new Error('The dev seed wrote no open Task to attach work to.');
    }
    await seedDemoTaskWork(tx, {
        agentId: agents.blippyId,
        computerId: input.computerId,
        serverId: input.serverId,
        task: ship,
    });
}

export async function seedDemoTasks(
    tx: Tx,
    input: { keyId: string; serverId: string; tasks: readonly DemoTask[] }
): Promise<SeededDemoTask[]> {
    const { keyId, serverId } = input;
    const now = new Date();
    const rows = input.tasks.map((task, index) => ({
        chatId: createOpaqueId('cht'),
        id: createOpaqueId('tsk'),
        number: index + 1,
        task,
    }));
    await tx.insert(chatsTable).values(
        rows.map(({ chatId, task }) => ({
            anchorMessageId: task.origin.messageId,
            id: chatId,
            kind: 'task' as const,
            lastActivityAt: task.conversation?.length ? now : null,
            lastMessageSequence: task.conversation?.length ?? 0,
            parentChatId: task.origin.chatId,
            parentChatKind: 'channel' as const,
            serverId,
        }))
    );
    await tx.insert(tasksTable).values(
        rows.map(({ chatId, id, number, task }) => ({
            assigneeAgentId: agentIdOf(task.assignee),
            assigneeUserId: userIdOf(task.assignee),
            chatId,
            completedAt: task.state === 'done' ? now : null,
            createdByAgentId: agentIdOf(task.createdBy),
            createdByUserId: userIdOf(task.createdBy),
            id,
            keyId,
            number,
            priority: task.priority,
            serverId,
            state: task.state,
            title: task.title,
        }))
    );
    await tx.insert(taskMessageLinksTable).values(
        rows.map(({ id, number, task }) => ({
            messageId: task.messageId,
            ordinal: 0,
            serverId,
            taskId: id,
            text: formatTaskKey(GENERAL_TASK_KEY, number),
        }))
    );
    const conversation = rows.flatMap(({ chatId, task }) =>
        (task.conversation ?? []).map((line, index) => {
            const id = createOpaqueId('msg');
            return {
                authorAgentId: agentIdOf(line.author),
                authorUserId: userIdOf(line.author),
                chatId,
                content: line.content,
                id,
                nonce: `dev-${chatId}-${index + 1}`,
                replyRootMessageId: id,
                sequence: index + 1,
                serverId,
            };
        })
    );
    if (conversation.length > 0) {
        await tx.insert(chatMessagesTable).values(conversation);
    }
    await seedFollows(tx, serverId, rows);
    await tx
        .update(taskKeysTable)
        .set({ nextNumber: sql`${taskKeysTable.nextNumber} + ${rows.length}` })
        .where(eq(taskKeysTable.id, keyId));
    return rows.map(({ chatId, id, number, task }) => ({
        chatId,
        id,
        messageCount: task.conversation?.length ?? 0,
        number,
    }));
}

async function seedFollows(
    tx: Tx,
    serverId: string,
    rows: readonly { chatId: string; task: DemoTask }[]
) {
    const followers = rows.flatMap(({ chatId, task }) =>
        [task.assignee, ...(task.conversation ?? []).map((line) => line.author)].map((actor) => ({
            actor,
            chatId,
        }))
    );
    const people = unique(
        followers.flatMap(({ actor, chatId }) => {
            const userId = userIdOf(actor);
            return userId ? [{ serverId, taskChatId: chatId, userId }] : [];
        }),
        (row) => `${row.taskChatId} ${row.userId}`
    );
    const agents = unique(
        followers.flatMap(({ actor, chatId }) => {
            const agentId = agentIdOf(actor);
            return agentId ? [{ agentId, serverId, taskChatId: chatId }] : [];
        }),
        (row) => `${row.taskChatId} ${row.agentId}`
    );
    if (people.length > 0) {
        await tx.insert(taskFollowsTable).values(people);
    }
    if (agents.length > 0) {
        await tx.insert(agentTaskFollowsTable).values(agents);
    }
}

function unique<T>(rows: T[], key: (row: T) => string): T[] {
    return [...new Map(rows.map((row) => [key(row), row])).values()];
}

function agentIdOf(actor: TaskActor) {
    return actor.kind === 'agent' ? actor.agentId : null;
}

function userIdOf(actor: TaskActor) {
    return actor.kind === 'user' ? actor.userId : null;
}
