import { expect, test } from 'bun:test';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

const fixture = cloudAgentFixture();

test('a launch into a Chat with unseen newer messages is held and creates nothing', async () => {
    const runner = await fixture.mintRunner('run_cloud_hold');
    const newer = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'own it in tech ops though not here',
        nonce: 'human-newer',
        serverId: fixture.serverId,
    });
    const before = await fixture.countWork();

    const held = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-hold' }));
    expect(held.status).toBe(200);
    expect(held.body).toMatchObject({
        formalMentionCount: 0,
        newMessageCount: 1,
        omittedMessageCount: 0,
        state: 'held',
    });
    const shown = (held.body as unknown as { shownMessages: Array<{ id: string }> }).shownMessages;
    expect(shown.map((message) => message.id)).toEqual([newer.message.id]);
    expect(await fixture.countWork()).toBe(before);
    expect(await countAgentMessages()).toBe(0);
    const [runs] = (await fixture.harness.sql`
        select count(*)::int as total from cloud_agent_runs where server_id = ${fixture.serverId}
    `) as { total: number }[];
    expect(runs?.total).toBe(0);

    // The hold served those messages to this run, so re-running the same
    // command (same nonce: the held attempt left nothing to replay) launches.
    const retried = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-hold' }));
    expect(retried.status).toBe(200);
    expect(retried.body).toMatchObject({ idempotent: false, state: 'started' });
    expect(await fixture.countWork()).toBe(before + 1);
    expect(await countAgentMessages()).toBe(1);
});

test('a launch is not held when the Agent has seen the Chat head', async () => {
    // The previous launch's clean check advanced the seen cursor to the head,
    // so a later run with nothing newer launches with a fresh nonce.
    const runner = await fixture.mintRunner('run_cloud_seen');
    const started = await fixture.postStart(runner, fixture.startBody({ nonce: 'cloud-seen' }));
    expect(started.status).toBe(200);
    expect(started.body).toMatchObject({ idempotent: false, state: 'started' });

    // An Agent's own posts never hold it.
    const again = await fixture.postStart(
        runner,
        fixture.startBody({ nonce: 'cloud-seen-again', title: 'A second task' })
    );
    expect(again.body).toMatchObject({ state: 'started' });
});

async function countAgentMessages() {
    const [row] = (await fixture.harness.sql`
        select count(*)::int as total from chat_messages
        where server_id = ${fixture.serverId} and author_agent_id = ${fixture.orbitAgentId}
    `) as { total: number }[];
    return row?.total ?? 0;
}
