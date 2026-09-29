import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;

/**
 * ADR 0037's migration over rows written by the previous schema: Asks become
 * text Messages, their events go, human-held tasks are released, and stored
 * `user://` mentions are backfilled into `mentioned_user_ids`, and every
 * visible Chat's history is marked Done so Needs you starts at the cutover.
 */
test('0052 retires Asks, releases human tasks, and backfills mentions', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-mention-migration-'));
    const admin = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_mention_migration_test';
    let database: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 51);
        await writeFile(journalPath, JSON.stringify(journal));
        await admin.unsafe('CREATE DATABASE haus_mention_migration_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        database = new SQL({ max: 1, url: url.toString() });
        await seedPreviousSchema(database);

        // Apply exactly 0052, whatever later migrations exist.
        const full = JSON.parse(
            await readFile(join(import.meta.dir, '../drizzle/postgres/meta/_journal.json'), 'utf8')
        );
        journal.entries = full.entries.filter((entry: { idx: number }) => entry.idx <= 52);
        await writeFile(journalPath, JSON.stringify(journal));
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0052_humans_addressed_by_mention',
        ]);

        expect(
            await database`SELECT id, body_kind, mentioned_user_ids FROM chat_messages ORDER BY sequence`
        ).toEqual([
            { body_kind: 'text', id: 'msg_ask', mentioned_user_ids: [] },
            {
                body_kind: 'text',
                id: 'msg_two',
                mentioned_user_ids: ['usr_ada', 'usr_bo'],
            },
            { body_kind: 'text', id: 'msg_plain', mentioned_user_ids: [] },
        ]);
        expect(await database`SELECT event_type FROM chat_events ORDER BY cursor`).toEqual([
            { event_type: 'message.created' },
        ]);
        expect(
            await database`SELECT message_id, assignee_agent_id, claimed_at, status, version
                FROM message_tasks ORDER BY message_id`
        ).toEqual([
            {
                assignee_agent_id: null,
                claimed_at: null,
                message_id: 'msg_plain',
                status: 'todo',
                version: 2,
            },
            {
                assignee_agent_id: null,
                claimed_at: null,
                message_id: 'msg_two',
                status: 'in_review',
                version: 2,
            },
        ]);
        expect(
            await database`SELECT column_name FROM information_schema.columns
                WHERE (table_name = 'message_tasks' AND column_name = 'assignee_user_id')
                   OR (table_name = 'chat_events' AND column_name = 'ask_id')`
        ).toEqual([]);
        expect(await database`SELECT to_regclass('public.asks') AS asks`).toEqual([{ asks: null }]);
        // Every human who can see a Chat has its history Done at the cutover;
        // the read marker stays where it was, including 0 for new rows.
        expect(
            await database`SELECT chat_id, reader_user_id, sequence, done_sequence
                FROM chat_reads ORDER BY chat_id, reader_user_id`
        ).toEqual([
            { chat_id: 'cht_dm', done_sequence: 4, reader_user_id: 'usr_bo', sequence: 0 },
            { chat_id: 'cht_product', done_sequence: 3, reader_user_id: 'usr_ada', sequence: 1 },
            { chat_id: 'cht_thread', done_sequence: 2, reader_user_id: 'usr_ada', sequence: 0 },
        ]);
        const [bodyKind] = await database`SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conname = 'chat_messages_body_kind'`;
        expect(bodyKind.definition).not.toContain("'ask'");
    } finally {
        await database?.close();
        await admin.unsafe('DROP DATABASE IF EXISTS haus_mention_migration_test');
        await admin.close();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);

/**
 * Rows in the 0051 shape. Foreign keys are waived so only the touched tables
 * need rows; each seeded Message is rewritten at most once, since a second
 * write in the migration's transaction would re-check its waived keys.
 */
async function seedPreviousSchema(sql: SQL) {
    await sql.unsafe(`
        SET session_replication_role = replica;
        INSERT INTO server_memberships (id, server_id, user_id, role)
        VALUES ('mem_ada', 'srv_one', 'usr_ada', 'owner'),
               ('mem_bo', 'srv_one', 'usr_bo', 'member');
        INSERT INTO chats (id, server_id, kind, name, last_message_sequence)
        VALUES ('cht_product', 'srv_one', 'channel', 'product', 3),
               ('cht_quiet', 'srv_one', 'channel', 'quiet', 0);
        INSERT INTO chats (id, server_id, kind, dm_member_one_user_id, dm_member_one_stint,
                           dm_agent_id, last_message_sequence)
        VALUES ('cht_dm', 'srv_one', 'dm', 'usr_bo', 1, 'agt_orbit', 4);
        INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind,
                           anchor_message_id, last_message_sequence)
        VALUES ('cht_thread', 'srv_one', 'thread', 'cht_product', 'channel', 'msg_two', 2);
        INSERT INTO channel_participants (server_id, chat_id, user_id)
        VALUES ('srv_one', 'cht_product', 'usr_ada'), ('srv_one', 'cht_quiet', 'usr_bo');
        INSERT INTO chat_messages (id, server_id, chat_id, author_agent_id, content, nonce, sequence, body_kind)
        VALUES
            ('msg_ask', 'srv_one', 'cht_product', 'agt_orbit',
             'Rename #product?', 'n1', 1, 'ask'),
            ('msg_two', 'srv_one', 'cht_product', 'agt_orbit',
             '[@bo](user://usr_bo) and [@Ada]( user://usr_ada ) and [@bo](user://usr_bo)', 'n2', 2, 'text'),
            ('msg_plain', 'srv_one', 'cht_product', 'agt_orbit',
             'user://usr_ada without a link, [label](https://example.com)', 'n3', 3, 'text');
        INSERT INTO asks (id, server_id, chat_id, message_id, agent_id, addressee_user_id, title, summary)
        VALUES ('ask_${'a'.repeat(16)}', 'srv_one', 'cht_product', 'msg_ask', 'agt_orbit', 'usr_ada',
                'Rename?', 'Rename #product.');
        INSERT INTO chat_events (id, server_id, cursor, event_type, chat_id, message_id, ask_id, sequence)
        VALUES
            ('evt_ask', 'srv_one', 1, 'ask.updated', 'cht_product', 'msg_ask', 'ask_${'a'.repeat(16)}', 1),
            ('evt_msg', 'srv_one', 2, 'message.created', 'cht_product', 'msg_ask', NULL, 1);
        INSERT INTO message_tasks (server_id, chat_id, message_id, number, origin, status,
                                   assignee_user_id, claimed_at, created_by_user_id)
        VALUES
            ('srv_one', 'cht_product', 'msg_plain', 1, 'composed', 'in_progress',
             'usr_ada', now(), 'usr_ada'),
            ('srv_one', 'cht_product', 'msg_two', 2, 'composed', 'in_review',
             'usr_bo', now(), 'usr_ada');
        INSERT INTO chat_reads (server_id, chat_id, reader_user_id, sequence)
        VALUES ('srv_one', 'cht_product', 'usr_ada', 1);
        SET session_replication_role = origin;
    `);
}

beforeAll(async () => {
    cluster = await startPostgresCluster();
});

afterAll(async () => {
    await cluster.stop();
});
