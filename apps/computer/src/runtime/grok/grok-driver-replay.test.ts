import { afterAll, expect, test } from 'bun:test';
import { makeDaemonRuntime } from '../../daemon-runtime.ts';
import type { ToolCallTurnEvent } from '../turn-event.ts';
import { collect, replayDriver, significant, text } from './fixtures/replay-driver.ts';
import { warmSessionCount } from './grok-warm-pool.ts';

// Each test replays a fixture captured from the installed `grok` (fixtures/capture.ts) through
// the production driver: process, ACP client, handshake, turn, and normalizer.
const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());
const signal = () => new AbortController().signal;

test('text turn: handshake, model selection, one reply, and the turn settles at the prompt response', async () => {
    const replay = await replayDriver('text', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        const events = await collect(
            await session.startTurn({ prompt: 'Reply with exactly PONG.', signal: signal() })
        );

        expect(session.isResume).toBe(false);
        expect(text(events)).toBe('PONG');
        expect(significant(events).map((event) => event.type)).toEqual([
            'step-finish',
            'turn-finish',
        ]);
        expect(events.at(-1)).toMatchObject({
            type: 'turn-finish',
            usage: { inputTokens: 10_895, outputTokens: 36, totalTokens: 10_931 },
        });
        const [launch, ...messages] = await replay.messages();
        expect(launch).toMatchObject({
            argv: [
                'agent',
                '--no-leader',
                '--always-approve',
                '--reasoning-effort',
                'low',
                'stdio',
            ],
            env: { GROK_HOME: `${replay.homeDir}/.grok`, HOME: replay.homeDir },
        });
        expect(messages.map((message) => message.method)).toEqual([
            'initialize',
            'authenticate',
            'session/new',
            'session/set_model',
            'session/prompt',
        ]);
        expect(messages[1]).toMatchObject({ params: { methodId: 'xai.api_key' } });
        expect(messages[2]).toMatchObject({
            params: {
                _meta: { yoloMode: true },
                cwd: replay.workspaceDir,
                mcpServers: [{ name: 'haus', type: 'http', headers: [{ name: 'Authorization' }] }],
            },
        });
        expect(messages[3]).toMatchObject({ params: { modelId: 'grok-4.6' } });

        // Detach parks the process warm; the next open of that state claims it without a launch.
        const parked = await session.detach();
        expect(parked).toEqual({ runtime: 'grok-build', sessionId: session.sessionId, version: 1 });
        expect(warmSessionCount()).toBe(1);
        const warm = await replay.driver.openSession({ resumeFrom: parked, sessionId: 'agt-1' });
        expect(warm.isResume).toBe(true);
        expect(warmSessionCount()).toBe(0);
        expect((await replay.messages()).filter((message) => 'argv' in message)).toHaveLength(1);
        await warm.stop();
    } finally {
        await replay.cleanup();
    }
});

test('shell turn: Grok run_terminal_command is a bash builtin; a non-zero exit is not a tool error', async () => {
    const replay = await replayDriver('shell', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        const events = significant(
            await collect(await session.startTurn({ prompt: 'shell', signal: signal() }))
        );
        const call = events.find((event) => event.type === 'tool-call');
        const result = events.find((event) => event.type === 'tool-result');

        expect(call).toMatchObject({
            input: { command: 'echo hello-from-shell && exit 3' },
            nativeName: 'run_terminal_command',
            providerExecuted: true,
            toolName: 'bash',
        });
        expect(result).toMatchObject({ output: { exit_code: 3 }, toolName: 'bash' });
        expect(result).not.toHaveProperty('isError');
        expect(events.filter((event) => event.type === 'step-finish')).toHaveLength(2);
        await session.stop();
    } finally {
        await replay.cleanup();
    }
});

test('edit turn: each edit folds a workspace-relative fileChange into its source call', async () => {
    const replay = await replayDriver('edit', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        const events = significant(
            await collect(await session.startTurn({ prompt: 'edit', signal: signal() }))
        );
        const calls = events.filter(
            (event): event is ToolCallTurnEvent =>
                event.type === 'tool-call' && event.toolName !== 'read_file'
        );

        expect(calls.map((call) => [call.toolName, call.input])).toEqual([
            ['edit', { file_path: 'notes.txt', new_string: 'gamma', old_string: 'beta' }],
            ['fileChange', { event: 'modify', path: 'notes.txt' }],
            ['write', { content: 'fresh', file_path: 'new.txt' }],
            ['fileChange', { event: 'create', path: 'new.txt' }],
        ]);
        expect(calls[1]).toMatchObject({
            dynamic: true,
            providerExecuted: true,
            sourceToolCallId: calls[0]?.toolCallId,
        });
        expect(calls[3]).toMatchObject({ sourceToolCallId: calls[2]?.toolCallId });
        expect(events.filter((event) => event.type === 'tool-result' && event.isError)).toEqual([]);
        await session.stop();
    } finally {
        await replay.cleanup();
    }
});

test('host tool turn: Grok use_tool on the Haus server is the host tool itself', async () => {
    const replay = await replayDriver('host-tool', runtime);
    try {
        const session = await replay.driver.openSession({
            resumeFrom: undefined,
            sessionId: 'agt-1',
        });
        const events = significant(
            await collect(await session.startTurn({ prompt: 'echo', signal: signal() }))
        );
        const tools = events.filter(
            (event) => event.type === 'tool-call' || event.type === 'tool-result'
        );

        expect(
            tools.map((event) => [event.type, event.toolName, event.providerExecuted ?? false])
        ).toEqual([
            ['tool-call', 'search_tool', true],
            ['tool-result', 'search_tool', true],
            ['tool-call', 'echo', false],
            ['tool-result', 'echo', false],
        ]);
        expect(tools[2]).toMatchObject({ input: { text: 'ping-mcp' } });
        expect(tools[3]).toMatchObject({ output: 'echo:ping-mcp' });
        await session.stop();
    } finally {
        await replay.cleanup();
    }
});

test('resume: session/load restores the stored session without replaying its history as events', async () => {
    const replay = await replayDriver('resume', runtime);
    try {
        const sessionId = replay.recordedSessionId();
        const session = await replay.driver.openSession({
            resumeFrom: { runtime: 'grok-build', sessionId, version: 1 },
            sessionId: 'agt-1',
        });
        const events = await collect(
            await session.startTurn({ prompt: 'codeword?', signal: signal() })
        );

        expect(session).toMatchObject({ isResume: true, sessionId });
        expect(text(events)).toContain('PAPAYA');
        const messages = (await replay.messages()).filter((message) => 'method' in message);
        expect(messages.map((message) => message.method)).toEqual([
            'initialize',
            'authenticate',
            'session/load',
            'session/set_model',
            'session/prompt',
        ]);
        expect(messages[2]).toMatchObject({ params: { _meta: { yoloMode: true }, sessionId } });
        await session.stop();
    } finally {
        await replay.cleanup();
    }
});
