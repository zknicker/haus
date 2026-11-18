import { afterAll, expect, test } from 'bun:test';
import type { AgentCommand, BrowserResult } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { BrowserReplyOffice } from './browser-reply-office.ts';

const computerId = 'cmp_1234567890123456';
const otherComputerId = 'cmp_0000000000000000';
const runtime = makeTestRuntime();

afterAll(() => runtime.dispose());

test('accepts one reply from the Computer that received the Browser request', async () => {
    const frames: AgentCommand[] = [];
    const office = createOffice((_, frame) => {
        frames.push(frame);
        return true;
    });
    const pending = office.request(computerId, { kind: 'get' });
    const reply = browserSettings(requestId(frames));

    expect(office.accept(otherComputerId, reply)).toBe(false);
    await expect(isPending(pending)).resolves.toBe(true);
    expect(office.accept(computerId, reply)).toBe(true);
    expect(office.accept(computerId, reply)).toBe(false);
    await expect(pending).resolves.toEqual(reply.result);
});

test('times out, removes the pending reply, and rejects a late result', async () => {
    const frames: AgentCommand[] = [];
    const office = createOffice((_, frame) => {
        frames.push(frame);
        return true;
    }, 0);
    const pending = office.request(computerId, { kind: 'get' });
    const reply = browserSettings(requestId(frames));

    await expect(pending).rejects.toThrow('The Computer did not answer the Browser request.');
    expect(office.accept(computerId, reply)).toBe(false);
});

test('disconnect rejects only replies owned by the disconnected Computer', async () => {
    const frames: AgentCommand[] = [];
    const office = createOffice((_, frame) => {
        frames.push(frame);
        return true;
    });
    const disconnected = office.request(computerId, { kind: 'get' });
    const surviving = office.request(otherComputerId, { kind: 'get' });
    const survivingReply = browserSettings(requestId(frames));

    office.disconnect(computerId);

    await expect(disconnected).rejects.toThrow('The selected Computer went offline.');
    expect(office.accept(otherComputerId, survivingReply)).toBe(true);
    await expect(surviving).resolves.toEqual(survivingReply.result);
});

test('synchronous send failures reject and clean up the pending reply', async () => {
    let requestId = '';
    const office = createOffice((_, frame) => {
        if ('requestId' in frame) {
            requestId = frame.requestId;
        }
        throw new Error('socket closed');
    });

    await expect(office.request(computerId, { kind: 'get' })).rejects.toThrow('socket closed');
    expect(office.accept(computerId, browserSettings(requestId))).toBe(false);
});

test('offline send and Browser failure preserve their public errors', async () => {
    const offline = createOffice(() => false);
    await expect(offline.request(computerId, { kind: 'get' })).rejects.toThrow(
        'The selected Computer is offline.'
    );

    const frames: AgentCommand[] = [];
    const failed = createOffice((_, frame) => {
        frames.push(frame);
        return true;
    });
    const pending = failed.request(computerId, { kind: 'get' });
    expect(
        failed.accept(computerId, {
            error: 'Chrome unavailable',
            requestId: requestId(frames),
            type: 'browser-result',
        })
    ).toBe(true);
    await expect(pending).rejects.toThrow('Chrome unavailable');
});

function createOffice(
    send: (computerId: string, frame: AgentCommand) => boolean,
    timeoutMs?: number
): BrowserReplyOffice {
    return new BrowserReplyOffice({ runtime, send, timeoutMs });
}

function requestId(frames: AgentCommand[]): string {
    const frame = frames.at(-1);
    if (!(frame && 'requestId' in frame)) {
        throw new Error('Expected a request frame.');
    }
    return frame.requestId;
}

function browserSettings(
    requestId: string
): BrowserResult & { result: NonNullable<BrowserResult['result']> } {
    return {
        requestId,
        result: {
            kind: 'settings',
            value: {
                configured: false,
                enabled: false,
                connection: null,
                browsers: [],
                status: null,
                updatedAt: null,
            },
        },
        type: 'browser-result',
    };
}

async function isPending(promise: Promise<unknown>): Promise<boolean> {
    return await Promise.race([
        promise.then(
            () => false,
            () => false
        ),
        Bun.sleep(5).then(() => true),
    ]);
}
