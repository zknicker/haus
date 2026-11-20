import { expect, test } from 'bun:test';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import { agentHearingFixture } from './agent-hearing.fixture.ts';

const { agents, fixture, heard, project, send } = agentHearingFixture();

test('an inline reply reaches the home Agents, and on a mention the mentioned Agent too', async () => {
    const root = await send(project('web'), 'Which cache do we keep?');

    expect(await heard(await send(project('web'), 'The edge one?', root))).toEqual(['ari', 'cyl']);
    expect(await heard(await send(project('web'), '@bex do you agree?', root))).toEqual([
        'ari',
        'bex',
        'cyl',
    ]);
});

test('after another Agent joined the chain, a home Agent with no follow still hears an unmentioned reply', async () => {
    const root = await send(project('web'), 'Do we cut the legacy route?');
    await send(project('web'), '@bex is anything still calling it?', root);

    expect(await heard(await send(project('web'), 'Waiting on that.', root))).toEqual([
        'ari',
        'bex',
        'cyl',
    ]);
});

test("after the only follower retired, a person's reply still reaches the hearers", async () => {
    const fen = await fixture.createAgent('Fen', 'fen');
    const root = await send(project('web'), 'Who owns the CDN bill?');
    await send(project('web'), '@fen can you check?', root);
    await fixture.owner.trpc.agent.delete.mutate({
        agentId: fen,
        confirmation: 'Fen',
        serverId: fixture.serverId,
    });

    expect(await heard(await send(project('web'), 'Any news on it?', root))).toEqual([
        'ari',
        'cyl',
    ]);
});

test('a home Agent that unfollows a chain keeps its queued replies and keeps hearing it', async () => {
    const root = await send(project('web'), 'Do we keep the beta banner?');
    await send(project('web'), '@ari your call.', root);
    const queued = await send(project('web'), 'No rush on it.', root);
    const ari = await fixture.mintRunner(createOpaqueId('run'), agents.ari, project('web'));
    const unfollowed = await fixture.post('/api/agent/messages/unfollow', ari, {
        messageId: root,
        target: '#web',
    });

    expect(unfollowed.status).toBe(200);
    expect(await heard(queued)).toEqual(['ari', 'cyl']);
    expect(await heard(await send(project('web'), 'Keeping it.', root))).toEqual(['ari', 'cyl']);
});

test('an unfollowing non-hearer stops hearing the chain', async () => {
    const root = await send(project('web'), 'Should the API version its errors?');
    await send(project('web'), '@bex what do you think?', root);
    const bex = await fixture.mintRunner(createOpaqueId('run'), agents.bex, project('web'));
    const unfollowed = await fixture.post('/api/agent/messages/unfollow', bex, {
        messageId: root,
        target: '#web',
    });

    expect(unfollowed.status).toBe(200);
    expect(await heard(await send(project('web'), 'Settling it here.', root))).toEqual([
        'ari',
        'cyl',
    ]);
});
