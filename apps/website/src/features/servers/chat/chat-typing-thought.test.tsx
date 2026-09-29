import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatFooterClearanceClassName } from '../../chats/chat-footer-surface.tsx';
import { ChatTypingStrip } from './chat-typing-indicator.tsx';
import {
    chatTypingThoughtDelay,
    chatTypingThoughtHoldMs,
    chatTypingThoughtMaxVisibleMs,
    chatTypingThoughtSpacingMs,
    chatTypingThoughtTiming,
    normalizeChatTypingThoughtText,
    resolveChatTypingThought,
    resolveChatTypingThoughtArrival,
    shownChatTypingThought,
    visibleChatTypingThought,
} from './chat-typing-thought.ts';

const engaged = [{ agentId: 'agt_juniper', runId: 'run_here' }];
const juniper = { agentId: 'agt_juniper', avatarUrl: null, displayName: 'Juniper' };

test('a thought shows only for the run engaging this Chat', () => {
    expect(
        resolveChatTypingThought(
            engaged,
            { agentId: 'agt_juniper', runId: 'run_here', text: 'Checking Halloween bids' },
            1
        )
    ).toEqual({
        agentId: 'agt_juniper',
        id: 1,
        runId: 'run_here',
        text: 'Checking Halloween bids',
    });
    // The same Agent thinking in a run engaged elsewhere, or another Agent, stays quiet here.
    expect(
        resolveChatTypingThought(
            engaged,
            { agentId: 'agt_juniper', runId: 'run_elsewhere', text: 'x' },
            2
        )
    ).toBeNull();
    expect(
        resolveChatTypingThought(engaged, { agentId: 'agt_cove', runId: 'run_here', text: 'x' }, 3)
    ).toBeNull();
});

test('a shown thought hides as soon as its engagement ends', () => {
    const thought = { agentId: 'agt_juniper', id: 1, runId: 'run_here', text: 'Reading the chart' };
    expect(visibleChatTypingThought(engaged, thought)).toBe(thought);
    expect(visibleChatTypingThought([], thought)).toBeNull();
    expect(visibleChatTypingThought(engaged, null)).toBeNull();
});

test('the bubble wobbles in, holds long enough to read, and wobbles out', () => {
    expect(chatTypingThoughtTiming).toEqual({ enterMs: 620, exitMs: 260 });
    // About six seconds for a typical eight-word line, scaled by length within bounds.
    expect(chatTypingThoughtHoldMs('Still digging through the Bun changelog for breakage')).toBe(
        6300
    );
    expect(chatTypingThoughtHoldMs('Checking the forecast')).toBe(5000);
    expect(
        chatTypingThoughtHoldMs('one two three four five six seven eight nine ten eleven twelve')
    ).toBe(7500);
});

test('the strip overlays the thought under the faces without taking layout', () => {
    const thought = { agentId: 'agt_juniper', id: 1, runId: 'run_here', text: 'Reading the chart' };
    const markup = renderToStaticMarkup(
        <ChatTypingStrip thoughts={{ latest: thought, live: thought }} typists={[juniper]} />
    );
    expect(markup).toContain('data-slot="chat-typing-thought"');
    expect(markup).toContain('Reading the chart');
    expect(markup).toContain('data-typist-avatar="agt_juniper"');
    expect(markup).toContain('pointer-events-none absolute inset-0 z-10');
    expect(markup).toContain('h-8');

    const idle = renderToStaticMarkup(
        <ChatTypingStrip thoughts={{ latest: thought, live: thought }} typists={[]} />
    );
    expect(idle).not.toContain('Reading the chart');
});

test('bubbles start at least a shortest hold apart, under the Server floor; an early one waits', () => {
    expect(chatTypingThoughtSpacingMs).toBe(5000);
    expect(chatTypingThoughtDelay(null, 10_000)).toBe(0);
    expect(chatTypingThoughtDelay(10_000, 14_900)).toBe(100);
    expect(chatTypingThoughtDelay(10_000, 15_000)).toBe(0);
    // The Server spaces a request's bubbles ten seconds apart, which never waits here.
    expect(chatTypingThoughtDelay(10_000, 20_000)).toBe(0);
});

test('an engagement’s first thought shows at once, even right after another bubble', () => {
    expect(chatTypingThoughtDelay(10_000, 11_000, true)).toBe(0);
    expect(chatTypingThoughtDelay(10_000, 11_000, false)).toBe(4000);
});

test('the transcript end clears a two-line bubble above the strip', () => {
    expect(chatFooterClearanceClassName).toContain('+4rem)');
});

