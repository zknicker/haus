import { expect } from 'bun:test';
import { recordExactMessagesServed } from '../src/agent-delivery/cursors.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';

/**
 * Reads a target as the Agent and records that exact visibility, as the
 * Computer proxy does for a real turn. Without it, an Agent post into that
 * Chat is freshness-held.
 */
export async function readTargetAsAgent(
    harness: { databaseUrl: string; url: string },
    context: { agentId: string; serverId: string },
    runner: { runId: string; token: string },
    target: string
) {
    const url = new URL('/api/agent/history', harness.url);
    url.searchParams.set('target', target);
    const history = await fetch(url, { headers: { authorization: `Bearer ${runner.token}` } });
    expect(history.status).toBe(200);
    const { messages } = (await history.json()) as {
        messages: Array<{ chat_id: string; id: string }>;
    };
    const database = await connectHausDatabase(harness.databaseUrl);
    try {
        await recordExactMessagesServed(database.db, {
            agentId: context.agentId,
            messages: messages.map((message) => ({ chatId: message.chat_id, id: message.id })),
            runId: runner.runId,
            serverId: context.serverId,
        });
    } finally {
        await database.close();
    }
}
