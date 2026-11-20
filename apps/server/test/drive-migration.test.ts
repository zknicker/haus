import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0129 moves every path into haus/ even when haus/<path> was already taken', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-drive-migration-'));
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
        await writeFile(journalPath, through(128));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedArtifacts(database);

        await writeFile(journalPath, through(129));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0129_drive',
        ]);

        expect(
            await database`SELECT id, path, path_key, deleted_at IS NOT NULL AS deleted
                FROM artifacts ORDER BY id`
        ).toEqual([
            { deleted: false, id: 'art_a', path: 'haus/A.md', path_key: 'haus/a.md' },
            { deleted: true, id: 'art_gone', path: 'haus/a.md', path_key: 'haus/a.md' },
            { deleted: false, id: 'art_haus', path: 'haus/haus/a.md', path_key: 'haus/haus/a.md' },
        ]);
        expect(
            await database`SELECT server_id, area_id, counter::int AS counter FROM drive_area_counters`
        ).toEqual([{ area_id: 'haus', counter: 2, server_id: 'srv_one' }]);
        expect(
            await database`SELECT path, path_key, sequence::int AS sequence, change, artifact_id,
                    revision_id
                FROM drive_changes ORDER BY sequence`
        ).toEqual([
            {
                artifact_id: 'art_a',
                change: 'put',
                path: 'haus/A.md',
                path_key: 'haus/a.md',
                revision_id: 'rev_a',
                sequence: 1,
            },
            {
                artifact_id: 'art_haus',
                change: 'put',
                path: 'haus/haus/a.md',
                path_key: 'haus/haus/a.md',
                revision_id: 'rev_haus',
                sequence: 2,
            },
        ]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedArtifacts(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_one', 'srv_one', 'one', 'One', 'UTC')`;
        await tx`INSERT INTO artifacts
            (id, server_id, creator_agent_id, current_revision_id, path, path_key, deleted_at)
            VALUES
                ('art_a', 'srv_one', 'agt_one', 'rev_a', 'A.md', 'a.md', NULL),
                ('art_haus', 'srv_one', 'agt_one', 'rev_haus', 'haus/a.md', 'haus/a.md', NULL),
                ('art_gone', 'srv_one', 'agt_one', 'rev_gone', 'a.md', 'a.md', now())`;
    });
}
