import { expect, test } from 'bun:test';
import { McpRequests } from './requests.ts';

test('cancellation arriving first prevents a later dispatch and is runner-scoped', () => {
    const requests = new McpRequests();
    requests.cancel('runner-a', 'request');
    const a = requests.begin('runner-a', 'request');
    const b = requests.begin('runner-b', 'request');
    expect(a.signal.aborted).toBe(true);
    expect(b.signal.aborted).toBe(false);
    expect(requests.cancelExisting('runner-c', 'request')).toBe(false);
    expect(b.signal.aborted).toBe(false);
    a.dispose();
    b.dispose();
    expect(requests.cancelExisting('runner-a', 'request')).toBe(false);
    requests.close();
});

test('duplicate active ids fail and shutdown cancels retained requests', () => {
    const requests = new McpRequests();
    const active = requests.begin('runner', 'request');
    expect(() => requests.begin('runner', 'request')).toThrow('reused');
    requests.close();
    expect(active.signal.aborted).toBe(true);
});
