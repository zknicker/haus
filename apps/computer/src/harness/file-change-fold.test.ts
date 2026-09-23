import { afterAll, expect, test } from 'bun:test';
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

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

// The parts a live Codex turn streamed for one apply_patch that created recheck.txt:
// codex-acp's edit call, then the harness's synthetic file change tagged with it.
const patchCall = {
    input: '{}',
    providerExecuted: true,
    toolCallId: 'call_patch',
    toolName: 'apply_patch',
    type: 'tool-call',
};
const patchResult = {
    output: {},
    providerExecuted: true,
    toolCallId: 'call_patch',
    toolName: 'apply_patch',
    type: 'tool-result',
};
function fileChange(id: string, path: string, event: string, sourceId?: string) {
    const payload = { event, path };
    const metadata = sourceId ? { providerMetadata: { acp: { toolCallId: sourceId } } } : {};
    const shared = {
        dynamic: true,
        input: payload,
        providerExecuted: true,
        toolCallId: id,
        toolName: 'fileChange',
        ...metadata,
    };
    return [
        { ...shared, type: 'tool-call' },
        { ...shared, output: payload, type: 'tool-result' },
    ];
}

async function project(parts: unknown[]) {
    const rootDir = await mkdtemp(join(tmpdir(), 'haus-file-change-fold-'));
    const events: string[] = [];
    const journal = await createComputerExecutionJournal({ agentRoot: rootDir, runId: 'run_fold' });
    const projector = createComputerActivityProjector({
        activity: new AgentActivityRun(runtime, ({ category, phase }) =>
            events.push(`${category}:${phase}`)
        ),
        journal,
        registry: createComputerActivityRegistry(),
        runtimeId: 'codex',
    });
    for (const part of parts) {
        await projector.observe(part);
    }
    await projector.finish('completed');
    const document = await readComputerExecutionJournal(rootDir, 'run_fold');
    await rm(rootDir, { force: true, recursive: true });
    const tools = document?.tools.map(({ input, nativeName, status, toolCallId, toolName }) => ({
        input,
        nativeName,
        status,
        toolCallId,
        toolName,
    }));
    return { events, tools };
}

test('one Codex patch is one editing step named by the file it created', async () => {
    const { events, tools } = await project([
        patchCall,
        ...fileChange('harness-file-change-1', 'recheck.txt', 'create', 'call_patch'),
        patchResult,
    ]);

    expect(events).toEqual(['editing_files:started', 'editing_files:completed']);
    expect(tools).toEqual([
        {
            input: { event: 'create', path: 'recheck.txt' },
            nativeName: 'apply_patch',
            status: 'completed',
            toolCallId: 'call_patch',
            toolName: 'fileChange',
        },
    ]);
});

test('a patch touching two files keeps one Activity and a step per file', async () => {
    const { events, tools } = await project([
        patchCall,
        ...fileChange('harness-file-change-1', 'a.txt', 'create', 'call_patch'),
        ...fileChange('harness-file-change-2', 'b.txt', 'modify', 'call_patch'),
        patchResult,
    ]);

    expect(events).toEqual(['editing_files:started', 'editing_files:completed']);
    expect(tools?.map(({ input, toolCallId }) => [toolCallId, input])).toEqual([
        ['call_patch', { event: 'create', path: 'a.txt' }],
        ['harness-file-change-2', { event: 'modify', path: 'b.txt' }],
    ]);
});

test('a source edit with its own input keeps its step and absorbs the file change', async () => {
    const editCall = { ...patchCall, input: { path: 'notes.txt' }, toolName: 'edit' };
    const { events, tools } = await project([
        editCall,
        ...fileChange('harness-file-change-1', 'notes.txt', 'modify', 'call_patch'),
        { ...patchResult, toolName: 'edit' },
    ]);

    expect(events).toEqual(['using_tool:started', 'using_tool:completed']);
    expect(tools?.map(({ input, toolCallId, toolName }) => [toolCallId, toolName, input])).toEqual([
        ['call_patch', 'edit', { path: 'notes.txt' }],
    ]);
});

test('a file change without a known source call is its own edit', async () => {
    const { events, tools } = await project([
        ...fileChange('harness-file-change-1', 'notes.txt', 'modify'),
        ...fileChange('harness-file-change-2', 'other.txt', 'modify', 'call_unseen'),
    ]);

    expect(events).toEqual([
        'editing_files:started',
        'editing_files:completed',
        'editing_files:started',
        'editing_files:completed',
    ]);
    expect(tools?.map(({ toolCallId, toolName }) => [toolCallId, toolName])).toEqual([
        ['harness-file-change-1', 'fileChange'],
        ['harness-file-change-2', 'fileChange'],
    ]);
});
