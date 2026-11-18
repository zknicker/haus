import type { SQL } from 'bun';
import { addDatasetLinks } from './thread-migration-dataset-links.ts';
import {
    addRows,
    type DatasetRow,
    type DatasetTables,
    insertDatasetTables,
    seededRandom,
} from './thread-migration-rows.ts';

export const productionShape = {
    cloudWorkThreads: 25,
    taskChats: 10,
    threadMessages: 1276,
    threads: 224,
    totalMessages: 3505,
} as const;

export const datasetServerId = 'srv_mig';
export const datasetUsers = ['usr_0', 'usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5'] as const;
export const datasetAgents = ['agt_0', 'agt_1', 'agt_2', 'agt_3'] as const;

export interface DatasetMessage {
    authorAgentId: string | null;
    authorUserId: string | null;
    chatId: string;
    createdAt: Date;
    id: string;
    mentionedUserIds: string[];
    nonce: string;
    replyRootMessageId: string | null;
    replyToMessageId: string | null;
    sequence: number;
}

export interface DatasetChat {
    anchor: DatasetMessage | null;
    id: string;
    kind: 'channel' | 'dm' | 'thread' | 'task';
    messages: DatasetMessage[];
    parent: DatasetChat | null;
}

export interface ThreadMigrationDataset {
    parents: DatasetChat[];
    tables: DatasetTables;
    tasks: DatasetChat[];
    threads: DatasetChat[];
}

const base = Date.parse('2026-01-05T09:00:00.000Z');
const parentCount = 12;
const dmStart = 8;
const taskMessagesEach = 10;

export async function seedThreadMigrationDataset(database: SQL) {
    const dataset = buildThreadMigrationDataset();
    await insertDatasetTables(database, dataset.tables);
    return dataset;
}

export function buildThreadMigrationDataset(): ThreadMigrationDataset {
    const random = seededRandom(52_014);
    const tables: DatasetTables = new Map();
    addIdentities(tables);
    const parents = Array.from({ length: parentCount }, (_, index) => parentChat(index));
    const parentMessageTotal =
        productionShape.totalMessages -
        productionShape.threadMessages -
        productionShape.taskChats * taskMessagesEach;
    const parentMessages: DatasetMessage[] = [];
    for (let index = 0; index < parentMessageTotal; index += 1) {
        const chat = parents[index % parentCount] as DatasetChat;
        const previous = chat.messages.at(-1) ?? null;
        const message = newMessage(
            chat,
            index,
            new Date(base + index * 60_000),
            previous,
            index % 7 === 3
        );
        parentMessages.push(message);
    }
    const threads = Array.from({ length: productionShape.threads }, (_, index) => {
        const anchor =
            parentMessages[Math.floor((index * parentMessageTotal) / productionShape.threads) + 3];
        return threadChat(index, anchor as DatasetMessage, parents, random);
    });
    shareNonces(threads);
    const tasks = taskChats(threads);
    for (const chat of [...parents, ...threads, ...tasks]) {
        addRows(tables, 'chats', chatRow(chat));
    }
    for (const chat of [...parents, ...threads, ...tasks]) {
        addRows(tables, 'chat_messages', ...chat.messages.map(messageRow));
    }
    addDatasetLinks(tables, { parents, tasks, threads }, random);
    return { parents, tables, tasks, threads };
}

function addIdentities(tables: DatasetTables) {
    addRows(tables, 'servers', {
        display_name: 'Migration',
        id: datasetServerId,
        slug: 'migration',
    });
    datasetUsers.forEach((userId, index) => {
        addRows(tables, 'users', { auth_subject: `subject-${index}`, id: userId });
        addRows(tables, 'server_memberships', {
            handle: `person-${index}`,
            id: `mem_${index}`,
            role: index === 0 ? 'owner' : 'member',
            server_id: datasetServerId,
            user_id: userId,
        });
    });
    datasetAgents.forEach((agentId, index) => {
        addRows(tables, 'agents', {
            display_name: `Agent ${index}`,
            handle: `helper-${index}`,
            home_timezone: 'UTC',
            id: agentId,
            server_id: datasetServerId,
        });
    });
}

function parentChat(index: number): DatasetChat {
    return {
        anchor: null,
        id: index < dmStart ? `cht_channel_${index}` : `cht_dm_${index}`,
        kind: index < dmStart ? 'channel' : 'dm',
        messages: [],
        parent: null,
    };
}

