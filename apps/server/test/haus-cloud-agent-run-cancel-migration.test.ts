import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;

beforeAll(async () => {
    cluster = await startPostgresCluster();
});

afterAll(async () => {
    await cluster.stop();
});

test('migration 0115 copies a cancel onto live Runs and the newest Run', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-run-cancel-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_run_cancel_test';
    let upgraded: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const throughMigration = (idx: number) =>
            writeFile(
                journalPath,
                JSON.stringify({
                    ...journal,
                    entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
                })
            );
        await throughMigration(114);
        await database.unsafe('CREATE DATABASE haus_run_cancel_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL({ max: 1, url: url.toString() });
        await seed(upgraded);

        await throughMigration(115);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0115_cloud-agent-run-cancel',
        ]);

        const runs = (await upgraded`
            SELECT id, cancel_requested_by_agent_id FROM cloud_agent_runs ORDER BY id
        `) as { cancel_requested_by_agent_id: null | string; id: string }[];
        expect(runs).toEqual([
            { cancel_requested_by_agent_id: null, id: 'car_000000000000000a' },
            { cancel_requested_by_agent_id: 'agt_mig', id: 'car_000000000000000b' },
            { cancel_requested_by_agent_id: 'agt_mig', id: 'car_000000000000000c' },
            { cancel_requested_by_agent_id: null, id: 'car_000000000000000d' },
        ]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_run_cancel_test');
        await database.close();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seed(sql: SQL) {
    await sql.unsafe('SET session_replication_role = replica');
    await sql.unsafe(`
        INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_mig', 'srv_mig', 'mig', 'Mig', 'UTC');
        INSERT INTO cloud_agent_work (
            id, server_id, chat_id, launch_message_id, agent_id, computer_id, provider, repository,
            title, status, terminal_at, cancel_requested_at, cancel_requested_by_agent_id
        ) VALUES
            ('caw_mig0000000000001', 'srv_mig', 'cht_mig', 'msg_a', 'agt_mig', 'cmp_mig', 'cursor',
             'demo/repo', 'Cancelled', 'cancelled', now(), now(), 'agt_mig'),
            ('caw_mig0000000000002', 'srv_mig', 'cht_mig', 'msg_b', 'agt_mig', 'cmp_mig', 'cursor',
             'demo/repo', 'Running', 'running', NULL, NULL, NULL);
        INSERT INTO cloud_agent_runs (id, server_id, work_id, status, terminal_at, created_at) VALUES
            ('car_000000000000000a', 'srv_mig', 'caw_mig0000000000001', 'completed', now(), now() - interval '3 hours'),
            ('car_000000000000000b', 'srv_mig', 'caw_mig0000000000001', 'running', NULL, now() - interval '2 hours'),
            ('car_000000000000000c', 'srv_mig', 'caw_mig0000000000001', 'cancelled', now(), now() - interval '1 hour'),
            ('car_000000000000000d', 'srv_mig', 'caw_mig0000000000002', 'running', NULL, now());
    `);
    await sql.unsafe('SET session_replication_role = DEFAULT');
}
