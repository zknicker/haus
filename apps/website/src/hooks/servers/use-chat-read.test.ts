import { expect, test } from 'bun:test';
import { canMarkChatRead, createChatReadAttemptTracker } from './use-chat-read.ts';

test('chat reads require a foreground app and a visible sequence', () => {
    const input = {
        chatId: 'chat-1',
        enabled: true,
        foregrounded: true,
        sequence: 4,
        serverId: 'server-1',
    };

    expect(canMarkChatRead(input)).toBe(true);
    expect(canMarkChatRead({ ...input, foregrounded: false })).toBe(false);
    expect(canMarkChatRead({ ...input, sequence: undefined })).toBe(false);
    expect(canMarkChatRead({ ...input, enabled: false })).toBe(false);
});

test('a failed read marker can retry after the controlled failure recovers', () => {
    const tracker = createChatReadAttemptTracker();
    const target = {
        chatKey: 'server-1:chat-1',
        requestKey: 'server-1:chat-1:4',
        sequence: 4,
    };

    expect(tracker.canAttempt(target)).toBe(true);
    tracker.begin(target);
    expect(tracker.canAttempt(target)).toBe(false);

    // Simulate markRead rejecting while the transport is unavailable.
    tracker.fail(target);
    expect(tracker.canAttempt(target)).toBe(true);

    tracker.begin(target);
    tracker.succeed(target, 4);
    expect(tracker.canAttempt(target)).toBe(false);
    expect(
        tracker.canAttempt({
            ...target,
            requestKey: 'server-1:chat-1:5',
            sequence: 5,
        })
    ).toBe(true);
});
