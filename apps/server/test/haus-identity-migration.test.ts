import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { SQL } from 'bun';
import { startEmptyDatabase } from './postgres-cluster.ts';

test('identity migration preserves existing Agent state and is repeatable', async () => {
    const cluster = await startEmptyDatabase();
    const sql = new SQL({ url: cluster.databaseUrl, max: 1 });
    try {
        await sql
            .unsafe(`
            CREATE TABLE agents (
                id text PRIMARY KEY,
                handle text NOT NULL,
                factory_kind text NOT NULL,
                effective_previous_agent_applied_at timestamptz,
                effective_previous_agent_status text,
                effective_previous_agent_version text,
                CONSTRAINT agents_previous_agent_status CHECK (
                    effective_previous_agent_status IN ('current', 'failed', 'pending')
                ),
                CONSTRAINT agents_handle_grammar CHECK (length(handle) > 0)
            );
            CREATE TABLE server_memberships (
                handle text,
                CONSTRAINT server_memberships_handle_grammar CHECK (length(handle) > 0)
            );
            INSERT INTO agents VALUES (
                'agt_existing', 'marlow', 'ordinary', '2026-09-10T12:00:00Z', 'current', '1.5.0'
            );
        `)
            .simple();
        const source = await readFile(
            new URL('../drizzle/postgres/0041_haus_identity.sql', import.meta.url),
            'utf8'
        );
        for (let attempt = 0; attempt < 2; attempt++) {
            for (const statement of source.split('--> statement-breakpoint')) {
                await sql.unsafe(statement);
            }
        }
        const [row] = await sql`
            SELECT id, effective_haus_agent_status AS status,
                   effective_haus_agent_version AS version,
                   effective_haus_agent_applied_at AS applied_at
            FROM agents
        `;
        expect(row).toMatchObject({ id: 'agt_existing', status: 'current', version: '1.5.0' });
        expect(new Date(row.applied_at).toISOString()).toBe('2026-09-10T12:00:00.000Z');
        const constraints = await sql`
            SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint
            WHERE conrelid = 'public.agents'::regclass
        `;
        expect(constraints.some((row) => row.conname === 'agents_haus_agent_status')).toBe(true);
        expect(
            constraints.find((row) => row.conname === 'agents_handle_grammar')?.definition
        ).toContain('haus');
        const columns = await sql`
            SELECT column_name FROM information_schema.columns
            WHERE table_name = 'agents' AND column_name LIKE '%previous%'
        `;
        expect(columns).toEqual([]);
    } finally {
        await sql.close({ timeout: 1 });
        await cluster.stop();
    }
}, 30_000);
