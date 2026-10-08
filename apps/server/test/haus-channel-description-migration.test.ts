import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { allChannelDescription } from '../src/servers/contracts.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;

beforeAll(async () => {
    cluster = await startPostgresCluster();
});

afterAll(async () => {
    await cluster.stop();
});

test('migration 0068 describes each existing #all and leaves other channels blank', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-channel-description-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_channel_description_test';
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
        await throughMigration(67);
        await database.unsafe('CREATE DATABASE haus_channel_description_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL(url.toString());
        await upgraded`INSERT INTO servers (id, slug, display_name)
            VALUES ('srv_one', 'one', 'One'), ('srv_two', 'two', 'Two')`;
        await upgraded`INSERT INTO chats (id, server_id, kind, name, is_all) VALUES
            ('cht_all_one', 'srv_one', 'channel', 'all', true),
            ('cht_all_two', 'srv_two', 'channel', 'all', true),
            ('cht_product', 'srv_one', 'channel', 'product', false)`;

        // Later migrations stay out of this upgrade, so the receipt names 0068 alone.
        await throughMigration(68);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0068_channel_descriptions',
        ]);
        expect(await upgraded`SELECT id, description FROM chats ORDER BY id`).toEqual([
            { description: allChannelDescription, id: 'cht_all_one' },
            { description: allChannelDescription, id: 'cht_all_two' },
            { description: null, id: 'cht_product' },
        ]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_channel_description_test');
        await database.close();
        await rm(folder, { recursive: true, force: true });
    }
});
