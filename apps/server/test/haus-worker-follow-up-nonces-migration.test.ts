import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';
import { seedPreWorkerRows } from './workers-migration-seed.ts';

const migration = join(import.meta.dir, '../drizzle/postgres/0135_worker-follow-up-nonces.sql');

test('0135 gives every Worker turn an empty follow-up nonce list, and running it again changes nothing', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-follow-up-nonces-'));
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
        await writeFile(journalPath, through(133));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedPreWorkerRows(database);
        await writeFile(journalPath, through(134));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);

        await writeFile(journalPath, through(135));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0135_worker-follow-up-nonces',
        ]);
        const migrated = await readNonces(database);
        expect(migrated.length).toBeGreaterThan(0);
        expect(new Set(migrated.map((row) => JSON.stringify(row.follow_up_nonces)))).toEqual(
            new Set(['[]'])
        );

        await database.unsafe(await readFile(migration, 'utf8'));
        expect(await readNonces(database)).toEqual(migrated);
    } finally {
        await database.close();
        await rm(folder, { force: true, recursive: true });
        await cluster.stop();
    }
});

async function readNonces(database: SQL) {
    return (await database`
        select id, follow_up_nonces from worker_turns order by id
    `) as { follow_up_nonces: string[]; id: string }[];
}
