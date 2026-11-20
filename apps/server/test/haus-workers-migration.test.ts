import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';
import { seedPreWorkerRows } from './workers-migration-seed.ts';

const migration = join(import.meta.dir, '../drizzle/postgres/0135_workers.sql');

test('0135 turns cloud agent work into Workers, and running it again changes nothing', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-workers-'));
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

        await writeFile(journalPath, through(135));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0135_workers',
        ]);
        const migrated = await readMigrated(database);
        expect(migrated.workers).toEqual([
            {
                carrier_computer_id: 'cmp_new0000000000000',
                closed: false,
                id: 'caw_aaaaaaaaaaaaaaaa',
                origin_chat_id: 'cht_ops',
                place: 'cursor',
                task_id: 'tsk_one',
            },
            {
                carrier_computer_id: 'cmp_old0000000000000',
                closed: true,
                id: 'caw_bbbbbbbbbbbbbbbb',
                origin_chat_id: 'cht_ops',
                place: 'claude',
                task_id: null,
            },
            {
                carrier_computer_id: 'cmp_old0000000000000',
                closed: true,
                id: 'caw_cccccccccccccccc',
                origin_chat_id: 'cht_ops',
                place: 'cursor',
                task_id: null,
            },
            {
                carrier_computer_id: 'cmp_gone000000000000',
                closed: true,
                id: 'caw_dddddddddddddddd',
                origin_chat_id: 'cht_ops',
                place: 'cursor',
                task_id: null,
            },
        ]);
        expect(migrated.closedAt).toEqual([
            { closed_at_terminal: false, closed_at_updated: false, id: 'caw_aaaaaaaaaaaaaaaa' },
            { closed_at_terminal: true, closed_at_updated: false, id: 'caw_bbbbbbbbbbbbbbbb' },
            { closed_at_terminal: false, closed_at_updated: true, id: 'caw_cccccccccccccccc' },
            { closed_at_terminal: false, closed_at_updated: true, id: 'caw_dddddddddddddddd' },
        ]);
        expect(migrated.turns).toEqual([
            {
                dispatched: true,
                id: 'car_a1aaaaaaaaaaaaaa',
                input: [],
                outcome: {
                    kind: 'report',
                    report: {
                        ask: null,
                        messageId: null,
                        outcome: 'done',
                        personId: null,
                        personRefused: null,
                        pullRequestUrls: ['https://github.com/acme/app/pull/12'],
                        source: 'provider',
                        text: 'Opened a pull request.',
                    },
                },
                worker_id: 'caw_aaaaaaaaaaaaaaaa',
            },
            {
                dispatched: false,
                id: 'car_a2aaaaaaaaaaaaaa',
                input: null,
                outcome: null,
                worker_id: 'caw_aaaaaaaaaaaaaaaa',
            },
            {
                dispatched: true,
                id: 'car_b1bbbbbbbbbbbbbb',
                input: [],
                outcome: {
                    kind: 'report',
                    report: {
                        ask: 'Which key?',
                        messageId: null,
                        outcome: 'needs-you',
                        personId: null,
                        personRefused: null,
                        pullRequestUrls: [],
                        source: 'provider',
                        text: 'Which key?',
                    },
                },
                worker_id: 'caw_bbbbbbbbbbbbbbbb',
            },
            {
                dispatched: true,
                id: 'car_b2bbbbbbbbbbbbbb',
                input: [],
                outcome: { kind: 'stopped' },
                worker_id: 'caw_bbbbbbbbbbbbbbbb',
            },
            {
                dispatched: true,
                id: 'car_c0cccccccccccccc',
                input: [],
                outcome: { detail: null, kind: 'failed', reason: 'no-report' },
                worker_id: 'caw_cccccccccccccccc',
            },
            {
                dispatched: true,
                id: 'car_c1cccccccccccccc',
                input: [],
                outcome: { detail: 'boom', kind: 'failed', reason: 'provider-error' },
                worker_id: 'caw_cccccccccccccccc',
            },
            {
                dispatched: true,
                id: 'car_c2cccccccccccccc',
                input: [],
                outcome: { detail: 'gone', kind: 'failed', reason: 'provider-expired' },
                worker_id: 'caw_cccccccccccccccc',
            },
            {
                dispatched: true,
                id: 'car_c3cccccccccccccc',
                input: null,
                outcome: null,
                worker_id: 'caw_cccccccccccccccc',
            },
            {
                dispatched: true,
                id: 'car_d1dddddddddddddd',
                input: [],
                outcome: { detail: null, kind: 'failed', reason: 'machine-removed' },
                worker_id: 'caw_dddddddddddddddd',
            },
        ]);
        expect(migrated.messages).toEqual([
            {
                content:
                    'Started.\n\n[GEN-7](task://tsk_one) and [Old \\[draft](worker://caw_bbbbbbbbbbbbbbbb)',
                id: 'msg_link',
            },
        ]);
        expect(migrated.historyLinks).toEqual([
            { message_id: 'msg_link', ordinal: 1, worker_id: 'caw_bbbbbbbbbbbbbbbb' },
        ]);
        expect(migrated.taskLinks).toEqual([
            {
                message_id: 'msg_link',
                ordinal: 0,
                task_id: 'tsk_one',
                text: '[GEN-7](task://tsk_one)',
            },
        ]);
        expect(migrated.inbox).toEqual([
            { id: 'inb_human00000000000', source: 'human', worker_turn_id: null },
            { id: 'inb_pullrequest00000', source: 'pull_request', worker_turn_id: null },
            {
                id: 'inb_settled000000000',
                source: 'worker_report',
                worker_turn_id: 'car_a1aaaaaaaaaaaaaa',
            },
            {
                id: 'inb_stall00000000000',
                source: 'worker_stall',
                worker_turn_id: 'car_c3cccccccccccccc',
            },
        ]);
        expect(migrated.triggers).toEqual([
            { run_id: 'run_one', source: 'worker_report' },
            { run_id: 'run_two', source: 'human' },
        ]);
        expect(migrated.stash).toEqual([{ stash: null }]);
        expect(migrated.inventories).toEqual([
            { default_provider: 'claude', id: 'cmp_new0000000000000', providers: 2 },
            { default_provider: 'cursor', id: 'cmp_old0000000000000', providers: 2 },
        ]);

        const statements = (await readFile(migration, 'utf8')).split('--> statement-breakpoint');
        await database.begin(async (tx) => {
            for (const statement of statements) {
                await tx.unsafe(statement);
            }
        });
        expect(await readMigrated(database)).toEqual(migrated);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function readMigrated(database: SQL) {
    return {
        closedAt: await database`SELECT id,
                coalesce(closed_at = terminal_at, false) AS closed_at_terminal,
                coalesce(terminal_at IS NULL AND closed_at = updated_at, false) AS closed_at_updated
            FROM workers ORDER BY id`,
        historyLinks: await database`SELECT message_id, worker_id, ordinal
            FROM worker_history_links ORDER BY ordinal`,
        inbox: await database`SELECT id, source, worker_turn_id FROM agent_inbox ORDER BY id`,
        inventories: await database`SELECT id,
                jsonb_array_length(reported_inventory->'cloudAgentProviders') AS providers,
                (SELECT entry->>'provider' FROM jsonb_array_elements(reported_inventory->'cloudAgentProviders') AS entry
                    WHERE entry->>'isDefault' = 'true') AS default_provider
            FROM computers ORDER BY id`,
        messages: await database`SELECT id, content FROM chat_messages ORDER BY id`,
        stash: await database`SELECT to_regclass('pending_default_worker_places') AS stash`,
        taskLinks: await database`SELECT message_id, task_id, ordinal, text
            FROM task_message_links ORDER BY ordinal`,
        triggers: await database`SELECT run_id, source FROM agent_run_triggers ORDER BY run_id`,
        turns: await database`SELECT id, worker_id, input, outcome,
                dispatched_at IS NOT NULL AS dispatched
            FROM worker_turns ORDER BY id`,
        workers: await database`SELECT id, task_id, carrier_computer_id, origin_chat_id, place,
                closed_at IS NOT NULL AS closed
            FROM workers ORDER BY id`,
    };
}
