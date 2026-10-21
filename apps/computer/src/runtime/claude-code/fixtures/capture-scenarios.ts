import * as z from 'zod';
import { defineHostTool, type HostToolSet } from '../../../host-tools/host-tool.ts';

/** One scripted interaction with a live `claude` process. */
export type CaptureStep =
    | { kind: 'control'; request: Record<string, unknown> }
    | { kind: 'end' }
    /** SIGKILLs the process at once: a crash, with nothing flushed. */
    | { kind: 'kill' }
    | { kind: 'send'; priority?: 'later' | 'next' | 'now'; text: string; uuid?: boolean }
    | { kind: 'sleep'; ms: number }
    | {
          kind: 'until';
          match: (seen: readonly Record<string, unknown>[]) => boolean;
          timeoutMs?: number;
      };

export interface CaptureScenario {
    authenticated: boolean;
    modelId?: string;
    /** Processes run in order; `resume` continues the previous process's conversation. */
    processes: readonly { resume?: 'missing' | 'previous'; steps: readonly CaptureStep[] }[];
}

/** The host tool every capture serves, standing in for Haus `execute`. */
export const captureTools: HostToolSet = [
    defineHostTool({
        description: 'Runs a Haus command and returns its output.',
        execute: async (input) => ({ text: `ran: ${input.command}`, type: 'text' }),
        inputSchema: z.object({ command: z.string() }),
        name: 'execute',
    }),
];

const results = (count: number) => (seen: readonly Record<string, unknown>[]) =>
    seen.filter((message) => message.type === 'result').length >= count;
const toolUse = (name: string) => (seen: readonly Record<string, unknown>[]) =>
    seen.some(
        (message) =>
            message.type === 'assistant' &&
            JSON.stringify(message.message ?? {}).includes(`"name":"${name}"`)
    );
const controlResponse = (seen: readonly Record<string, unknown>[]) =>
    seen.some((message) => message.type === 'control_response');
const send = (text: string, extra: Partial<Extract<CaptureStep, { kind: 'send' }>> = {}) =>
    ({ kind: 'send', text, ...extra }) as const;
const until = (match: (seen: readonly Record<string, unknown>[]) => boolean, timeoutMs?: number) =>
    ({ kind: 'until', match, ...(timeoutMs ? { timeoutMs } : {}) }) as const;
const end = { kind: 'end' } as const;
const steerTask =
    'Use the Bash tool to run `sleep 8; echo first-done`, then reply with its output.';
const steerText = 'Also include the word BANANA in your final reply.';

export const captureScenarios: Record<string, CaptureScenario> = {
    'auth-failure': {
        authenticated: false,
        processes: [{ steps: [send('Reply with exactly: pong'), until(results(1), 60_000), end] }],
    },
    compaction: {
        authenticated: true,
        processes: [
            {
                steps: [
                    send('Reply with exactly: ok'),
                    until(results(1)),
                    send('/compact'),
                    until(results(2)),
                    end,
                ],
            },
        ],
    },
    interrupt: {
        authenticated: true,
        processes: [
            {
                steps: [
                    send('Use the Bash tool to run `sleep 30`, then reply done.'),
                    until(toolUse('Bash')),
                    { kind: 'sleep', ms: 1500 },
                    { kind: 'control', request: { subtype: 'interrupt' } },
                    until(results(1)),
                    send('Reply with exactly: after'),
                    until(results(2)),
                    end,
                ],
            },
        ],
    },
    'mcp-tool': {
        authenticated: true,
        processes: [
            {
                steps: [
                    send(
                        'Call the mcp__haus__execute tool with command "status", then reply with its output.'
                    ),
                    until(results(1)),
                    end,
                ],
            },
        ],
    },
    'plan-usage': {
        authenticated: true,
        processes: [
            {
                steps: [
                    send('Reply with exactly: pong'),
                    until(results(1)),
                    { kind: 'control', request: { subtype: 'get_usage' } },
                    until(controlResponse, 30_000),
                    end,
                ],
            },
        ],
    },
    reasoning: {
        authenticated: true,
        modelId: 'claude-sonnet-5-5',
        processes: [
            {
                steps: [
                    send('Think it through, then reply with only the number: 17 * 23 + 4'),
                    until(results(1)),
                    end,
                ],
            },
        ],
    },
    resume: {
        authenticated: true,
        processes: [
            { steps: [send('Remember the codeword ZEBRA-42. Reply ok.'), until(results(1)), end] },
            {
                resume: 'previous',
                steps: [send('Reply with only the codeword.'), until(results(1)), end],
            },
        ],
    },
    'resume-missing': {
        authenticated: true,
        processes: [
            {
                resume: 'missing',
                steps: [
                    send('Reply with exactly: pong'),
                    until((seen) => results(1)(seen), 30_000),
                    end,
                ],
            },
        ],
    },
    'steer-next': {
        authenticated: true,
        processes: [
            {
                steps: [
                    send(steerTask, { uuid: true }),
                    until(toolUse('Bash')),
                    { kind: 'sleep', ms: 1000 },
                    send(steerText, { priority: 'next', uuid: true }),
                    until(results(1)),
                    { kind: 'sleep', ms: 12_000 },
                    end,
                ],
            },
        ],
    },
    'steer-plain': {
        authenticated: true,
        processes: [
            {
                steps: [
                    send(steerTask),
                    until(toolUse('Bash')),
                    { kind: 'sleep', ms: 1000 },
                    send(steerText),
                    until(results(1)),
                    { kind: 'sleep', ms: 12_000 },
                    end,
                ],
            },
        ],
    },
    subagent: {
        authenticated: true,
        processes: [
            {
                steps: [
                    send(
                        'Use the Agent tool (subagent_type "general-purpose") to have a sub-agent run `echo sub-ok` with Bash, then reply with what it reported.'
                    ),
                    until(results(1), 300_000),
                    end,
                ],
            },
        ],
    },
    'text-reply': {
        authenticated: true,
        processes: [{ steps: [send('Reply with exactly: pong'), until(results(1)), end] }],
    },
    'tool-use': {
        authenticated: true,
        processes: [
            {
                steps: [
                    send(
                        'Read notes.txt with the Read tool, change "beta" to "BETA" with the Edit tool, run `wc -l notes.txt` with Bash, run `exit 3` with Bash, then reply done.'
                    ),
                    until(results(1)),
                    end,
                ],
            },
        ],
    },
    'two-turns': {
        authenticated: true,
        processes: [
            {
                steps: [
                    send('Reply with exactly: pong'),
                    until(results(1)),
                    send('Reply with exactly: ping'),
                    until(results(2)),
                    end,
                ],
            },
        ],
    },
};
