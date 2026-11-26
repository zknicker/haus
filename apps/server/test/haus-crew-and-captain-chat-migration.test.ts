import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('0164 drops old Captain DMs and what hangs off them, and relabels Task chat dm rows', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-crew-captain-chat-'));
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
        await writeFile(journalPath, through(162));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedChats(database);
        await seedCaptainDmDependents(database);

        await writeFile(journalPath, through(163));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0164_crew-and-captain-chat',
        ]);
        expect(await database`SELECT id, kind FROM chats ORDER BY id`).toEqual([
            { id: 'cht_ops', kind: 'channel' },
            { id: 'cht_people', kind: 'dm' },
            { id: 'cht_task', kind: 'task' },
        ]);
        expect(
            await database`SELECT id, addressed_reason, delivery FROM agent_inbox ORDER BY id`
        ).toEqual([
            { addressed_reason: 'mention', delivery: 'steer', id: 'inb_mentionrow000001' },
            { addressed_reason: 'task_chat', delivery: 'steer', id: 'inb_taskchatdm000001' },
            { addressed_reason: null, delivery: 'steer', id: 'inb_unaddressed00001' },
        ]);
        expect(await database`SELECT id FROM chat_messages ORDER BY id`).toEqual([
            { id: 'msg_people' },
        ]);
        expect(
            await database`SELECT
                (SELECT count(*)::int FROM reminders) AS reminders,
                (SELECT count(*)::int FROM reminder_agent_attention) AS attention,
                (SELECT count(*)::int FROM triggers) AS triggers,
                (SELECT count(*)::int FROM message_claims) AS claims,
                (SELECT count(*)::int FROM agent_chat_reads) AS reads`
        ).toEqual([{ attention: 0, claims: 0, reads: 0, reminders: 0, triggers: 0 }]);
        expect(await database`SELECT origin_chat_id, origin_message_id FROM tasks`).toEqual([
            { origin_chat_id: null, origin_message_id: null },
        ]);
        await expect(insert(database, 'inb_newdmrow00000001', 'dm')).rejects.toThrow(
            /agent_inbox_addressed_reason/u
        );
        await insert(database, 'inb_captainchat00001', 'captain_chat');
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

async function seedChats(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO chats (id, server_id, kind, name) VALUES ('cht_ops', 'srv_one', 'channel', 'ops')`;
        await tx`INSERT INTO chats (id, server_id, kind, parent_chat_id, parent_chat_kind)
            VALUES ('cht_task', 'srv_one', 'task', 'cht_ops', 'channel')`;
        await tx`INSERT INTO chats (id, server_id, kind, dm_agent_id, dm_member_one_user_id,
                dm_member_one_stint, last_message_sequence)
            VALUES ('cht_captain_dm', 'srv_one', 'dm', 'agt_one', 'usr_ada', 1, 1)`;
        await tx`INSERT INTO chats (id, server_id, kind, dm_member_one_user_id, dm_member_one_stint,
                dm_member_two_user_id, dm_member_two_stint, last_message_sequence)
            VALUES ('cht_people', 'srv_one', 'dm', 'usr_ada', 1, 'usr_bo', 1, 1)`;
        await tx`INSERT INTO chat_messages (id, server_id, chat_id, sequence, author_user_id, content, nonce)
            VALUES ('msg_captain_dm', 'srv_one', 'cht_captain_dm', 1, 'usr_ada', 'hello', 'non_one'),
                   ('msg_people', 'srv_one', 'cht_people', 1, 'usr_ada', 'hi Bo', 'non_two')`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, state, addressed_reason)
            VALUES
                ('inb_taskchatdm000001', 'srv_one', 'agt_task', 'cht_task', 'go', 'msg_task',
                    'human', 'queued', 'dm'),
                ('inb_captaindm0000001', 'srv_one', 'agt_one', 'cht_captain_dm', 'hello',
                    'msg_captain_dm', 'human', 'queued', 'dm'),
                ('inb_retireddm0000001', 'srv_one', 'agt_one', 'cht_ops', 'hi', 'msg_gone',
                    'human', 'seen', 'dm'),
                ('inb_mentionrow000001', 'srv_one', 'agt_one', 'cht_ops', 'hey', 'msg_ops',
                    'human', 'queued', 'mention'),
                ('inb_unaddressed00001', 'srv_one', 'agt_one', 'cht_ops', 'fyi', 'msg_fyi',
                    'human', 'queued', null)`;
    });
}

async function seedCaptainDmDependents(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO reminders (id, server_id, owner_agent_id, anchor_chat_id,
                anchor_message_id, fire_at, status, timezone, title, created_at, updated_at)
            VALUES ('rem_one', 'srv_one', 'agt_one', 'cht_captain_dm', 'msg_captain_dm', now(),
                'scheduled', 'UTC', 'Follow up', now(), now())`;
        await tx`INSERT INTO reminder_fires (id, server_id, reminder_id, fired_at, scheduled_for)
            VALUES ('rfi_one', 'srv_one', 'rem_one', now(), now())`;
        await tx`INSERT INTO reminder_agent_attention (id, server_id, agent_id, anchor_chat_id,
                fire_id, attention_kind, queued_at, reminder_id)
            VALUES ('rat_one', 'srv_one', 'agt_one', 'cht_captain_dm', 'rfi_one', 'reminder',
                now(), 'rem_one')`;
        await tx`INSERT INTO triggers (id, server_id, owner_agent_id, anchor_chat_id, kind,
                status, title, created_at, updated_at)
            VALUES ('trg_one', 'srv_one', 'agt_one', 'cht_captain_dm', 'github', 'armed', 'CI',
                now(), now())`;
        await tx`INSERT INTO message_claims (server_id, chat_id, message_id, number, origin,
                created_by_user_id)
            VALUES ('srv_one', 'cht_captain_dm', 'msg_captain_dm', 1, 'claimed', 'usr_ada')`;
        await tx`INSERT INTO agent_chat_reads (server_id, agent_id, chat_id, sequence)
            VALUES ('srv_one', 'agt_one', 'cht_captain_dm', 1)`;
        await tx`INSERT INTO tasks (id, server_id, project_id, short_id, title, chat_id,
                created_by_user_id, origin_chat_id, origin_message_id)
            VALUES ('tsk_one', 'srv_one', 'cht_ops', 'k3mq7xta', 'From the DM', 'cht_task',
                'usr_ada', 'cht_captain_dm', 'msg_captain_dm')`;
    });
}

function insert(database: SQL, id: string, addressedReason: string) {
    return database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, addressed_reason)
            VALUES (${id}, 'srv_one', 'agt_one', 'cht_ops', 'x', ${id}, 'human', ${addressedReason})`;
    });
}
