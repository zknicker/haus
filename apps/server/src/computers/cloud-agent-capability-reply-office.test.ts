import { afterAll, expect, test } from 'bun:test';
import type { AgentCommand, CloudAgentCapabilityResult } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { TestClock } from 'effect';
import { CloudAgentCapabilityReplyOffice } from './cloud-agent-capability-reply-office.ts';

const computerId = 'cmp_1234567890123456';
const otherComputerId = 'cmp_0000000000000000';
const runtime = makeTestRuntime();
const get = { operation: { kind: 'get' }, provider: 'cursor' } as const;

afterAll(() => runtime.dispose());

test('accepts one capability reply only from its requested Computer', async () => {
    const { office, frames } = createOffice();
    const pending = office.request(computerId, get);
    const reply = capability(requestId(frames));
    expect(office.accept(otherComputerId, reply)).toBe(false);
    expect(office.accept(computerId, reply)).toBe(true);
    expect(office.accept(computerId, reply)).toBe(false);
    await expect(pending).resolves.toEqual(reply.result);
});

test('reads and connect requests time out after ten seconds, without waiting for approval', async () => {
    const { office, frames } = createOffice();
    for (const kind of ['get', 'connect', 'cancel-sign-in'] as const) {
        const pending = office.request(computerId, { operation: { kind }, provider: 'cursor' });
        const reply = capability(requestId(frames));
        const failure = pending.catch((error: unknown) => error);
        await runtime.runPromise(TestClock.adjust(10_000));
        expect(await failure).toEqual(
            new Error('The Computer did not answer the Cloud Agent request.')
        );
        expect(office.accept(computerId, reply)).toBe(false);
    }
});

test('disconnect rejects only that Computer and removes its pending reply', async () => {
    const { office, frames } = createOffice();
    const disconnected = office.request(computerId, get);
    const disconnectedReply = capability(requestId(frames));
    const surviving = office.request(otherComputerId, get);
    const survivingReply = capability(requestId(frames));

    office.disconnect(computerId);
    await expect(disconnected).rejects.toThrow('The selected Computer went offline.');
    expect(office.accept(computerId, disconnectedReply)).toBe(false);
    expect(office.accept(otherComputerId, survivingReply)).toBe(true);
    await expect(surviving).resolves.toEqual(survivingReply.result);
});

test('synchronous send failure cleans up and preserves the original error', async () => {
    let sentRequestId = '';
    const failure = new Error('socket closed');
    const office = new CloudAgentCapabilityReplyOffice({
        runtime,
        send: (_, frame) => {
            if ('requestId' in frame) {
                sentRequestId = frame.requestId;
            }
            throw failure;
        },
    });
    await expect(office.request(computerId, get)).rejects.toBe(failure);
    expect(office.accept(computerId, capability(sentRequestId))).toBe(false);
});

test('offline and provider rejection preserve their public errors', async () => {
    const offline = new CloudAgentCapabilityReplyOffice({ runtime, send: () => false });
    await expect(offline.request(computerId, get)).rejects.toThrow(
        'The selected Computer is offline.'
    );
    const { office, frames } = createOffice();
    const pending = office.request(computerId, get);
    expect(
        office.accept(computerId, {
            error: 'Login was cancelled',
            requestId: requestId(frames),
            type: 'cloud-agent-capability-result',
        })
    ).toBe(true);
    await expect(pending).rejects.toThrow('Login was cancelled');
});

function createOffice() {
    const frames: AgentCommand[] = [];
    const office = new CloudAgentCapabilityReplyOffice({
        runtime,
        send: (_, frame) => {
            frames.push(frame);
            return true;
        },
    });
    return { frames, office };
}

function requestId(frames: AgentCommand[]): string {
    const frame = frames.at(-1);
    if (!(frame && 'requestId' in frame)) {
        throw new Error('Expected a request frame.');
    }
    return frame.requestId;
}

function capability(
    requestId: string
): CloudAgentCapabilityResult & { result: NonNullable<CloudAgentCapabilityResult['result']> } {
    return {
        requestId,
        result: {
            accountEmail: null,
            expiresAt: null,
            provider: 'cursor',
            ready: false,
            reason: 'not-connected',
        },
        type: 'cloud-agent-capability-result',
    };
}
