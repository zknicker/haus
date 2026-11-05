import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

test('a human-created Agent is queued one greeting wake in #all', async () => {
    const agentId = await fixture.createAgent('Beacon', 'beacon');

    expect(await readGreetings(agentId)).toEqual([
        { chatName: 'all', dedupeKey: `greeting:${agentId}`, state: 'queued' },
    ]);
});

test('an Agent-created Agent is queued one greeting wake, and a replay queues no second', async () => {
    const runner = await fixture.mintRunner('run_create_greeting');
    const body = fixture.createBody({ displayName: 'Herald', nonce: 'create-greeting' });

    const created = await fixture.postCreate(runner, body);
    const agentId = created.body.agent?.agentId ?? '';
    expect(created.status).toBe(200);
    expect(await readGreetings(agentId)).toEqual([
        { chatName: 'all', dedupeKey: `greeting:${agentId}`, state: 'queued' },
    ]);

    const replay = await fixture.postCreate(runner, body);
    expect(replay.body).toMatchObject({ idempotent: true });
    expect(await readGreetings(agentId)).toHaveLength(1);
});

test('existing Agents and Cove are never queued a greeting by creation', async () => {
    await fixture.createAgent('Signal', 'signal');

    expect(await readGreetings(fixture.orbitAgentId)).toHaveLength(1);
    expect(await readGreetings(fixture.coveAgentId)).toEqual([]);
});

async function readGreetings(agentId: string) {
    return await fixture.harness.sql`
        select chats.name as "chatName", agent_inbox.dedupe_key as "dedupeKey", agent_inbox.state
        from agent_inbox
        join chats on chats.id = agent_inbox.chat_id
        where agent_inbox.agent_id = ${agentId} and agent_inbox.source = 'greeting'
    `;
}
