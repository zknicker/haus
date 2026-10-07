import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

async function readSignatureEmoji(agentId: string): Promise<string | null> {
    const [row] = (await fixture.harness.sql`
        select signature_emoji from agents where id = ${agentId}
    `) as { signature_emoji: string | null }[];
    return row?.signature_emoji ?? null;
}

function appCreate(overrides: Record<string, unknown>) {
    return fixture.owner.trpc.agent.create.mutate({
        computerId: fixture.computerId,
        displayName: 'Ember',
        handle: 'ember',
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: fixture.serverId,
        ...overrides,
    });
}

test('the App creates an Agent with a normalized signature emoji, or null without one', async () => {
    const withEmoji = await appCreate({ handle: 'ember', signatureEmoji: ' ❤ ' });
    expect(await readSignatureEmoji(withEmoji.agent.id)).toBe('❤️');

    const without = await appCreate({ displayName: 'Plain', handle: 'plain' });
    expect(await readSignatureEmoji(without.agent.id)).toBeNull();

    await expect(
        appCreate({ displayName: 'Wordy', handle: 'wordy', signatureEmoji: 'fox' })
    ).rejects.toThrow(/exactly one emoji/u);
});

test('an Agent creates a teammate with a signature emoji, or null without one', async () => {
    const runner = await fixture.mintRunner('run_create_signature_emoji');
    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Fox', nonce: 'emoji-fox', signatureEmoji: '🦊' })
    );
    expect(created.status).toBe(200);
    expect(await readSignatureEmoji(created.body.agent?.agentId ?? '')).toBe('🦊');

    const plain = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Bare', nonce: 'emoji-none' })
    );
    expect(plain.status).toBe(200);
    expect(await readSignatureEmoji(plain.body.agent?.agentId ?? '')).toBeNull();

    // A replay with a different emoji asks for a different Agent under a spent nonce.
    const conflict = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Fox', nonce: 'emoji-fox', signatureEmoji: '🐺' })
    );
    expect(conflict.status).toBe(409);
});

test('the Agent API refuses an invalid signature emoji with the rule', async () => {
    const runner = await fixture.mintRunner('run_create_bad_emoji');
    const refused = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Text', nonce: 'emoji-text', signatureEmoji: 'fox' })
    );
    expect(refused.status).toBe(400);
    expect(refused.body).toMatchObject({
        code: 'INVALID_ARG',
        message: expect.stringContaining('exactly one emoji'),
    });
});
