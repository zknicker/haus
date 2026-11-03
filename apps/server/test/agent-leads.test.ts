import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { startHeartbeatRun } from './heartbeat-run-fixture.ts';

const fixture = agentCreationFixture();

test('a second Agent is refused a message another Agent claimed, and told who holds it', async () => {
    await fixture.harness.sql`
        insert into channel_agent_participants (server_id, chat_id, agent_id)
        values (${fixture.serverId}, ${fixture.channelId}, ${fixture.peerAgentId})
        on conflict do nothing
    `;
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Has anyone looked at the vendor contract?',
        nonce: 'lead-anchor-1',
        serverId: fixture.serverId,
    });
    const orbit = await runner('run_lead_orbit00001', fixture.orbitAgentId);
    const peer = await runner('run_lead_peer000001', fixture.peerAgentId);

    const claimed = await call('POST', '/api/agent/leads', orbit, {
        messageId: anchor.message.id,
        topic: 'Vendor contract',
    });
    expect(claimed.status).toBe(200);
    expect(claimed.body).toMatchObject({
        claimed: true,
        lead: {
            agentHandle: 'orbit',
            anchorChatId: fixture.channelId,
            anchorMessageId: anchor.message.id,
            doneAt: null,
            topic: 'Vendor contract',
        },
    });
    const leadId = (claimed.body.lead as { id: string }).id;

    const conflict = await call('POST', '/api/agent/leads', peer, {
        messageId: anchor.message.id,
        topic: 'Contract again',
    });
    expect(conflict.body).toEqual({
        claimed: false,
        heldBy: { agentHandle: 'orbit', agentId: fixture.orbitAgentId },
        leadId,
    });

    // The holder asking again gets its own lead back, not a duplicate.
    const again = await call('POST', '/api/agent/leads', orbit, {
        messageId: anchor.message.id,
        topic: 'Vendor contract',
    });
    expect((again.body.lead as { id: string }).id).toBe(leadId);

    // A topic with no message is always free to claim.
    const free = await call('POST', '/api/agent/leads', peer, { topic: 'Pricing page copy' });
    expect(free.body).toMatchObject({ claimed: true, lead: { anchorMessageId: null } });

    const missing = await call('POST', '/api/agent/leads', peer, {
        messageId: 'msg_doesnotexist0001',
        topic: 'Ghost',
    });
    expect(missing.status).toBe(404);
});

test('leads list newest first within seven days and only the claimer can finish one', async () => {
    const orbit = await runner('run_lead_orbit00002', fixture.orbitAgentId);
    const peer = await runner('run_lead_peer000002', fixture.peerAgentId);
    const stale = await call('POST', '/api/agent/leads', orbit, { topic: 'Stale lead' });
    const staleId = (stale.body.lead as { id: string }).id;
    await fixture.harness.sql`
        update agent_leads set created_at = now() - interval '8 days' where id = ${staleId}
    `;

    const list = await call('GET', '/api/agent/leads', peer);
    const topics = (list.body.leads as { topic: string }[]).map((lead) => lead.topic);
    expect(topics[0]).toBe('Pricing page copy');
    expect(topics).toContain('Vendor contract');
    expect(topics).not.toContain('Stale lead');

    const lead = (list.body.leads as { id: string; topic: string }[]).find(
        (entry) => entry.topic === 'Vendor contract'
    );
    const foreign = await call('POST', `/api/agent/leads/${lead?.id}/done`, peer, {
        finding: 'Not mine to close.',
    });
    expect(foreign.status).toBe(403);
    expect(foreign.body).toMatchObject({ code: 'LEAD_NOT_OWNED' });

    const done = await call('POST', `/api/agent/leads/${lead?.id}/done`, orbit, {
        finding: 'Renewal is due in March; legal has the redline.',
    });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({
        lead: { finding: 'Renewal is due in March; legal has the redline.', id: lead?.id },
    });
    expect((done.body.lead as { doneAt: string | null }).doneAt).not.toBeNull();

    const unknown = await call('POST', '/api/agent/leads/led_nothinghere0001/done', orbit, {
        finding: 'x',
    });
    expect(unknown.status).toBe(404);
});

test('claiming sweeps leads older than fourteen days', async () => {
    const orbit = await runner('run_lead_orbit00003', fixture.orbitAgentId);
    const old = await call('POST', '/api/agent/leads', orbit, { topic: 'Ancient lead' });
    const oldId = (old.body.lead as { id: string }).id;
    await fixture.harness.sql`
        update agent_leads set created_at = now() - interval '15 days' where id = ${oldId}
    `;
    await call('POST', '/api/agent/leads', orbit, { topic: 'Fresh lead' });
    const rows = await fixture.harness.sql`select id from agent_leads where id = ${oldId}`;
    expect(rows).toEqual([]);
});

// Last: it retires the peer Agent.
test("a retired Agent's unfinished claim neither blocks a claim nor lists as open", async () => {
    const anchor = await fixture.owner.trpc.chat.send.mutate({
        chatId: fixture.channelId,
        content: 'Can the Memphis warehouse still ship today?',
        nonce: 'lead-anchor-retired',
        serverId: fixture.serverId,
    });
    const peer = await runner('run_lead_peer000004', fixture.peerAgentId);
    const held = await call('POST', '/api/agent/leads', peer, {
        messageId: anchor.message.id,
        topic: 'Memphis cutoff',
    });
    expect(held.body).toMatchObject({ claimed: true });
    await fixture.harness.sql`
        update agents set retired_at = now() where id = ${fixture.peerAgentId}
    `;

    const orbit = await runner('run_lead_orbit00004', fixture.orbitAgentId);
    const claimed = await call('POST', '/api/agent/leads', orbit, {
        messageId: anchor.message.id,
        topic: 'Memphis cutoff',
    });
    expect(claimed.body).toMatchObject({ claimed: true, lead: { agentHandle: 'orbit' } });
    const list = await call('GET', '/api/agent/leads', orbit);
    const holders = (list.body.leads as { agentId: string; topic: string }[])
        .filter((lead) => lead.topic === 'Memphis cutoff')
        .map((lead) => lead.agentId);
    expect(holders).toEqual([fixture.orbitAgentId]);
});

/** Leads are claimed only from an active heartbeat run, so each runner is one. */
async function runner(runId: string, agentId: string) {
    await startHeartbeatRun(fixture, runId, agentId);
    return await fixture.mintRunner(runId, agentId, undefined, false);
}

async function call(
    method: 'GET' | 'POST',
    path: string,
    runner: { token: string },
    body?: unknown
) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method,
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}
