import { expect, test } from 'bun:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SQL } from 'bun';
import { migrateHausDatabase } from '../src/postgres/migrations.ts';
import { startEmptyDatabase } from './postgres-cluster.ts';

const migrationTag = '0151_computer-agent-access';

test('0151 keeps every invocation and lets only a not-found refusal record no Computer', async () => {
    const cluster = await startEmptyDatabase();
    const folder = await mkdtemp(join(tmpdir(), 'haus-computer-agent-access-'));
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
        await writeFile(journalPath, through(150));
        await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder);
        await seedInvocations(database);
        expect(
            await rejects(database, { computerId: null, outcome: 'failed', refusal: 'not-found' })
        ).toBe(true);

        await writeFile(journalPath, through(151));
        expect(await migrateHausDatabase(cluster.databaseUrl, 'haus', 'haus', folder)).toEqual([
            migrationTag,
        ]);

        expect(await readInvocations(database)).toEqual([
            { computer_id: 'cmp_aaaaaaaaaaaaaaaa', id: 'inv_aaaaaaaaaaaaaaaa', refusal: 'off' },
            { computer_id: null, id: 'inv_bbbbbbbbbbbbbbbb', refusal: null },
        ]);
        expect(
            await rejects(database, { computerId: null, outcome: 'failed', refusal: 'not-found' })
        ).toBe(false);
        expect(
            await rejects(database, {
                computerId: 'cmp_aaaaaaaaaaaaaaaa',
                outcome: 'failed',
                refusal: 'no-access',
            })
        ).toBe(false);
        expect(
            await rejects(database, { computerId: null, outcome: 'failed', refusal: 'no-access' })
        ).toBe(true);
        expect(await rejects(database, { computerId: null, outcome: 'failed', refusal: null })).toBe(
            true
        );
        expect(
            await rejects(database, { computerId: null, outcome: 'completed', refusal: null })
        ).toBe(true);
        expect(await rejects(database, { computerId: null, outcome: 'offline', refusal: null })).toBe(
            false
        );
    } finally {
        await database.close();
        await cluster.stop();
        await rm(folder, { force: true, recursive: true });
    }
});

let inserted = 0;

async function rejects(
    database: SQL,
    row: { computerId: string | null; outcome: string; refusal: string | null }
) {
    inserted += 1;
    const id = `inv_check${String(inserted).padStart(11, '0')}`;
    try {
        await database.begin(async (tx) => {
            await tx`SET LOCAL session_replication_role = replica`;
            await tx`INSERT INTO agent_invocations (id, server_id, agent_id, computer_id, run_id, seq,
                    tool_call_id, operation_kind, state, outcome, refusal, requested_at, finished_at,
                    timeout_ms)
                VALUES (${id}, 'srv_a', 'agt_a', ${row.computerId}, ${`run_${id}`}, 0, ${`toolu_${id}`},
                    'bash', 'finished', ${row.outcome}, ${row.refusal}, now(), now(), 1000)`;
        });
        return false;
    } catch (error) {
        expect(String(error)).toContain('agent_invocations_');
        return true;
    }
}

async function readInvocations(database: SQL) {
    return await database`
        SELECT id, computer_id, refusal FROM agent_invocations
        WHERE id NOT LIKE 'inv_check%' ORDER BY id COLLATE "C"`;
}

async function seedInvocations(database: SQL) {
    await database.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`;
        await tx`INSERT INTO agent_invocations (id, server_id, agent_id, computer_id, run_id, seq,
                tool_call_id, operation_kind, state, outcome, refusal, requested_at, finished_at,
                timeout_ms)
            VALUES
                ('inv_aaaaaaaaaaaaaaaa', 'srv_a', 'agt_a', 'cmp_aaaaaaaaaaaaaaaa', 'run_a', 0, 'toolu_a',
                    'desktop', 'finished', 'failed', 'off', now(), now(), 1000),
                ('inv_bbbbbbbbbbbbbbbb', 'srv_a', 'agt_a', null, 'run_b', 0, 'toolu_b',
                    'bash', 'finished', 'offline', null, now(), now(), 1000)`;
    });
}
