import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

const efforts = ['low', 'medium', 'high', 'xhigh', 'max'];
const runtime = (id: string, models: { id: string; reasoningEfforts: string[] }[]) => ({
    id,
    label: id,
    models: models.map((model) => ({
        ...model,
        defaultReasoningEffort: 'medium',
        features: [],
        label: model.id,
    })),
});
const pi = runtime('pi', [{ id: 'pi', reasoningEfforts: efforts }]);
const createdAt = new Date('2026-01-01T00:00:00.000Z');
const previousRotation = new Date('2026-02-01T00:00:00.000Z');

test('retiring Pi moves its Agents to the default runtime their Computer reports', async () => {
    const cluster = await startPostgresCluster();
    const folder = await mkdtemp(join(tmpdir(), 'haus-retire-pi-'));
    const database = new SQL({ max: 1, url: cluster.databaseUrl });
    try {
        await cp(join(import.meta.dir, '../drizzle/postgres'), folder, { recursive: true });
        const journalPath = join(folder, 'meta/_journal.json');
        const journal = JSON.parse(await readFile(journalPath, 'utf8'));
        journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= 99);
        await writeFile(
            journalPath,
            JSON.stringify({
                ...journal,
                entries: journal.entries.filter((entry: { idx: number }) => entry.idx <= 98),
            })
        );
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        const inventories = {
            cmp_claudecode000000: {
                runtimes: [
                    runtime('codex', [{ id: 'gpt-5.6-sol', reasoningEfforts: efforts }]),
                    pi,
                    runtime('claude-code', [
                        { id: 'claude-opus-4-8', reasoningEfforts: efforts },
                        { id: 'claude-sonnet-5', reasoningEfforts: efforts },
                    ]),
                ],
            },
            cmp_grokbuild0000000: {
                runtimes: [
                    pi,
                    runtime('grok-build', [
                        { id: 'grok-4.6', reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
                    ]),
                ],
            },
        };
        // Only Agent configuration matters; Server and membership foreign keys are skipped.
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            for (const [index, [id, inventory]] of [
                ...Object.entries(inventories),
                ['cmp_unreported000000', null] as const,
            ].entries()) {
                await tx`INSERT INTO computers
                    (id, server_id, attached_by_user_id, credential_hash, reported_inventory)
                    VALUES (${id}, 'srv_one', 'usr_one', ${String(index).repeat(64)}, ${inventory}::jsonb)`;
            }
            for (const [id, computerId, runtimeId, modelId, effort, generation] of [
                ['agt_claude', 'cmp_claudecode000000', 'pi', 'pi', 'max', 1],
                ['agt_grok', 'cmp_grokbuild0000000', 'pi', 'pi', 'max', 1],
                ['agt_fallback', 'cmp_unreported000000', 'pi', 'pi', 'high', 3],
                ['agt_codex', 'cmp_claudecode000000', 'codex', 'gpt-5.6-sol', 'low', 1],
            ] as const) {
                await tx`INSERT INTO agents
                    (id, server_id, display_name, handle, home_timezone, computer_id,
                     desired_runtime_id, desired_model_id, desired_reasoning_effort,
                     session_generation, session_reset_kind, created_at)
                    VALUES (${id}, 'srv_one', ${id}, ${id.replace('_', '-')}, 'UTC',
                        ${computerId}, ${runtimeId}, ${modelId}, ${effort}, ${generation},
                        'full', ${createdAt})`;
                await tx`INSERT INTO agent_message_drafts
                    (server_id, agent_id, chat_id, content, rehold_count, session_generation)
                    VALUES ('srv_one', ${id}, 'cht_one', 'held', 1, ${generation})`;
            }
            await tx`INSERT INTO agent_session_rotations
                (server_id, agent_id, generation, reason, rotated_at)
                VALUES ('srv_one', 'agt_fallback', 3, 'session', ${previousRotation})`;
            // agt_grok is mid-run on Pi: its rotation defers to the run's settle.
            await tx`INSERT INTO agent_delivery
                (agent_id, server_id, active_run_id, active_run_computer_id,
                 active_run_runtime_id, active_run_model_id, active_run_reasoning_effort,
                 consecutive_failures, last_failure_at, last_failure_kind, paused_at, pause_step)
                VALUES ('agt_grok', 'srv_one', 'run_one', 'cmp_grokbuild0000000', 'pi', 'pi',
                    'max', 3, ${previousRotation}, 'runtime', ${previousRotation}, 1)`;
            await tx`INSERT INTO agent_delivery
                (agent_id, server_id, consecutive_failures, last_failure_at, last_failure_kind,
                 retry_after)
                VALUES ('agt_fallback', 'srv_one', 2, ${previousRotation}, 'runtime',
                    ${previousRotation})`;
            await tx`INSERT INTO agent_delivery
                (agent_id, server_id, consecutive_failures, last_failure_at, last_failure_kind)
                VALUES ('agt_codex', 'srv_one', 1, ${previousRotation}, 'runtime')`;
        });

        await writeFile(journalPath, JSON.stringify(journal));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            '0099_retire-pi-runtime',
        ]);
        expect(
            await database`SELECT id, desired_runtime_id, desired_model_id, desired_reasoning_effort
                FROM agents ORDER BY id`
        ).toEqual([
            {
                id: 'agt_claude',
                desired_runtime_id: 'claude-code',
                desired_model_id: 'claude-opus-4-8',
                desired_reasoning_effort: 'max',
            },
            {
                id: 'agt_codex',
                desired_runtime_id: 'codex',
                desired_model_id: 'gpt-5.6-sol',
                desired_reasoning_effort: 'low',
            },
            {
                id: 'agt_fallback',
                desired_runtime_id: 'claude-code',
                desired_model_id: 'claude-opus-4-8',
                desired_reasoning_effort: 'high',
            },
            {
                id: 'agt_grok',
                desired_runtime_id: 'grok-build',
                desired_model_id: 'grok-4.6',
                desired_reasoning_effort: 'medium',
            },
        ]);
        // Like a configuration change: an idle Agent rotates now, a mid-run one on settle.
        expect(
            await database`SELECT id, session_generation, session_reset_kind FROM agents ORDER BY id`
        ).toEqual([
            { id: 'agt_claude', session_generation: 2, session_reset_kind: 'session' },
            { id: 'agt_codex', session_generation: 1, session_reset_kind: 'full' },
            { id: 'agt_fallback', session_generation: 4, session_reset_kind: 'session' },
            { id: 'agt_grok', session_generation: 1, session_reset_kind: 'full' },
        ]);
        expect(
            await database`SELECT agent_id, generation, reason, previous_started_at
                FROM agent_session_rotations ORDER BY agent_id, generation`
        ).toEqual([
            {
                agent_id: 'agt_claude',
                generation: 2,
                previous_started_at: createdAt,
                reason: 'configuration',
            },
            {
                agent_id: 'agt_fallback',
                generation: 3,
                previous_started_at: null,
                reason: 'session',
            },
            {
                agent_id: 'agt_fallback',
                generation: 4,
                previous_started_at: previousRotation,
                reason: 'configuration',
            },
        ]);
        expect(
            await database`SELECT agent_id FROM agent_message_drafts ORDER BY agent_id`
        ).toEqual([{ agent_id: 'agt_codex' }, { agent_id: 'agt_grok' }]);
        // A runtime change is a human fix attempt: it lifts failure holds and wake pauses.
        expect(
            await database`SELECT agent_id, consecutive_failures, paused_at, retry_after,
                active_run_id FROM agent_delivery ORDER BY agent_id`
        ).toEqual([
            {
                active_run_id: null,
                agent_id: 'agt_codex',
                consecutive_failures: 1,
                paused_at: null,
                retry_after: null,
            },
            {
                active_run_id: null,
                agent_id: 'agt_fallback',
                consecutive_failures: 0,
                paused_at: null,
                retry_after: null,
            },
            {
                active_run_id: 'run_one',
                agent_id: 'agt_grok',
                consecutive_failures: 0,
                paused_at: null,
                retry_after: null,
            },
        ]);
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