const building = {
    agentId: 'agt_juniper',
    id: 1,
    runId: 'run_here',
    text: 'Checking the build status',
};
// Shown at 10s; its first hold ends after the wobble-in and hold.
const onScreen = {
    hideAt: 10_000 + chatTypingThoughtTiming.enterMs + chatTypingThoughtHoldMs(building.text),
    shownAt: 10_000,
    thought: building,
};

test('the same line while its bubble is up extends the hold instead of a new bubble', () => {
    // The replayed turn's "Checking the build status" came back 1.5s later, reworded only in case.
    expect(
        resolveChatTypingThoughtArrival(
            onScreen,
            { ...building, text: 'checking the build status.' },
            11_500
        )
    ).toEqual({ hideAt: 11_500 + chatTypingThoughtHoldMs(building.text), kind: 'extend' });
});

test('the same line after its bubble has left shows as a new bubble', () => {
    expect(resolveChatTypingThoughtArrival(null, building, 20_000)).toEqual({ kind: 'show' });
});

test('a different line, or the same line from another run, replaces the bubble as usual', () => {
    expect(
        resolveChatTypingThoughtArrival(
            onScreen,
            { ...building, text: 'Reading the CI log' },
            11_000
        )
    ).toEqual({ kind: 'show' });
    expect(
        resolveChatTypingThoughtArrival(onScreen, { ...building, runId: 'run_next' }, 11_000)
    ).toEqual({ kind: 'show' });
    expect(
        resolveChatTypingThoughtArrival(onScreen, { ...building, agentId: 'agt_cove' }, 11_000)
    ).toEqual({ kind: 'show' });
});

test('repeats keep one bubble up at most twelve seconds from when it appeared', () => {
    expect(chatTypingThoughtMaxVisibleMs).toBe(12_000);
    const cap = onScreen.shownAt + chatTypingThoughtMaxVisibleMs;
    // Late repeats extend only up to the cap...
    expect(
        resolveChatTypingThoughtArrival({ ...onScreen, hideAt: 20_000 }, building, 20_000)
    ).toEqual({ hideAt: cap, kind: 'extend' });
    // ...and once the cap is reached they add nothing and show nothing new.
    expect(resolveChatTypingThoughtArrival({ ...onScreen, hideAt: cap }, building, 21_000)).toEqual(
        {
            kind: 'absorb',
        }
    );
});

test('compares lines by their words, ignoring case, punctuation, and spacing', () => {
    expect(normalizeChatTypingThoughtText("  I'm checking the  Build status. ")).toBe(
        'im checking the build status'
    );
    expect(normalizeChatTypingThoughtText('OK, checking the build status')).not.toBe(
        normalizeChatTypingThoughtText('Checking the build status')
    );
});

const earlier = { agentId: 'agt_juniper', id: 1, runId: 'run_here', text: 'Reading the chart' };
const newer = { agentId: 'agt_juniper', id: 2, runId: 'run_here', text: 'Comparing weekends' };

test('hovering recalls the latest thought after its bubble has left', () => {
    const after = { latest: earlier, live: null };
    expect(shownChatTypingThought(after, false)).toBeNull();
    expect(shownChatTypingThought(after, true)).toBe(earlier);
});

test('hovering a live bubble holds that same bubble; a newer thought replaces it', () => {
    // Same thought, same key: the hover keeps it up without a second wobble.
    expect(shownChatTypingThought({ latest: earlier, live: earlier }, true)).toBe(earlier);
    expect(shownChatTypingThought({ latest: newer, live: newer }, true)).toBe(newer);
    // Once the newer bubble's hold ends, the hover keeps showing the newer text.
    expect(shownChatTypingThought({ latest: newer, live: null }, true)).toBe(newer);
});

test('hovering before any thought this engagement shows nothing', () => {
    expect(shownChatTypingThought({ latest: null, live: null }, true)).toBeNull();
});

test('the recalled thought belongs to its engagement and clears when the run ends', () => {
    // The hook keeps `latest` only while `visibleChatTypingThought` still admits it.
    expect(visibleChatTypingThought([], earlier)).toBeNull();
    expect(
        visibleChatTypingThought([{ agentId: 'agt_juniper', runId: 'run_next' }], earlier)
    ).toBeNull();
});

test('only the faces and dots take the pointer, and hover adds no tab stop', () => {
    const markup = renderToStaticMarkup(
        <ChatTypingStrip thoughts={{ latest: earlier, live: null }} typists={[juniper]} />
    );
    expect(markup).toMatch(/class="pointer-events-none relative flex h-8/);
    expect(markup).toMatch(/class="pointer-events-auto [^"]*" data-slot="chat-typing-recall"/);
    expect(markup).not.toContain('tabindex');
    // Not hovered: the retained thought stays hidden.
    expect(markup).not.toContain('data-slot="chat-typing-thought"');
});
