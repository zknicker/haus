import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentExecutionJournalSchema } from '@haus/api';
import type { ComputerAgentActivityUpdate } from '../agent-activity.ts';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createComputerActivityProjector } from './activity-projector.ts';
import { createComputerActivityRegistry } from './activity-registry.ts';
import { createComputerExecutionJournal } from './execution-journal.ts';
import { delegationOperationId } from './subagent-steps.ts';

const roots: string[] = [];
const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

// Trimmed from a live Claude Code 1.0.143 capture: the harness streams the
// parent `Agent` call as parts and everything about its sub-agent as raw messages.
const parent = 'toolu_01SHKppRQNKB4vvqqaiv26WK';
const task = 'a25887734782ba2ef';
const raw = (rawValue: Record<string, unknown>) => ({ rawValue, type: 'raw' });
const completedRun = [
    {
        input: '{"description":"Count lines a","subagent_type":"general-purpose","prompt":"Run: wc -l a.txt"}',
        nativeName: 'Agent',
        providerExecuted: true,
        toolCallId: parent,
        toolName: 'Agent',
        type: 'tool-call',
    },
    raw({
        description: 'Count lines a',
        is_backgrounded: false,
        prompt: 'Run: wc -l a.txt',
        spawn_depth: 1,
        subagent_type: 'general-purpose',
        subtype: 'task_started',
        task_id: task,
        task_type: 'local_agent',
        tool_use_id: parent,
        type: 'system',
    }),
    raw({ subtype: 'task_started', task_id: 'b1', task_type: 'local_bash', type: 'system' }),
    raw({
        description: 'Running Count lines in a.txt',
        last_tool_name: 'Bash',
        subtype: 'task_progress',
        task_id: task,
        tool_use_id: parent,
        type: 'system',
        usage: { duration_ms: 3428, tool_uses: 1, total_tokens: 23_180 },
    }),
    raw({
        message: {
            content: [
                {
                    id: 'toolu_01LFqdfwBacfmnJ3wBfhDCMA',
                    input: { command: 'wc -l a.txt', description: 'Count lines in a.txt' },
                    name: 'Bash',
                    type: 'tool_use',
                },
            ],
        },
        parent_tool_use_id: parent,
        type: 'assistant',
    }),
    raw({
        message: {
            content: [
                {
                    content: '       3 a.txt',
                    is_error: false,
                    tool_use_id: 'toolu_01LFqdfwBacfmnJ3wBfhDCMA',
                    type: 'tool_result',
                },
            ],
        },
        parent_tool_use_id: parent,
        type: 'user',
    }),
    raw({
        description: 'Reading a.txt',
        last_tool_name: 'Read',
        subtype: 'task_progress',
        task_id: task,
        tool_use_id: parent,
        type: 'system',
        usage: { duration_ms: 4128, tool_uses: 2, total_tokens: 23_245 },
    }),
    raw({
        patch: { end_time: 1_791_299_121_812, status: 'completed' },
        subtype: 'task_updated',
        task_id: task,
        type: 'system',
    }),
    raw({
        status: 'completed',
        subtype: 'task_notification',
        summary: 'a.txt contains 3 lines.',
        task_id: task,
        tool_use_id: parent,
        type: 'system',
        usage: { duration_ms: 8390, tool_uses: 3, total_tokens: 24_660 },
    }),
    {
        output: {
            agentType: 'general-purpose',
            content: [{ text: 'a.txt contains 3 lines.', type: 'text' }],
            status: 'completed',
            totalDurationMs: 8390,
            totalTokens: 24_660,
            totalToolUseCount: 3,
        },
        toolCallId: parent,
        toolName: 'Agent',
        type: 'tool-result',
    },
];

