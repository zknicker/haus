import type { DatasetChat, DatasetMessage } from './thread-migration-dataset.ts';
import { addDatasetRecords } from './thread-migration-dataset-records.ts';
import { addRows, type DatasetTables, idBody } from './thread-migration-rows.ts';

const serverId = 'srv_mig';
const users = ['usr_0', 'usr_1', 'usr_2', 'usr_3', 'usr_4', 'usr_5'];
const agents = ['agt_0', 'agt_1', 'agt_2', 'agt_3'];
const at = new Date('2026-03-01T12:00:00.000Z');
const readFractions = [0.35, 0.6, 0.9, 1];

interface DatasetChats {
    parents: DatasetChat[];
    tasks: DatasetChat[];
    threads: DatasetChat[];
}

/** Everything that names a Chat or Message besides the Messages themselves. */
export function addDatasetLinks(tables: DatasetTables, chats: DatasetChats, random: () => number) {
    addReads(tables, chats, random);
    addAgentPositions(tables, chats, random);
    addInboxItems(tables, chats);
    addDrafts(tables, chats.threads);
    addDatasetRecords(tables, chats);
}

/** Human read markers and follows at varied positions, plus Task follows that must survive. */
function addReads(tables: DatasetTables, chats: DatasetChats, random: () => number) {
    users.forEach((userId, user) => {
        chats.parents.forEach((chat, index) => {
            if ((user + index) % 4 === 0) {
                return;
            }
            const sequence = Math.floor(
                chat.messages.length * (readFractions[(user * 3 + index) % 4] as number)
            );
            addRows(
                tables,
                'chat_reads',
                read(chat, userId, sequence, user % 2 === 0 ? sequence : 0)
            );
        });
        chats.threads.forEach((chat, index) => {
            if ((index + user) % 3 === 0) {
                const sequence = Math.floor(random() * (chat.messages.length + 1));
                addRows(tables, 'chat_reads', read(chat, userId, sequence, 0));
            }
            const followed = (index + user) % 4 === 0;
            if (followed || (index + user) % 11 === 0) {
                addRows(tables, 'thread_follows', follow(chat, userId, followed, 'thread'));
            }
            if ((index + user) % 9 === 0) {
                addRows(tables, 'thread_closures', {
                    closed_through_sequence: 1 + Math.floor(random() * chat.messages.length),
                    server_id: serverId,
                    thread_chat_id: chat.id,
                    user_id: userId,
                });
            }
        });
        chats.tasks.forEach((chat, index) => {
            addRows(
                tables,
                'chat_reads',
                read(chat, userId, (index + user) % chat.messages.length, 0)
            );
            if ((index + user) % 3 === 0) {
                addRows(tables, 'thread_follows', follow(chat, userId, true, 'task'));
            }
        });
    });
}

/** Agent read markers, follows, and freshness cursors across two session generations. */
function addAgentPositions(tables: DatasetTables, chats: DatasetChats, random: () => number) {
    agents.forEach((agentId, agent) => {
        chats.parents.forEach((chat, index) => {
            const length = chat.messages.length;
            if ((agent + index) % 3 !== 0) {
                const sequence = Math.floor(
                    length * (readFractions[(agent + index) % 4] as number)
                );
                addRows(tables, 'agent_chat_reads', agentRead(chat, agentId, sequence));
            }
            if ((agent + index) % 2 === 0) {
                const seen = Math.floor(length * 0.7);
                addRows(
                    tables,
                    'agent_inbox_cursors',
                    cursor(chat, agentId, 1, seen, Math.min(length, seen + 2))
                );
            }
            if (agent === 0 && index < 3) {
                addRows(
                    tables,
                    'agent_inbox_cursors',
                    cursor(chat, agentId, 2, length - 4, length - 4)
                );
            }
        });
        chats.threads.forEach((chat, index) => {
            const length = chat.messages.length;
            if ((index + agent) % 5 === 0) {
                addRows(
                    tables,
                    'agent_chat_reads',
                    agentRead(chat, agentId, Math.floor(random() * (length + 1)))
                );
            }
            const followed = (index + agent) % 6 === 0;
            if (followed || (index + agent) % 13 === 0) {
                addRows(
                    tables,
                    'agent_thread_follows',
                    agentFollow(chat, agentId, followed, 'thread')
                );
            }
            if ((index + agent) % 7 === 0) {
                const seen = Math.floor(random() * (length + 1));
                addRows(
                    tables,
                    'agent_inbox_cursors',
                    cursor(chat, agentId, 1, seen, Math.min(length, seen + 1))
                );
            }
            if (agent === 0 && index < 12) {
                addRows(tables, 'agent_inbox_cursors', cursor(chat, agentId, 2, 1, 2));
            }
        });
        chats.tasks.forEach((chat, index) => {
            addRows(tables, 'agent_chat_reads', agentRead(chat, agentId, (index * 3 + agent) % 10));
            if ((index + agent) % 2 === 0) {
                addRows(tables, 'agent_thread_follows', agentFollow(chat, agentId, true, 'task'));
            }
        });
    });
}

