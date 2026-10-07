import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { SQL } from 'bun';
import { drizzle } from 'drizzle-orm/bun-sql';
import { agentsTable } from '../src/postgres/schema/agents.ts';
import { startPostgresCluster } from './postgres-cluster.ts';

test('conversation style preserves the preceding Server personality read and write path', async () => {
    const cluster = await startPostgresCluster();
    const sql = new SQL({ url: cluster.databaseUrl, max: 1 });
    try {
        await sql.unsafe(`CREATE TABLE agents (
            id text PRIMARY KEY,
            personality text,
            CONSTRAINT agents_personality_length CHECK (
                personality IS NULL OR char_length(personality) BETWEEN 1 AND 2000
            )
        )`);
        await sql`INSERT INTO agents (id, personality) VALUES ('agt_existing', 'Be direct')`;
        const source = await readFile(
            new URL('../drizzle/postgres/0064_agent_conversation_style.sql', import.meta.url),
            'utf8'
        );
        for (const statement of source.split('--> statement-breakpoint')) {
            await sql.unsafe(statement);
        }
        const db = drizzle(sql);
        expect(
            await db.select({ conversationStyle: agentsTable.conversationStyle }).from(agentsTable)
        ).toEqual([{ conversationStyle: 'Be direct' }]);
        await db.update(agentsTable).set({ conversationStyle: 'Keep replies short' });
        expect(await sql`SELECT personality FROM agents`).toEqual([
            { personality: 'Keep replies short' },
        ]);
        await sql`UPDATE agents SET personality = 'Explain tradeoffs'`;
        expect(
            await db.select({ conversationStyle: agentsTable.conversationStyle }).from(agentsTable)
        ).toEqual([{ conversationStyle: 'Explain tradeoffs' }]);
    } finally {
        await sql.close({ timeout: 1 });
        await cluster.stop();
    }
}, 30_000);
