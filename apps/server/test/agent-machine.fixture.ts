import { digest, type FrameClient, type InvocationHarness } from './agent-invocations.fixture.ts';
import type { RunnerClient, RunnerFrame } from './runner.fixture.ts';

export async function closeFlush(setup: InvocationHarness, credential: string, flushId: string) {
    const minted = await fetch(new URL('/computer/runner/mint', setup.harness.url), {
        body: JSON.stringify({
            agentId: setup.agentId,
            chatId: null,
            credentialHash: digest(credential),
            purpose: 'drive-sync',
            runId: flushId,
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
    });
    if (minted.status !== 200) {
        return minted.status;
    }
    const { runnerToken } = (await minted.json()) as { runnerToken: string };
    const closed = await fetch(new URL('/api/agent/drive/push/close', setup.harness.url), {
        body: JSON.stringify({ push_id: flushId }),
        headers: { authorization: `Bearer ${runnerToken}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return closed.status;
}

export async function seedScriptFire(
    setup: InvocationHarness,
    input: { dispatchedTo?: string; key: string }
) {
    const { agentId, harness, owner, serverId } = setup;
    const chatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
    await owner.trpc.chat.send.mutate({
        chatId,
        content: `Anchor ${input.key}`,
        nonce: `anchor_${input.key}`,
        serverId,
    });
    const [anchor] = (await harness.sql`
        select id from chat_messages where nonce = ${`anchor_${input.key}`}
    `) as { id: string }[];
    await harness.sql`
        insert into reminders (id, server_id, owner_agent_id, anchor_chat_id, anchor_message_id,
            created_at, fire_at, status, timezone, title, updated_at, script)
        values (${`rem_${input.key}`}, ${serverId}, ${agentId}, ${chatId}, ${anchor?.id},
            now(), now(), 'fired', 'UTC', 'Deploy check', now(), 'printf deployed')
    `;
    await harness.sql`
        insert into reminder_fires (id, server_id, reminder_id, fired_at, scheduled_for, has_script)
        values (${`fire_${input.key}`}, ${serverId}, ${`rem_${input.key}`}, now(), now(), true)
    `;
    await harness.sql`
        insert into reminder_agent_attention (id, server_id, agent_id, anchor_chat_id, fire_id,
            attention_kind, queued_at, reminder_id, script, dispatched_computer_id,
            dispatched_placement_generation)
        select ${`att_${input.key}`}, ${serverId}, ${agentId}, ${chatId}, ${`fire_${input.key}`},
            'reminder_script', now(), ${`rem_${input.key}`}, 'printf deployed',
            ${input.dispatchedTo ?? null},
            case when ${input.dispatchedTo ?? null}::text is null then null else placement_generation end
        from agents where id = ${agentId}
    `;
    return `att_${input.key}`;
}

export function nextAfter(
    client: FrameClient | RunnerClient,
    predicate: (frame: RunnerFrame) => boolean
) {
    const seen = client.frames.length;
    return client.next((frame) => client.frames.indexOf(frame) >= seen && predicate(frame));
}

export async function runnerBarrier(runner: RunnerClient, agentId: string, toolCallId: string) {
    runner.send({
        agentId,
        computer: 'no-such-computer',
        operation: { command: 'true', kind: 'bash' },
        runId: 'run_barrier',
        seq: 0,
        toolCallId,
        type: 'invocation-request',
    });
    await runner.next(
        (frame) => frame.type === 'invocation-result' && frame.toolCallId === toolCallId
    );
}

export function settledTurn(agentId: string, runId: string) {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId,
        endedAt: now,
        messageCount: 0,
        modelId: 'gpt-5.6-sol',
        outputProduced: false,
        runId,
        runtimeId: 'codex',
        startedAt: now,
        status: 'completed',
        summary: 'Read the notes.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
