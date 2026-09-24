import { describe, expect, test } from 'bun:test';
import {
    type AgentThought,
    agentThoughtsEnabled,
    createAgentThoughtNarrator,
    thoughtIntervalMs,
} from './thought-narrator.ts';
import type { ThoughtSummarizer } from './thought-summarizer.ts';

function harness(runtimeId: string, summarizer?: ThoughtSummarizer) {
    const thoughts: AgentThought[] = [];
    let clock = Date.parse('2026-09-24T12:00:00.000Z');
    const narrator = createAgentThoughtNarrator({
        emit: (thought) => thoughts.push(thought),
        now: () => clock,
        runtimeId,
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
        },
        block,
        narrator,
        thoughts,
    };
}

function fakeSummarizer(answer: (reasoning: string) => Promise<string | null>) {
    const seen: string[] = [];
    let warmed = 0;
    const summarizer: ThoughtSummarizer = {
        close: () => undefined,
        summarize: (reasoning) => {
            seen.push(reasoning);
            return answer(reasoning);
        },
        warm: () => {
            warmed += 1;
        },
    };
    return { seen, summarizer, warmed: () => warmed };
}

describe('Agent thought narrator', () => {
    test('uses a Codex title directly, even when the block is short', () => {
        const run = harness('codex');
        run.block('r1', '**Inspecting', ' chart data**');
        expect(run.thoughts).toEqual([
            { at: '2026-09-24T12:00:00.000Z', text: 'Inspecting chart data' },
        ]);
    });

    test('admits at most one thought per run each interval and drops the rest', () => {
        const run = harness('codex');
        run.block('r1', '**Planning memory read**');
        run.advance(thoughtIntervalMs - 1);
        run.block('r2', '**Checking task board**');
        run.advance(1);
        run.block('r3', '**Sending the reply**');
        expect(run.thoughts.map((thought) => thought.text)).toEqual([
            'Planning memory read',
            'Sending the reply',
        ]);
    });

    test('skips untitled blocks under the minimum length', () => {
        const run = harness('pi');
        run.block('r1', 'Let me check it.');
        expect(run.thoughts).toEqual([]);
    });

    test('condenses untitled reasoning locally without a summarizer', () => {
        const run = harness('pi');
        run.block('r1', 'Let me check the Halloween bids against last week', ' before replying.');
        expect(run.thoughts.map((thought) => thought.text)).toEqual([
            'Checking the Halloween bids against last week',
        ]);
    });

    test('asks the summarizer only for Claude Code reasoning, and only with the phrase leaving', async () => {
        const fake = fakeSummarizer(async () => 'Comparing Halloween bids to last week');
        const claude = harness('claude-code', fake.summarizer);
        claude.block('r1', 'The user wants the Halloween bids compared with last week.');
        await Bun.sleep(0);
        expect(claude.thoughts.map((thought) => thought.text)).toEqual([
            'Comparing Halloween bids to last week',
        ]);
        expect(fake.seen).toHaveLength(1);
        expect(fake.warmed()).toBe(1);

        const grok = harness('grok-build', fake.summarizer);
        grok.block('r1', 'Let me read the memory file to see the greeting preference.');
        expect(fake.seen).toHaveLength(1);
        expect(grok.thoughts.map((thought) => thought.text)).toEqual([
            'Reading the memory file to see',
        ]);
    });

    test('drops a failed or late summary, and anything after close', async () => {
        const fake = fakeSummarizer(async () => null);
        const run = harness('claude-code', fake.summarizer);
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
        const closing = harness('claude-code', slow.summarizer);
        closing.block('r1', 'Thinking through which campaign has the highest bid right now.');
        closing.narrator.close();
        release('Comparing campaign bids');
        await Bun.sleep(0);
        expect(closing.thoughts).toEqual([]);
    });

    test('is on only when HAUS_AGENT_THOUGHTS is exactly true', () => {
        expect(agentThoughtsEnabled({ HAUS_AGENT_THOUGHTS: 'true' })).toBe(true);
        expect(agentThoughtsEnabled({ HAUS_AGENT_THOUGHTS: 'false' })).toBe(false);
        expect(agentThoughtsEnabled({})).toBe(false);
    });
});
