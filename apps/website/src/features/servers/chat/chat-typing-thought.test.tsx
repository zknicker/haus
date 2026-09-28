import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { chatFooterClearanceClassName } from '../../chats/chat-footer-surface.tsx';
import { ChatTypingStrip } from './chat-typing-indicator.tsx';
import {
    chatTypingThoughtDelay,
    chatTypingThoughtMaxVisibleMs,
    chatTypingThoughtSpacingMs,
    chatTypingThoughtTiming,
    normalizeChatTypingThoughtText,
    resolveChatTypingThought,
    resolveChatTypingThoughtArrival,
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

test('the bubble wobbles in, holds, and wobbles out on the specified beat', () => {
    expect(chatTypingThoughtTiming).toEqual({ enterMs: 620, exitMs: 260, holdMs: 2300 });
});

test('the strip overlays the thought under the faces without taking layout', () => {
    const thought = { agentId: 'agt_juniper', id: 1, runId: 'run_here', text: 'Reading the chart' };
    const markup = renderToStaticMarkup(<ChatTypingStrip thought={thought} typists={[juniper]} />);
    expect(markup).toContain('data-slot="chat-typing-thought"');
    expect(markup).toContain('Reading the chart');
    expect(markup).toContain('data-typist-avatar="agt_juniper"');
    expect(markup).toContain('pointer-events-none absolute inset-0 z-10');
    expect(markup).toContain('h-8');

    const idle = renderToStaticMarkup(<ChatTypingStrip thought={thought} typists={[]} />);
    expect(idle).not.toContain('Reading the chart');
});

test('bubbles start at least four seconds apart; an early thought waits its turn', () => {
    expect(chatTypingThoughtSpacingMs).toBe(4000);
    expect(chatTypingThoughtDelay(null, 10_000)).toBe(0);
    // The spot test's bubble 3.9s after the previous one now waits 100ms.
    expect(chatTypingThoughtDelay(10_000, 13_900)).toBe(100);
    expect(chatTypingThoughtDelay(10_000, 14_000)).toBe(0);
    expect(chatTypingThoughtDelay(10_000, 20_000)).toBe(0);
});

test('an engagement’s first thought shows at once, even right after another bubble', () => {
    expect(chatTypingThoughtDelay(10_000, 11_000, true)).toBe(0);
    expect(chatTypingThoughtDelay(10_000, 11_000, false)).toBe(3000);
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
    hideAt: 10_000 + chatTypingThoughtTiming.enterMs + chatTypingThoughtTiming.holdMs,
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
    ).toEqual({ hideAt: 11_500 + chatTypingThoughtTiming.holdMs, kind: 'extend' });
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

test('repeats keep one bubble up at most eight seconds from when it appeared', () => {
    expect(chatTypingThoughtMaxVisibleMs).toBe(8000);
    const cap = onScreen.shownAt + chatTypingThoughtMaxVisibleMs;
    // Late repeats extend only up to the cap...
    expect(
        resolveChatTypingThoughtArrival({ ...onScreen, hideAt: 16_000 }, building, 16_000)
    ).toEqual({ hideAt: cap, kind: 'extend' });
    // ...and once the cap is reached they add nothing and show nothing new.
    expect(resolveChatTypingThoughtArrival({ ...onScreen, hideAt: cap }, building, 17_000)).toEqual(
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