async function setup(runId: string) {
    const root = await mkdtemp(join(tmpdir(), 'haus-subagent-'));
    roots.push(root);
    const journal = await createComputerExecutionJournal({ agentRoot: root, runId });
    const events: ComputerAgentActivityUpdate[] = [];
    const actions: Array<string | null> = [];
    const activity = new AgentActivityRun(runtime, (update) => events.push(update));
    const projector = createComputerActivityProjector({
        activity,
        journal,
        registry: createComputerActivityRegistry(),
        runtimeId: 'claude-code',
        thoughts: { close() {}, observe() {}, observeAction: (action) => actions.push(action) },
    });
    return { actions, activity, events, journal, projector };
}

test('a sub-agent is one paired delegating operation with its calls nested in the journal', async () => {
    const { actions, activity, events, journal, projector } = await setup('run_delegate');
    for (const part of completedRun) {
        await projector.observe(part);
    }
    await projector.finish('completed');
    await journal.finish('completed');

    const operationId = delegationOperationId(parent);
    expect(operationId).toMatch(/^[0-9a-f]{32}$/u);
    expect(events.map(({ category, operationId: id, phase }) => ({ category, id, phase }))).toEqual(
        [
            { category: 'delegating', id: operationId, phase: 'started' },
            { category: 'delegating', id: operationId, phase: 'completed' },
        ]
    );
    // The delegation counts once as a sub-agent; its child calls never count.
    expect(activity.snapshot()).toEqual({
        operations: [{ category: 'delegating', completed: 1, failed: 0, interrupted: 0 }],
    });
    expect(actions).toEqual(['delegate to a sub-agent: Count lines a']);

    const document = agentExecutionJournalSchema.parse(journal.snapshot());
    expect(
        document.tools.map(({ parentToolCallId, status, toolName }) => ({
            parentToolCallId,
            status,
            toolName,
        }))
    ).toEqual([
        { parentToolCallId: undefined, status: 'completed', toolName: 'Agent' },
        { parentToolCallId: parent, status: 'completed', toolName: 'Bash' },
    ]);
    expect(document.tools[0]?.subagent).toEqual({
        endedAt: '2026-10-06T15:05:21.812Z',
        label: 'Count lines a',
        latestAction: 'Reading a.txt',
        startedAt: expect.any(String),
        status: 'completed',
        subagentType: 'general-purpose',
        usage: { durationMs: 8390, toolUses: 3, totalTokens: 24_660 },
    });
    expect(document.tools[1]?.output).toBe('       3 a.txt');
});

test('an interrupted turn settles a running sub-agent and its delegating operation', async () => {
    const { events, journal, projector } = await setup('run_interrupt');
    // Stop before the sub-agent's update, notification, and result.
    for (const part of completedRun.slice(0, 6)) {
        await projector.observe(part);
    }
    await projector.finish('interrupted');
    await journal.finish('interrupted');

    expect(events.map(({ category, phase }) => `${category}:${phase}`)).toEqual([
        'delegating:started',
        'delegating:interrupted',
    ]);
    const [delegating, child] = journal.snapshot().tools;
    expect(delegating?.status).toBe('interrupted');
    expect(delegating?.subagent?.status).toBe('interrupted');
    expect(delegating?.subagent?.endedAt).toEqual(expect.any(String));
    expect(child).toMatchObject({ parentToolCallId: parent, status: 'completed' });
});

test('a revived task runs again and a stray child call never opens activity', async () => {
    const { events, journal, projector } = await setup('run_revive');
    for (const part of completedRun.slice(0, 9)) {
        await projector.observe(part);
    }
    await projector.observe(completedRun[1]);
    expect(journal.snapshot().tools[0]?.subagent).toMatchObject({ status: 'running' });
    expect(journal.snapshot().tools[0]?.subagent?.endedAt).toBeUndefined();
    // Were the harness ever to translate a sub-agent's call, it stays journal-only.
    await projector.observe({
        input: { command: 'ls' },
        toolCallId: 'toolu_01LFqdfwBacfmnJ3wBfhDCMA',
        toolName: 'bash',
        type: 'tool-call',
    });
    expect(events.map(({ category }) => category)).toEqual(['delegating']);
});
