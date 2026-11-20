import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';
import { seedPreWorkerRows } from './workers-migration-seed.ts';

const migration = join(import.meta.dir, '../drizzle/postgres/0137_w3-workers-on-computers.sql');

test('0137 turns every Computer off, backfills Project defaults and repos, and running it again changes nothing', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-workers-on-computers-'));
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
        await writeFile(journalPath, through(134));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedPreWorkerRows(database);
        await seedServerWithoutWorkers(database);
        await writeFile(journalPath, through(136));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedMoreTaskWorkers(database);

        await writeFile(journalPath, through(137));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0137_w3-workers-on-computers',
        ]);
        const migrated = await readMigrated(database);
        expect(migrated.computers).toEqual([
            { id: 'cmp_new0000000000000', worker_limit: 4, workers_enabled: false },
            { id: 'cmp_old0000000000000', worker_limit: 4, workers_enabled: false },
        ]);
        expect(migrated.projects).toEqual([
            {
                chat_id: 'cht_ops',
                default_worker_computer_id: null,
                default_worker_place: 'claude',
            },
            { chat_id: 'cht_two', default_worker_computer_id: null, default_worker_place: null },
        ]);
        expect(migrated.workers).toEqual([
            { id: 'caw_aaaaaaaaaaaaaaaa', place: 'cursor', unset: true },
            { id: 'caw_bbbbbbbbbbbbbbbb', place: 'claude', unset: true },
            { id: 'caw_cccccccccccccccc', place: 'cursor', unset: true },
            { id: 'caw_dddddddddddddddd', place: 'cursor', unset: true },
            { id: 'wkr_eeeeeeeeeeeeeeee', place: 'cursor', unset: true },
            { id: 'wkr_ffffffffffffffff', place: 'claude', unset: true },
            { id: 'wkr_gggggggggggggggg', place: 'claude', unset: true },
        ]);
        expect(migrated.turns).toEqual(
            Array.from({ length: 9 }, () => ({
                dispatch_attempt: 0,
                ended_at: null,
                report_draft: null,
            }))
        );
        expect(migrated.repos).toEqual([
            { id_shape: true, project_id: 'cht_ops', repository: 'acme/api', server_id: 'srv_one' },
            { id_shape: true, project_id: 'cht_ops', repository: 'acme/app', server_id: 'srv_one' },
        ]);
        expect(migrated.tables).toEqual([{ credentials: 0, links: 0, pushes_with_worker: 0 }]);

        const statements = (await readFile(migration, 'utf8')).split('--> statement-breakpoint');
        await database.begin(async (tx) => {
            for (const statement of statements) {
                await tx.unsafe(statement);
            }
        });
        expect(await readMigrated(database)).toEqual(migrated);

        expect(
            await refusal(
                database`UPDATE projects SET default_worker_place = 'computer' WHERE chat_id = 'cht_two'`
            )
        ).toContain('"projects_default_worker_computer"');
        expect(
            await refusal(
                database`UPDATE workers SET place = 'computer' WHERE id = 'caw_aaaaaaaaaaaaaaaa'`
            )
        ).toContain('"workers_runtime"');
        const credential = (hash: string) =>
            database`INSERT INTO worker_turn_credentials
                (token_hash, server_id, turn_id, kind, attempt, expires_at)
                VALUES (${hash.repeat(64)}, 'srv_one', 'car_a2aaaaaaaaaaaaaa', 'turn', 1, now())`;
        expect(await refusal(credential('c'))).toBe('accepted');
        expect(await refusal(credential('d'))).toContain('"worker_turn_credentials_live"');
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

function refusal(query: PromiseLike<unknown>) {
    return query.then(
        () => 'accepted',
        (cause: Error) => cause.message
    );
}

async function seedServerWithoutWorkers(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_two', 'two', 'Two')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_two', 'srv_two', 'channel', 'two')`;
        await tx`INSERT INTO task_keys (id, server_id, key, next_number)
            VALUES ('tky_two', 'srv_two', 'TWO', 1)`;
        await tx`INSERT INTO projects (chat_id, server_id, task_key_id)
            VALUES ('cht_two', 'srv_two', 'tky_two')`;
    });
}

async function seedMoreTaskWorkers(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO workers (id, server_id, agent_id, carrier_computer_id, place,
                repository, task_id, title, created_at, closed_at)
            VALUES
                ('wkr_eeeeeeeeeeeeeeee', 'srv_one', 'agt_one', 'cmp_old0000000000000', 'cursor',
                    'acme/app', 'tsk_one', 'Same repo', '2026-06-01T00:00:00Z', null),
                ('wkr_ffffffffffffffff', 'srv_one', 'agt_one', 'cmp_old0000000000000', 'claude',
                    'acme/api', 'tsk_one', 'Other repo', '2026-06-02T00:00:00Z', null),
                ('wkr_gggggggggggggggg', 'srv_one', 'agt_one', 'cmp_old0000000000000', 'claude',
                    'acme/history', null, 'Taskless', '2026-06-03T00:00:00Z',
                    '2026-06-04T00:00:00Z')`;
    });
}

async function readMigrated(database: SQL) {
    return {
        computers: await database`SELECT id, workers_enabled, worker_limit
            FROM computers ORDER BY id`,
        projects: await database`SELECT chat_id, default_worker_place, default_worker_computer_id
            FROM projects ORDER BY chat_id`,
        repos: await database`SELECT server_id, project_id, repository,
                id ~ '^prp_[A-Za-z0-9_-]{16}$' AS id_shape
            FROM project_repos ORDER BY server_id, project_id, repository`,
        tables: await database`SELECT
                (SELECT count(*)::int FROM project_repo_links) AS links,
                (SELECT count(*)::int FROM worker_turn_credentials) AS credentials,
                (SELECT count(*)::int FROM drive_pushes WHERE worker_id IS NOT NULL) AS pushes_with_worker`,
        turns: await database`SELECT dispatch_attempt, report_draft, ended_at
            FROM worker_turns ORDER BY id`,
        workers: await database`SELECT id, place,
                num_nonnulls(runtime, model, branch, worker_md_revision_id, native_session_id) = 0
                    AS unset
            FROM workers ORDER BY id`,
    };
}
