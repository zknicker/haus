import { afterAll, beforeAll, expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

let cluster: PostgresCluster;

beforeAll(async () => {
    cluster = await startPostgresCluster();
});

afterAll(async () => {
    await cluster.stop();
});

test('migration 0072 drops the chat_events log and the Server cursor, keeping messages', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'haus-drop-chat-events-'));
    const database = new SQL(cluster.databaseUrl);
    const url = new URL(cluster.databaseUrl);
    url.pathname = '/haus_drop_chat_events_test';
    let upgraded: SQL | undefined;
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const throughMigration = (idx: number) =>
            writeFile(
                journalPath,
                JSON.stringify({
                    ...journal,
                    entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= idx),
                })
            );
        await throughMigration(71);
        await database.unsafe('CREATE DATABASE haus_drop_chat_events_test');
        await migrateHausDatabase(url.toString(), 'haus', 'haus', folder);
        upgraded = new SQL({ max: 1, url: url.toString() });
        // Foreign keys are waived so only the touched tables need rows.
        await upgraded.unsafe(`
            SET session_replication_role = replica;
            INSERT INTO servers (id, slug, display_name, last_chat_event_cursor)
            VALUES ('srv_one', 'one', 'One', 1);
            INSERT INTO chats (id, server_id, kind, name, last_message_sequence)
            VALUES ('cht_product', 'srv_one', 'channel', 'product', 1);
            INSERT INTO chat_messages
                (id, server_id, chat_id, author_user_id, content, nonce, sequence,
                 reply_root_message_id)
            VALUES ('msg_one', 'srv_one', 'cht_product', 'usr_ada', 'hello', 'n1', 1, 'msg_one');
            INSERT INTO chat_events (id, server_id, cursor, event_type, chat_id, message_id, sequence)
            VALUES ('evt_one', 'srv_one', 1, 'message.created', 'cht_product', 'msg_one', 1);
            SET session_replication_role = origin;
        `);

        // Later migrations stay out of this upgrade, so the receipt names 0072 alone.
        await throughMigration(72);
        expect(await migrateHausDatabase(url.toString(), 'haus', 'haus', folder)).toEqual([
            '0072_drop_chat_events',
        ]);
        expect(await upgraded`SELECT to_regclass('public.chat_events') AS events`).toEqual([
            { events: null },
        ]);
        expect(
            await upgraded`SELECT to_regclass('public.chat_events_message_created_idx') AS idx`
        ).toEqual([{ idx: null }]);
        expect(
            await upgraded`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'servers' AND column_name = 'last_chat_event_cursor'`
        ).toEqual([]);
        expect(await upgraded`SELECT id FROM chat_messages`).toEqual([{ id: 'msg_one' }]);
    } finally {
        await upgraded?.close();
        await database.unsafe('DROP DATABASE IF EXISTS haus_drop_chat_events_test');
        await database.close();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
