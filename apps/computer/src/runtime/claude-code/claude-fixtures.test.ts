import { describe, expect, test } from 'bun:test';
import { isPromptResumeRejection } from '../../harness/resume-rejection.ts';
import type { RuntimeSession } from '../driver.ts';
import type { TurnEvent } from '../turn-event.ts';
import { parseClaudeLine } from './claude-messages.ts';
import { createClaudeSession } from './claude-session.ts';
import { createClaudeWarmPool } from './claude-warm-pool.ts';
import { collect, readFixture, replayConnection } from './fixtures/fixture-replay.ts';

const fixtureNames = [
    'auth-failure',
    'compaction',
    'interrupt',
    'mcp-tool',
    'plan-usage',
    'reasoning',
    'resume',
    'resume-missing',
    'steer-next',
    'steer-plain',
    'subagent',
    'text-reply',
    'tool-use',
    'two-turns',
];

// Real Claude Code 2.1.284 streams (fixtures/*.jsonl, recorded by fixtures/capture.ts) replayed
// through the connection, normalizer, and turn exactly as the driver runs them.

function replaySession(name: string, options: { collectPlanUsage?: boolean } = {}) {
    const { connection, process } = replayConnection(name);
    const session = createClaudeSession({
        collectPlanUsage: options.collectPlanUsage ?? false,
        connection,
        isResume: false,
        pool: createClaudeWarmPool(),
        relaunch: () => Promise.reject(new Error('A replay cannot relaunch.')),
    });
    return { process, session };
}

async function runTurn(session: RuntimeSession, prompt = 'prompt') {
    const turn = await session.startTurn({ prompt, signal: new AbortController().signal });
    return await collect(turn.events);
}

const ofType = <Type extends TurnEvent['type']>(events: TurnEvent[], type: Type) =>
    events.filter((event): event is Extract<TurnEvent, { type: Type }> => event.type === type);

