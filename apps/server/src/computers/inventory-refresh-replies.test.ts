import { afterAll, expect, test } from 'bun:test';
import type { AgentCommand } from '@haus/api';
import { makeTestRuntime } from '@haus/effect';
import { InventoryRefreshReplies } from './inventory-refresh-replies.ts';

const runtime = makeTestRuntime();
afterAll(() => runtime.dispose());

test('coalesces refreshes and accepts only the requested Computer and request', async () => {
    const frames: AgentCommand[] = [];
    const replies = new InventoryRefreshReplies({
        runtime,
        send: (_, frame) => {
            frames.push(frame);
            return true;
        },
    });
    const pending = replies.request('cmp_one');
    expect(replies.request('cmp_one')).toBe(pending);
    expect(frames).toHaveLength(1);
    const request = frames[0];
    if (request?.type !== 'inventory-refresh-request') {
        throw new Error('Missing request');
    }
    const result = {
        requestId: request.requestId,
        runtimes: [],
        status: 'refreshed',
        type: 'inventory-refresh-result',
    } as const;
    expect(replies.accept('cmp_other', { ...result, runtimes: [] })).toBe(false);
    expect(replies.accept('cmp_one', { ...result, requestId: 'req_wrong', runtimes: [] })).toBe(
        false
    );
    expect(replies.accept('cmp_one', { ...result, runtimes: [] })).toBe(true);
    expect(replies.accept('cmp_one', { ...result, runtimes: [] })).toBe(false);
    await expect(pending).resolves.toEqual([]);
});

test('offline, disconnected, and older unresponsive Computers finish with actionable errors', async () => {
    const offline = new InventoryRefreshReplies({ runtime, send: () => false });
    await expect(offline.request('cmp_offline')).rejects.toThrow('offline');
    const connected = new InventoryRefreshReplies({ runtime, send: () => true });
    const pending = connected.request('cmp_disconnect');
    connected.disconnect('cmp_disconnect');
    await expect(pending).rejects.toThrow('offline');
    const old = new InventoryRefreshReplies({ runtime, send: () => true, timeoutMs: 0 });
    await expect(old.request('cmp_old')).rejects.toThrow('Update Haus Computer');
});
