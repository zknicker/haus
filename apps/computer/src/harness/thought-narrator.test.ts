import { describe, expect, test } from 'bun:test';
import type { AgentThoughtContent } from '@haus/api';
import { createAgentThoughtNarrator, thoughtIntervalMs } from './thought-narrator.ts';

function harness() {
    const thoughts: AgentThoughtContent[] = [];
    let clock = Date.parse('2026-09-24T12:00:00.000Z');
    const timers = new Set<{ at: number; run: () => void }>();
    const narrator = createAgentThoughtNarrator({
        emit: (thought) => thoughts.push(thought),
        now: () => clock,
        schedule: (run, ms) => {
            const timer = { at: clock + ms, run };
            timers.add(timer);
            return () => timers.delete(timer);
        },
    });
    const block = (id: string, ...deltas: string[]) => {
        narrator.observe({ id, type: 'reasoning-start' });
        for (const text of deltas) {
            narrator.observe({ id, text, type: 'reasoning-delta' });
        }
        narrator.observe({ id, type: 'reasoning-end' });
    };
    return {
        advance: (ms: number) => {
            clock += ms;
            for (const timer of [...timers]) {
                if (timer.at <= clock) {
                    timers.delete(timer);
                    timer.run();
                }
            }
        },
        block,
        narrator,
        thoughts,
    };
}

describe('Agent thought narrator', () => {
    test('uses a Codex title directly, even when the block is short', () => {
        const run = harness();
        run.block('r1', '**Inspecting', ' chart data**');
        expect(run.thoughts).toEqual([
            { at: '2026-09-24T12:00:00.000Z', kind: 'phrase', text: "I'm inspecting chart data" },
        ]);
    });

    test('admits one thought per interval and holds only the newest block for the next', () => {
        const run = harness();
        run.block('r1', '**Planning memory read**');
        run.advance(1000);
        run.block('r2', '**Checking task board**');
        run.advance(1000);
        run.block('r3', '**Reading sales chart**');
        expect(run.thoughts.map((thought) => text(thought))).toEqual(["I'm planning memory read"]);

        run.advance(thoughtIntervalMs - 2000);
        expect(run.thoughts.map((thought) => text(thought))).toEqual([
            "I'm planning memory read",
            "I'm reading sales chart",
        ]);
        expect(run.thoughts[1]?.at).toBe('2026-09-24T12:00:04.000Z');
    });

    test('releases a block at once when the interval has already passed', () => {
        const run = harness();
        run.block('r1', '**Planning memory read**');
        run.advance(thoughtIntervalMs);
        run.block('r2', '**Sending the reply**');
        expect(run.thoughts.map((thought) => text(thought))).toEqual([
            "I'm planning memory read",
            "I'm sending the reply",
        ]);
    });

    test('drops a waiting block on close', () => {
        const run = harness();
        run.block('r1', '**Planning memory read**');
        run.block('r2', '**Checking task board**');
        run.narrator.close();
        run.advance(thoughtIntervalMs);
        expect(run.thoughts.map((thought) => text(thought))).toEqual(["I'm planning memory read"]);
    });

    test('skips untitled blocks under the minimum length', () => {
        const run = harness();
        run.block('r1', 'Let me check it.');
        expect(run.thoughts).toEqual([]);
    });

    test('sends untitled reasoning as a scrubbed excerpt for the Server to summarize', () => {
        const run = harness();
        run.block(
            'r1',
            'Let me check the Halloween bids in ~/ads/bids.csv against last week',
            ' via https://ads.example.com before replying.'
        );
        expect(run.thoughts).toEqual([
            {
                at: '2026-09-24T12:00:00.000Z',
                kind: 'reasoning',
                reasoning:
                    'Let me check the Halloween bids in against last week via before replying.',
            },
        ]);
    });

    test('caps the excerpt and skips a block that is too short once scrubbed', () => {
        const run = harness();
        run.block('r1', `Comparing bids ${'x'.repeat(10)} https://example.com/a/very/long/path`);
        expect(run.thoughts).toEqual([]);

        run.block('r2', 'Weighing the campaign budgets. '.repeat(200));
        const [thought] = run.thoughts;
        expect(thought?.kind).toBe('reasoning');
        expect(thought?.kind === 'reasoning' && thought.reasoning.length).toBe(3000);
    });

    test('holds titles and excerpts in the same newest-wins slot', () => {
        const run = harness();
        run.block('r1', '**Planning memory read**');
        run.block('r2', 'Now I should compare this week against the previous week of sales.');
        run.block('r3', '**Checking task board**');
        run.advance(thoughtIntervalMs);
        expect(run.thoughts.map((thought) => thought.kind)).toEqual(['phrase', 'phrase']);
        expect(run.thoughts.map(text)).toEqual([
            "I'm planning memory read",
            "I'm checking task board",
        ]);
    });
});

function text(thought: AgentThoughtContent) {
    return thought.kind === 'phrase' ? thought.text : thought.reasoning;
}
