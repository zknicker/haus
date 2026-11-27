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
import { insertTaskAgent } from '../tasks/task-agent.ts';
import { randomShortId } from '../tasks/task-short-id.ts';
import { seedDemoTaskWork } from './seed-demo-task-work.ts';

type Tx = Pick<HausDatabase, 'insert' | 'select' | 'update'>;

const demoCrewModel = 'gpt-5.6-sol';

type DemoAuthor = TaskActor | 'crew';

interface DemoTask {
    archived?: true;
    conversation?: readonly { author: DemoAuthor; content: string }[];
    createdBy: TaskActor;
    origin: { chatId: string; messageId: string };
    title: string;
}

export interface SeededDemoTask {
    agentId: string | null;
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
    const crew = 'crew' as const;
    const inAll = (messageId: string) => ({ chatId: channels.allId, messageId });
    const [ship] = await seedDemoTasks(tx, {
        computerId: input.computerId,
        projectId: channels.demoId,
        serverId: input.serverId,
        tasks: [
            {
                conversation: [
                    { author: crew, content: 'Taking this. Upload, crop, and save in one pass.' },
                    { author: owner, content: 'Keep the crop square for now.' },
                    { author: crew, content: 'Square it is. Starting the build now.' },
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
                    { author: crew, content: '5 MB covers every phone photo I tried.' },
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
                    { author: crew, content: 'Drafted the welcome copy and posted it in #all.' },
                    { author: owner, content: 'Reads well. Ship it.' },
                    { author: crew, content: 'Shipped. Archiving this.' },
                ],
                createdBy: tiny,
                origin: inAll(messages.planMessageId),
                title: 'Write the onboarding welcome copy',
            },
        ],
    });
    if (!ship?.agentId) {
        throw new Error('The dev seed wrote no active crew Task to attach work to.');
    }
    await seedDemoTaskWork(tx, {
        agentId: ship.agentId,
        serverId: input.serverId,
        task: ship,
    });
}

export async function seedDemoTasks(
    tx: Tx,
    input: { computerId: string; projectId: string; serverId: string; tasks: readonly DemoTask[] }
): Promise<SeededDemoTask[]> {
    const { computerId, projectId, serverId } = input;
    const now = new Date();
    const rows = await Promise.all(
        input.tasks.map(async (task) => {
            const shortId = randomShortId();
            const captainId = agentIdOf(task.createdBy);
            const agentId = captainId
                ? await insertTaskAgent(tx, {
                      serverId,
                      session: { computerId, modelId: demoCrewModel, runtimeId: 'codex' },
                      shortId,
                      starter: task.createdBy,
                      title: task.title,
                  })
                : null;
            return {
                agentId,
                captainId,
                chatId: createOpaqueId('cht'),
                id: createOpaqueId('tsk'),
                shortId,
                task,
            };
        })
    );
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
        rows.map(({ agentId, captainId, chatId, id, shortId, task }) => ({
            agentId,
            archivedAt: task.archived ? now : null,
            captainId,
            chatId,
            computerId: agentId ? computerId : null,
            createdByAgentId: agentIdOf(task.createdBy),
            createdByUserId: userIdOf(task.createdBy),
            id,
            originChatId: task.origin.chatId,
            originMessageId: task.origin.messageId,
            projectId,
            model: agentId ? demoCrewModel : null,
            serverId,
            shortId,
            title: task.title,
        }))
    );
    const conversation = rows.flatMap(({ agentId, chatId, task }) =>
        (task.conversation ?? []).map((line, index) => {
            const id = createOpaqueId('msg');
            return {
                authorAgentId: line.author === 'crew' ? agentId : agentIdOf(line.author),
                authorUserId: line.author === 'crew' ? null : userIdOf(line.author),
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
    return rows.map(({ agentId, chatId, id, task }) => ({
        agentId,
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
        [
            task.createdBy,
            ...(task.conversation ?? []).flatMap((line) =>
                line.author === 'crew' ? [] : [line.author]
            ),
        ].map((actor) => ({ actor, chatId }))
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
