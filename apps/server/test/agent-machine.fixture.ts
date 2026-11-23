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
