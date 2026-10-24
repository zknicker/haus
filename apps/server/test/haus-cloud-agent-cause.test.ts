import { beforeAll, expect, test } from 'bun:test';
import { cloudAgentFixture } from './cloud-agent-fixture.ts';

/**
 * A fire answered by delegating: the `--say` post of `haus cloud-agent start`
 * carries the cause exactly as `haus message send` does (Forge, 2026-10-24: a
 * reminder answered with a cloud launch showed no reply line).
 * specs/automation-provenance.md
 */

const fixture = cloudAgentFixture();
let anchorMessageId: string;

beforeAll(async () => {
    anchorMessageId = (
        await fixture.owner.trpc.chat.send.mutate({
            chatId: fixture.channelId,
            content: 'Wire the dependency webhook to Orbit',
            nonce: 'cause_anchor',
            serverId: fixture.serverId,
        })
    ).message.id;
});

test('an explicit --cause is recorded on the launch Message', async () => {
    const fireId = await fireNewTrigger('explicit');
    const runner = await cleanRun('explicit');
    const started = await fixture.postStart(
        runner,
        fixture.startBody({ cause: fireId, nonce: 'cause_explicit' })
    );
    expect(started.body).toMatchObject({ state: 'started' });
    expect(await readCause(started.body.messageId ?? '')).toEqual({
        attribution: 'explicit',
        reminder_fire_id: null,
        trigger_fire_id: fireId,
    });
});

test('a launch that is the sole answer to a served fire infers its cause', async () => {
    const runner = await cleanRun('inferred');
    const fireId = await fireNewTrigger('inferred');
    await pullEvents(runner.token);
    const started = await fixture.postStart(runner, fixture.startBody({ nonce: 'cause_inferred' }));
    expect(started.body).toMatchObject({ state: 'started' });
    expect(await readCause(started.body.messageId ?? '')).toEqual({
        attribution: 'inferred',
        reminder_fire_id: null,
        trigger_fire_id: fireId,
    });
});

test('an unknown cause is refused and launches nothing', async () => {
    const runner = await cleanRun('unknown');
    const before = await workCount();
    const refused = await fixture.postStart(
        runner,
        fixture.startBody({ cause: 'rmf_does_not_exist', nonce: 'cause_unknown' })
    );
    expect(refused).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
    expect((refused.body as { message?: string }).message).toContain(
        'No Reminder fire rmf_does_not_exist'
    );
    expect(await workCount()).toBe(before);
});

/**
 * A drain run reads the target and takes every queued item, so the run that
 * launches is served only the fire (if any) that arrives after it.
 */
async function cleanRun(name: string) {
    const drain = await acceptedRun(`run_cause_${name}_drain`);
    await fixture.readTarget(drain, '#product');
    await pullEvents(drain.token);
    const runner = await acceptedRun(`run_cause_${name}`);
    await pullEvents(runner.token);
    // Visibility is per run, so the launching run reads the target too.
    await fixture.readTarget(runner, '#product');
    return runner;
}

/**
 * The Computer is offline in this harness, so the run a pull needs is accepted
 * here the way `beginActiveRun` plus an ack would accept it.
 */
async function acceptedRun(runId: string) {
    const runner = await fixture.mintRunner(runId);
    await fixture.harness.sql`
        insert into agent_delivery (
            agent_id, server_id, active_run_id, active_run_chat_id, active_run_computer_id,
            active_run_model_id, active_run_reasoning_effort, active_run_runtime_id,
            accepted_at, dispatched_at
        )
        values (
            ${fixture.orbitAgentId}, ${fixture.serverId}, ${runId}, ${fixture.channelId},
            ${fixture.computerId}, 'gpt-5.6-sol', 'medium', 'codex', now(), now()
        )
        on conflict (agent_id) do update set
            active_run_id = excluded.active_run_id,
            active_run_chat_id = excluded.active_run_chat_id,
            active_run_computer_id = excluded.active_run_computer_id,
            active_run_model_id = excluded.active_run_model_id,
            active_run_reasoning_effort = excluded.active_run_reasoning_effort,
            active_run_runtime_id = excluded.active_run_runtime_id,
            accepted_at = now(),
            dispatched_at = now()
    `;
    return runner;
}

async function fireNewTrigger(name: string) {
    const owner = await fixture.mintRunner(`run_cause_${name}_trigger`);
    const created = await fetch(new URL('/api/agent/triggers', fixture.harness.url), {
        body: JSON.stringify({ messageId: anchorMessageId, title: `Cause ${name}` }),
        headers: { authorization: `Bearer ${owner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const { secret, trigger } = (await created.json()) as {
        secret?: string;
        trigger?: { id?: string };
    };
    const fired = await fetch(new URL(`/api/triggers/${trigger?.id}`, fixture.harness.url), {
        body: '{}',
        headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    const { fireId } = (await fired.json()) as { fireId?: string };
    if (fired.status !== 202 || !fireId) {
        throw new Error(`Trigger fire failed: ${fired.status}`);
    }
    return fireId;
}

async function pullEvents(token: string) {
    const response = await fetch(new URL('/api/agent/events', fixture.harness.url), {
        headers: { authorization: `Bearer ${token}` },
    });
    expect(response.status).toBe(200);
}

async function readCause(messageId: string) {
    const [row] = (await fixture.harness.sql`
        select attribution, trigger_fire_id, reminder_fire_id
        from message_causes where message_id = ${messageId}
    `) as Record<string, string | null>[];
    return row ?? null;
}

async function workCount() {
    const [row] = (await fixture.harness.sql`
        select count(*)::int as count from cloud_agent_work where server_id = ${fixture.serverId}
    `) as { count: number }[];
    return row?.count ?? 0;
}
