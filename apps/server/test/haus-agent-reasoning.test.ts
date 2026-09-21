import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
const inventory = {
    runtimes: [
        {
            id: 'codex',
            label: 'Codex',
            models: [
                {
                    id: 'gpt-5.6-sol',
                    label: 'GPT-5.6 Sol',
                    defaultReasoningEffort: 'medium',
                    reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'],
                },
                { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra' },
            ],
        },
    ],
};

test('persists model-supported effort and rejects unsupported configuration without changing it', async () => {
    const { owner, harness, serverId, computerId: computerA } = fixture;
    await harness.sql`update computers set reported_inventory = ${inventory}::jsonb where id = ${computerA}`;
    const created = await owner.trpc.agent.create.mutate({
        computerId: computerA,
        displayName: 'Reasoner',
        handle: 'reasoner',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        reasoningEffort: 'max',
        serverId,
    });
    expect(created.agent.desiredReasoningEffort).toBe('max');
    const [before] =
        await harness.sql`select session_generation from agents where id = ${created.agent.id}`;
    await expect(
        owner.trpc.agent.configure.mutate({
            agentId: created.agent.id,
            modelId: 'gpt-5.6-terra',
            runtimeId: 'codex',
            reasoningEffort: 'max',
            serverId,
        })
    ).rejects.toThrow('does not support reasoning effort');
    const configured = await owner.trpc.agent.configure.mutate({
        agentId: created.agent.id,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        reasoningEffort: 'xhigh',
        serverId,
    });
    expect(configured.desiredReasoningEffort).toBe('xhigh');
    const [stored] =
        await harness.sql`select desired_reasoning_effort, session_generation from agents where id = ${created.agent.id}`;
    expect(stored.desired_reasoning_effort).toBe('xhigh');
    expect(stored.session_generation).toBe(before.session_generation);
    await harness.sql`delete from agents where id = ${created.agent.id}`;
});
