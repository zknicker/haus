import { afterAll, expect, test } from 'bun:test';
import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createACP } from '@ai-sdk/harness-acp';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createHarnessActivityProjector } from './activity-projector.ts';
import { codexBuiltinTools } from './codex-acp.ts';
import {
    createComputerExecutionJournal,
    readComputerExecutionJournal,
} from './execution-journal.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

test('codex-acp tool calls get readable names, categories, and real durations', async () => {
    const rootDir = await realpath(await mkdtemp(join(tmpdir(), 'haus-codex-tools-')));
    const binDir = join(rootDir, 'bin');
    const homeDir = join(rootDir, 'home');
    await mkdir(binDir);
    await mkdir(homeDir);
    await mkdir(join(rootDir, 'workspace'));
    await writeFile(join(binDir, 'codex-acp'), fakeCodexAcp);
    await chmod(join(binDir, 'codex-acp'), 0o755);
    const agent = new HarnessAgent({
        harness: createACP({
            builtinTools: codexBuiltinTools,
            executable: 'codex-acp',
            harnessId: 'codex',
            isMcpToolCall: (toolCall) => toolCall._meta?.is_mcp_tool_call === true,
            modelMapping: { path: 'model', type: 'session-config-option' },
            source: { type: 'local' },
        }),
        permissionMode: 'allow-all',
        sandbox: createLocalTrustedSandboxProvider({
            env: { HOME: homeDir, PATH: `${binDir}:${process.env.PATH}` },
            homeDir,
            rootDir,
            runtime,
        }),
        sandboxConfig: { workDir: 'workspace' },
    });
    const events: Array<{ category: string; phase: string }> = [];
    const journal = await createComputerExecutionJournal({
        agentRoot: rootDir,
        runId: 'run_codex',
    });
    const projector = createHarnessActivityProjector({
        activity: new AgentActivityRun(runtime, ({ category, phase }) =>
            events.push({ category, phase })
        ),
        journal,
        runtimeId: 'codex',
        workspaceDir: join(rootDir, 'workspace'),
    });
    const session = await agent.createSession();
    try {
        const result = await agent.stream({
            abortSignal: AbortSignal.timeout(15_000),
            prompt: 'work',
            session,
        });
        for await (const part of result.fullStream) {
            await projector.observe(part);
        }
        await projector.finish('completed');
    } finally {
        await session.destroy();
    }
    const document = await readComputerExecutionJournal(rootDir, 'run_codex');
    const tools = document?.tools.map(({ durationMs, toolCallId, toolName }) => ({
        durationMs,
        toolCallId,
        toolName,
    }));

    expect(tools?.map(({ toolCallId, toolName }) => [toolCallId, toolName])).toEqual([
        ['exec-sleep', 'bash'],
        // A read Codex parsed out of a command is a read of its file, not an empty command.
        ['exec-read', 'read'],
        // The patch and the harness's file change for it are one step, named by the file.
        ['exec-patch', 'fileChange'],
        ['compact-1', 'compaction'],
        ['mcp-1', 'acp_tool_mcp-1'],
    ]);
    expect(document?.tools.find((tool) => tool.toolCallId === 'exec-read')).toMatchObject({
        input: { path: 'notes.txt' },
        nativeName: 'bash',
        output: { exit_code: 0, formatted_output: 'hi' },
    });
    // The harness shows workspace paths relative, and the bare workspace as a token.
    expect(document?.tools[0]?.input).toEqual({
        command: 'sleep 0.4 && echo "cwd is <workspace>."',
        cwd: '<workspace>',
    });
    expect(document?.tools.find((tool) => tool.toolCallId === 'exec-patch')).toMatchObject({
        input: { event: 'create', path: 'notes.txt' },
        nativeName: 'apply_patch',
        status: 'completed',
    });
    // The step spans the command, not the host-tool correlation window after it.
    expect(tools?.[0]?.durationMs).toBeGreaterThanOrEqual(350);
    expect(events).toEqual([
        { category: 'running_command', phase: 'started' },
        { category: 'running_command', phase: 'completed' },
        { category: 'reading_files', phase: 'started' },
        { category: 'reading_files', phase: 'completed' },
        { category: 'editing_files', phase: 'started' },
        { category: 'editing_files', phase: 'completed' },
        { category: 'using_tool', phase: 'started' },
        { category: 'using_tool', phase: 'completed' },
    ]);
    await rm(rootDir, { force: true, recursive: true });
}, 60_000);

// The update shapes codex-acp 1.12.0 sends for a command, a parsed file read,
// an apply_patch, a context compaction, and an MCP call.
const fakeCodexAcp = `#!/usr/bin/env node
const { createInterface } = require('node:readline');
const send = (message) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\\n');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function turn(sessionId) {
    const update = (value) => send({ method: 'session/update', params: { sessionId, update: value } });
    update({ sessionUpdate: 'tool_call', toolCallId: 'exec-sleep', status: 'in_progress',
        kind: 'execute', title: 'sleep 0.4', name: 'exec_command',
        rawInput: { command: 'sleep 0.4 && echo "cwd is ' + process.cwd() + '."', cwd: process.cwd() } });
    await sleep(400);
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'exec-sleep', name: 'exec_command',
        status: 'completed', rawOutput: { formatted_output: '', exit_code: 0 } });
    update({ sessionUpdate: 'tool_call', toolCallId: 'exec-read', status: 'in_progress',
        kind: 'read', title: "Read file 'notes.txt'", locations: [{ path: process.cwd() + '/notes.txt' }],
        name: 'exec_command' });
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'exec-read', name: 'exec_command',
        status: 'completed', rawOutput: { formatted_output: 'hi', exit_code: 0 } });
    update({ sessionUpdate: 'tool_call', toolCallId: 'exec-patch', title: 'Editing files',
        kind: 'edit', status: 'in_progress',
        content: [{ type: 'diff', oldText: null, newText: 'hi\\n', path: 'notes.txt' }] });
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'exec-patch', status: 'completed' });
    update({ sessionUpdate: 'tool_call', toolCallId: 'compact-1', kind: 'think',
        title: 'Compact conversation', status: 'in_progress' });
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'compact-1',
        title: 'Compact conversation', status: 'completed' });
    update({ sessionUpdate: 'tool_call', toolCallId: 'mcp-1', kind: 'execute',
        title: 'mcp.docs.lookup', status: 'in_progress',
        rawInput: { server: 'docs', tool: 'lookup', arguments: {} },
        _meta: { is_mcp_tool_call: true } });
    update({ sessionUpdate: 'tool_call_update', toolCallId: 'mcp-1', status: 'completed',
        rawOutput: { result: { content: [] }, error: null } });
}
createInterface({ input: process.stdin }).on('line', async (line) => {
    const message = JSON.parse(line);
    let result = {};
    if (message.method === 'initialize') {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
    } else if (message.method === 'session/new') {
        result = { sessionId: 'codex-thread' };
    } else if (message.method === 'session/prompt') {
        await turn(message.params.sessionId);
        result = { stopReason: 'end_turn' };
    }
    if (message.id !== undefined) send({ id: message.id, result });
});
`;
