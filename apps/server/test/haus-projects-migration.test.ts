import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';
import { seedChannelsBeforeProjects } from './projects-migration-seed.ts';

const migrationTag = '0130_channels-are-projects';

test('0130 turns every live or archived channel into a Project with one key', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-projects-'));
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
        await writeFile(journalPath, through(129));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedChannelsBeforeProjects(database);

        await writeFile(journalPath, through(130));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        const projects = await readProjects(database);
        expect(projects).toEqual([
            project('cht_all', 'haus', 'GEN', 'tky_gen'),
            project('cht_alpha', 'alpha', 'TIE', 'tky_tie'),
            project('cht_beta', 'beta', 'BETA'),
            project('cht_dash', '--', 'P2'),
            project('cht_gone', 'gone', null),
            project('cht_haus', 'haus-3', 'HAUS2'),
            project('cht_haus2', 'haus-2', null),
            project('cht_infra', 'infra', 'OPS', 'tky_ops'),
            project('cht_misc', 'misc', 'MISC'),
            project('cht_old', 'old', 'OLD', 'tky_old'),
            project('cht_ops', 'ops', 'OPS2'),
            project('cht_plans', '2024-plans', 'P202'),
            project('cht_under', '__', 'P3'),
            project('cht_b_all', 'haus', 'GEN', 'tky_b_gen'),
            project('cht_b_ops', 'ops', 'OPS'),
        ]);

        expect(
            await database`SELECT id, key_id, number FROM tasks ORDER BY id COLLATE "C"`
        ).toEqual([
            { id: 'tsk_infra', key_id: 'tky_ops', number: 2 },
            { id: 'tsk_infra2', key_id: 'tky_ops', number: 3 },
            { id: 'tsk_misc', key_id: 'tky_gen', number: 1 },
            { id: 'tsk_misc2', key_id: 'tky_gen', number: 2 },
            { id: 'tsk_ops', key_id: 'tky_ops', number: 1 },
        ]);
        expect(await database`SELECT key FROM task_keys WHERE id = 'tky_gone'`).toEqual([
            { key: 'GONE' },
        ]);
        expect(
            await database`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'chats' AND column_name = 'task_key_id'`
        ).toEqual([]);
        await expect(
            settle(database`UPDATE chats SET name = 'all' WHERE id = 'cht_all'`)
        ).rejects.toThrow(/chats_shape/u);
        await expect(
            settle(database`INSERT INTO projects (chat_id, server_id, task_key_id)
                VALUES ('cht_haus2', 'srv_a', 'tky_tie')`)
        ).rejects.toThrow(/projects_task_key_id_key/u);

        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
        const replayed = await readFile(join(folder, `${migrationTag}.sql`), 'utf8');
        for (const statement of replayed.split('--> statement-breakpoint')) {
            await database.unsafe(statement);
        }
        expect(await readProjects(database)).toEqual(projects);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function readProjects(database: SQL) {
    return await database`
        SELECT c.id, c.name, k.key, p.task_key_id
        FROM chats c
        LEFT JOIN projects p ON p.chat_id = c.id
        LEFT JOIN task_keys k ON k.id = p.task_key_id
        WHERE c.kind = 'channel'
        ORDER BY c.server_id, c.id COLLATE "C"`;
}

function project(id: string, name: string, key: string | null, taskKeyId?: string) {
    return {
        id,
        key,
        name,
        task_key_id: key === null ? null : (taskKeyId ?? expect.stringMatching(/^tky_/u)),
    };
}

async function settle(query: PromiseLike<unknown>) {
    return await query;
}
