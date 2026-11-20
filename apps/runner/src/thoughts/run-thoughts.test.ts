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
