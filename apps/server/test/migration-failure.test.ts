import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describeMigrationFailure } from '../src/postgres/migration-failure.ts';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('a failed migration reports the PostgreSQL error behind the failed query', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-migration-failure-'));
    try {
        await mkdir(join(folder, 'meta'));
        await writeFile(
            join(folder, 'meta/_journal.json'),
            JSON.stringify({
                dialect: 'postgresql',
                entries: [{ breakpoints: true, idx: 0, tag: '0000_orphan', version: '7', when: 1 }],
                version: '7',
            })
        );
        await writeFile(
            join(folder, '0000_orphan.sql'),
            [
                'CREATE TABLE "parents" ("id" integer PRIMARY KEY);',
                'CREATE TABLE "children" ("parent_id" integer CONSTRAINT "children_parent_fk" REFERENCES "parents");',
                'INSERT INTO "children" VALUES (1);',
            ].join('--> statement-breakpoint\n')
        );

        const failure = await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder).then(
            () => undefined,
            (error: unknown) => error
        );
        const report = describeMigrationFailure(failure, cluster.databaseUrl);

        expect(report).toBe(
            [
                'Failed query: ',
                'INSERT INTO "children" VALUES (1);',
                'params: ',
                'Caused by: insert or update on table "children" violates foreign key constraint "children_parent_fk"',
                '    errno: 23503',
                '    code: ERR_POSTGRES_SERVER_ERROR',
                '    constraint: children_parent_fk',
                '    table: children',
                '    detail: Key (parent_id)=(1) is not present in table "parents".',
            ].join('\n')
        );
    } finally {
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

test('a failure report never repeats the database URL or its password', () => {
    const databaseUrl = 'postgres://migrator:s3cr%2Ft@db.internal:5432/haus';
    const error = new Error('Failed query', {
        cause: new Error(`could not connect to ${databaseUrl} as migrator with s3cr/t`),
    });

    expect(describeMigrationFailure(error, databaseUrl)).toBe(
        'Failed query\nCaused by: could not connect to [redacted] as migrator with [redacted]'
    );
});
