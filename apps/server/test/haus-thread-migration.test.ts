import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { reverseThreadMigration } from '../scripts/reverse-thread-migration.ts';
import {
    takeThreadMigrationSnapshot,
    verifyThreadMigration,
} from '../scripts/verify-thread-migration.ts';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';
import {
    type DatasetChat,
    type DatasetMessage,
    productionShape,
    seedThreadMigrationDataset,
} from './thread-migration-dataset.ts';

/**
 * ADR 0053 decision 14 on a production-shaped dataset: 0124 turns every Thread
 * into inline replies on its anchor, the verifier's invariants hold, every
 * affected Chat reads clean while every other Chat keeps its unread, Task
 * Chats are untouched, and the dev reverse script
 * restores the database exactly.
 */
test('0124 folds every Thread into its parent and reverses exactly', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-thread-migration-'));
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
        await writeFile(journalPath, through(123));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        const dataset = await seedThreadMigrationDataset(database);
        expect(await shape(database)).toEqual({
            messages: productionShape.totalMessages,
            threadMessages: productionShape.threadMessages,
            threads: productionShape.threads,
            threadsUnderDms: dataset.threads.filter((thread) => thread.parent?.kind === 'dm')
                .length,
            workThreads: productionShape.cloudWorkThreads,
        });

        const original = await dumpDatabase(database);
        const before = await takeThreadMigrationSnapshot(cluster.databaseUrl);
        await writeFile(journalPath, through(124));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0124_threads-to-inline-replies',
        ]);

        const result = await verifyThreadMigration(cluster.databaseUrl, before);
        expect(result.invariants.filter((invariant) => !invariant.ok)).toEqual([]);
        console.info('0124 unread on the generated dataset', JSON.stringify(result.unread));
        // Affected Chats read clean, every other Chat keeps its unread, and no
        // queued delivery wakes an Agent to moved history.
        expect(result.unread).toMatchObject({
            affectedUnreadAfter: 0,
            pendingInboxItems: 0,
            unaffectedChanged: 0,
        });
        expect(result.unread?.affectedUnreadBefore).toBeGreaterThan(0);
        expect(result.unread?.unaffectedUnread).toBeGreaterThan(0);
        expect(result.ok).toBe(true);
        const tasks = pickTaskRows(original);
        expect(tasks.chats).toHaveLength(dataset.tasks.length);
        expect(await taskRows(database)).toEqual(tasks);
        await expectMovedShape(database, dataset.threads);

        await reverseThreadMigration(cluster.databaseUrl);
        expect(await dumpDatabase(database)).toEqual(original);

        // 0126 drops the Thread schema on the migrated dataset, keeps every Task
        // follow under its Task name, and the reverse script refuses from then on.
        await writeFile(journalPath, through(125));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0124_threads-to-inline-replies',
            '0125_legacy-tasks-and-boards',
        ]);
        const follows = await database`SELECT
            (SELECT array_agg(server_id || ' ' || thread_chat_id || ' ' || user_id || ' ' || followed ORDER BY 1)
                FROM thread_follows) AS people,
            (SELECT array_agg(server_id || ' ' || thread_chat_id || ' ' || agent_id || ' ' || followed ORDER BY 1)
                FROM agent_thread_follows) AS agents`;
        await writeFile(journalPath, through(126));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0126_threads-are-gone',
        ]);
        expect(
            await database`SELECT
            (SELECT array_agg(server_id || ' ' || task_chat_id || ' ' || user_id || ' ' || followed ORDER BY 1)
                FROM task_follows) AS people,
            (SELECT array_agg(server_id || ' ' || task_chat_id || ' ' || agent_id || ' ' || followed ORDER BY 1)
                FROM agent_task_follows) AS agents`
        ).toEqual(follows);
        expect(follows[0].people.length).toBeGreaterThan(0);
        expect(
            await database`SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND (table_name LIKE '%thread%' OR column_name LIKE '%thread%')
                AND table_name NOT LIKE 'thread_migration_%'`
        ).toEqual([]);
        await expect(reverseThreadMigration(cluster.databaseUrl)).rejects.toThrow(
            '0126_threads-are-gone has run'
        );
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 180_000);

