// Ported from botiverse/raft-source packages/daemon/src/drivers/codex.test.ts (FSL-1.1-ALv2)
import { describe, expect, test } from 'bun:test';
import {
    emitTurn,
    labels,
    runningFakeTurn as running,
    turnCompleted,
    usage,
} from './testing/session-harness.ts';

const agentMessage = (id: string, phase: string | null, text = '') => ({
    item: { id, phase, text, type: 'agentMessage' },
});

describe('Codex turn events', () => {
    test('completed agent text after deltas is not duplicated', async () => {
        const { fake, turn } = await running();
        emitTurn(fake, turn.turnId, 'item/agentMessage/delta', {
            delta: 'HELLO',
            itemId: 'item-1',
        });
        emitTurn(fake, turn.turnId, 'item/completed', agentMessage('item-1', null, 'HELLO'));
        turnCompleted(fake, turn.turnId);
        expect(labels(await turn.finished)).toEqual(['text-delta:HELLO', 'turn-finish']);
    });

    test('commentary is liveness, not answer text; a cached final_answer phase is text', async () => {
        const { fake, turn } = await running();
        emitTurn(fake, turn.turnId, 'item/started', agentMessage('c-1', 'commentary'));
        emitTurn(fake, turn.turnId, 'item/agentMessage/delta', {
            delta: 'assistant to=functions',
            itemId: 'c-1',
        });
        emitTurn(
            fake,
            turn.turnId,
            'item/completed',
            agentMessage('c-1', 'commentary', 'assistant to=functions')
        );
        emitTurn(fake, turn.turnId, 'item/started', agentMessage('f-1', 'final_answer'));
        emitTurn(fake, turn.turnId, 'item/agentMessage/delta', { delta: 'Final', itemId: 'f-1' });
        emitTurn(
            fake,
            turn.turnId,
            'item/completed',
            agentMessage('m-2', 'final_answer', 'Unstreamed')
        );
        turnCompleted(fake, turn.turnId);
        expect(labels(await turn.finished)).toEqual([
            'text-delta:Final',
            'text-delta:Unstreamed',
            'turn-finish',
        ]);
    });

    test('a successful turn with no output, progress, or usage is an error', async () => {
        const { fake, turn } = await running();
        emitTurn(fake, turn.turnId, 'thread/tokenUsage/updated', { tokenUsage: null });
        turnCompleted(fake, turn.turnId);
        expect(labels(await turn.finished)).toEqual([
            'error:Codex runtime completed without a response. Please retry. (codex_zero_evidence_turn_completed)',
        ]);
    });

    test('token usage or a raw response item is evidence for a quiet successful turn', async () => {
        const first = await running();
        usage(first.fake, first.turn.turnId);
        turnCompleted(first.fake, first.turn.turnId);
        expect(labels(await first.turn.finished)).toEqual(['step-finish', 'turn-finish']);
        const second = await running();
        emitTurn(second.fake, second.turn.turnId, 'rawResponseItem/completed', {
            item: { type: 'function_call_output' },
        });
        turnCompleted(second.fake, second.turn.turnId);
        expect(labels(await second.turn.finished)).toEqual(['turn-finish']);
    });

    test('context compaction is a silent compaction tool call', async () => {
        const { fake, turn } = await running();
        emitTurn(fake, turn.turnId, 'item/started', {
            item: { id: 'cmp-1', type: 'contextCompaction' },
        });
        emitTurn(fake, turn.turnId, 'item/completed', {
            item: { id: 'cmp-1', type: 'contextCompaction' },
        });
        turnCompleted(fake, turn.turnId);
        const events = await turn.finished;
        expect(labels(events)).toEqual([
            'tool-call:compaction',
            'tool-result:compaction',
            'turn-finish',
        ]);
        expect(events.find((event) => event.type === 'tool-call')).toMatchObject({
            dynamic: true,
            providerExecuted: true,
        });
    });

    test('a shell call reports the script the model wrote, not the shell-joined argv', async () => {
        const { fake, turn } = await running();
        // Verbatim from a live gpt-5.6-terra turn: a heredoc's quotes make Codex join with "…".
        const wrapped =
            '/bin/zsh -lc "haus message send --target \\"#eval-q6mjgp\\" --reply-to \\"twvWArcS\\" --done <<\'HAUSMSG\'\n43447.\nHAUSMSG"';
        const single = "/bin/zsh -lc 'echo hello-haus && ls'";
        for (const [id, command] of [
            ['cmd-1', wrapped],
            ['cmd-2', single],
        ] as const) {
            emitTurn(fake, turn.turnId, 'item/started', {
                item: { command, commandActions: [], cwd: '/w', id, type: 'commandExecution' },
            });
        }
        turnCompleted(fake, turn.turnId);
        const calls = (await turn.finished).filter((event) => event.type === 'tool-call');
        expect(calls.map((event) => event.input)).toEqual([
            {
                command:
                    'haus message send --target "#eval-q6mjgp" --reply-to "twvWArcS" --done <<\'HAUSMSG\'\n43447.\nHAUSMSG',
                cwd: '/w',
            },
            { command: 'echo hello-haus && ls', cwd: '/w' },
        ]);
    });

    test('completed tool items yield matching tool results', async () => {
        const { fake, turn } = await running();
        const item = (method: string, value: object) =>
            emitTurn(fake, turn.turnId, method, { item: value });
        item('item/started', {
            command: 'ls',
            commandActions: [],
            cwd: '/w',
            id: 'cmd-1',
            type: 'commandExecution',
        });
        item('item/completed', {
            aggregatedOutput: 'a',
            command: 'ls',
            exitCode: 0,
            id: 'cmd-1',
            status: 'completed',
            type: 'commandExecution',
        });
        item('item/started', {
            arguments: { q: 1 },
            id: 'mcp-1',
            server: 'github',
            tool: 'search_issues',
            type: 'mcpToolCall',
        });
        item('item/completed', {
            error: null,
            id: 'mcp-1',
            result: { content: [] },
            server: 'github',
            tool: 'search_issues',
            type: 'mcpToolCall',
        });
        item('item/started', { id: 'web-1', query: 'Codex app-server', type: 'webSearch' });
        item('item/completed', { id: 'web-1', query: 'Codex app-server', type: 'webSearch' });
        item('item/started', {
            id: 'col-1',
            prompt: 'inspect this',
            tool: 'spawnAgent',
            type: 'collabAgentToolCall',
        });
        item('item/completed', {
            id: 'col-1',
            status: 'completed',
            tool: 'spawnAgent',
            type: 'collabAgentToolCall',
        });
        turnCompleted(fake, turn.turnId);
        const events = await turn.finished;
        expect(labels(events)).toEqual([
            'tool-call:bash',
            'tool-result:bash',
            'tool-call:mcp__github__search_issues',
            'tool-result:mcp__github__search_issues',
            'tool-call:webSearch',
            'tool-result:webSearch',
            'tool-call:collab_agent',
            'tool-result:collab_agent',
            'turn-finish',
        ]);
        expect(events.find((event) => event.type === 'tool-call')).toMatchObject({
            input: { command: 'ls', cwd: '/w' },
            nativeName: 'exec_command',
        });
        expect(
            events.find((event) => event.type === 'tool-call' && event.toolName.startsWith('mcp__'))
        ).toMatchObject({ dynamic: true });
        expect(
            events.find((event) => event.type === 'tool-call' && event.toolName === 'webSearch')
        ).toMatchObject({
            input: { query: 'Codex app-server' },
            nativeName: 'web_search',
        });
    });

    test('a failed MCP call is a tool error; a declined command is an error result', async () => {
        const { fake, turn } = await running();
        const item = (method: string, value: object) =>
            emitTurn(fake, turn.turnId, method, { item: value });
        item('item/started', {
            arguments: {},
            id: 'mcp-1',
            server: 'haus',
            tool: 'execute',
            type: 'mcpToolCall',
        });
        item('item/completed', {
            error: { message: 'boom' },
            id: 'mcp-1',
            server: 'haus',
            tool: 'execute',
            type: 'mcpToolCall',
        });
        item('item/started', {
            command: 'rm -rf /',
            commandActions: [],
            cwd: '/w',
            id: 'cmd-1',
            type: 'commandExecution',
        });
        item('item/completed', {
            command: 'rm -rf /',
            exitCode: null,
            id: 'cmd-1',
            status: 'declined',
            type: 'commandExecution',
        });
        turnCompleted(fake, turn.turnId);
        const events = await turn.finished;
        expect(events.find((event) => event.type === 'tool-error')).toMatchObject({
            error: { message: 'boom' },
            toolName: 'execute',
        });
        expect(
            events.find((event) => event.type === 'tool-result' && event.toolName === 'bash')
        ).toMatchObject({ isError: true });
    });
});
