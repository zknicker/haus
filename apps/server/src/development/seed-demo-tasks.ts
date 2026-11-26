import type { TaskActor } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentTaskFollowsTable,
    chatMessagesTable,
    chatsTable,
    taskFollowsTable,
    tasksTable,
} from '../postgres/schema.ts';
import { randomShortId } from '../tasks/task-short-id.ts';
import { seedDemoTaskWork } from './seed-demo-task-work.ts';

type Tx = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

interface DemoTask {
    archived?: true;
    conversation?: readonly { author: TaskActor; content: string }[];
    createdBy: TaskActor;
    origin: { chatId: string; messageId: string };
    title: string;
}

export interface SeededDemoTask {
    chatId: string;
    id: string;
    messageCount: number;
}

export async function seedServerDemoTasks(
    tx: Tx,
    input: {
        agents: { blippyId: string; tinyId: string };
        channels: { allId: string; demoId: string };
        computerId: string;
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
        projectId: channels.demoId,
        serverId: input.serverId,
        tasks: [
            {
                conversation: [
                    { author: blippy, content: 'Taking this. Upload, crop, and save in one pass.' },
                    { author: owner, content: 'Keep the crop square for now.' },
                    {
                        author: blippy,
                        content: 'Square it is. Handing the build to a Worker.',
                    },
                ],
                createdBy: blippy,
                origin: inAll(messages.shipTaskMessageId),
                title: 'Ship the avatar upload flow end to end',
            },
            {
                createdBy: tiny,
                origin: inAll(messages.auditTaskMessageId),
                title: 'Audit the member directory for stale copy',
            },
            {
                conversation: [
                    { author: tiny, content: '5 MB covers every phone photo I tried.' },
                    { author: owner, content: 'Let me check what the iPhone sends first.' },
                ],
                createdBy: tiny,
                origin: inAll(messages.planMessageId),
                title: 'Pick the upload size cap',
            },
            {
                createdBy: blippy,
                origin: { chatId: channels.demoId, messageId: messages.polishMessageId },
                title: 'Sign off on the core flow polish list',
            },
            {
                archived: true,
                conversation: [
                    { author: tiny, content: 'Drafted the welcome copy and posted it in #all.' },
                    { author: owner, content: 'Reads well. Ship it.' },
                    { author: tiny, content: 'Shipped. Archiving this.' },
                ],
                createdBy: tiny,
                origin: inAll(messages.planMessageId),
                title: 'Write the onboarding welcome copy',
            },
        ],
    });
    if (!ship) {
        throw new Error('The dev seed wrote no active Task to attach work to.');
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
    input: { projectId: string; serverId: string; tasks: readonly DemoTask[] }
): Promise<SeededDemoTask[]> {
    const { projectId, serverId } = input;
    const now = new Date();
    const rows = input.tasks.map((task) => ({
        chatId: createOpaqueId('cht'),
        id: createOpaqueId('tsk'),
        task,
    }));
    await tx.insert(chatsTable).values(
        rows.map(({ chatId, task }) => ({
            id: chatId,
            kind: 'task' as const,
            lastActivityAt: task.conversation?.length ? now : null,
            lastMessageSequence: task.conversation?.length ?? 0,
            parentChatId: projectId,
            parentChatKind: 'channel' as const,
            serverId,
        }))
    );
    await tx.insert(tasksTable).values(
        rows.map(({ chatId, id, task }) => ({
            archivedAt: task.archived ? now : null,
            chatId,
            createdByAgentId: agentIdOf(task.createdBy),
            createdByUserId: userIdOf(task.createdBy),
            id,
            originChatId: task.origin.chatId,
            originMessageId: task.origin.messageId,
            projectId,
            serverId,
            shortId: randomShortId(),
            title: task.title,
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
    return rows.map(({ chatId, id, task }) => ({
        chatId,
        id,
        messageCount: task.conversation?.length ?? 0,
    }));
}

async function seedFollows(
    tx: Tx,
    serverId: string,
    rows: readonly { chatId: string; task: DemoTask }[]
) {
    const followers = rows.flatMap(({ chatId, task }) =>
        [task.createdBy, ...(task.conversation ?? []).map((line) => line.author)].map((actor) => ({
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
