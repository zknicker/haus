import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import * as schema from '../src/postgres/schema.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrations = join(import.meta.dir, '../drizzle/postgres');

test('the migration chain builds an empty database to the Drizzle schema, once', async () => {
    const journal = JSON.parse(await readFile(join(migrations, 'meta/_journal.json'), 'utf8')) as {
        entries: { idx: number; tag: string }[];
    };
    const database = await startEmptyDatabase();
    try {
        await expect(
            migrateHausDatabase(database.databaseUrl, 'not-a-role', 'haus')
        ).rejects.toThrow('plain PostgreSQL identifier');
        expect(await migrateHausDatabase(database.databaseUrl, 'haus', 'haus')).toEqual(
            journal.entries.map((entry) => entry.tag)
        );
        expect(await migrateHausDatabase(database.databaseUrl, 'haus', 'haus')).toEqual([]);

        const last = journal.entries.at(-1);
        const snapshot = JSON.parse(
            await readFile(
                join(migrations, 'meta', `${String(last?.idx).padStart(4, '0')}_snapshot.json`),
                'utf8'
            )
        );
        expect(await generateMigration(snapshot, generateDrizzleJson(schema))).toEqual([]);
    } finally {
        await database.stop();
    }
});
