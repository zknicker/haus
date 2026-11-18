import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { seedLegacyTasks } from './legacy-tasks-seed.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0127 turns worked legacy Tasks into places and archives the rest', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-legacy-tasks-'));
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
        await writeFile(journalPath, through(126));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedLegacyTasks(database);

        await writeFile(journalPath, through(127));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0127_legacy-tasks-and-boards',
        ]);

        const tasks = await database`
            SELECT t.id, t.state, t.key_id, t.completed_at IS NOT NULL AS completed,
                c.parent_chat_id, c.anchor_message_id
            FROM tasks t LEFT JOIN chats c ON c.server_id = t.server_id AND c.id = t.chat_id
            ORDER BY t.number`;
        expect(tasks).toEqual([
            row('tsk_linked', 'open', 'cht_ops', 'msg_ops_1'),
            row('tsk_tracked_a', 'todo', 'cht_all', expect.stringMatching(/^msg_/u)),
            row('tsk_tracked_b', 'todo', 'cht_all', expect.stringMatching(/^msg_/u)),
            row('tsk_drift', 'done'),
            row('tsk_human', 'canceled'),
            row('tsk_unassigned', 'canceled'),
            row('tsk_done', 'done'),
            row('tsk_canceled', 'canceled'),
            row('tsk_place', 'open', 'cht_ops', 'msg_ops_1'),
        ]);
        const counts = (await database`SELECT
            (SELECT count(*)::integer FROM tasks WHERE chat_id IS NOT NULL) AS places,
            (SELECT count(*)::integer FROM tasks WHERE chat_id IS NULL) AS history,
            (SELECT count(*)::integer FROM tasks WHERE chat_id IS NULL AND state = 'canceled'
                AND id IN ('tsk_human', 'tsk_unassigned')) AS canceled_now`) as Record<
            string,
            number
        >[];
        console.info('0127 legacy Task cases', JSON.stringify(counts[0]));
        expect(counts[0]).toEqual({ canceled_now: 2, history: 5, places: 4 });

        const posts = await database`
            SELECT m.sequence, m.author_agent_id, m.content, m.nonce, l.task_id, l.text
            FROM chat_messages m JOIN task_message_links l ON l.message_id = m.id
            WHERE m.chat_id = 'cht_all' ORDER BY m.sequence`;
        expect(posts).toEqual([
            post(3, 'agt_two', 'Tracking GEN-2: Ship the docs', 'tsk_tracked_a', 'GEN-2'),
            post(4, 'agt_one', 'Tracking GEN-3: Fix the build', 'tsk_tracked_b', 'GEN-3'),
        ]);
        expect(
            await database`SELECT id, last_message_sequence, task_key_id FROM chats
                WHERE kind = 'channel' ORDER BY id`
        ).toEqual([
            { id: 'cht_all', last_message_sequence: 4, task_key_id: 'brd_gen' },
            { id: 'cht_new', last_message_sequence: 0, task_key_id: 'brd_gen' },
            { id: 'cht_ops', last_message_sequence: 2, task_key_id: 'brd_gen' },
        ]);

        expect(
            await database`SELECT t.id, f.user_id FROM thread_follows f
                JOIN tasks t ON t.chat_id = f.thread_chat_id
                WHERE f.thread_chat_kind = 'task' AND f.followed ORDER BY t.number, f.user_id`
        ).toEqual([
            { id: 'tsk_linked', user_id: 'usr_ada' },
            { id: 'tsk_linked', user_id: 'usr_bo' },
            { id: 'tsk_tracked_b', user_id: 'usr_bo' },
        ]);
        expect(
            await database`SELECT t.id, f.agent_id, r.sequence FROM agent_thread_follows f
                JOIN tasks t ON t.chat_id = f.thread_chat_id
                LEFT JOIN agent_chat_reads r
                    ON r.agent_id = f.agent_id AND r.chat_id = f.thread_chat_id
                WHERE f.followed ORDER BY t.number`
        ).toEqual([
            { agent_id: 'agt_one', id: 'tsk_linked', sequence: 0 },
            { agent_id: 'agt_two', id: 'tsk_tracked_a', sequence: 0 },
            { agent_id: 'agt_one', id: 'tsk_tracked_b', sequence: 0 },
        ]);

        expect(await database`SELECT id, next_number FROM task_keys`).toEqual([
            { id: 'brd_gen', next_number: 10 },
        ]);
        const [assignment] = await database`
            SELECT content FROM agent_inbox WHERE source = 'task_assignment'`;
        expect(JSON.parse(assignment.content)).toEqual({
            assignedBy: 'ada',
            assignedByAgent: false,
            id: 'task-assign:tsk_linked:1',
            key: 'GEN-1',
            priority: 'none',
            taskId: 'tsk_linked',
            title: 'Rotate the keys',
        });
        expect(
            await database`SELECT tablename FROM pg_tables WHERE schemaname = 'public'
                AND tablename IN ('boards', 'board_columns', 'task_inbox_items')`
        ).toEqual([]);
        expect(
            await database`SELECT column_name, is_nullable FROM information_schema.columns
                WHERE table_name = 'tasks' AND column_name IN ('board_id', 'column_id', 'key_id')`
        ).toEqual([{ column_name: 'key_id', is_nullable: 'NO' }]);
        await expect(
            settle(database`UPDATE tasks SET completed_at = NULL WHERE id = 'tsk_done'`)
        ).rejects.toThrow(/tasks_completed_at/u);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);

function row(id: string, state: string, parent: string | null = null, anchor: unknown = null) {
    return {
        anchor_message_id: anchor,
        completed: state === 'done' || state === 'canceled',
        id,
        key_id: 'brd_gen',
        parent_chat_id: parent,
        state,
    };
}

function post(sequence: number, agent: string, content: string, taskId: string, text: string) {
    return {
        author_agent_id: agent,
        content,
        nonce: `task-origin:${taskId}`,
        sequence,
        task_id: taskId,
        text,
    };
}

async function settle(query: PromiseLike<unknown>) {
    return await query;
}
