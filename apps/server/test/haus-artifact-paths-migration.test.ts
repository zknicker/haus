import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/** [id, server, name, deleted, current filename, minute created] */
const artifacts = [
    ['art_report', 'srv_one', 'report', false, 'q4.pdf', 1],
    ['art_notes', 'srv_one', 'notes', false, 'Notes.MD', 2],
    ['art_archive', 'srv_one', 'archive', false, 'archive.tar.gz', 3],
    ['art_dotfile', 'srv_one', 'dotfile', false, '.env', 4],
    ['art_spaced', 'srv_one', 'spaced', false, 'x.p d f', 5],
    ['art_shout', 'srv_one', 'Report', false, 'shout.pdf', 6],
    ['art_gone', 'srv_one', 'report', true, 'old.pdf', 0],
    ['art_other', 'srv_two', 'report', false, 'other.pdf', 1],
    ['art_pending', 'srv_one', 'pending', false, null, 7],
] as const;

test('artifact paths backfill from name plus extension and disambiguate by folded key', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-artifact-paths-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const through = (idx: number) =>
            writeFile(
                journalPath,
                JSON.stringify({
                    ...journal,
                    entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
                })
            );
        await through(86);
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            for (const [id, server, name, deleted, filename, minute] of artifacts) {
                const created = new Date(Date.UTC(2026, 9, 1, 0, minute));
                await tx`INSERT INTO artifacts
                    (id, server_id, name, creator_user_id, created_at, deleted_at, current_revision_id)
                    VALUES (${id}, ${server}, ${name}, 'usr_one', ${created},
                        ${deleted ? created : null}, ${filename ? `rev_${id}` : null})`;
                if (filename) {
                    await tx`INSERT INTO artifact_revisions
                        (id, artifact_id, server_id, author_key, author_user_id, content_type,
                            filename, object_key, request_id, reserved_bytes, revision_number,
                            sha256, state, title)
                        VALUES (${`rev_${id}`}, ${id}, ${server}, 'user:usr_one', 'usr_one',
                            'application/octet-stream', ${filename}, ${`key/${id}`},
                            ${`request-${id}`}, 0, 1, ${'a'.repeat(64)}, 'ready', ${name})`;
                }
            }
        });
        await through(87);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0087_artifact-paths',
        ]);
        const rows = await database`SELECT id, path, path_key FROM artifacts ORDER BY id`;
        expect(
            Object.fromEntries(rows.map((row: { id: string; path: string }) => [row.id, row.path]))
        ).toEqual({
            art_archive: 'archive.gz',
            art_dotfile: 'dotfile',
            art_gone: 'report.pdf',
            art_notes: 'notes.MD',
            art_other: 'report.pdf',
            art_pending: 'pending',
            art_report: 'report.pdf',
            art_shout: 'Report-2.pdf',
            art_spaced: 'spaced',
        });
        expect(rows.find((row: { id: string }) => row.id === 'art_notes')).toMatchObject({
            path_key: 'notes.md',
        });
        const [name] = await database`
            SELECT count(*)::int AS count FROM information_schema.columns
            WHERE table_name = 'artifacts' AND column_name = 'name'`;
        expect(name.count).toBe(0);
        const duplicate = await database`
            UPDATE artifacts SET path = 'REPORT.pdf', path_key = 'report.pdf' WHERE id = 'art_notes'`
            .then(() => null)
            .catch((error: Error) => error.message);
        expect(duplicate).toContain('artifacts_server_path_key');
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
