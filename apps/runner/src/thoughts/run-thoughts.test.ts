import { describe, expect, test } from 'bun:test';
import { type AgentThoughtFrame, runnerUpFrameSchema } from '@haus/api';
import { parseClaudeMessage } from '../claude/claude-messages.ts';
import { ClaudeNormalizer } from '../claude/claude-normalizer.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { createRunThoughts } from './run-thoughts.ts';
import { thoughtIntervalMs } from './thought-narrator.ts';

const knownSecret = 'grtr-run-credential-value';

function harness() {
    const frames: AgentThoughtFrame[] = [];
    let clock = Date.parse('2026-11-20T12:00:00.000Z');
    const timers = new Set<{ at: number; run: () => void }>();
    const thoughts = createRunThoughts({
        agentId: 'agt_1',
        knownSecrets: [knownSecret],
        now: () => clock,
        runId: 'run_1',
        schedule: (run, ms) => {
            const timer = { at: clock + ms, run };
            timers.add(timer);
            return () => timers.delete(timer);
        },
        send: (frame) => frames.push(frame),
    });
    const advance = () => {
        clock += thoughtIntervalMs;
        for (const timer of [...timers]) {
            if (timer.at <= clock) {
                timers.delete(timer);
                timer.run();
            }
        }
    };
    const feed = (...events: TurnEvent[]) => {
        for (const event of events) {
            thoughts.observe(event);
        }
        advance();
    };
    return { feed, frames, thoughts };
}

const call = (toolCallId: string, toolName: string, input: unknown) =>
    ({ input, toolCallId, toolName, type: 'tool-call' }) satisfies TurnEvent;

const result = (toolCallId: string, toolName: string, output: unknown) =>
    ({ output, toolCallId, toolName, type: 'tool-result' }) satisfies TurnEvent;

function claudeEvents(messages: unknown[]) {
    let next = 0;
    const claude = new ClaudeNormalizer({
        invocations: new Map(),
        newId: () => `block-${++next}`,
        now: () => 0,
    });
    return messages.flatMap((message) => claude.normalize(parseClaudeMessage(message)));
}

function streamEvent(event: Record<string, unknown>) {
    return { event, parent_tool_use_id: null, session_id: 'ses_1', type: 'stream_event' };
}

