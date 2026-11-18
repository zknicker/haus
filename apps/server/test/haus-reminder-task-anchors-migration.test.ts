import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0125 keeps existing reminders and lets a Task reminder anchor on its origin', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-reminder-task-anchors-'));
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
        await writeFile(journalPath, through(124));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedWorld(database);

        await writeFile(journalPath, through(125));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0125_reminder-task-anchors',
        ]);

        expect(await database`SELECT id, anchor_chat_id, anchor_message_id FROM reminders`).toEqual(
            [{ anchor_chat_id: 'cht_ops', anchor_message_id: 'msg_origin', id: 'rem_existing' }]
        );
        await database`INSERT INTO reminders
            (id, server_id, anchor_chat_id, anchor_message_id, owner_agent_id, status, timezone,
             title, fire_at, created_at, updated_at)
            VALUES ('rem_task', 'srv_one', 'cht_task', 'msg_origin', 'agt_one', 'scheduled',
                    'UTC', 'Check back', now(), now(), now())`;
        await expect(
            settle(database`INSERT INTO reminders
                (id, server_id, anchor_chat_id, anchor_message_id, owner_agent_id, status,
                 timezone, title, fire_at, created_at, updated_at)
                VALUES ('rem_missing', 'srv_one', 'cht_task', 'msg_missing', 'agt_one',
                        'scheduled', 'UTC', 'Nowhere', now(), now(), now())`)
        ).rejects.toThrow(/reminders_anchor_message_fk/u);

        await database`INSERT INTO agent_inbox
            (id, server_id, agent_id, chat_id, content, dedupe_key, source, cloud_agent_notice)
            VALUES ('inb_pullrequest00001', 'srv_one', 'agt_one', 'cht_task', 'ready',
                    'acme/api#1:ready_for_review:abc', 'cloud_agent_work', 'pull_request')`;
        await expect(
            settle(database`INSERT INTO agent_inbox
                (id, server_id, agent_id, chat_id, content, dedupe_key, source, cloud_agent_notice)
                VALUES ('inb_settled000000001', 'srv_one', 'agt_one', 'cht_task', 'done', 'settled-key',
                        'cloud_agent_work', 'settled')`)
        ).rejects.toThrow(/agent_inbox_cloud_agent_notice/u);
        await expect(
            settle(database`INSERT INTO agent_inbox
                (id, server_id, agent_id, chat_id, content, dedupe_key, source)
                VALUES ('inb_bare000000000001', 'srv_one', 'agt_one', 'cht_task', 'x', 'bare-key',
                        'cloud_agent_work')`)
        ).rejects.toThrow(/agent_inbox_cloud_agent_notice/u);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);

async function seedWorld(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_one', 'srv_one', 'one', 'One', 'UTC')`;
        await tx`INSERT INTO chats (id, server_id, kind, name, last_message_sequence)
            VALUES ('cht_ops', 'srv_one', 'channel', 'ops', 1)`;
        await tx`INSERT INTO chat_messages
            (id, server_id, chat_id, author_agent_id, content, nonce, sequence)
            VALUES ('msg_origin', 'srv_one', 'cht_ops', 'agt_one', 'Found a bug', 'n1', 1)`;
        await tx`INSERT INTO chats
            (id, server_id, kind, parent_chat_id, parent_chat_kind, anchor_message_id)
            VALUES ('cht_task', 'srv_one', 'task', 'cht_ops', 'channel', 'msg_origin')`;
        await tx`INSERT INTO reminders
            (id, server_id, anchor_chat_id, anchor_message_id, owner_agent_id, status, timezone,
             title, fire_at, created_at, updated_at)
            VALUES ('rem_existing', 'srv_one', 'cht_ops', 'msg_origin', 'agt_one', 'scheduled',
                    'UTC', 'Follow up', now(), now(), now())`;
    });
}

async function settle(query: PromiseLike<unknown>) {
    return await query;
}
