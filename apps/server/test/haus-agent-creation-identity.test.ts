import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a colliding name returns the minted handle without needing announcement text', async () => {
    const runner = await fixture.mintRunner('run_create_collision');
    const created = await fixture.postCreate(
        runner,
        fixture.createBody({
            displayName: 'Orbit',
            nonce: 'create-collision',
        })
    );
    expect(created.status).toBe(200);
    expect(created.body.agent?.handle).toBe('orbit-2');
    expect(created.body).not.toHaveProperty('messageId');
});

test('creation rejects the removed announcement input', async () => {
    const runner = await fixture.mintRunner('run_create_old_input');
    const refused = await fixture.postCreate(
        runner,
        fixture.createBody({
            content: 'Meet @legacy.',
            displayName: 'Legacy',
            nonce: 'old-create-input',
        })
    );
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('INVALID_ARG');
});

test('reusing a nonce with a different brief or channels refuses before avatar generation', async () => {
    const runner = await fixture.mintRunner('run_create_request_conflict');
    const body = fixture.createBody({
        avatarConcept: 'a moonlit raccoon',
        brief: 'Own deliveries.',
        nonce: 'request-conflict',
    });
    expect((await fixture.postCreate(runner, body)).status).toBe(200);
    const spent = fixture.avatarRequests.length;
    for (const change of [{ brief: 'Own finance.' }, { channels: ['#product'] }]) {
        const refused = await fixture.postCreate(runner, { ...body, ...change });
        expect(refused.status).toBe(409);
        expect(refused.body.code).toBe('AGENT_CREATE_IDEMPOTENCY_CONFLICT');
    }
    expect(fixture.avatarRequests.length).toBe(spent);
});
