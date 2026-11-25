import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0158_worker-drive-fences';
const dispatched = 'wkt_dispatched000000';
const queued = 'wkt_queued0000000000';

test('0158 fences dispatched Worker turns at their Agent generation and admits Worker deleters', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-worker-drive-fences-'));
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
        await writeFile(journalPath, through(156));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seed(database);

        await writeFile(journalPath, through(157));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        expect(await database`SELECT id, reset_generation FROM worker_turns ORDER BY id`).toEqual([
            { id: dispatched, reset_generation: 2 },
            { id: queued, reset_generation: null },
        ]);
        await database`UPDATE artifacts SET deleted_at = now(), deleted_by = 'worker:wkr_aaaaaaaaaaaaaaaa'`;
        expect(await database`SELECT deleted_by FROM artifacts`).toEqual([
            { deleted_by: 'worker:wkr_aaaaaaaaaaaaaaaa' },
        ]);
        const refused = await database`UPDATE artifacts SET deleted_by = 'robot:a'`.catch(
            (cause: Error) => cause.message
        );
        expect(refused).toContain('artifacts_deleted_by_shape');
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seed(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_a', 'a', 'A')`;
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone,
                home_project_id, reset_generation)
            VALUES ('agt_cove', 'srv_a', 'Cove', 'cove', 'UTC', 'prj_a', 2)`;
        await tx`INSERT INTO workers (id, server_id, agent_id, carrier_computer_id, place, runtime,
                repository, task_id, title)
            VALUES ('wkr_aaaaaaaaaaaaaaaa', 'srv_a', 'agt_cove', 'cmp_a', 'computer', 'codex', 'haus/haus',
                'tsk_a', 'Report')`;
        await tx`INSERT INTO worker_turns (id, server_id, worker_id, input, dispatched_at)
            VALUES (${dispatched}, 'srv_a', 'wkr_aaaaaaaaaaaaaaaa', '[]'::jsonb, now()),
                (${queued}, 'srv_a', 'wkr_aaaaaaaaaaaaaaaa', '[]'::jsonb, null)`;
        await tx`INSERT INTO artifacts (id, server_id, path, path_key, creator_agent_id)
            VALUES ('art_a', 'srv_a', 'agents/cove/a.md', 'agents/cove/a.md', 'agt_cove')`;
    });
}
