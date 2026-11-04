import { expect, test } from 'bun:test';
import type { AgentIdleCompactionReport } from '@haus/api';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

/**
 * Idle compaction is an Owner's Server setting, off by default, that every attached Computer
 * follows; a compaction a Computer ran is recorded as the Agent's completed turn for Usage.
 */
const fixture = cloudAgentFixture();

test('idle compaction starts off; every member reads it and only an Owner changes it', async () => {
    const input = { serverId: fixture.serverId };
    expect(await fixture.owner.trpc.server.settings.query(input)).toEqual({
        idleCompaction: false,
    });
    expect(await fixture.peer.trpc.server.settings.query(input)).toEqual({
        idleCompaction: false,
    });
    await expect(
        fixture.peer.trpc.server.setIdleCompaction.mutate({ ...input, idleCompaction: true })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });

    expect(
        await fixture.owner.trpc.server.setIdleCompaction.mutate({ ...input, idleCompaction: true })
    ).toEqual({ idleCompaction: true });
    expect(await fixture.peer.trpc.server.settings.query(input)).toEqual({ idleCompaction: true });
    await fixture.owner.trpc.server.setIdleCompaction.mutate({ ...input, idleCompaction: false });
});

test('an attached Computer gets the setting on attach and on every change', async () => {
    const socket = new WebSocket(fixture.computerSocketUrl());
    const settings: boolean[] = [];
    socket.addEventListener('message', (event) => {
        const frame = JSON.parse(String(event.data)) as { idleCompaction?: boolean; type: string };
        if (frame.type === 'server-runtime-settings') {
            settings.push(frame.idleCompaction === true);
        }
    });
    await fixture.opened(socket);
    try {
        socket.send(JSON.stringify(fixture.bootstrapFrame()));
        await until(() => settings.length === 1);
        expect(settings).toEqual([false]);

        await fixture.owner.trpc.server.setIdleCompaction.mutate({
            idleCompaction: true,
            serverId: fixture.serverId,
        });
        await until(() => settings.length === 2);
        expect(settings).toEqual([false, true]);
    } finally {
        socket.close();
        await fixture.owner.trpc.server.setIdleCompaction.mutate({
            idleCompaction: false,
            serverId: fixture.serverId,
        });
    }
});

test('a reported idle compaction is the Agent’s completed turn, counted once in Usage', async () => {
    const socket = await fixture.attachComputer();
    const report: AgentIdleCompactionReport = {
        agentId: fixture.orbitAgentId,
        compactionId: 'compaction-0f3a9c1e-test',
        costUsd: 2.5,
        endedAt: '2026-11-04T10:01:00.000Z',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        startedAt: '2026-11-04T10:00:00.000Z',
        tokenUsage: {
            cacheReadTokens: 800_000,
            cacheWriteTokens: 2000,
            inputTokens: 803_000,
            outputTokens: 9000,
            totalTokens: 812_000,
        },
        tokensAfter: 41_000,
        tokensBefore: 812_000,
        type: 'agent-idle-compaction',
    };
    try {
        // A resend is the same turn, never a second one.
        socket.send(JSON.stringify(report));
        socket.send(JSON.stringify(report));
        const rows = await until(async () => {
            const found = await fixture.harness.sql`
                select run_id, status, summary, message_count, output_produced,
                    input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens
                from agent_turns where run_id = ${report.compactionId}
            `;
            return found.length > 0 ? found : null;
        });
        expect(rows).toEqual([
            {
                cache_read_tokens: 800_000,
                cache_write_tokens: 2000,
                input_tokens: 803_000,
                message_count: 0,
                output_produced: false,
                output_tokens: 9000,
                run_id: report.compactionId,
                status: 'completed',
                summary: 'Compacted idle context: 812K → 41K tokens.',
                total_tokens: 812_000,
            },
        ]);
        const usage = await fixture.harness.sql`
            select sum(total_tokens)::int as total from agent_token_usage_daily
            where agent_id = ${fixture.orbitAgentId} and date = '2026-11-04'
        `;
        expect(usage).toEqual([{ total: 812_000 }]);
    } finally {
        socket.close();
    }
});

async function until<Value>(
    read: () => Value | Promise<Value>,
    timeoutMs = 5000
): Promise<NonNullable<Value>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await read();
        if (value) {
            return value as NonNullable<Value>;
        }
        if (Date.now() > deadline) {
            throw new Error('Timed out waiting for the Server.');
        }
        await Bun.sleep(20);
    }
}
