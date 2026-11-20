import { describe, expect, test } from 'bun:test';
import {
    type AgentThoughtContent,
    agentThoughtResultMaxLength,
    agentThoughtResultSchema,
} from '@haus/api';
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

    test('sends an action at once when the interval is open, and shares the interval', () => {
        const run = harness();
        run.narrator.observeAction('curl api.open-meteo.com/v1/forecast');
        run.narrator.observeAction(null);
        run.block('r1', '**Reading sales chart**');
        expect(run.thoughts).toEqual([
            {
                action: 'curl api.open-meteo.com/v1/forecast',
                at: '2026-09-24T12:00:00.000Z',
                kind: 'action',
            },
        ]);
        run.advance(thoughtIntervalMs);
        expect(run.thoughts.map(text)).toEqual([
            'curl api.open-meteo.com/v1/forecast',
            "I'm reading sales chart",
        ]);
    });

    test('keeps a waiting title or excerpt over a newer action, and lets them replace actions', () => {
        const run = harness();
        run.block('r1', '**Planning weather fetch**');
        run.block('r2', '**Checking the forecast endpoint**');
        run.narrator.observeAction('curl api.weather.gov/gridpoints/OKX/forecast');
        run.advance(thoughtIntervalMs);
        run.narrator.observeAction('read MEMORY.md');
        run.narrator.observeAction('curl wttr.in/New');
        run.advance(thoughtIntervalMs);
        run.narrator.observeAction('edit notes.md');
        run.block(
            'r3',
            'Now I should compare the three days and pick the rainiest one for the tip.'
        );
        run.advance(thoughtIntervalMs);
        expect(run.thoughts.map(text)).toEqual([
            "I'm planning weather fetch",
            "I'm checking the forecast endpoint",
            'curl wttr.in/New',
            'Now I should compare the three days and pick the rainiest one for the tip.',
        ]);
    });

    test('a finished action with a result outranks a waiting title and a bare action', () => {
        const run = harness();
        run.block('r1', '**Planning weather fetch**');
        run.narrator.observeAction('curl api.open-meteo.com/v1/forecast', 'Saturday: rain likely');
        run.block('r2', '**Reviewing the forecast**');
        run.narrator.observeAction('curl wttr.in/Chicago');
        run.advance(thoughtIntervalMs);
        expect(run.thoughts.slice(1)).toEqual([
            {
                action: 'curl api.open-meteo.com/v1/forecast',
                at: '2026-09-24T12:00:04.000Z',
                kind: 'action',
                result: 'Saturday: rain likely',
            },
        ]);
    });

    test('results that finish together ride one frame, each halved', () => {
        const run = harness();
        run.narrator.observeAction('curl api.weather.gov/gridpoints/LOT/forecast');
        run.narrator.observeAction(
            'curl api.weather.gov/gridpoints/LOT/forecast',
            'Saturday: Mostly Sunny, 61'
        );
        run.narrator.observeAction('curl api.weather.gov/alerts/active', 'count: 0, alerts:');
        run.advance(thoughtIntervalMs);
        expect(run.thoughts.at(-1)).toEqual({
            action: 'curl api.weather.gov/gridpoints/LOT/forecast; curl api.weather.gov/alerts/active',
            at: '2026-09-24T12:00:04.000Z',
            kind: 'action',
            result: 'Saturday: Mostly Sunny, 61\ncount: 0, alerts:',
        });
    });

    test('merged full-length results still fit the result cap', () => {
        const run = harness();
        const full = 'x'.repeat(Math.floor(agentThoughtResultMaxLength / 2));
        run.narrator.observeAction('curl a.example.com');
        run.narrator.observeAction('curl a.example.com', full);
        run.narrator.observeAction('curl b.example.com', full);
        run.advance(thoughtIntervalMs);
        const merged = run.thoughts.at(-1);
        const result = merged?.kind === 'action' ? merged.result : undefined;
        expect(agentThoughtResultSchema.safeParse(result).success).toBe(true);
    });

    test('drops actions after close', () => {
        const run = harness();
        run.narrator.close();
        run.narrator.observeAction('curl example.com');
        expect(run.thoughts).toEqual([]);
    });
});

function text(thought: AgentThoughtContent) {
    if (thought.kind === 'action') {
        return thought.action;
    }
    return thought.kind === 'phrase' ? thought.text : thought.reasoning;
}
