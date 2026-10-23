import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { startRun } from './heartbeat-run-fixture.ts';

const fixture = agentCreationFixture();

test('a lead claim outside an active heartbeat run is refused and points to haus task claim', async () => {
    const chatRun = await runner('run_guard_chat00001', fixture.orbitAgentId, 'human');
    const refused = await claimLead(chatRun, { topic: 'Regular turn lead' });
    expect(refused.status).toBe(403);
    expect(refused.body).toMatchObject({ code: 'HEARTBEAT_RUN_REQUIRED' });
    expect(refused.body.message).toContain('haus task claim');

    const unknown = await fixture.mintRunner(
        'run_guard_none00001',
        fixture.orbitAgentId,
        undefined,
        false
    );
    expect((await claimLead(unknown, { topic: 'No trigger' })).status).toBe(403);

    const heartbeat = await runner('run_guard_gone00001', fixture.orbitAgentId, 'heartbeat');
    await runner('run_guard_next00001', fixture.orbitAgentId, 'human');
    const late = await claimLead(heartbeat, { topic: 'Lost slot' });
    expect(late.status).toBe(403);
    expect(late.body).toMatchObject({ code: 'HEARTBEAT_RUN_REQUIRED' });

    const rows = await fixture.harness.sql`select id from agent_leads`;
    expect(rows).toEqual([]);
});

test('a lead claim on a message an Agent holds as a task is refused with the holder', async () => {
    await fixture.harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${fixture.serverId}, ${fixture.channelId}, ${fixture.peerAgentId})
        on conflict do nothing
    `;
    const held = await send('Can someone reconcile the October payouts?', 'guard-held');
    const free = await send('Did the vendor ever answer about pricing?', 'guard-free');

    // A regular turn claims the task as before.
    const turn = await runner('run_guard_turn00001', fixture.orbitAgentId, 'human');
    const claimed = await call('POST', '/api/agent/tasks/claim', turn, {
        messageId: held,
        target: '#product',
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body).toMatchObject({ results: [{ outcome: 'claimed' }] });

    const heartbeat = await runner('run_guard_beat00001', fixture.peerAgentId, 'heartbeat');
    const refused = await claimLead(heartbeat, { messageId: held, topic: 'October payouts' });
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ code: 'LEAD_HELD_AS_TASK' });
    expect(refused.body.message).toContain('@orbit has this as a task');

    const granted = await claimLead(heartbeat, { messageId: free, topic: 'Vendor pricing' });
    expect(granted.status).toBe(200);
    expect(granted.body).toMatchObject({ claimed: true, lead: { anchorMessageId: free } });
});

test('a task claim from a heartbeat run is refused and points to haus lead claim', async () => {
    const message = await send('Who owns the Q4 launch checklist?', 'guard-task');
    for (const source of ['heartbeat', 'dream']) {
        const run = await runner(`run_guard_${source}_task1`, fixture.orbitAgentId, source);
        const refused = await call('POST', '/api/agent/tasks/claim', run, {
            messageId: message,
            target: '#product',
        });
        expect(refused.status).toBe(403);
        expect(refused.body).toMatchObject({ code: 'REGULAR_TURN_REQUIRED' });
        expect(refused.body.message).toContain('haus lead claim');
    }
    const tasks = await fixture.harness.sql`
        select message_id from message_tasks where message_id = ${message}
    `;
    expect(tasks).toEqual([]);
});

async function runner(runId: string, agentId: string, source: string) {
    await startRun(fixture, runId, agentId, source);
    return await fixture.mintRunner(runId, agentId, undefined, false);
}

async function send(content: string, nonce: string) {
    const sent = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content,
        nonce,
        serverId: fixture.serverId,
    });
    return sent.message.id;
}

async function claimLead(runner: { token: string }, body: { messageId?: string; topic: string }) {
    return await call('POST', '/api/agent/leads', runner, body);
}

async function call(method: 'POST', path: string, runner: { token: string }, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method,
    });
    return {
        body: (await response.json()) as Record<string, unknown> & { message?: string },
        status: response.status,
    };
}