function threadChat(
    index: number,
    anchor: DatasetMessage,
    parents: DatasetChat[],
    random: () => number
): DatasetChat {
    const parent = parents.find((chat) => chat.id === anchor.chatId) as DatasetChat;
    const chat: DatasetChat = {
        anchor,
        id: `cht_thread_${index}`,
        kind: 'thread',
        messages: [],
        parent,
    };
    const size = index < 156 ? 6 : 5;
    let at = anchor.createdAt.getTime();
    for (let position = 0; position < size; position += 1) {
        at += 30_000 + Math.floor(random() * 300_000);
        const previous = chat.messages.at(-1) ?? null;
        const inline = position >= 2 && position % 3 === 2;
        const message = newMessage(chat, index + position, new Date(at), previous, inline);
        if (position === 1) {
            message.mentionedUserIds = [datasetUsers[index % datasetUsers.length] as string];
        }
    }
    return chat;
}

function taskChats(threads: DatasetChat[]) {
    const channelThreads = threads.filter((thread) => thread.parent?.kind === 'channel');
    return Array.from({ length: productionShape.taskChats }, (_, index) => {
        const thread = channelThreads[index * 13] as DatasetChat;
        const chat: DatasetChat = {
            anchor: thread.anchor,
            id: `cht_task_${index}`,
            kind: 'task',
            messages: [],
            parent: thread.parent,
        };
        const start = (thread.anchor as DatasetMessage).createdAt.getTime();
        for (let position = 0; position < taskMessagesEach; position += 1) {
            const previous = chat.messages.at(-1) ?? null;
            newMessage(
                chat,
                index + position,
                new Date(start + (position + 1) * 45_000),
                previous,
                false
            );
        }
        return chat;
    });
}

function shareNonces(threads: DatasetChat[]) {
    const first = threads[0] as DatasetChat;
    (first.messages[0] as DatasetMessage).nonce = (first.anchor as DatasetMessage).nonce;
    const sibling = threads.find((thread) => thread !== first && thread.parent === first.parent);
    if (!sibling) {
        throw new Error('The dataset needs two Threads under one parent');
    }
    (first.messages[1] as DatasetMessage).nonce = 'shared-nonce';
    (sibling.messages[1] as DatasetMessage).nonce = 'shared-nonce';
}

function newMessage(
    chat: DatasetChat,
    seed: number,
    createdAt: Date,
    previous: DatasetMessage | null,
    inline: boolean
): DatasetMessage {
    const sequence = chat.messages.length + 1;
    const id = `msg_${chat.id.slice(4)}_${sequence}`;
    const byAgent = seed % 3 === 0;
    const reply = inline && previous !== null;
    const message: DatasetMessage = {
        authorAgentId: byAgent ? (datasetAgents[seed % datasetAgents.length] as string) : null,
        authorUserId: byAgent ? null : (datasetUsers[seed % datasetUsers.length] as string),
        chatId: chat.id,
        createdAt,
        id,
        mentionedUserIds: [],
        nonce: `nonce-${id}`,
        replyRootMessageId: reply
            ? (previous.replyRootMessageId ?? previous.id)
            : seed % 2 === 0
              ? id
              : null,
        replyToMessageId: reply ? previous.id : null,
        sequence,
    };
    chat.messages.push(message);
    return message;
}

function chatRow(chat: DatasetChat): DatasetRow {
    const index = Number(chat.id.split('_').at(-1));
    const first = chat.messages[0] as DatasetMessage;
    const last = chat.messages.at(-1) as DatasetMessage;
    const created = chat.anchor
        ? new Date(chat.anchor.createdAt.getTime() + 1000)
        : new Date(base - 86_400_000);
    const human = chat.kind === 'dm' && index < 10;
    return {
        anchor_message_id: chat.anchor?.id ?? null,
        created_at: created < first.createdAt ? created : first.createdAt,
        dm_agent_id: chat.kind === 'dm' && !human ? (datasetAgents[index - 10] as string) : null,
        dm_member_one_stint: chat.kind === 'dm' ? 1 : null,
        dm_member_one_user_id:
            chat.kind === 'dm'
                ? (datasetUsers[human ? (index - dmStart) * 2 : index - 6] as string)
                : null,
        dm_member_two_stint: human ? 1 : null,
        dm_member_two_user_id: human ? (datasetUsers[(index - dmStart) * 2 + 1] as string) : null,
        id: chat.id,
        kind: chat.kind,
        last_activity_at: last.createdAt,
        last_message_sequence: chat.messages.length,
        name: chat.kind === 'channel' ? `room-${index}` : null,
        parent_chat_id: chat.parent?.id ?? null,
        parent_chat_kind: chat.parent?.kind ?? null,
        server_id: datasetServerId,
    };
}

function messageRow(message: DatasetMessage): DatasetRow {
    return {
        author_agent_id: message.authorAgentId,
        author_user_id: message.authorUserId,
        chat_id: message.chatId,
        content: `Message ${message.id}`,
        created_at: message.createdAt,
        id: message.id,
        mentioned_user_ids: message.mentionedUserIds,
        nonce: message.nonce,
        reply_root_message_id: message.replyRootMessageId,
        reply_to_message_id: message.replyToMessageId,
        sequence: message.sequence,
        server_id: datasetServerId,
    };
}
