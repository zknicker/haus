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

test('migration 0082 signs every GitHub connection out and leaves other connections alone', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-github-app-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_github_app_test';
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
        await throughMigration(81);
        await database.unsafe('CREATE DATABASE haus_github_app_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL({ max: 1, url: url.toString() });
        // Foreign keys are waived so only the touched tables need rows.
        await upgraded.unsafe(`
            SET session_replication_role = replica;
            INSERT INTO mcp_connections
                (id, server_id, name, url, auth, connected, header_names, tools, preset, account_label)
            VALUES
                ('mcp_github0000000000', 'srv_one', 'GitHub', 'https://api.githubcopilot.com/mcp/',
                 'oauth', true, '{}', '{get_me,list_issues}', 'github', 'octocat'),
                ('mcp_xxxxxxxxxxxxxxxx', 'srv_one', 'X', 'https://x.example/mcp',
                 'oauth', true, '{}', '{post}', 'x', 'haus');
            INSERT INTO mcp_secrets (connection_id, secret) VALUES
                ('mcp_github0000000000', '{"access_token":"gho_old"}'),
                ('mcp_xxxxxxxxxxxxxxxx', '{"access_token":"x_keep"}');
            INSERT INTO agent_mcp_connection_grants (server_id, agent_id, connection_id) VALUES
                ('srv_one', 'agt_cove', 'mcp_github0000000000'),
                ('srv_one', 'agt_cove', 'mcp_xxxxxxxxxxxxxxxx');
            INSERT INTO triggers
                (id, server_id, owner_agent_id, anchor_chat_id, kind, secret_hash, status, title,
                 created_at, updated_at)
            VALUES ('trg_webhook', 'srv_one', 'agt_cove', 'cht_dm', 'webhook', 'hash', 'armed',
                    'Deploy', now(), now());
            SET session_replication_role = origin;
        `);

        await throughMigration(82);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0082_github_app',
        ]);
        expect(
            await upgraded`SELECT id, connected, tools, account_label FROM mcp_connections ORDER BY id`
        ).toEqual([
            { account_label: null, connected: false, id: 'mcp_github0000000000', tools: [] },
            { account_label: 'haus', connected: true, id: 'mcp_xxxxxxxxxxxxxxxx', tools: ['post'] },
        ]);
        expect(await upgraded`SELECT connection_id FROM mcp_secrets`).toEqual([
            { connection_id: 'mcp_xxxxxxxxxxxxxxxx' },
        ]);
        expect(await upgraded`SELECT connection_id FROM agent_mcp_connection_grants`).toEqual([
            { connection_id: 'mcp_xxxxxxxxxxxxxxxx' },
        ]);
        expect(await upgraded`SELECT kind, secret_hash FROM triggers`).toEqual([
            { kind: 'webhook', secret_hash: 'hash' },
        ]);

        // A webhook still needs its secret; a github Trigger may have none, and only those two kinds exist.
        const insertTrigger = async (id: string, kind: string, secretHash: string | null) => {
            try {
                await upgraded?.unsafe(`
                    SET session_replication_role = replica;
                    INSERT INTO triggers
                        (id, server_id, owner_agent_id, anchor_chat_id, kind, secret_hash, status,
                         title, created_at, updated_at)
                    VALUES ('${id}', 'srv_one', 'agt_cove', 'cht_dm', '${kind}',
                            ${secretHash ? `'${secretHash}'` : 'null'}, 'armed', 'T', now(), now());
                    SET session_replication_role = origin;
                `);
                return 'inserted';
            } catch (cause) {
                await upgraded?.unsafe('SET session_replication_role = origin');
                return String(cause);
            }
        };
        expect(await insertTrigger('trg_bare', 'webhook', null)).toMatch(/triggers_secret_kind/u);
        expect(await insertTrigger('trg_ghs', 'github', 'hash')).toMatch(/triggers_secret_kind/u);
        expect(await insertTrigger('trg_odd', 'schedule', null)).toMatch(/triggers_kind/u);
        expect(await insertTrigger('trg_gh', 'github', null)).toBe('inserted');
        expect(
            await upgraded`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'agent_delivery' AND column_name = 'agent_chain_advanced_at'`
        ).toEqual([{ column_name: 'agent_chain_advanced_at' }]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_github_app_test');
        await database.close();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
