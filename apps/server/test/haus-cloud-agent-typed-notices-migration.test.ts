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

const live = 'car_000000000000000a';
const settled = 'car_000000000000000b';

test('migration 0116 types both notice key shapes and moves live error codes to stalls', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-typed-notices-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_typed_notices_test';
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
        await throughMigration(115);
        await database.unsafe('CREATE DATABASE haus_typed_notices_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL({ max: 1, url: url.toString() });
        await seed(upgraded);

        await throughMigration(116);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0116_cloud-agent-typed-notices',
        ]);

        expect(
            await upgraded`
                SELECT dedupe_key, cloud_agent_run_id, cloud_agent_notice FROM agent_inbox
                ORDER BY dedupe_key
            `
        ).toEqual([
            {
                cloud_agent_notice: 'stall',
                cloud_agent_run_id: live,
                dedupe_key: `${live}:stall:249154`,
            },
            { cloud_agent_notice: 'settled', cloud_agent_run_id: settled, dedupe_key: settled },
            { cloud_agent_notice: null, cloud_agent_run_id: null, dedupe_key: 'msg_human' },
        ]);
        expect(
            await upgraded`
                SELECT id, error_code, stall_code FROM cloud_agent_runs ORDER BY id
            `
        ).toEqual([
            { error_code: null, id: live, stall_code: 'claude-prompt-not-found' },
            { error_code: 'provider-launch-failed', id: settled, stall_code: null },
        ]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_typed_notices_test');
        await database.close();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seed(sql: SQL) {
    await sql.unsafe('SET session_replication_role = replica');
    await sql.unsafe(`
        INSERT INTO cloud_agent_work (
            id, server_id, chat_id, launch_message_id, agent_id, computer_id, provider, repository,
            title
        ) VALUES ('caw_mig0000000000001', 'srv_mig', 'cht_mig', 'msg_a', 'agt_mig', 'cmp_mig',
            'cursor', 'demo/repo', 'Running');
        INSERT INTO cloud_agent_runs (id, server_id, work_id, status, terminal_at, error_code) VALUES
            ('${live}', 'srv_mig', 'caw_mig0000000000001', 'running', NULL, 'claude-prompt-not-found'),
            ('${settled}', 'srv_mig', 'caw_mig0000000000001', 'failed', now(), 'provider-launch-failed');
        INSERT INTO agent_inbox (id, agent_id, server_id, chat_id, content, dedupe_key, source) VALUES
            ('inb_0000000000000001', 'agt_mig', 'srv_mig', 'cht_mig', '', '${live}:stall:249154', 'cloud_agent_work'),
            ('inb_0000000000000002', 'agt_mig', 'srv_mig', 'cht_mig', '', '${settled}', 'cloud_agent_work'),
            ('inb_0000000000000003', 'agt_mig', 'srv_mig', 'cht_mig', '', 'car_gone:stall:249154', 'cloud_agent_work'),
            ('inb_0000000000000004', 'agt_mig', 'srv_mig', 'cht_mig', 'hi', 'msg_human', 'human');
    `);
    await sql.unsafe('SET session_replication_role = DEFAULT');
}
