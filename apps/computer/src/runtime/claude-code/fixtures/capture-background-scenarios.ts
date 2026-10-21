import type { CaptureScenario, CaptureStep } from './capture-scenarios.ts';

/**
 * Background sub-agent captures: the Agent starts a sub-agent with `run_in_background`, its turn
 * ends, and Claude Code later reports the task (specs/runtime-drivers.md "Background work").
 */
type Seen = readonly Record<string, unknown>[];

const results = (count: number) => (seen: Seen) =>
    seen.filter((message) => message.type === 'result').length >= count;
const system =
    (subtype: string, count = 1) =>
    (seen: Seen) =>
        seen.filter((message) => message.type === 'system' && message.subtype === subtype).length >=
        count;
const toolUses = (name: string, count: number) => (seen: Seen) =>
    seen.filter(
        (message) =>
            message.type === 'assistant' &&
            message.parent_tool_use_id === null &&
            JSON.stringify(message.message ?? {}).includes(`"name":"${name}"`)
    ).length >= count;
const controlResponse = (seen: Seen) => seen.some((message) => message.type === 'control_response');

const send = (text: string): CaptureStep => ({ kind: 'send', text, uuid: true });
const until = (match: (seen: Seen) => boolean, timeoutMs?: number): CaptureStep => ({
    kind: 'until',
    match,
    ...(timeoutMs ? { timeoutMs } : {}),
});
const sleep = (ms: number): CaptureStep => ({ kind: 'sleep', ms });
const end: CaptureStep = { kind: 'end' };
/** The driver's handshake: an interrupt spares background tasks (`perTaskStopAffordance`). */
const initialize: readonly CaptureStep[] = [
    { kind: 'control', request: { perTaskStopAffordance: true, subtype: 'initialize' } },
    until(controlResponse, 30_000),
];
const wait = (seconds: number) => `python3 -c "import time; time.sleep(${seconds})"`;
const startBackground = (seconds: number, command = wait(seconds)) =>
    send(
        `Use the Agent tool with run_in_background set to true (subagent_type "general-purpose") to have a sub-agent run \`${command}; echo bg-ok\` with Bash and report its output. Do not wait for it: as soon as it has started, reply with exactly: started`
    );

export const backgroundCaptureScenarios: Record<string, CaptureScenario> = {
    /**
     * Turn ends while the task runs; a new message is answered; the completion wakes a turn.
     * Claude Code blocks a leading `sleep`, so the sub-agent backgrounds a shell of its own and
     * finishes first: the recording covers a sub-agent-owned shell outliving its sub-agent.
     */
    'background-subagent': {
        authenticated: true,
        processes: [
            {
                steps: [
                    ...initialize,
                    startBackground(25, 'sleep 25'),
                    until(results(1), 120_000),
                    send('Reply with exactly: pong'),
                    until(results(2)),
                    until(results(3), 300_000),
                    sleep(3000),
                    end,
                ],
            },
        ],
    },
    /** The completion arrives while another turn runs a long tool call. */
    'background-fold': {
        authenticated: true,
        processes: [
            {
                steps: [
                    ...initialize,
                    startBackground(8),
                    until(results(1), 120_000),
                    send(
                        'Use the Bash tool to run `python3 -c "import time; time.sleep(40)"; echo fg-done`, then reply with its output.'
                    ),
                    until(results(2), 300_000),
                    sleep(15_000),
                    end,
                ],
            },
        ],
    },
    /** An interrupt of a later turn spares the background task. */
    'background-interrupt': {
        authenticated: true,
        processes: [
            {
                steps: [
                    ...initialize,
                    startBackground(30),
                    until(results(1), 120_000),
                    send(
                        'Use the Bash tool to run `python3 -c "import time; time.sleep(30)"`, then reply done.'
                    ),
                    until(toolUses('Bash', 1), 120_000),
                    sleep(1500),
                    { kind: 'control', request: { cancel_queued: true, subtype: 'interrupt' } },
                    until(results(2)),
                    until(system('task_notification'), 300_000),
                    sleep(20_000),
                    end,
                ],
            },
        ],
    },
    /** The process dies with a task running; the resumed process reports it orphaned. */
    'background-orphan': {
        authenticated: true,
        processes: [
            {
                steps: [
                    ...initialize,
                    startBackground(120),
                    until(results(1), 120_000),
                    { kind: 'kill' },
                ],
            },
            {
                resume: 'previous',
                steps: [
                    ...initialize,
                    sleep(5000),
                    send('Reply with exactly: pong'),
                    until(results(1), 120_000),
                    sleep(20_000),
                    end,
                ],
            },
        ],
    },
};
