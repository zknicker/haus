import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { migrationsSince0060 } from './migration-receipts.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

test('an existing Server accepts tmterminal after migration without changing saved accounts', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-tmterminal-preset-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        await writeFile(
            journalPath,
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 84),
            })
        );
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO mcp_connections
                (id, server_id, name, url, auth, connected, header_names, tools, preset)
                VALUES ('mcp_hhhhhhhhhhhhhhhh', 'srv_one', 'Handmade',
                    'https://handmade.merchbase.co/mcp', 'oauth', false, '{}', '{}', 'handmade')`;
        });
        const connections = await database`SELECT * FROM mcp_connections`;
        await writeFile(journalPath, JSON.stringify(journal));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual(
            migrationsSince0060.filter((tag) => tag >= '0085_')
        );
        expect(await database`SELECT * FROM mcp_connections`).toEqual(connections);
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO mcp_connections
                (id, server_id, name, url, auth, connected, header_names, tools, preset)
                VALUES ('mcp_tttttttttttttttt', 'srv_one', 'Trademark Terminal',
                    'https://tmterminal.merchbase.co/mcp', 'oauth', false, '{}', '{}', 'tmterminal')`;
        });
        expect(
            await database`SELECT preset FROM mcp_connections WHERE preset = 'tmterminal'`
        ).toEqual([{ preset: 'tmterminal' }]);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