describe('Claude Code fixture replay', () => {
    test('a plain reply streams text, thinking, step usage, and settles on the result', async () => {
        const events = await runTurn(replaySession('text-reply').session);
        expect(ofType(events, 'text-delta').map((event) => event.text)).toEqual(['pong']);
        expect(ofType(events, 'reasoning-start')).toHaveLength(1);
        expect(ofType(events, 'reasoning-end')).toHaveLength(1);
        expect(ofType(events, 'step-finish')).toEqual([
            {
                contextTokens: 20_079,
                type: 'step-finish',
                usage: {
                    cacheReadTokens: 12_919,
                    cacheWriteTokens: 7150,
                    inputTokens: 20_079,
                    outputTokens: 42,
                    totalTokens: 20_121,
                },
            },
        ]);
        expect(events.at(-1)).toEqual({
            claudePlanUsage: null,
            type: 'turn-finish',
            usage: {
                cacheReadTokens: 12_919,
                cacheWriteTokens: 7150,
                inputTokens: 20_079,
                outputTokens: 42,
                totalTokens: 20_121,
            },
        });
    });

    test('every recorded stdout line parses at the boundary', () => {
        for (const name of fixtureNames) {
            for (const record of readFixture(name)) {
                if (record.stream === 'stdout') {
                    const parsed = parseClaudeLine(record.line);
                    expect({ name, parsed: parsed && 'invalid' in parsed ? parsed : 'ok' }).toEqual(
                        {
                            name,
                            parsed: 'ok',
                        }
                    );
                }
            }
        }
    });

    test('builtin tools keep common names, workspace-relative inputs, and Bash exit codes', async () => {
        const events = await runTurn(replaySession('tool-use').session);
        const calls = ofType(events, 'tool-call');
        expect(calls.map((call) => [call.toolName, call.nativeName])).toEqual([
            ['read', 'Read'],
            ['bash', 'Bash'],
            ['bash', 'Bash'],
            ['edit', 'Edit'],
        ]);
        expect(calls.every((call) => call.providerExecuted === true)).toBe(true);
        expect(calls[0]?.input).toEqual({ file_path: 'notes.txt' });
        expect(calls[1]?.input).toEqual({ command: 'wc -l notes.txt' });
        const results = ofType(events, 'tool-result');
        // Raft #17: a command that ran and exited non-zero is a completed call.
        expect(results.find((result) => result.toolCallId === calls[2]?.toolCallId)).toMatchObject({
            output: { exitCode: 3, stdout: 'Exit code 3' },
        });
        expect(
            results.find((result) => result.toolCallId === calls[0]?.toolCallId)?.output
        ).toMatchObject({ file: { filePath: 'notes.txt' }, type: 'text' });
        expect(ofType(events, 'tool-error')).toEqual([]);
        expect(events.at(-1)?.type).toBe('turn-finish');
    });

    test('a Haus host tool reports its own name without providerExecuted', async () => {
        const events = await runTurn(replaySession('mcp-tool').session);
        const host = ofType(events, 'tool-call').find((call) => call.toolName === 'execute');
        expect(host).toEqual({
            input: { command: 'status' },
            nativeName: 'mcp__haus__execute',
            toolCallId: expect.any(String),
            toolName: 'execute',
            type: 'tool-call',
        });
        expect(
            ofType(events, 'tool-result').find((result) => result.toolCallId === host?.toolCallId)
        ).toMatchObject({ output: 'ran: status', toolName: 'execute' });
        expect(
            ofType(events, 'tool-call').find((call) => call.toolName === 'ToolSearch')
        ).toMatchObject({ providerExecuted: true });
    });

    test('steering mid-tool is acknowledged by Claude Code and joins the running turn', async () => {
        const { process, session } = replaySession('steer-next');
        const turn = await session.startTurn({ prompt: 'p', signal: new AbortController().signal });
        const events: TurnEvent[] = [];
        let steered: unknown;
        for await (const event of turn.events) {
            events.push(event);
            if (event.type === 'tool-call' && steered === undefined) {
                steered = await session.steer('Also include the word BANANA.');
            }
        }
        expect(steered).toEqual({ delivered: true });
        expect(JSON.parse(process.writes[1] ?? '{}')).toMatchObject({
            priority: 'next',
            type: 'user',
        });
        expect(ofType(events, 'turn-finish')).toHaveLength(1);
        expect(
            ofType(events, 'text-delta')
                .map((event) => event.text)
                .join('')
        ).toContain('BANANA');
        expect(await session.steer('late')).toEqual({ delivered: false, reason: 'idle' });
    });

    test('Stop interrupts the turn, which settles as an abort, and the process takes the next turn', async () => {
        const { process, session } = replaySession('interrupt');
        const stop = new AbortController();
        const turn = await session.startTurn({ prompt: 'p', signal: stop.signal });
        const events: TurnEvent[] = [];
        for await (const event of turn.events) {
            events.push(event);
            if (event.type === 'tool-call') {
                stop.abort();
            }
        }
        await turn.settle();
        expect(JSON.parse(process.writes[1] ?? '{}')).toMatchObject({
            request: { cancel_queued: true, subtype: 'interrupt' },
            type: 'control_request',
        });
        expect(events.at(-1)).toEqual({ type: 'abort' });
        expect(ofType(events, 'error')).toEqual([]);
        const next = await runTurn(session);
        expect(ofType(next, 'text-delta').map((event) => event.text)).toEqual(['after']);
        expect(next.at(-1)?.type).toBe('turn-finish');
    });

    test('a missing conversation fails the turn as a prompt resume rejection', async () => {
        const events = await runTurn(replaySession('resume-missing').session);
        const [failure] = ofType(events, 'error');
        expect(isPromptResumeRejection(failure?.error)).toBe(true);
        expect(events.at(-1)?.type).toBe('error');
    });

    test('a missing login is a typed access failure that ends the turn', async () => {
        const events = await runTurn(replaySession('auth-failure').session);
        expect(events.at(-1)).toEqual({
            category: 'access',
            severity: 'error',
            title: 'Not logged in · Please run /login',
            type: 'session-failure',
        });
    });

    test('a foreground sub-agent reports explicit lineage and its totals', async () => {
        const events = await runTurn(replaySession('subagent').session);
        const delegate = ofType(events, 'tool-call').find((call) => call.toolName === 'Agent');
        expect(ofType(events, 'subagent-started')).toEqual([
            {
                description: 'Run echo sub-ok command',
                subagentType: 'general-purpose',
                taskId: 'af1c1ef5f028570db',
                toolCallId: delegate?.toolCallId ?? '',
                type: 'subagent-started',
            },
        ]);
        expect(ofType(events, 'subagent-tool-call')).toMatchObject([
            { parentToolCallId: delegate?.toolCallId, toolName: 'Bash' },
        ]);
        expect(ofType(events, 'subagent-status').map((event) => event.status)).toContain(
            'completed'
        );
        expect(
            ofType(events, 'tool-result').find(
                (result) => result.toolCallId === delegate?.toolCallId
            )?.output
        ).toMatchObject({ totalTokens: 12_893, totalToolUseCount: 1 });
        // A sub-agent's own calls are never the Agent's.
        expect(ofType(events, 'tool-call').map((call) => call.toolName)).toEqual(['Agent']);
    });

    test('a compaction is reported as the synthetic compaction tool pair with its summary', async () => {
        const { session } = replaySession('compaction');
        await runTurn(session);
        const events = await runTurn(session, '/compact');
        const [call] = ofType(events, 'tool-call');
        expect(call).toMatchObject({
            dynamic: true,
            providerExecuted: true,
            toolName: 'compaction',
        });
        expect(ofType(events, 'tool-result')[0]?.output).toMatchObject({
            summary: expect.stringContaining('This session is being continued'),
            tokensAfter: 1298,
            tokensBefore: 20_119,
            trigger: 'manual',
        });
        expect(events.at(-1)?.type).toBe('turn-finish');
    });

    test('two turns run on one process, each settling on its own result', async () => {
        const { process, session } = replaySession('two-turns');
        const first = await runTurn(session);
        const second = await runTurn(session);
        expect(ofType(first, 'text-delta').map((event) => event.text)).toEqual(['pong']);
        expect(ofType(second, 'text-delta').map((event) => event.text)).toEqual(['ping']);
        expect(process.writes).toHaveLength(2);
    });

    test('plan usage is read after the turn when the refresh is claimed', async () => {
        const { process, session } = replaySession('plan-usage', { collectPlanUsage: true });
        const events = await runTurn(session);
        expect(JSON.parse(process.writes[1] ?? '{}')).toMatchObject({
            request: { subtype: 'get_usage' },
        });
        // An env-token login reports no subscription windows.
        expect(events.at(-1)).toMatchObject({ claudePlanUsage: null, type: 'turn-finish' });
    });
});
