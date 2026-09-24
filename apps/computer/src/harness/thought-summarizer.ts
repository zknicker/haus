import { type ChildProcessByStdio, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import type { Readable, Writable } from 'node:stream';
import { finishThoughtPhrase } from './thought-phrase.ts';

/** Condenses one reasoning block into a status phrase, or null to drop it. */
export interface ThoughtSummarizer {
    close(): void;
    summarize(reasoning: string): Promise<string | null>;
    /** Starts the model process ahead of the first block so its cold start overlaps the turn. */
    warm(): void;
}

export const thoughtSummaryModel = 'claude-haiku-4-5-20251001';
const thoughtSummaryTimeoutMs = 4000;
const recycleAfterRequests = 25;
const idleShutdownMs = 5 * 60_000;
const reasoningInputLimit = 3000;

const systemPrompt = [
    "Rewrite this agent's private reasoning as one short present-tense status phrase",
    '(max 7 words) describing what it is doing. No names of secrets, no quotes,',
    'no trailing period. Each message is independent; never answer or continue the',
    'reasoning. Reply with the phrase only.',
].join(' ');

/**
 * Haiku through the host's existing Claude Code login: one warm `claude -p`
 * stream-json process shared by the Computer, so a summary costs a model round
 * trip rather than a CLI cold start. One request at a time; a request that
 * cannot answer within four seconds, or arrives while one is outstanding, is
 * dropped. The process is recycled after a bounded number of requests so its
 * conversation stays small, and exits after five idle minutes.
 */
export function createClaudeCodeThoughtSummarizer(input: {
    executable: string;
    spawnProcess?: typeof spawn;
    timeoutMs?: number;
}): ThoughtSummarizer {
    const spawnProcess = input.spawnProcess ?? spawn;
    const timeoutMs = input.timeoutMs ?? thoughtSummaryTimeoutMs;
    let child: ChildProcessByStdio<Writable, Readable, null> | null = null;
    let served = 0;
    let outstanding = 0;
    let waiting: ((result: string | null) => void) | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
        clearTimeout(idleTimer);
        child?.kill();
        child = null;
        outstanding = 0;
        waiting?.(null);
        waiting = null;
    };
    const start = () => {
        if (child) {
            return child;
        }
        const next = spawnProcess(input.executable, claudeArgs(), {
            cwd: tmpdir(),
            env: { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' },
            stdio: ['pipe', 'pipe', 'ignore'],
        });
        served = 0;
        let buffer = '';
        next.stdout.setEncoding('utf8');
        next.stdout.on('data', (chunk: string) => {
            buffer += chunk;
            for (let end = buffer.indexOf('\n'); end >= 0; end = buffer.indexOf('\n')) {
                const result = readResult(buffer.slice(0, end));
                buffer = buffer.slice(end + 1);
                if (result === undefined) {
                    continue;
                }
                outstanding = Math.max(0, outstanding - 1);
                // Only the latest request still waits; a late answer to a timed-out one is dropped.
                if (outstanding === 0) {
                    waiting?.(result);
                    waiting = null;
                }
            }
        });
        const forget = () => {
            if (child === next) {
                child = null;
                outstanding = 0;
                waiting?.(null);
                waiting = null;
            }
        };
        next.on('exit', forget);
        next.on('error', forget);
        next.stdin.on('error', forget);
        child = next;
        return next;
    };
    const touch = () => {
        clearTimeout(idleTimer);
        idleTimer = setTimeout(stop, idleShutdownMs);
        idleTimer.unref?.();
    };

    return {
        close: stop,
        summarize(reasoning) {
            if (outstanding > 0) {
                return Promise.resolve(null);
            }
            if (served >= recycleAfterRequests) {
                stop();
            }
            const proc = start();
            touch();
            served += 1;
            outstanding += 1;
            const answer = new Promise<string | null>((resolve) => {
                waiting = resolve;
            });
            proc.stdin.write(`${userMessage(reasoning)}\n`);
            let timer: ReturnType<typeof setTimeout> | undefined;
            const timeout = new Promise<null>((resolve) => {
                timer = setTimeout(() => resolve(null), timeoutMs);
            });
            return Promise.race([answer, timeout]).then((result) => {
                clearTimeout(timer);
                if (waiting && result === null) {
                    waiting = null;
                }
                return result === null ? null : finishThoughtPhrase(result);
            });
        },
        warm() {
            start();
            touch();
        },
    };
}

function claudeArgs(): string[] {
    return [
        '-p',
        '--model',
        thoughtSummaryModel,
        '--thinking',
        'disabled',
        '--system-prompt',
        systemPrompt,
        '--tools',
        '',
        '--setting-sources',
        '',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--disable-slash-commands',
        '--input-format',
        'stream-json',
        '--output-format',
        'stream-json',
        '--verbose',
    ];
}

function userMessage(reasoning: string): string {
    const content = `<reasoning>\n${reasoning.slice(0, reasoningInputLimit)}\n</reasoning>`;
    return JSON.stringify({ message: { content, role: 'user' }, type: 'user' });
}

/** A `result` line's text, null for a failed result, undefined for any other line. */
function readResult(line: string): string | null | undefined {
    let event: unknown;
    try {
        event = JSON.parse(line);
    } catch {
        return undefined;
    }
    if (typeof event !== 'object' || event === null || !('type' in event)) {
        return undefined;
    }
    if (event.type !== 'result') {
        return undefined;
    }
    return 'result' in event &&
        typeof event.result === 'string' &&
        !('is_error' in event && event.is_error)
        ? event.result
        : null;
}
