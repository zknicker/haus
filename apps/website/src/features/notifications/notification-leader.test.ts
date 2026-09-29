import { expect, test } from 'bun:test';
import { claimNotificationLeadership, type LockManagerApi } from './notification-leader.ts';

/** An in-memory exclusive lock queue with the Web Locks request shape. */
function fakeLocks(): LockManagerApi {
    const queues = new Map<string, Array<() => void>>();
    const held = new Set<string>();
    const grantNext = (name: string) => {
        const next = queues.get(name)?.shift();
        if (next) {
            next();
        } else {
            held.delete(name);
        }
    };
    return {
        request: (name, { signal }, callback) =>
            new Promise((resolve, reject) => {
                const run = () => {
                    held.add(name);
                    callback().then(() => {
                        grantNext(name);
                        resolve(undefined);
                    });
                };
                if (!held.has(name)) {
                    run();
                    return;
                }
                const queue = queues.get(name) ?? [];
                queue.push(run);
                queues.set(name, queue);
                signal.addEventListener('abort', () => {
                    const index = queue.indexOf(run);
                    if (index >= 0) {
                        queue.splice(index, 1);
                        reject(new DOMException('Aborted', 'AbortError'));
                    }
                });
            }),
    };
}

test('one tab leads per Server and the next takes over when it leaves', async () => {
    const locks = fakeLocks();
    const first = claimNotificationLeadership('needs-you:srv_one', locks);
    const second = claimNotificationLeadership('needs-you:srv_one', locks);
    const otherServer = claimNotificationLeadership('needs-you:srv_two', locks);
    await Promise.resolve();

    expect(first.isLeader()).toBe(true);
    expect(second.isLeader()).toBe(false);
    expect(otherServer.isLeader()).toBe(true);

    first.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(first.isLeader()).toBe(false);
    expect(second.isLeader()).toBe(true);

    // A waiting tab that leaves never becomes leader.
    const third = claimNotificationLeadership('needs-you:srv_one', locks);
    third.release();
    second.release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(third.isLeader()).toBe(false);
});

test('without Web Locks every tab leads', () => {
    expect(claimNotificationLeadership('needs-you:srv_one', undefined).isLeader()).toBe(true);
});
