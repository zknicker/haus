import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

test('backfills outcome for settled fires and defaults the new wake-rule columns', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-reminder-wake-rules-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        const upToWakeRules = journal.entries;
        await writeFile(
            journalPath,
            JSON.stringify({
                ...journal,
                entries: upToWakeRules.filter((entry: { idx: number }) => entry.idx <= 110),
            })
        );
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);

        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO users (id, auth_subject, display_name)
                VALUES ('usr_one', 'cf-wake-rules', 'Before wake rules')`;
            await tx`INSERT INTO servers (id, display_name, slug)
                VALUES ('srv_one', 'Before Wake Rules', 'before-wake-rules')`;
            await tx`INSERT INTO chats (id, server_id, kind, name, is_all, last_message_sequence)
                VALUES ('cht_one', 'srv_one', 'channel', 'all', true, 1)`;
            await tx`INSERT INTO agents (id, server_id, display_name, handle, home_timezone)
                VALUES ('agt_one', 'srv_one', 'Cove', 'wake-rules-cove', 'America/New_York')`;
            await tx`INSERT INTO chat_messages
                (id, server_id, chat_id, sequence, author_agent_id, content, nonce, created_at)
                VALUES ('msg_one', 'srv_one', 'cht_one', 1, 'agt_one', 'Anchor', 'anchor', now())`;
            for (const [id, script] of [
                ['rem_plain', null],
                ['rem_script', 'check-disk'],
            ] as const) {
                await tx`INSERT INTO reminders
                    (id, server_id, owner_agent_id, title, anchor_chat_id, anchor_message_id,
                     fire_at, timezone, script, status, version, created_at, updated_at)
                    VALUES (${id}, 'srv_one', 'agt_one', 'Title', 'cht_one', 'msg_one',
                        now() + interval '1 day', 'America/New_York', ${script}, 'scheduled', 1,
                        now(), now())`;
            }
            // A plain reminder's fire always wakes.
            await tx`INSERT INTO reminder_fires
                (id, server_id, reminder_id, fired_at, scheduled_for, has_script)
                VALUES ('rmf_plain', 'srv_one', 'rem_plain', now(), now(), false)`;
            // A settled script fire that exited 0 with no output: today's quiet tick.
            await tx`INSERT INTO reminder_fires
                (id, server_id, reminder_id, fired_at, scheduled_for, has_script,
                 script_exit_code, script_output, script_timed_out)
                VALUES ('rmf_quiet', 'srv_one', 'rem_script', now(), now() - interval '4 hours', true, 0, '   ', false)`;
            // A settled script fire that exited 0 with output: today's wake.
            await tx`INSERT INTO reminder_fires
                (id, server_id, reminder_id, fired_at, scheduled_for, has_script,
                 script_exit_code, script_output, script_timed_out)
                VALUES ('rmf_woke', 'srv_one', 'rem_script', now(), now() - interval '3 hours', true, 0, 'changed', false)`;
            // A settled script fire that failed: today's wake.
            await tx`INSERT INTO reminder_fires
                (id, server_id, reminder_id, fired_at, scheduled_for, has_script,
                 script_exit_code, script_timed_out)
                VALUES ('rmf_failed', 'srv_one', 'rem_script', now(), now() - interval '2 hours', true, 1, false)`;
            // A settled script fire that timed out: today's wake.
            await tx`INSERT INTO reminder_fires
                (id, server_id, reminder_id, fired_at, scheduled_for, has_script,
                 script_exit_code, script_timed_out)
                VALUES ('rmf_timedout', 'srv_one', 'rem_script', now(), now() - interval '1 hours', true, 0, true)`;
            // A script fire the Computer never settled: unknown outcome.
            await tx`INSERT INTO reminder_fires
                (id, server_id, reminder_id, fired_at, scheduled_for, has_script)
                VALUES ('rmf_pending', 'srv_one', 'rem_script', now(), now() - interval '30 minutes', true)`;
        });

        await writeFile(
            journalPath,
            JSON.stringify({
                ...journal,
                entries: upToWakeRules.filter((entry: { idx: number }) => entry.idx <= 111),
            })
        );
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0111_reminder-wake-rules',
        ]);

        expect(await database`SELECT id, outcome FROM reminder_fires ORDER BY id`).toEqual([
            { id: 'rmf_failed', outcome: 'woke' },
            { id: 'rmf_pending', outcome: null },
            { id: 'rmf_plain', outcome: 'woke' },
            { id: 'rmf_quiet', outcome: 'quiet' },
            { id: 'rmf_timedout', outcome: 'woke' },
            { id: 'rmf_woke', outcome: 'woke' },
        ]);
        expect(
            await database`SELECT wake_on_change, fail_after, consecutive_failures,
                failure_streak_woken, last_wake_output_hash FROM reminders ORDER BY id`
        ).toEqual([
            {
                wake_on_change: false,
                fail_after: null,
                consecutive_failures: 0,
                failure_streak_woken: false,
                last_wake_output_hash: null,
            },
            {
                wake_on_change: false,
                fail_after: null,
                consecutive_failures: 0,
                failure_streak_woken: false,
                last_wake_output_hash: null,
            },
        ]);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
