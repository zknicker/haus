import { expect, test } from 'bun:test';
import { createRunThoughts } from './run-thoughts.ts';

test('a runner turn narrates its reasoning title, a started command, and the command finding', () => {
    const frames: Record<string, unknown>[] = [];
    let now = 0;
    const thoughts = createRunThoughts({
        agentId: 'agt_1',
        link: { send: (frame) => frames.push({ ...frame }) },
        now: () => now,
        runId: 'run_1',
        schedule: () => () => undefined,
    });

    thoughts.observe({ id: 'r1', type: 'reasoning-start' });
    thoughts.observe({
        id: 'r1',
        text: '**Checking the deploy**\nLooking at the',
        type: 'reasoning-delta',
    });
    thoughts.observe({ id: 'r1', type: 'reasoning-end' });
    now = 5000;
    thoughts.observe({
        input: { command: 'git status' },
        toolCallId: 'toolu_1',
        toolName: 'bash',
        type: 'tool-call',
    });
    now = 10_000;
    thoughts.observe({
        output: 'On branch main\nnothing to commit, working tree clean',
        toolCallId: 'toolu_1',
        toolName: 'bash',
        type: 'tool-result',
    });
    thoughts.observe({
        input: { command: 'view', path: '/work/notes/plan.md' },
        toolCallId: 'toolu_2',
        toolName: 'str_replace_based_edit_tool',
        type: 'tool-call',
    });
    thoughts.close();

    expect(frames.map(({ at: _at, ...frame }) => frame)).toEqual([
        {
            agentId: 'agt_1',
            kind: 'phrase',
            runId: 'run_1',
            text: "I'm checking the deploy",
            type: 'agent-thought',
        },
        {
            action: 'git status',
            agentId: 'agt_1',
            kind: 'action',
            runId: 'run_1',
            type: 'agent-thought',
        },
        {
            action: 'git status',
            agentId: 'agt_1',
            kind: 'action',
            result: 'On branch main\nnothing to commit, working tree clean',
            runId: 'run_1',
            type: 'agent-thought',
        },
    ]);
});

test('a GPT shell call that reads a file or a secret never becomes a finding', () => {
    const frames: Record<string, unknown>[] = [];
    const thoughts = createRunThoughts({
        agentId: 'agt_1',
        link: { send: (frame) => frames.push({ ...frame }) },
        now: () => 0,
        runId: 'run_1',
        schedule: () => () => undefined,
    });
    const shell = (toolCallId: string, command: string[], output: string) => {
        thoughts.observe({ input: { command }, toolCallId, toolName: 'shell', type: 'tool-call' });
        thoughts.observe({ output, toolCallId, toolName: 'shell', type: 'tool-result' });
    };

    shell('call_1', ['cat', '/work/private.txt'], 'the private notes nobody should see');
    shell('call_2', ['bash', '-lc', 'printenv OPENAI_API_KEY'], 'sk-live-secret-value-123456');
    shell('call_3', ['bash', '-lc', 'haus message read --chat all'], 'a long message history');
    thoughts.close();

    expect(frames.map((frame) => frame.action)).toContain('cat private.txt');
    expect(frames.some((frame) => 'result' in frame)).toBe(false);
});
