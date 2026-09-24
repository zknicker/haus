import { describe, expect, test } from 'bun:test';
import {
    type AgentThought,
    agentThoughtsEnabled,
    createAgentThoughtNarrator,
    thoughtIntervalMs,
    thoughtSummarizerFromEnv,
} from './thought-narrator.ts';
import type { ThoughtSummarizer } from './thought-summarizer.ts';

function harness(summarizer?: ThoughtSummarizer) {
    const thoughts: AgentThought[] = [];
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
        summarizer,
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

function fakeSummarizer(answer: (reasoning: string) => Promise<string | null>) {
    const seen: string[] = [];
    const summarizer: ThoughtSummarizer = {
        summarize: (reasoning) => {
            seen.push(reasoning);
            return answer(reasoning);
        },
    };
    return { seen, summarizer };
}

describe('Agent thought narrator', () => {
    test('uses a Codex title directly, even when the block is short', () => {
        const run = harness();
        run.block('r1', '**Inspecting', ' chart data**');
        expect(run.thoughts).toEqual([
            { at: '2026-09-24T12:00:00.000Z', text: 'Inspecting chart data' },
        ]);
    });

    test('admits one thought per interval and holds only the newest block for the next', () => {
        const run = harness();
        run.block('r1', '**Planning memory read**');
        run.advance(1000);
        run.block('r2', '**Checking task board**');
        run.advance(1000);
        run.block('r3', '**Reading sales chart**');
        expect(run.thoughts.map((thought) => thought.text)).toEqual(['Planning memory read']);

        run.advance(thoughtIntervalMs - 2000);
        expect(run.thoughts.map((thought) => thought.text)).toEqual([
            'Planning memory read',
            'Reading sales chart',
        ]);
        expect(run.thoughts[1]?.at).toBe('2026-09-24T12:00:04.000Z');
    });

    test('releases a block at once when the interval has already passed', () => {
        const run = harness();
        run.block('r1', '**Planning memory read**');
        run.advance(thoughtIntervalMs);
        run.block('r2', '**Sending the reply**');
        expect(run.thoughts.map((thought) => thought.text)).toEqual([
            'Planning memory read',
            'Sending the reply',
        ]);
    });

    test('drops a waiting block on close', () => {
        const run = harness();
        run.block('r1', '**Planning memory read**');
        run.block('r2', '**Checking task board**');
        run.narrator.close();
        run.advance(thoughtIntervalMs);
        expect(run.thoughts.map((thought) => thought.text)).toEqual(['Planning memory read']);
    });

    test('skips untitled blocks under the minimum length', () => {
        const run = harness();
        run.block('r1', 'Let me check it.');
        expect(run.thoughts).toEqual([]);
    });

    test('condenses untitled reasoning locally without a summarizer', () => {
        const run = harness();
        run.block('r1', 'Let me check the Halloween bids against last week', ' before replying.');
        expect(run.thoughts.map((thought) => thought.text)).toEqual([
            'Checking the Halloween bids against last week',
        ]);
    });

    test('summarizes untitled reasoning from any harness, sending only the phrase on', async () => {
        const fake = fakeSummarizer(async () => 'Comparing Halloween bids to last week');
        const run = harness(fake.summarizer);
        run.block('r1', 'The user wants the Halloween bids compared with last week.');
        await Bun.sleep(0);
        expect(run.thoughts.map((thought) => thought.text)).toEqual([
            'Comparing Halloween bids to last week',
        ]);
        expect(fake.seen).toEqual(['The user wants the Halloween bids compared with last week.']);

        // Titles never reach the model.
        run.advance(thoughtIntervalMs);
        run.block('r2', '**Inspecting chart data**');
        expect(fake.seen).toHaveLength(1);
        expect(run.thoughts.at(-1)?.text).toBe('Inspecting chart data');
    });

    test('drops a failed or late summary, and anything after close', async () => {
        const fake = fakeSummarizer(async () => null);
        const run = harness(fake.summarizer);
        run.block('r1', 'Thinking through which campaign has the highest bid right now.');
        await Bun.sleep(0);
        expect(run.thoughts).toEqual([]);

        let release: (value: string) => void = () => undefined;
        const slow = fakeSummarizer(
            () =>
                new Promise((resolve) => {
                    release = resolve;
                })
        );
        const closing = harness(slow.summarizer);
        closing.block('r1', 'Thinking through which campaign has the highest bid right now.');
        closing.narrator.close();
        release('Comparing campaign bids');
        await Bun.sleep(0);
        expect(closing.thoughts).toEqual([]);
    });

    test('uses Gemini only when a key is configured', () => {
        expect(thoughtSummarizerFromEnv({ HAUS_GEMINI_API_KEY: 'key' })).not.toBeNull();
        expect(thoughtSummarizerFromEnv({ HAUS_GEMINI_API_KEY: '  ' })).toBeNull();
        expect(thoughtSummarizerFromEnv({})).toBeNull();
    });

    test('is on only when HAUS_AGENT_THOUGHTS is exactly true', () => {
        expect(agentThoughtsEnabled({ HAUS_AGENT_THOUGHTS: 'true' })).toBe(true);
        expect(agentThoughtsEnabled({ HAUS_AGENT_THOUGHTS: 'false' })).toBe(false);
        expect(agentThoughtsEnabled({})).toBe(false);
    });
});