describe('run thoughts', () => {
    test('a Claude turn narrates its summarized thinking and its Haus bash action', () => {
        const run = harness();
        const toolUse = {
            id: 'toolu_1',
            input: { command: "curl -fsS 'https://api.open-meteo.com/v1/forecast?lat=41.8'" },
            name: 'mcp__haus__bash',
            type: 'tool_use',
        };
        const events = claudeEvents([
            streamEvent({
                content_block: { type: 'thinking' },
                index: 0,
                type: 'content_block_start',
            }),
            streamEvent({
                delta: {
                    thinking: 'I should pull the weekend forecast for Chicago before answering.',
                    type: 'thinking_delta',
                },
                index: 0,
                type: 'content_block_delta',
            }),
            streamEvent({ index: 0, type: 'content_block_stop' }),
            { message: { content: [toolUse] }, parent_tool_use_id: null, type: 'assistant' },
            {
                message: {
                    content: [
                        {
                            content: [{ text: 'Saturday: rain likely, high 58F.', type: 'text' }],
                            tool_use_id: 'toolu_1',
                            type: 'tool_result',
                        },
                    ],
                },
                parent_tool_use_id: null,
                type: 'user',
            },
        ]);
        run.feed(...events);
        expect(run.frames).toEqual([
            {
                agentId: 'agt_1',
                at: '2026-11-20T12:00:00.000Z',
                kind: 'reasoning',
                reasoning: 'I should pull the weekend forecast for Chicago before answering.',
                runId: 'run_1',
                type: 'agent-thought',
            },
            {
                action: 'curl -fsS api.open-meteo.com/v1/forecast',
                agentId: 'agt_1',
                at: '2026-11-20T12:00:04.000Z',
                kind: 'action',
                result: 'Saturday: rain likely, high 58F.',
                runId: 'run_1',
                type: 'agent-thought',
            },
        ]);
        for (const frame of run.frames) {
            expect(runnerUpFrameSchema.safeParse(frame).success).toBe(true);
        }
    });

    test('Claude web search and fetch describe the query and the page', () => {
        const run = harness();
        run.feed(call('w1', 'webSearch', { query: 'bun 1.4 release notes' }));
        run.feed(
            call('w2', 'WebFetch', { prompt: 'summarize', url: 'https://bun.sh/blog/bun-v1.4?x=1' })
        );
        expect(run.frames.map((frame) => frame.kind === 'action' && frame.action)).toEqual([
            'web search: bun 1.4 release notes',
            'browse bun.sh/blog/bun-v1.4',
        ]);
    });

    test('a Pi turn narrates a titled block, its shell, editor, and patch actions', () => {
        const run = harness();
        run.feed(
            { id: 'r1', type: 'reasoning-start' },
            { id: 'r1', text: '**Checking release notes**', type: 'reasoning-delta' },
            { id: 'r1', type: 'reasoning-end' }
        );
        run.feed(call('s1', 'shell', { command: 'gh release list --repo oven-sh/bun' }));
        run.feed(
            call('e1', 'str_replace_based_edit_tool', {
                command: 'view',
                path: '/Users/someone/launch/checklist.md',
            })
        );
        run.feed(
            call('p1', 'apply_patch', {
                input: '*** Begin Patch\n*** Update File: src/forecast.ts\n@@\n-a\n+b\n*** End Patch',
            })
        );
        expect(
            run.frames.map((frame) =>
                frame.kind === 'action' ? frame.action : frame.kind === 'phrase' && frame.text
            )
        ).toEqual([
            "I'm checking release notes",
            'gh release list --repo oven-sh/bun',
            'read checklist.md',
            'edit forecast.ts',
        ]);
    });

    test('Haus bookkeeping, failures, file output, and invalid calls never ride a thought', () => {
        const run = harness();
        run.feed(call('h1', 'bash', { command: 'haus message check' }));
        run.feed(result('h1', 'bash', 'You have 2 new messages from the launch channel.'));
        run.feed(call('c1', 'bash', { command: 'cat notes.txt' }));
        run.feed(result('c1', 'bash', 'Private launch notes that stay on the machine.'));
        run.feed(call('f1', 'bash', { command: 'curl https://wttr.in/Chicago' }));
        run.feed({ error: 'exit 7', toolCallId: 'f1', toolName: 'bash', type: 'tool-error' });
        run.feed({ ...call('i1', 'bash', { command: 'curl example.com' }), invalid: true });
        expect(run.frames.map((frame) => frame.kind === 'action' && frame)).toEqual([
            expect.objectContaining({ action: 'cat notes.txt' }),
            expect.objectContaining({ action: 'curl wttr.in/Chicago' }),
        ]);
        expect(run.frames.some((frame) => frame.kind === 'action' && frame.result)).toBe(false);
    });

    test('close drops a thought still waiting for the interval', () => {
        const run = harness();
        run.thoughts.observe(call('a1', 'bash', { command: 'curl api.weather.gov/alerts/active' }));
        run.thoughts.observe(call('a2', 'bash', { command: 'curl wttr.in/Chicago' }));
        run.thoughts.close();
        run.feed();
        expect(run.frames).toHaveLength(1);
    });

    test('a disclosed password or a known secret never reaches a frame', () => {
        const run = harness();
        const disclosure = 'The database password is hunter2 for staging access.';
        run.feed(
            { id: 'r1', type: 'reasoning-start' },
            { id: 'r1', text: disclosure, type: 'reasoning-delta' },
            { id: 'r1', type: 'reasoning-end' }
        );
        run.feed(
            { id: 'r2', type: 'reasoning-start' },
            { id: 'r2', text: '**Checking token: s3cr3t-staging**', type: 'reasoning-delta' },
            { id: 'r2', type: 'reasoning-end' }
        );
        run.feed(call('k1', 'bash', { command: `curl https://api.example.com/v1/${knownSecret}` }));
        run.feed(
            call('k2', 'bash', { command: 'curl -fsS https://api.example.com/v1/status' }),
            result('k2', 'bash', `status ok, deploy key is k3y-material, runner ${knownSecret}`)
        );
        const sent = JSON.stringify(run.frames);
        for (const secret of ['hunter2', 's3cr3t-staging', knownSecret, 'k3y-material']) {
            expect(sent).not.toContain(secret);
        }
        expect(sent).not.toContain(disclosure);
        expect(run.frames.map((frame) => frame.kind)).toEqual([
            'reasoning',
            'phrase',
            'action',
            'action',
            'action',
        ]);
        for (const frame of run.frames) {
            expect(runnerUpFrameSchema.safeParse(frame).success).toBe(true);
        }
    });
});
