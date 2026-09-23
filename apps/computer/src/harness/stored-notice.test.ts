import { expect, test } from 'bun:test';
import { createNoticeCoordinator } from './stored-notice.ts';

test('a notice waits until every in-flight tool call has resolved', async () => {
    const delivered: string[] = [];
    const coordinator = createNoticeCoordinator((notice) => {
        delivered.push(notice);
        return Promise.resolve(true);
    });
    coordinator.toolCallStarted({ toolCallId: 'call_a' });
    coordinator.toolCallStarted({ toolCallId: 'call_b' });
    const accepted = coordinator.enqueue('[Haus inbox notice]');

    await coordinator.toolCallSettled({ toolCallId: 'call_a' });
    await coordinator.toolCallSettled({ preliminary: true, toolCallId: 'call_b' });
    expect(delivered).toEqual([]);

    await coordinator.toolCallSettled({ toolCallId: 'call_b' });
    expect(delivered).toEqual(['[Haus inbox notice]']);
    expect(await accepted).toBe(true);
});

test('a notice still pending when the turn ends is declined for the next turn', async () => {
    const coordinator = createNoticeCoordinator(() => Promise.resolve(true));
    coordinator.toolCallStarted({ toolCallId: 'call_a' });
    const accepted = coordinator.enqueue('[Haus inbox notice]');

    coordinator.close();

    expect(await accepted).toBe(false);
});
