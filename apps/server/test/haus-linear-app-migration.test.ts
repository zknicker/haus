import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

test('migration 0091 keeps hosted Linear sign-ins as custom MCP connections', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-linear-app-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 91);
        await writeFile(
            journalPath,
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 90),
            })
        );
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        // Only MCP state matters; its Server and Agent foreign keys are skipped.
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO mcp_connections
                (id, server_id, name, url, auth, connected, header_names, tools, preset)
                VALUES
                ('mcp_llllllllllllllll', 'srv_one', 'Linear', 'https://mcp.linear.app/mcp',
                 'oauth', true, '{}', '{list_issues}', 'linear'),
                ('mcp_gggggggggggggggg', 'srv_one', 'GitHub', 'https://api.githubcopilot.com/mcp/',
                 'oauth', false, '{}', '{}', 'github')`;
            await tx`INSERT INTO mcp_secrets (connection_id, secret) VALUES
                ('mcp_llllllllllllllll', '{"tokens":{"access_token":"test-token"}}')`;
            await tx`INSERT INTO agent_mcp_connection_grants (server_id, agent_id, connection_id)
                VALUES ('srv_one', 'agt_cove', 'mcp_llllllllllllllll')`;
        });
        const connections = await database`SELECT * FROM mcp_connections ORDER BY id`;
        const secrets = await database`SELECT * FROM mcp_secrets`;
        const grants = await database`SELECT * FROM agent_mcp_connection_grants`;

        await writeFile(journalPath, JSON.stringify(journal));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0091_linear-app',
        ]);
        expect(await database`SELECT * FROM mcp_connections ORDER BY id`).toEqual(
            connections.map((connection) => ({
                ...connection,
                preset: connection.preset === 'linear' ? null : connection.preset,
            }))
        );
        expect(await database`SELECT * FROM mcp_secrets`).toEqual(secrets);
        expect(await database`SELECT * FROM agent_mcp_connection_grants`).toEqual(grants);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
