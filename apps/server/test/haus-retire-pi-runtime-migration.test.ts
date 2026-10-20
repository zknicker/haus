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
            for (const [id, computerId, runtimeId, modelId, effort] of [
                ['agt_claude', 'cmp_claudecode000000', 'pi', 'pi', 'max'],
                ['agt_grok', 'cmp_grokbuild0000000', 'pi', 'pi', 'max'],
                ['agt_fallback', 'cmp_unreported000000', 'pi', 'pi', 'high'],
                ['agt_codex', 'cmp_claudecode000000', 'codex', 'gpt-5.6-sol', 'low'],
            ]) {
                await tx`INSERT INTO agents
                    (id, server_id, display_name, handle, home_timezone, computer_id,
                     desired_runtime_id, desired_model_id, desired_reasoning_effort)
                    VALUES (${id}, 'srv_one', ${id}, ${id.replace('_', '-')}, 'UTC',
                        ${computerId}, ${runtimeId}, ${modelId}, ${effort})`;
            }
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
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([]);
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { recursive: true, force: true });
    }
}, 60_000);
