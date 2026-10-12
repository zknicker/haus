import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

test('retiring Vercel preserves saved accounts as custom MCP connections', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-vercel-preset-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        await writeFile(
            journalPath,
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 82),
            })
        );
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        // Only MCP state matters; its Server and Agent foreign keys are skipped.
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO mcp_connections
                (id, server_id, name, url, auth, connected, header_names, tools, preset)
                VALUES
                ('mcp_vvvvvvvvvvvvvvvv', 'srv_one', 'Vercel', 'https://mcp.vercel.com',
                 'oauth', true, '{}', '{list_projects}', 'vercel'),
                ('mcp_cccccccccccccccc', 'srv_one', 'Cloudflare', 'https://mcp.cloudflare.com/mcp',
                 'oauth', false, '{}', '{}', 'cloudflare')`;
            await tx`INSERT INTO mcp_secrets (connection_id, secret) VALUES
                ('mcp_vvvvvvvvvvvvvvvv', '{"tokens":{"access_token":"test-token"}}')`;
            await tx`INSERT INTO agent_mcp_connection_grants (server_id, agent_id, connection_id)
                VALUES ('srv_one', 'agt_cove', 'mcp_vvvvvvvvvvvvvvvv')`;
        });
        const connections = await database`SELECT * FROM mcp_connections ORDER BY id`;
        const secrets = await database`SELECT * FROM mcp_secrets`;
        const grants = await database`SELECT * FROM agent_mcp_connection_grants`;

        await writeFile(journalPath, JSON.stringify(journal));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0083_remove-vercel-preset',
        ]);
        expect(await database`SELECT * FROM mcp_connections ORDER BY id`).toEqual(
            connections.map((connection) => ({
                ...connection,
                preset: connection.preset === 'vercel' ? null : connection.preset,
            }))
        );
        expect(await database`SELECT * FROM mcp_secrets`).toEqual(secrets);
        expect(await database`SELECT * FROM agent_mcp_connection_grants`).toEqual(grants);
        const restorePreset = async () =>
            await database`UPDATE mcp_connections SET preset = 'vercel'
                WHERE id = 'mcp_vvvvvvvvvvvvvvvv'`;
        await expect(restorePreset()).rejects.toThrow('mcp_connections_preset');
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
