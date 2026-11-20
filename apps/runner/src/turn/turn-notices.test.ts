import { expect, test } from 'bun:test';
import { noticeCoordinator } from './turn-notices.ts';

test('a settled tool call hands its notice over without waiting for the harness to place it', async () => {
    const delivered: string[] = [];
    const placement = Promise.withResolvers<boolean>();
    const coordinator = noticeCoordinator((notice) => {
        delivered.push(notice);
        return placement.promise;
    });

    coordinator.toolCallStarted('call_1');
    const accepted = coordinator.enqueue('New message from Ada.');
    expect(delivered).toEqual([]);

    expect(coordinator.toolCallSettled('call_1')).toBeUndefined();
    expect(delivered).toEqual(['New message from Ada.']);

    placement.resolve(true);
    expect(await accepted).toBe(true);
});

test('a notice waits until every tool call in flight has settled', async () => {
    const delivered: string[] = [];
    const coordinator = noticeCoordinator((notice) => {
        delivered.push(notice);
        return Promise.resolve(false);
    });

    coordinator.toolCallStarted('call_1');
    coordinator.toolCallStarted('call_2');
    const accepted = coordinator.enqueue('Task assigned.');
    coordinator.toolCallSettled('call_1');
    expect(delivered).toEqual([]);

    coordinator.toolCallSettled('call_2');
    expect(delivered).toEqual(['Task assigned.']);
    expect(await accepted).toBe(false);
});