/** Inbox deliveries for Thread and parent Messages, and exact-visibility rows. */
function addInboxItems(tables: DatasetTables, chats: DatasetChats) {
    let counter = 0;
    const deliver = (message: DatasetMessage, agentId: string, mentioned: boolean) => {
        counter += 1;
        addRows(tables, 'agent_inbox', {
            agent_id: agentId,
            chat_id: message.chatId,
            content: `Delivery of ${message.id}`,
            dedupe_key: message.id,
            id: `inb_${idBody(counter)}`,
            mentioned,
            server_id: serverId,
            state: counter % 3 === 0 ? 'queued' : 'seen',
        });
    };
    chats.threads.forEach((chat, index) => {
        chat.messages.forEach((message, position) => {
            if ((index + position) % 5 === 0) {
                deliver(message, agents[(index + position) % 4] as string, position === 1);
            }
        });
        if (index % 10 === 1) {
            addRows(tables, 'agent_inbox_exact_visibility', {
                agent_id: agents[index % 4] as string,
                chat_id: chat.id,
                message_id: (chat.messages[0] as DatasetMessage).id,
                server_id: serverId,
                session_generation: 1,
            });
        }
    });
    for (const chat of chats.parents) {
        chat.messages.slice(-6).forEach((message, position) => {
            deliver(message, agents[position % 4] as string, false);
        });
    }
}

/** Held drafts: a parent draft beats a Thread draft, the newest Thread draft beats another. */
function addDrafts(tables: DatasetTables, threads: DatasetChat[]) {
    const first = threads[1] as DatasetChat;
    const sibling = threads.find(
        (thread) => thread !== first && thread.parent === first.parent
    ) as DatasetChat;
    const draft = (
        chat: DatasetChat,
        agentId: string,
        savedAt: string,
        replyTo: string | null
    ) => ({
        agent_id: agentId,
        chat_id: chat.id,
        content: `Draft in ${chat.id}`,
        rehold_count: 1,
        reply_to_message_id: replyTo,
        saved_at: new Date(savedAt),
        server_id: serverId,
        session_generation: 1,
    });
    addRows(
        tables,
        'agent_message_drafts',
        draft(first, 'agt_0', '2026-03-01T10:00:00Z', null),
        draft(first.parent as DatasetChat, 'agt_0', '2026-03-01T09:00:00Z', null),
        draft(first, 'agt_1', '2026-03-01T10:00:00Z', null),
        draft(sibling, 'agt_1', '2026-03-01T11:00:00Z', null),
        draft(threads[5] as DatasetChat, 'agt_2', '2026-03-01T10:00:00Z', null),
        draft(
            threads[6] as DatasetChat,
            'agt_3',
            '2026-03-01T10:00:00Z',
            (threads[6]?.messages[1] as DatasetMessage).id
        )
    );
}

function read(chat: DatasetChat, userId: string, sequence: number, doneSequence: number) {
    return {
        chat_id: chat.id,
        done_sequence: doneSequence,
        reader_user_id: userId,
        sequence,
        server_id: serverId,
        updated_at: at,
    };
}

function follow(chat: DatasetChat, userId: string, followed: boolean, kind: 'task' | 'thread') {
    return {
        followed,
        server_id: serverId,
        thread_chat_id: chat.id,
        thread_chat_kind: kind,
        user_id: userId,
    };
}

function agentRead(chat: DatasetChat, agentId: string, sequence: number) {
    return { agent_id: agentId, chat_id: chat.id, sequence, server_id: serverId };
}

function agentFollow(
    chat: DatasetChat,
    agentId: string,
    followed: boolean,
    kind: 'task' | 'thread'
) {
    return {
        agent_id: agentId,
        followed,
        server_id: serverId,
        thread_chat_id: chat.id,
        thread_chat_kind: kind,
    };
}

function cursor(
    chat: DatasetChat,
    agentId: string,
    generation: number,
    seen: number,
    held: number
) {
    return {
        agent_id: agentId,
        chat_id: chat.id,
        held_through_sequence: held,
        seen_up_to_sequence: seen,
        server_id: serverId,
        session_generation: generation,
    };
}
