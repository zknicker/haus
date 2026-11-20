import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { RunTools, ToolOutcome } from '../run-context.ts';
import type { RuntimeTurn } from '../turn/runtime-driver.ts';
import type { TurnEvent } from '../turn/turn-event.ts';
import { createClaudeHarness } from './claude-driver.ts';
import { type ClaudeEnvironment, setupTokenEnvironment } from './claude-launch.ts';

const setupToken = process.env.HAUS_RUNNER_CLAUDE_SETUP_TOKEN;
const liveTest = process.env.HAUS_RUN_LIVE_RUNNER_CLAUDE_TEST === '1' ? test : test.skip;
const root = await mkdtemp(join(tmpdir(), 'haus-runner-driver-'));
afterAll(() => rm(root, { force: true, recursive: true }));

const hostLogin: ClaudeEnvironment = () => ({
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    USER: process.env.USER,
});

liveTest(
    'a driver session runs two turns, steers mid-tool, and resumes cold from the volume',
    async () => {
        const environment = setupToken ? setupTokenEnvironment(setupToken) : hostLogin;
        const nonce = crypto.randomUUID().slice(0, 8);
        const launch = {
            agentDir: join(root, 'agents', 'agent-live'),
            agentId: 'agent-live',
            instructions:
                'You are a test agent. Use the bash tool when asked to run a command. Answer in one short line.',
            modelId: 'claude-haiku-4-5',
            reasoningEffort: 'default' as const,
            tools: localTools(),
        };
        const warm = createClaudeHarness({ environment, maxWarm: 2 });
        const session = await warm.driver(launch).openSession({
            resumeFrom: undefined,
            sessionId: 'agent-live-1',
        });
        expect(session.isResume).toBe(false);
        const first = await session.startTurn({
            prompt: `Run \`sleep 4 && echo ${nonce}\` with the bash tool, then reply with what it printed.`,
            signal: new AbortController().signal,
        });
        const steers: Promise<unknown>[] = [];
        const firstEvents = await collect(first, (event) => {
            if (event.type === 'tool-call' && steers.length === 0) {
                steers.push(session.steer('Also end your reply with the word banana.'));
            }
        });
        expect(await Promise.all(steers)).toEqual([{ delivered: true }]);
        expect(first.unconsumedSteers()).toEqual([]);
        expect(firstEvents.at(-1)?.type).toBe('turn-finish');
        expect(toolNames(firstEvents)).toEqual(['bash']);
        expect(text(firstEvents)).toContain(nonce);
        expect(text(firstEvents).toLowerCase()).toContain('banana');
        expect([...session.initTools].toSorted()).toEqual([
            'WebFetch',
            'WebSearch',
            'mcp__haus__bash',
            'mcp__haus__execute',
            'mcp__haus__str_replace_based_edit_tool',
        ]);
        const second = await session.startTurn({
            prompt: 'Reply with the single word: ready.',
            signal: new AbortController().signal,
        });
        expect((await collect(second)).at(-1)?.type).toBe('turn-finish');
        const nativeSessionId = await session.detach();
        expect(warm.warm).toBe(1);
        warm.close();

        const cold = createClaudeHarness({ environment, maxWarm: 2 });
        const resumed = await cold.driver(launch).openSession({
            resumeFrom: nativeSessionId,
            sessionId: 'agent-live-1',
        });
        expect(resumed.isResume).toBe(true);
        const third = await resumed.startTurn({
            prompt: 'What did the bash command print earlier? Reply with only that value.',
            signal: new AbortController().signal,
        });
        expect(text(await collect(third))).toContain(nonce);
        expect(await resumed.stop()).toBe(nativeSessionId);
        cold.close();
        if (setupToken) {
            expect(await readdir(join(launch.agentDir, 'claude', 'projects'))).toHaveLength(1);
        }
    }
);

async function collect(turn: RuntimeTurn, onEvent?: (event: TurnEvent) => void) {
    const events: TurnEvent[] = [];
    for await (const event of turn.events) {
        events.push(event);
        onEvent?.(event);
    }
    await turn.settle();
    return events;
}

function toolNames(events: readonly TurnEvent[]) {
    return events.flatMap((event) => (event.type === 'tool-call' ? [event.toolName] : []));
}

function text(events: readonly TurnEvent[]) {
    return events.map((event) => (event.type === 'text-delta' ? event.text : '')).join('');
}

function localTools() {
    const refused: ToolOutcome = {
        content: [{ text: 'Not available in this test.', type: 'text' }],
        isError: true,
    };
    const tools: RunTools = {
        applyPatch: () => Promise.resolve(refused),
        async bash(_toolCallId, input) {
            const child = Bun.spawn(['bash', '-c', input.command], {
                stderr: 'pipe',
                stdout: 'pipe',
            });
            const output = await new Response(child.stdout).text();
            const outcome: ToolOutcome = {
                content: [{ text: output, type: 'text' }],
                invocation: 'completed',
                isError: (await child.exited) !== 0,
            };
            return outcome;
        },
        edit: () => Promise.resolve(refused),
        execute: () => Promise.resolve(refused),
        settle: () =>
            Promise.resolve({
                sendCount: 0,
                servedAutomationIds: [],
                visibleMessages: [],
            }),
        shell: () => Promise.resolve(refused),
        viewImage: () => Promise.resolve(refused),
    };
    return tools;
}
