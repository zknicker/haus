import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0155_machine-change';

test('0155 starts every Agent, run and push at placement 0 and admits the moved refusal', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-machine-change-'));
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
        await writeFile(journalPath, through(153));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seed(database);

        await writeFile(journalPath, through(154));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        expect(
            await database`
                SELECT
                    (SELECT placement_generation FROM agents) AS agent,
                    (SELECT placement_generation FROM agent_run_triggers) AS run,
                    (SELECT placement_generation FROM drive_pushes) AS push,
                    (SELECT count(*)::int FROM agent_machine_changes) AS changes`
        ).toEqual([{ agent: 0, changes: 0, push: 0, run: 0 }]);
        await database`
            UPDATE agent_invocations SET refusal = 'moved' WHERE id = 'inv_seeded0000000000'`;
        expect(await database`SELECT refusal FROM agent_invocations`).toEqual([
            { refusal: 'moved' },
        ]);
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
        await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone, home_project_id)
            VALUES ('agt_cove', 'srv_a', 'Cove', 'cove', 'UTC', 'prj_a')`;
        await tx`INSERT INTO agent_run_triggers (server_id, agent_id, run_id, source, work_id, chat_id)
            VALUES ('srv_a', 'agt_cove', 'run_a', 'subagent', 'wake_a', null)`;
        await tx`INSERT INTO drive_pushes (server_id, agent_id, id) VALUES ('srv_a', 'agt_cove', 'run_a')`;
        await tx`INSERT INTO agent_invocations (id, server_id, agent_id, run_id, tool_call_id, seq,
                operation_kind, timeout_ms, requested_at, state, outcome, finished_at, computer_id, refusal)
            VALUES ('inv_seeded0000000000', 'srv_a', 'agt_cove', 'run_a', 'tool_a', 0, 'bash', 1000,
                now(), 'finished', 'failed', now(), 'cmp_a', 'no-access')`;
    });
}
