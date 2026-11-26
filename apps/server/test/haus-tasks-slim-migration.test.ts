import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0159 gives every existing Task a short id and drops its backlog fields', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-tasks-slim-'));
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
        await writeFile(journalPath, through(157));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedBacklogTasks(database);

        await writeFile(journalPath, through(158));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0159_tasks-slim',
        ]);
        const tasks = (await database`
            SELECT id, short_id, archived_at FROM tasks ORDER BY id
        `) as { archived_at: Date | null; id: string; short_id: string }[];
        expect(tasks.map((task) => task.id)).toEqual(['tsk_done', 'tsk_labeled', 'tsk_open']);
        expect(tasks.every((task) => /^[0-9a-hjkmnp-tv-z]{8}$/u.test(task.short_id))).toBe(true);
        expect(new Set(tasks.map((task) => task.short_id)).size).toBe(3);
        expect(tasks.every((task) => task.archived_at === null)).toBe(true);

        const columns = (await database`
            SELECT column_name FROM information_schema.columns WHERE table_name = 'tasks'
        `) as { column_name: string }[];
        const names = columns.map((column) => column.column_name);
        for (const dropped of ['state', 'priority', 'due_on', 'assignee_user_id', 'key_id']) {
            expect(names).not.toContain(dropped);
        }
        const [labels] = (await database`
            SELECT to_regclass('task_labels') IS NOT NULL AS catalog,
                to_regclass('task_label_assignments') IS NOT NULL AS assignments
        `) as { assignments: boolean; catalog: boolean }[];
        expect(labels).toEqual({ assignments: false, catalog: true });
        await expect(
            database`UPDATE tasks SET short_id = 'SEC-12xx' WHERE id = 'tsk_open'`.then(() => null)
        ).rejects.toThrow(/tasks_short_id_shape/u);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedBacklogTasks(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO users (id, auth_subject) VALUES ('usr_one', 'subject-one')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_ops', 'srv_one', 'channel', 'ops')`;
        await tx`INSERT INTO task_keys (id, server_id, key, next_number)
            VALUES ('tky_gen', 'srv_one', 'GEN', 4)`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id)
            VALUES ('cht_ops', 'srv_one', 'tky_gen')`;
        await tx`INSERT INTO task_labels (id, server_id, name, color)
            VALUES ('lbl_one', 'srv_one', 'Infra', 'blue')`;
        await tx`INSERT INTO tasks (id, server_id, key_id, project_id, number, title, state,
                priority, due_on, completed_at, assignee_user_id, created_by_user_id)
            VALUES
                ('tsk_open', 'srv_one', 'tky_gen', 'cht_ops', 1, 'Open', 'open', 'high',
                    '2026-12-01', null, 'usr_one', 'usr_one'),
                ('tsk_done', 'srv_one', 'tky_gen', 'cht_ops', 2, 'Done', 'done', 'none',
                    null, now(), null, 'usr_one'),
                ('tsk_labeled', 'srv_one', 'tky_gen', 'cht_ops', 3, 'Labeled', 'todo', 'low',
                    null, null, null, 'usr_one')`;
        await tx`INSERT INTO task_label_assignments (task_id, label_id, server_id)
            VALUES ('tsk_labeled', 'lbl_one', 'srv_one')`;
    });
}
