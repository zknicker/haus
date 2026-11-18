import { expect, test } from 'bun:test';
import {
    chatTypingLaunchStaleMs,
    createChatTypingLaunchQueue,
    isStaleChatTypingLaunch,
} from './chat-typing-launch-queue.ts';

function testQueue() {
    const page = { hidden: false, now: 1000 };
    const timers: { at: number; run: () => void }[] = [];
    const queue = createChatTypingLaunchQueue({
        isHidden: () => page.hidden,
        measure: () => ({ x: 10, y: 10 }),
        now: () => page.now,
        schedule: (run, delayMs) => {
            const timer = { at: page.now + delayMs, run };
            timers.push(timer);
            return () => timers.splice(timers.indexOf(timer), 1);
        },
    });
    const advance = (ms: number) => {
        page.now += ms;
        for (const timer of timers.filter((item) => item.at <= page.now)) {
            timer.run();
        }
    };
    return { advance, page, queue, timers };
}

test('a face that arrives while the page is hidden is dropped, not queued', () => {
    const { advance, page, queue } = testQueue();
    page.hidden = true;
    queue.launch('🤔');
    advance(400);
    queue.launch('🧐');
    advance(400);
    queue.launch('😊');
    expect(queue.getSnapshot()).toEqual([]);
    // Back in view, nothing from the hidden stretch bursts out.
    page.hidden = false;
    advance(1000);
    expect(queue.getSnapshot()).toEqual([]);
    queue.launch('🤓');
    expect(queue.getSnapshot().map((item) => item.face)).toEqual(['🤓']);
});

test('hiding the page drops airborne and waiting faces and frees the cap', () => {
    const { advance, page, queue, timers } = testQueue();
    queue.launch('🤔');
    advance(50);
    // A reply face waits out the minimum gap on a timer.
    queue.launch('😊');
    expect(timers).toHaveLength(1);
    page.hidden = true;
    queue.drop();
    expect(queue.getSnapshot()).toEqual([]);
    expect(timers).toHaveLength(0);
    page.hidden = false;
    advance(1000);
    expect(queue.getSnapshot()).toEqual([]);
    for (const face of ['🤔', '🧐', '🤓', '🫣', '😤', '🫡'] as const) {
        queue.launch(face);
        advance(400);
    }
    expect(queue.getSnapshot()).toHaveLength(6);
});

test('faces admitted while animation frames stall are too late to play on return', () => {
    const { advance, queue } = testQueue();
    // A blurred, occluded window: faces are admitted but no frame runs, so none finish.
    for (const face of ['🤔', '🧐', '🤓'] as const) {
        queue.launch(face);
        advance(400);
    }
    advance(2000);
    const now = 1000 + 3 * 400 + 2000;
    const stale = queue.getSnapshot().filter((item) => isStaleChatTypingLaunch(item, now));
    expect(stale).toHaveLength(3);
    for (const item of stale) {
        queue.finish(item.id);
    }
    expect(queue.getSnapshot()).toEqual([]);
});

test('a face whose first frame comes promptly plays', () => {
    const { queue } = testQueue();
    queue.launch('🤔');
    const [item] = queue.getSnapshot();
    expect(item && isStaleChatTypingLaunch(item, item.admittedAt + 32)).toBe(false);
    expect(
        item && isStaleChatTypingLaunch(item, item.admittedAt + chatTypingLaunchStaleMs + 1)
    ).toBe(true);
});
