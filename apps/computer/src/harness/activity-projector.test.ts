import { afterAll, afterEach, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import {
    createComputerActivityProjector,
    createComputerActivityRegistry,
} from './activity-projector.ts';
import {
    createComputerExecutionJournal,
    readComputerExecutionJournal,
} from './execution-journal.ts';
import { classifyHausProxyBoundary } from './haus-proxy-boundary.ts';

const roots: string[] = [];
const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
function activityRun(events: Array<{ category: string; phase: string; toolRef?: string }>) {
    return new AgentActivityRun(runtime, ({ category, phase, toolRef }) =>
        events.push({ category, phase, ...(toolRef ? { toolRef } : {}) })
    );
}
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});
test('projects explicit adapter tool fixtures without inspecting tool inputs', async () => {
    const cases = [
        {
            nativeName: 'exec_command',
            runtimeId: 'codex',
            toolName: 'bash',
            category: 'running_command',
        },
        {
            nativeName: 'Read',
            runtimeId: 'claude-code',
            toolName: 'read',
            category: 'reading_files',
        },
        {
            nativeName: 'Write',
            runtimeId: 'claude-code',
            toolName: 'write',
            category: 'editing_files',
        },
        { nativeName: 'edit', runtimeId: 'pi', toolName: 'edit', category: 'editing_files' },
        { runtimeId: 'pi', toolName: 'glob', category: 'reading_files' },
        { runtimeId: 'pi', toolName: 'ls', category: 'reading_files' },
        { runtimeId: 'grok-build', toolName: 'bash', category: 'running_command' },
        { runtimeId: 'grok-build', toolName: 'write', category: 'editing_files' },
        { runtimeId: 'grok-build', toolName: 'webSearch', category: 'searching_web' },
        {
            nativeName: 'web_search',
            runtimeId: 'codex',
            toolName: 'webSearch',
            category: 'searching_web',
        },
        { runtimeId: 'codex', toolName: 'apply_patch', category: 'editing_files' },
    ] as const;

    for (const fixture of cases) {
        const events: Array<{ category: string; phase: string }> = [];
        const projector = createComputerActivityProjector({
            activity: activityRun(events),
            registry: createComputerActivityRegistry(),
            runtimeId: fixture.runtimeId,
        });
        await projector.observe({
            input: JSON.stringify({ command: 'cat private.txt', query: 'private query' }),
            ...('nativeName' in fixture ? { nativeName: fixture.nativeName } : {}),
            toolCallId: `call_${fixture.runtimeId}`,
            toolName: fixture.toolName,
            type: 'tool-call',
        });
        await projector.observe({
            output: { text: 'private output' },
            toolCallId: `call_${fixture.runtimeId}`,
            toolName: fixture.toolName,
            type: 'tool-result',
        });
        expect(events).toEqual([
            { category: fixture.category, phase: 'started' },
            { category: fixture.category, phase: 'completed' },
        ]);
    }
});
test('keeps malicious MCP names and shell cat generic', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-projector-'));
    roots.push(root);
    const journal = await createComputerExecutionJournal({ agentRoot: root, runId: 'run_generic' });
    const events: Array<{ category: string; phase: string; toolRef?: string }> = [];
    const projector = createComputerActivityProjector({
        journal,
        activity: activityRun(events),
        registry: createComputerActivityRegistry(),
        runtimeId: 'codex',
    });

    for (const [toolCallId, toolName, nativeName, input] of [
        [
            'call_mcp',
            'mcp__evil__delete_everything',
            'mcp__evil__delete_everything',
            { query: 'search' },
        ],
        ['call_shell', 'bash', 'shell', { command: 'cat private.txt' }],
    ] as const) {
        await projector.observe({
            input: JSON.stringify(input),
            nativeName,
            toolCallId,
            toolName,
            type: 'tool-call',
        });
        await projector.observe({
            output: { text: 'private' },
            toolCallId,
            toolName,
            type: 'tool-result',
        });
    }
    await projector.observe({
        dynamic: true,
        input: JSON.stringify({ command: 'search' }),
        toolCallId: 'call_dynamic_bash',
        toolName: 'bash',
        type: 'tool-call',
    });
    await projector.observe({
        output: 'private',
        toolCallId: 'call_dynamic_bash',
        toolName: 'bash',
        type: 'tool-result',
    });

    expect(events).toEqual([
        { category: 'using_tool', phase: 'started' },
        { category: 'using_tool', phase: 'completed' },
        { category: 'running_command', phase: 'started' },
        { category: 'running_command', phase: 'completed' },
        { category: 'using_tool', phase: 'started' },
        { category: 'using_tool', phase: 'completed' },
    ]);
    expect(JSON.stringify(events)).not.toContain('private');
});
test('pairs preliminary, failure, interruption, and restart journal evidence by toolCallId', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-journal-'));
    roots.push(root);
    const journal = await createComputerExecutionJournal({
        agentRoot: root,
        now: (() => {
            let tick = 0;
            return () => new Date(`2026-08-11T00:00:0${tick++}.000Z`);
        })(),
        runId: 'run_journal',
    });
    const events: Array<{ category: string; phase: string }> = [];
    const projector = createComputerActivityProjector({
        journal,
        activity: activityRun(events),
        registry: createComputerActivityRegistry(),
        runtimeId: 'pi',
    });

    await projector.observe({
        input: { command: 'echo one' },
        nativeName: 'bash',
        toolCallId: 'call_preliminary',
        toolName: 'bash',
        type: 'tool-call',
    });
    await projector.observe({
        output: 'partial',
        preliminary: true,
        toolCallId: 'call_preliminary',
        toolName: 'bash',
        type: 'tool-result',
    });
    await projector.observe({
        isError: true,
        output: 'failed output',
        toolCallId: 'call_preliminary',
        toolName: 'bash',
        type: 'tool-result',
    });
    await journal.recordToolResult({
        isError: false,
        output: 'late preliminary output',
        preliminary: true,
        toolCallId: 'call_preliminary',
        toolName: 'bash',
    });
    await projector.observe({
        input: { command: 'echo two' },
        nativeName: 'bash',
        toolCallId: 'call_interrupted',
        toolName: 'bash',
        type: 'tool-call',
    });
    await projector.finish('interrupted');

    const reopened = await createComputerExecutionJournal({
        agentRoot: root,
        runId: 'run_journal',
    });
    await createComputerActivityProjector({
        journal: reopened,
        activity: activityRun(events),
        registry: createComputerActivityRegistry(),
        runtimeId: 'pi',
    }).observe({
        input: { command: 'echo two' },
        nativeName: 'bash',
        toolCallId: 'call_interrupted',
        toolName: 'bash',
        type: 'tool-call',
    });
    await createComputerActivityProjector({
        journal: reopened,
        activity: activityRun(events),
        registry: createComputerActivityRegistry(),
        runtimeId: 'pi',
    }).observe({
        output: 'restarted output',
        toolCallId: 'call_interrupted',
        toolName: 'bash',
        type: 'tool-result',
    });
    await reopened.finish('completed');

    const document = await readComputerExecutionJournal(root, 'run_journal');
    expect(document?.tools).toHaveLength(2);
    expect(document?.tools[0]).toMatchObject({
        final: { error: 'failed output' },
        preliminary: { output: 'partial' },
        status: 'failed',
        toolCallId: 'call_preliminary',
    });
    expect(document?.tools[1]).toMatchObject({
        final: { output: 'restarted output' },
        status: 'completed',
        toolCallId: 'call_interrupted',
    });
    expect(events).toContainEqual({ category: 'running_command', phase: 'failed' });
});
test('classifies structured Haus message and Browser proxy boundaries', () => {
    expect(classifyHausProxyBoundary('GET', '/api/agent/events')).toBe('checking_messages');
    expect(classifyHausProxyBoundary('GET', '/api/agent/history')).toBe('checking_messages');
    expect(classifyHausProxyBoundary('GET', '/api/agent/messages/search')).toBe(
        'checking_messages'
    );
    expect(classifyHausProxyBoundary('POST', '/api/agent/browser')).toBe('browsing');
    expect(classifyHausProxyBoundary('GET', '/api/agent/inbox')).toBeNull();
});
test('semantic activity frames have no raw tool fields and host categories are registration-owned', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-host-tool-'));
    roots.push(root);
    const journal = await createComputerExecutionJournal({ agentRoot: root, runId: 'run_host' });
    const registry = createComputerActivityRegistry();
    registry.registerHausHostTool({ category: 'browsing', name: 'browser', toolRef: 'browser' });
    const events: Array<{ category: string; phase: string; toolRef?: string }> = [];
    const projector = createComputerActivityProjector({
        journal,
        activity: activityRun(events),
        registry,
        runtimeId: 'codex',
    });
    await projector.observe({
        input: { command: 'do not leak this' },
        toolCallId: 'call_browser',
        toolName: 'browser',
        type: 'tool-call',
    });
    await projector.observe({
        output: 'do not leak this either',
        toolCallId: 'call_browser',
        toolName: 'browser',
        type: 'tool-result',
    });

    expect(events).toEqual([
        { category: 'browsing', phase: 'started', toolRef: 'browser' },
        { category: 'browsing', phase: 'completed', toolRef: 'browser' },
    ]);
    expect(Object.keys(events[0] ?? {})).toEqual(['category', 'phase', 'toolRef']);
    expect(JSON.stringify(events)).not.toContain('do not leak');
    const evidence = await readComputerExecutionJournal(root, 'run_host');
    expect(JSON.stringify(evidence)).toContain('do not leak this');
});
