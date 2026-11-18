import type { DatasetChat, DatasetMessage } from './thread-migration-dataset.ts';
import { addRows, type DatasetTables, idBody } from './thread-migration-rows.ts';

const serverId = 'srv_mig';
const agents = ['agt_0', 'agt_1', 'agt_2', 'agt_3'];
const at = new Date('2026-03-01T12:00:00.000Z');

/** Work, claims, reminders, triggers, attachments, and run records anchored in Threads. */
export function addDatasetRecords(
    tables: DatasetTables,
    chats: { tasks: DatasetChat[]; threads: DatasetChat[] }
) {
    addWork(tables, chats.threads);
    addAnchoredRecords(tables, chats.threads);
    addLiveRun(tables, chats.threads[40] as DatasetChat);
    const task = chats.tasks[0] as DatasetChat;
    addRows(
        tables,
        'reminders',
        reminder('rem_task', task.id, (task.anchor as DatasetMessage).id, 'agt_0')
    );
}

/** Cloud agent work on 25 Threads, image generations, and claims on Thread Messages. */
function addWork(tables: DatasetTables, threads: DatasetChat[]) {
    const claimNumbers = new Map<string, number>();
    threads.forEach((chat, index) => {
        const message = (position: number) => (chat.messages[position] as DatasetMessage).id;
        const parent = chat.parent as DatasetChat;
        if (index % 9 === 0) {
            const workId = `caw_${idBody(index + 1)}`;
            addRows(tables, 'cloud_agent_work', {
                agent_id: agents[index % 4] as string,
                chat_id: chat.id,
                computer_id: 'cmp_mini',
                id: workId,
                launch_message_id: message(0),
                provider: 'claude',
                repository: 'acme/api',
                server_id: serverId,
                title: `Work ${index}`,
            });
            addRows(tables, 'cloud_agent_work_links', workLink(chat.id, message(1), workId));
            addRows(
                tables,
                'cloud_agent_work_links',
                workLink(parent.id, (chat.anchor as DatasetMessage).id, workId)
            );
        }
        if (index % 45 === 2) {
            addRows(tables, 'image_generation_links', {
                chat_id: chat.id,
                generation_id: `img_${index}`,
                message_id: message(2),
                ordinal: 0,
                server_id: serverId,
            });
        }
        if (index % 17 === 4) {
            const number = (claimNumbers.get(parent.id) ?? 0) + 1;
            claimNumbers.set(parent.id, number);
            addRows(tables, 'message_claims', {
                assignee_agent_id: agents[index % 4] as string,
                chat_id: parent.id,
                claimed_at: at,
                created_by_agent_id: agents[index % 4] as string,
                message_id: message(0),
                number,
                origin: 'claimed',
                server_id: serverId,
                status: 'in_progress',
                thread_chat_id: chat.id,
            });
        }
    });
}

function addAnchoredRecords(tables: DatasetTables, threads: DatasetChat[]) {
    threads.forEach((chat, index) => {
        const message = (position: number) => (chat.messages[position] as DatasetMessage).id;
        const owner = agents[index % 4] as string;
        if (index % 23 === 7) {
            addRows(
                tables,
                'reminders',
                reminder(`rem_${index}`, chat.id, message(chat.messages.length - 1), owner)
            );
            if (index < 100) {
                addRows(tables, 'reminder_agent_attention', {
                    agent_id: owner,
                    anchor_chat_id: chat.id,
                    attention_kind: 'reminder',
                    fire_id: `rfi_${index}`,
                    id: `raa_${index}`,
                    queued_at: at,
                    reminder_id: `rem_${index}`,
                    server_id: serverId,
                });
                addRows(tables, 'message_causes', {
                    anchor_chat_id: chat.id,
                    attribution: 'explicit',
                    fired_at: at,
                    kind: 'reminder_fire',
                    message_id: message(1),
                    owner_agent_id: owner,
                    reminder_fire_id: `rfi_${index}`,
                    reminder_id: `rem_${index}`,
                    server_id: serverId,
                    summary: 'Daily',
                    title: 'Check in',
                });
            }
        }
        if (index % 50 === 10) {
            addRows(tables, 'triggers', {
                anchor_chat_id: chat.id,
                anchor_message_id: message(0),
                created_at: at,
                id: `trg_${index}`,
                kind: 'github',
                owner_agent_id: owner,
                server_id: serverId,
                status: 'armed',
                title: `Trigger ${index}`,
                updated_at: at,
            });
            addRows(tables, 'agent_run_triggers', {
                agent_id: owner,
                chat_id: chat.id,
                run_id: `run_${index}`,
                server_id: serverId,
                source: 'human',
                work_id: `work_${index}`,
            });
        }
        if (index % 20 === 3) {
            addRows(tables, 'attachments', {
                chat_id: chat.id,
                filename: `shot-${index}.png`,
                id: `att_${idBody(1000 + index)}`,
                media_type: 'image/png',
                message_id: message(3),
                message_position: 0,
                server_id: serverId,
                state: 'ready',
                upload_nonce: `upload-${index}`,
                uploader_user_id: 'usr_0',
            });
        }
    });
}

/** An Agent mid-run in a Thread: its delivery row and runner credential name the Thread. */
function addLiveRun(tables: DatasetTables, live: DatasetChat) {
    addRows(tables, 'agent_runner_credentials', {
        agent_id: 'agt_3',
        chat_id: live.id,
        computer_id: 'cmp_mini',
        id: `arc_${idBody(7)}`,
        run_id: 'run_live',
        server_id: serverId,
        token_hash: 'a'.repeat(64),
    });
    addRows(tables, 'agent_delivery', {
        active_run_chat_id: live.id,
        active_run_computer_id: 'cmp_mini',
        active_run_id: 'run_live',
        active_run_model_id: 'opus',
        active_run_reasoning_effort: 'default',
        active_run_runtime_id: 'claude-code',
        agent_id: 'agt_3',
        server_id: serverId,
    });
}

function workLink(chatId: string, messageId: string, workId: string) {
    return {
        chat_id: chatId,
        message_id: messageId,
        ordinal: 0,
        server_id: serverId,
        work_id: workId,
    };
}

function reminder(id: string, chatId: string, messageId: string, owner: string) {
    return {
        anchor_chat_id: chatId,
        anchor_message_id: messageId,
        created_at: at,
        fire_at: at,
        id,
        owner_agent_id: owner,
        server_id: serverId,
        status: 'scheduled',
        timezone: 'UTC',
        title: `Reminder ${id}`,
        updated_at: at,
    };
}
