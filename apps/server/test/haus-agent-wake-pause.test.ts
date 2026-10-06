import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
const inventory = {
    runtimes: [
        {
            id: 'codex',
            label: 'Codex',
            models: [
                { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
                { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
            ],
        },
    ],
};

test('projects a wake pause, and only a runtime or model change lifts it', async () => {
    const { computerId, harness, owner, serverId } = fixture;
    await harness.sql`update computers set reported_inventory = ${inventory}::jsonb where id = ${computerId}`;
    const { agent } = await owner.trpc.agent.create.mutate({
        computerId,
        displayName: 'Pauser',
        handle: 'pauser',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId,
    });
    expect(agent.wakePause).toBeNull();
    await harness.sql`
        insert into agent_delivery (
            agent_id, server_id, consecutive_failures, same_failure_streak,
            failure_fingerprint, pause_step, paused_at, retry_after,
            last_failure_kind, last_failure_code, last_failure_at
        )
        values (
            ${agent.id}, ${serverId}, 3, 3, '0123456789abcdef', 1,
            now() - interval '2 hours', now() + interval '3 hours',
            'unknown', 'compaction-failed', now() - interval '1 hour'
        )
        on conflict (agent_id) do update set
            consecutive_failures = excluded.consecutive_failures,
            same_failure_streak = excluded.same_failure_streak,
            failure_fingerprint = excluded.failure_fingerprint,
            pause_step = excluded.pause_step,
            paused_at = excluded.paused_at,
            retry_after = excluded.retry_after,
            last_failure_kind = excluded.last_failure_kind,
            last_failure_code = excluded.last_failure_code,
            last_failure_at = excluded.last_failure_at
    `;
    const paused = await owner.trpc.agent.get.query({ agentId: agent.id, serverId });
    expect(paused.wakePause).toMatchObject({
        failureCount: 3,
        lastFailure: { code: 'compaction-failed', kind: 'unknown' },
        nextProbeAt: expect.any(String),
        pausedAt: expect.any(String),
    });

    const configure = (modelId: string) =>
        owner.trpc.agent.configure.mutate({
            agentId: agent.id,
            modelId,
            runtimeId: 'codex',
            serverId,
        });
    expect((await configure('gpt-5.6-sol')).wakePause).not.toBeNull();
    expect((await configure('gpt-5.6-terra')).wakePause).toBeNull();
    const listed = await owner.trpc.agent.list.query({ serverId });
    expect(listed.find((entry) => entry.id === agent.id)?.wakePause).toBeNull();
    await harness.sql`delete from agents where id = ${agent.id}`;
});
