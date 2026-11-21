import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SQL } from 'bun';
import {
    migrationRehearsalScript,
    pendingMigrationTags,
    rehearsalPsqlArgs,
} from '../../../scripts/release/migration-rehearsal-script.mjs';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { seedServerWithAllChannelAgent } from './all-homed-agent-seed.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';
import { resolvePostgresBinaries } from './postgres-process.ts';

const migrationsFolder = join(import.meta.dir, '../drizzle/postgres');
const restoredDeferred = 'SET CONSTRAINTS ALL DEFERRED;--> statement-breakpoint\n';

test('the release rehearsal catches the v20 migration failure and always rolls back', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-migration-rehearsal-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(migrationsFolder, folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8')) as {
            entries: { idx: number; tag: string; when: number }[];
        };
        await writeFile(
            journalPath,
            JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.idx <= 128) })
        );
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedServerWithAllChannelAgent(database);
        const latestApplied = await latestMigration(database);

        const migrations = await Promise.all(
            pendingMigrationTags(journal, Number(latestApplied)).map(async (tag) => ({
                sql: await readFile(join(migrationsFolder, `${tag}.sql`), 'utf8'),
                tag,
            }))
        );
        const asShippedInV20 = migrations.map((migration) => ({
            ...migration,
            sql:
                migration.tag === '0135_workers'
                    ? migration.sql.replace(
                          /;--> statement-breakpoint\nSET CONSTRAINTS ALL DEFERRED;\n$/u,
                          ';\n'
                      )
                    : migration.tag === '0142_all-is-a-chat'
                      ? migration.sql.replace(restoredDeferred, '')
                      : migration.sql,
        }));

        const failed = rehearse(cluster.databaseUrl, migrationRehearsalScript(asShippedInV20));
        expect(failed.status).not.toBe(0);
        expect(failed.stderr).toContain('rehearsal: applying 0142_all-is-a-chat');
        expect(failed.stderr).toContain('ERROR:  23503: update or delete on table "projects"');
        expect(failed.stderr).toContain('"agents_home_project_fk"');
        expect(failed.stderr).toContain('DETAIL:  Key (server_id, chat_id)=(srv_a, cht_all)');

        const passed = rehearse(cluster.databaseUrl, migrationRehearsalScript(migrations));
        expect(passed.stderr).toContain('rehearsal: checking every deferred constraint');
        expect(passed.stderr).not.toContain('ERROR');
        expect(passed.status).toBe(0);

        expect(await latestMigration(database)).toBe(latestApplied);
        expect(await database`SELECT to_regclass('public.workers') AS workers`).toEqual([
            { workers: null },
        ]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

function rehearse(databaseUrl: string, script: string) {
    const psql = join(dirname(resolvePostgresBinaries().createdb), 'psql');
    return spawnSync(psql, [databaseUrl, ...rehearsalPsqlArgs], {
        encoding: 'utf8',
        input: script,
    });
}

async function latestMigration(database: SQL) {
    const [row] =
        await database`SELECT max(created_at)::text AS latest FROM drizzle.__drizzle_migrations`;
    return row.latest as string;
}
