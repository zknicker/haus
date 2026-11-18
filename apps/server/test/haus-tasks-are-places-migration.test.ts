import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/**
 * ADR 0053 over rows 0123 left: boards become key-ledger entries with the same
 * ids and counters, Tasks take their board's key and a state from their column,
 * Channels take the General board's key, and a `task` Chat may hang off a
 * Channel Message beside others on the same anchor.
 */
test('0124 copies boards into the key ledger and backfills Task state and Channel keys', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-tasks-places-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const through = (idx: number) =>
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
            });
        await writeFile(journalPath, through(123));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);

        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
            await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_one', 'subject-one')`;
            await tx`INSERT INTO boards (id, server_id, key, name, next_number, created_by_user_id)
                VALUES ('brd_gen', 'srv_one', 'GEN', 'General', 7, null),
                       ('brd_sec', 'srv_one', 'SEC', 'Security', 3, 'usr_one')`;
            await tx`INSERT INTO board_columns (id, server_id, board_id, name, category, position)
                VALUES ('col_backlog', 'srv_one', 'brd_gen', 'Backlog', 'backlog', 0),
                       ('col_todo', 'srv_one', 'brd_gen', 'Todo', 'todo', 1),
                       ('col_active', 'srv_one', 'brd_gen', 'Doing', 'active', 2),
                       ('col_done', 'srv_one', 'brd_gen', 'Done', 'done', 3),
                       ('col_canceled', 'srv_one', 'brd_sec', 'Nope', 'canceled', 0)`;
            await tx`INSERT INTO tasks (id, server_id, board_id, column_id, number, title, created_by_user_id)
                VALUES ('tsk_backlog', 'srv_one', 'brd_gen', 'col_backlog', 1, 'A', 'usr_one'),
                       ('tsk_todo', 'srv_one', 'brd_gen', 'col_todo', 2, 'B', 'usr_one'),
                       ('tsk_active', 'srv_one', 'brd_gen', 'col_active', 3, 'C', 'usr_one'),
                       ('tsk_done', 'srv_one', 'brd_gen', 'col_done', 4, 'D', 'usr_one'),
                       ('tsk_canceled', 'srv_one', 'brd_sec', 'col_canceled', 1, 'E', 'usr_one')`;
            await tx`INSERT INTO chats (id, server_id, kind, name)
                VALUES ('cht_ops', 'srv_one', 'channel', 'ops')`;
            await tx`INSERT INTO chats (id, server_id, kind, dm_member_one_user_id, dm_member_one_stint, dm_agent_id)
                VALUES ('cht_dm', 'srv_one', 'dm', 'usr_one', 1, 'agt_one')`;
        });

        await writeFile(journalPath, through(124));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0124_tasks-are-places',
        ]);

        expect(await database`SELECT id, key, next_number FROM task_keys ORDER BY key`).toEqual([
            { id: 'brd_gen', key: 'GEN', next_number: 7 },
            { id: 'brd_sec', key: 'SEC', next_number: 3 },
        ]);
        expect(await database`SELECT id, key_id, state, chat_id FROM tasks ORDER BY id`).toEqual([
            { chat_id: null, id: 'tsk_active', key_id: 'brd_gen', state: 'open' },
            { chat_id: null, id: 'tsk_backlog', key_id: 'brd_gen', state: 'todo' },
            { chat_id: null, id: 'tsk_canceled', key_id: 'brd_sec', state: 'canceled' },
            { chat_id: null, id: 'tsk_done', key_id: 'brd_gen', state: 'done' },
            { chat_id: null, id: 'tsk_todo', key_id: 'brd_gen', state: 'todo' },
        ]);
        expect(await database`SELECT id, task_key_id FROM chats ORDER BY id`).toEqual([
            { id: 'cht_dm', task_key_id: null },
            { id: 'cht_ops', task_key_id: 'brd_gen' },
        ]);

        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
                VALUES ('cht_task_a', 'srv_one', 'task', 'cht_ops', 'channel', 'msg_origin'),
                       ('cht_task_b', 'srv_one', 'task', 'cht_ops', 'channel', 'msg_origin')`;
        });
        await expect(
            settle(
                database`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
                VALUES ('cht_task_dm', 'srv_one', 'task', 'cht_dm', 'dm', 'msg_dm')`
            )
        ).rejects.toThrow(/chats_shape/u);
        await expect(
            settle(database`UPDATE chats SET task_key_id = 'brd_gen' WHERE id = 'cht_dm'`)
        ).rejects.toThrow(/chats_task_key_shape/u);
        await expect(
            settle(database`UPDATE tasks SET state = 'active' WHERE id = 'tsk_todo'`)
        ).rejects.toThrow(/tasks_state/u);
        const constraints = await database`
            SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
            WHERE conname IN ('agent_inbox_chat', 'agent_inbox_cloud_agent_notice',
                'thread_follows_kind', 'agent_thread_follows_kind')
            ORDER BY conname`;
        expect(constraints.map((row: { definition: string }) => row.definition)).toEqual([
            expect.stringContaining("'task_assignment'"),
            expect.stringContaining("'pull_request'"),
            expect.stringContaining("'task'"),
            expect.stringContaining("'task'"),
        ]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);

/** Runs a lazy Bun SQL query so `expect().rejects` sees a real promise. */
async function settle(query: PromiseLike<unknown>) {
    return await query;
}
