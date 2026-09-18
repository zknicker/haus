// The installed `claude` CLI, driven the way the bridge drives its pinned copy.
//
// Two things make this faithful rather than approximate. The instructions go in
// through `--append-system-prompt`, which is where the bridge puts an agent's
// instructions, so the model sees the same text at the same level. And the host
// login is resolved per start by the product's own `claudeNativeEnvironment`
// and passed in the child environment only — the credential never lands on disk
// in the temp root, and the eval never has to read one.
import path from 'node:path';
import { claudeNativeEnvironment } from '../../apps/computer/src/harness/claude-native-auth.ts';
import {
    directSearchPath,
    linkHostFile,
    parseJsonLines,
    runCli,
    traceEntry,
} from './direct-cli.mjs';
import { evalInstructions } from './instructions.mjs';

/** Skipped by the trace: these are the model talking, not the model acting. */
const untracedBlocks = new Set(['text', 'thinking']);

export const createClaudeLane = async ({
    executable,
    homeDir,
    hostHomeDir,
    modelId,
    reasoningEffort,
    workspaceDir,
}) => {
    await linkHostFile({
        source: path.join(hostHomeDir, '.claude.json'),
        target: path.join(homeDir, '.claude.json'),
    });
    await linkHostFile({
        source: path.join(hostHomeDir, '.claude', '.credentials.json'),
        target: path.join(homeDir, '.claude', '.credentials.json'),
    });
    const env = {
        ...(await claudeNativeEnvironment()),
        HOME: homeDir,
        PATH: directSearchPath(executable),
    };

    return async ({ prompt, timeoutMs }) => {
        const result = await runCli({
            args: claudeArgs({ modelId, prompt, reasoningEffort }),
            command: executable.path,
            cwd: workspaceDir,
            env,
            timeoutMs,
        });
        return readClaudeTurn(result);
    };
};

/**
 * `bypassPermissions` alone is enough here: the CLI never prompts, so the model
 * reads its skill without an approval round trip it would not get in the
 * product either.
 */
export const claudeArgs = ({ modelId, prompt, reasoningEffort }) => [
    '-p',
    prompt,
    '--model',
    modelId,
    '--output-format',
    'stream-json',
    '--verbose',
    '--append-system-prompt',
    evalInstructions,
    '--permission-mode',
    'bypassPermissions',
    '--effort',
    reasoningEffort,
];

/**
 * Folds the stream-json events into one turn. Tool-use blocks carry the trace
 * (their input is what proves the design system was read); the terminal
 * `result` event carries the reply text, the token usage and the turn's cost.
 */
export const readClaudeTurn = ({ exitCode, stderr, stdout }) => {
    const turn = { costUsd: null, failure: null, text: null, trace: [], usage: null };
    for (const event of parseJsonLines(stdout)) {
        foldClaudeEvent(turn, event);
    }
    if (turn.failure) {
        throw new Error(`claude turn failed: ${turn.failure}`);
    }
    if (turn.text === null) {
        throw new Error(
            `claude exited ${exitCode} without a result event: ${stderr.trim().slice(-300) || '(no stderr)'}`
        );
    }
    return { costUsd: turn.costUsd, stderr, text: turn.text, trace: turn.trace, usage: turn.usage };
};

function foldClaudeEvent(turn, event) {
    if (event.type === 'assistant') {
        for (const block of event.message?.content ?? []) {
            if (!untracedBlocks.has(block.type)) {
                turn.trace.push(traceEntry(block.name ?? block.type, block.input));
            }
        }
        return;
    }
    if (event.type !== 'result') {
        return;
    }
    turn.text = typeof event.result === 'string' ? event.result : turn.text;
    turn.costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null;
    turn.usage = claudeUsage(event.usage);
    turn.failure = event.is_error ? (event.result ?? 'claude reported is_error') : null;
}

function claudeUsage(usage) {
    if (!usage) {
        return null;
    }
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    return {
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
}
