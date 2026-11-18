import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { readCreationGuidance } from './agent-creation-guidance-fixture.ts';

const fixture = agentCreationFixture();

test('new creation refuses before avatar generation without full current-run guidance', async () => {
    const runner = await fixture.mintRunner('run_guidance_missing', undefined, undefined, false);
    const before = fixture.avatarRequests.length;
    const request = fixture.createBody({ avatarConcept: 'a lantern', nonce: 'guidance-hire' });
    const refused = await fixture.postCreate(runner, request);
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('AGENT_CREATION_GUIDANCE_REQUIRED');
    expect(fixture.avatarRequests).toHaveLength(before);

    await readCreationGuidance(fixture.harness.url, runner.token);
    const created = await fixture.postCreate(runner, request);
    expect(created.status).toBe(200);
    const [audits] = await fixture.harness.sql`
        select count(*)::int as count from manual_lookup_audit
        where agent_id=${fixture.orbitAgentId} and run_id=${runner.runId} and operation='get'
    `;
    expect(audits.count).toBe(3);
    const newRun = await fixture.mintRunner('run_guidance_retry', undefined, undefined, false);
    const replay = await fixture.postCreate(newRun, request);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent).toBe(true);
    expect(replay.body.agent?.agentId).toBe(created.body.agent?.agentId);
});

test('search, previous-run reads, and another Agent reads cannot substitute for full reads', async () => {
    await fixture.mintRunner('run_guidance_other_agent', fixture.peerAgentId);
    await fixture.mintRunner('run_guidance_previous');
    const runner = await fixture.mintRunner(
        'run_guidance_search_only',
        undefined,
        undefined,
        false
    );
    const query = new URLSearchParams({
        q: 'patrol',
        scope: 'recipes',
        intent: 'Find a relevant standing-watch archetype.',
        reason: 'The owner needs reliable read-only monitoring.',
    });
    const searched = await fetch(
        new URL(`/api/agent/manual/search?${query}`, fixture.harness.url),
        {
            headers: { authorization: `Bearer ${runner.token}` },
        }
    );
    expect(searched.status).toBe(200);
    expect(
        (await fixture.postCreate(runner, fixture.createBody({ nonce: 'search-not-read' }))).body
            .code
    ).toBe('AGENT_CREATION_GUIDANCE_REQUIRED');
});

test('full guidance still requires a nonempty standing brief', async () => {
    const runner = await fixture.mintRunner('run_guidance_no_brief');
    const result = await fixture.postCreate(
        runner,
        fixture.createBody({ brief: null, nonce: 'no-standing-brief' })
    );
    expect(result.status).toBe(400);
    expect(result.body.code).toBe('INVALID_ARG');
});

test('failed full-topic lookups never become creation-read receipts', async () => {
    const runner = await fixture.mintRunner('run_failed_manual', undefined, undefined, false);
    const query = new URLSearchParams({
        topic: 'recipes/archetype/nonexistent',
        intent: 'Create a teammate for a standing watch.',
        reason: 'Retrieve the full archetype before hiring.',
    });
    const response = await fetch(new URL(`/api/agent/manual/get?${query}`, fixture.harness.url), {
        headers: { authorization: `Bearer ${runner.token}` },
    });
    expect(response.status).toBe(404);
    const [row] = await fixture.harness
        .sql`select count(*)::int as count from manual_lookup_audit where run_id=${runner.runId} and operation='get' and resolved_topic_id is not null`;
    expect(row.count).toBe(0);
    expect(
        (await fixture.postCreate(runner, fixture.createBody({ nonce: 'failed-lookup-hire' }))).body
            .code
    ).toBe('AGENT_CREATION_GUIDANCE_REQUIRED');
});

test('legacy missing-brief nonce receipts replay but fresh old-client requests refuse clearly', async () => {
    const runner = await fixture.mintRunner('run_legacy_creation');
    const input = fixture.createBody({ nonce: 'legacy-no-brief-receipt' });
    const created = await fixture.postCreate(runner, input);
    expect(created.status).toBe(200);
    const legacy = { ...input, brief: null };
    // Golden d031 request encoding, independently of the current hashing function.
    const hash = createHash('sha256')
        .update(JSON.stringify(['#product', 'Scout', 'Watches the delivery lane.', null, null, []]))
        .digest('hex');
    await fixture.harness
        .sql`update agents set creation_request_hash=${hash} where id=${created.body.agent?.agentId}`;
    const freshRun = await fixture.mintRunner(
        'run_legacy_creation_replay',
        undefined,
        undefined,
        false
    );
    const replay = await fixture.postCreate(freshRun, legacy);
    expect(replay.status).toBe(200);
    expect(replay.body.idempotent).toBe(true);
    expect(replay.body.agent?.agentId).toBe(created.body.agent?.agentId);
    const refused = await fixture.postCreate(freshRun, {
        ...legacy,
        nonce: 'old-client-fresh-hire',
    });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('INVALID_ARG');
    expect(refused.body.message).toContain('--brief');
    expect(refused.body.nextAction).toContain('full agent, one-or-many');
});