/** Spot checks the verifier cannot express: where moved rows went and what was dropped. */
async function expectMovedShape(database: SQL, threads: DatasetChat[]) {
    const dmThread = threads.find((thread) => thread.parent?.kind === 'dm') as DatasetChat;
    const anchor = dmThread.anchor as DatasetMessage;
    const rows = (await database`
        SELECT id, chat_id, reply_to_message_id, reply_root_message_id FROM chat_messages
        WHERE chat_id = ${dmThread.parent?.id ?? ''}`) as {
        chat_id: string;
        id: string;
        reply_root_message_id: string;
        reply_to_message_id: string;
    }[];
    const anchorRoot = anchor.replyRootMessageId ?? anchor.id;
    expect(dmThread.messages.some((message) => message.replyToMessageId !== null)).toBe(true);
    for (const message of dmThread.messages) {
        // A top-level Thread reply now answers the anchor; an inline reply keeps its parent.
        expect(rows.find((row) => row.id === message.id)).toEqual({
            chat_id: dmThread.parent?.id ?? '',
            id: message.id,
            reply_root_message_id: anchorRoot,
            reply_to_message_id: message.replyToMessageId ?? anchor.id,
        });
    }
    const [nonces] = (await database`
        SELECT count(*)::integer AS suffixed FROM chat_messages WHERE nonce LIKE '%~cht_thread_%'`) as {
        suffixed: number;
    }[];
    expect(nonces?.suffixed).toBe(3);
    const dropped = (await database`SELECT
            (SELECT count(*)::integer FROM thread_follows WHERE thread_chat_kind = 'thread') AS thread_follows,
            (SELECT count(*)::integer FROM agent_thread_follows WHERE thread_chat_kind = 'thread') AS agent_follows,
            (SELECT count(*)::integer FROM thread_closures) AS closures,
            (SELECT count(*)::integer FROM message_claims WHERE thread_chat_id IS NOT NULL) AS thread_claims,
            (SELECT count(*)::integer FROM cloud_agent_work work JOIN chats chat
                ON chat.server_id = work.server_id AND chat.id = work.chat_id
                WHERE chat.kind IN ('channel', 'dm')) AS parent_work,
            (SELECT count(*)::integer FROM agent_message_drafts) AS drafts`) as Record<
        string,
        number
    >[];
    // Thread follows and closures are gone, claims and work name the parent, and
    // the six held drafts collapse to one per session and parent.
    expect(dropped).toEqual([
        {
            agent_follows: 0,
            closures: 0,
            drafts: 4,
            parent_work: 25,
            thread_claims: 0,
            thread_follows: 0,
        },
    ]);
}

async function shape(database: SQL) {
    const [row] = (await database`SELECT
        (SELECT count(*)::integer FROM chat_messages) AS messages,
        (SELECT count(*)::integer FROM chat_messages message JOIN chats chat
            ON chat.id = message.chat_id WHERE chat.kind = 'thread') AS "threadMessages",
        (SELECT count(*)::integer FROM chats WHERE kind = 'thread') AS threads,
        (SELECT count(*)::integer FROM chats WHERE kind = 'thread' AND parent_chat_kind = 'dm') AS "threadsUnderDms",
        (SELECT count(DISTINCT chat_id)::integer FROM cloud_agent_work) AS "workThreads"`) as Record<
        string,
        number
    >[];
    return row;
}

/** Task Chats, their Messages, reads, follows, and reminders, as `dumpDatabase` renders them. */
async function taskRows(database: SQL) {
    return pickTaskRows(await dumpDatabase(database));
}

function pickTaskRows(dump: Record<string, string[]>) {
    const isTask = (row: string) => row.includes('"cht_task_');
    return Object.fromEntries(
        [
            'chats',
            'chat_messages',
            'chat_reads',
            'agent_chat_reads',
            'thread_follows',
            'agent_thread_follows',
            'reminders',
        ].map((table) => [table, (dump[table] ?? []).filter(isTask)])
    );
}

/** Every public table's rows, the constraint set, and Drizzle's ledger, as sorted JSON text. */
async function dumpDatabase(database: SQL) {
    const tables = (await database`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY 1`) as {
        tablename: string;
    }[];
    const dump: Record<string, string[]> = {};
    for (const { tablename } of tables) {
        const rows = (await database.unsafe(
            `SELECT to_jsonb(t)::text AS row FROM "${tablename}" t ORDER BY 1`
        )) as { row: string }[];
        dump[tablename] = rows.map((row) => row.row);
    }
    const constraints = (await database`
        SELECT conrelid::regclass::text || '.' || conname || ' ' || pg_get_constraintdef(oid)
            || ' deferrable=' || condeferrable || ' deferred=' || condeferred AS row
        FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1`) as {
        row: string;
    }[];
    dump.pg_constraint = constraints.map((row) => row.row);
    const ledger = (await database`
        SELECT hash || ' ' || created_at AS row FROM drizzle.__drizzle_migrations ORDER BY 1`) as {
        row: string;
    }[];
    dump['drizzle.__drizzle_migrations'] = ledger.map((row) => row.row);
    return dump;
}
