import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

/**
 * ADR 0052: a Server at 0122 with heartbeat work queued, in flight, and on
 * record takes 0123. The heartbeat rows go, an in-flight heartbeat run ends,
 * and everything else rides through.
 */
test('0123 retires heartbeat rows and tables on a Server at 0122', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-retire-heartbeats-'));
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
        await writeFile(journalPath, through(122));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedHeartbeatRows(database);

        await writeFile(journalPath, through(123));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0123_retire-heartbeats',
        ]);

        expect(
            await database`SELECT table_name FROM information_schema.tables
                WHERE table_name IN ('agent_dreams', 'agent_dream_summaries',
                    'agent_heartbeat_checks', 'agent_leads')`
        ).toEqual([]);
        expect(
            await database`SELECT column_name FROM information_schema.columns
                WHERE table_name = 'agents' AND column_name = 'effective_background_tasks'`
        ).toEqual([]);
        expect(await database`SELECT id, source FROM agent_inbox ORDER BY id`).toEqual([
            { id: 'inb_subagentitem0000', source: 'subagent' },
        ]);
        expect(await database`SELECT run_id, source FROM agent_run_triggers`).toEqual([
            { run_id: 'run_subagent', source: 'subagent' },
        ]);
        // The in-flight heartbeat run ended: its slot cleared and its credential revoked.
        expect(
            await database`SELECT agent_id, active_run_id FROM agent_delivery ORDER BY agent_id`
        ).toEqual([
            { active_run_id: null, agent_id: 'agt_one' },
            { active_run_id: 'run_subagent', agent_id: 'agt_two' },
        ]);
        expect(
            await database`SELECT run_id, revoked_at IS NOT NULL AS revoked
                FROM agent_runner_credentials ORDER BY run_id`
        ).toEqual([
            { revoked: true, run_id: 'run_heartbeat' },
            { revoked: false, run_id: 'run_subagent' },
        ]);

        const checks = await database`SELECT pg_get_constraintdef(oid) AS definition
            FROM pg_constraint WHERE conname IN ('agent_inbox_chat', 'agent_run_triggers_chat')`;
        expect(checks).toHaveLength(2);
        for (const { definition } of checks) {
            expect(definition).toContain('subagent');
            expect(definition).toContain('task_assignment');
            expect(definition).not.toContain('dream');
            expect(definition).not.toContain('heartbeat');
        }
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
}, 60_000);

/** Rows the migration reaches are real; the seed itself skips foreign-key wiring. */
async function seedHeartbeatRows(database: SQL) {
    const tokenHash = (digit: string) => digit.repeat(64);
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO servers (id, slug, display_name) VALUES ('srv_one', 'one', 'One')`;
        await tx`INSERT INTO agents (id, server_id, handle, display_name, home_timezone)
            VALUES ('agt_one', 'srv_one', 'agent-one', 'Agent One', 'UTC'),
                ('agt_two', 'srv_one', 'agent-two', 'Agent Two', 'UTC')`;
        await tx`INSERT INTO agent_inbox (id, server_id, agent_id, chat_id, content, dedupe_key,
                source, run_id, state)
            VALUES
                ('inb_dreamitem0000000', 'srv_one', 'agt_one', null, '', 'dream:agt_one:2026-11-17',
                 'dream', null, 'queued'),
                ('inb_heartbeatitem000', 'srv_one', 'agt_one', null, '',
                 'heartbeat:agt_one:2026-11-18:08:00', 'heartbeat', 'run_heartbeat', 'accepted'),
                ('inb_reportitem000000', 'srv_one', 'agt_one', null, 'Nothing new.',
                 'heartbeat-report:run_old', 'heartbeat_report', null, 'seen'),
                ('inb_subagentitem0000', 'srv_one', 'agt_two', null, '',
                 'subagent:agt_two:wake_1', 'subagent', 'run_subagent', 'accepted')`;
        await tx`INSERT INTO agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
            VALUES
                ('srv_one', 'agt_one', 'run_heartbeat', null, 'heartbeat',
                 'heartbeat:agt_one:2026-11-18:08:00'),
                ('srv_one', 'agt_one', 'run_old', null, 'dream', 'dream:agt_one:2026-11-16'),
                ('srv_one', 'agt_two', 'run_subagent', null, 'subagent', 'subagent:agt_two:wake_1')`;
        await tx`INSERT INTO agent_delivery (agent_id, server_id, active_run_id,
                active_run_computer_id, active_run_runtime_id, active_run_model_id,
                active_run_reasoning_effort, accepted_at, dispatched_at)
            VALUES
                ('agt_one', 'srv_one', 'run_heartbeat', 'cmp_one', 'codex', 'gpt', 'medium',
                 now(), now()),
                ('agt_two', 'srv_one', 'run_subagent', 'cmp_one', 'codex', 'gpt', 'medium',
                 now(), now())`;
        await tx`INSERT INTO agent_runner_credentials (id, server_id, agent_id, computer_id, run_id,
                token_hash)
            VALUES
                ('arc_heartbeat0000000', 'srv_one', 'agt_one', 'cmp_one', 'run_heartbeat',
                 ${tokenHash('a')}),
                ('arc_subagent00000000', 'srv_one', 'agt_two', 'cmp_one', 'run_subagent',
                 ${tokenHash('b')})`;
        await tx`INSERT INTO agent_dreams (agent_id, server_id, run_id, files, patch, started_at,
                finished_at)
            VALUES ('agt_one', 'srv_one', 'run_old', '[]', '', now(), now())`;
        await tx`INSERT INTO agent_leads (id, server_id, agent_id, topic)
            VALUES ('led_one', 'srv_one', 'agt_one', 'Q4 budget')`;
    });
}
