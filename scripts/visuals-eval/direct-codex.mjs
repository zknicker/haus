// The installed `codex` CLI, driven through `codex exec`.
//
// One unavoidable difference from the claude lane: `codex exec` has no flag for
// system-level instructions, so the eval's instructions are written to
// `AGENTS.md` in the working directory, which is where Codex looks for them —
// and where the harness bridge's Codex lane puts an Agent's instructions too.
// Auth mirrors the harness: an isolated CODEX_HOME holding a symlink to the
// host login, so nothing leaks between runs and no credential is copied.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
    directSearchPath,
    linkHostFile,
    parseJsonLines,
    runCli,
    traceEntry,
} from './direct-cli.mjs';
import { evalInstructions } from './instructions.mjs';

/** Items that are the model thinking or answering, not the model acting. */
const untracedItems = new Set(['agent_message', 'error', 'reasoning', 'todo_list']);

export const createCodexLane = async ({
    executable,
    homeDir,
    hostHomeDir,
    modelId,
    reasoningEffort,
    workspaceDir,
}) => {
    const codexHome = path.join(homeDir, '.codex');
    await linkHostFile({
        source: path.join(hostHomeDir, '.codex', 'auth.json'),
        target: path.join(codexHome, 'auth.json'),
    });
    await writeFile(path.join(workspaceDir, 'AGENTS.md'), `${evalInstructions}\n`);
    const env = {
        CODEX_HOME: codexHome,
        HOME: homeDir,
        PATH: directSearchPath(executable),
    };
    const lastMessageFile = path.join(homeDir, 'codex-last-message.txt');

    return async ({ prompt, timeoutMs }) => {
        await writeFile(lastMessageFile, '');
        const result = await runCli({
            args: codexArgs({ lastMessageFile, modelId, prompt, reasoningEffort }),
            command: executable.path,
            cwd: workspaceDir,
            env,
            timeoutMs,
        });
        const lastMessage = await readFile(lastMessageFile, 'utf8').catch(() => '');
        return readCodexTurn({ ...result, lastMessage });
    };
};

export const codexArgs = ({ lastMessageFile, modelId, prompt, reasoningEffort }) => [
    'exec',
    '--model',
    modelId,
    '-c',
    `model_reasoning_effort="${reasoningEffort}"`,
    '--skip-git-repo-check',
    '--json',
    '--output-last-message',
    lastMessageFile,
    prompt,
];

/**
 * Folds the `--json` event stream into one turn. The final text comes from the
 * `--output-last-message` file rather than the stream, because that file is the
 * one place Codex promises the whole last message; the stream supplies the
 * trace and the token usage.
 */
export const readCodexTurn = ({ exitCode, lastMessage, stderr, stdout }) => {
    const turn = { failure: null, text: lastMessage.trim(), trace: [], usage: null };
    for (const event of parseJsonLines(stdout)) {
        foldCodexEvent(turn, event);
    }
    if (turn.failure) {
        throw new Error(`codex turn failed: ${turn.failure}`);
    }
    if (!turn.text) {
        throw new Error(
            `codex exited ${exitCode} with an empty last message: ${stderr.trim().slice(-300) || '(no stderr)'}`
        );
    }
    return { costUsd: null, stderr, text: turn.text, trace: turn.trace, usage: turn.usage };
};

function foldCodexEvent(turn, event) {
    if (event.type === 'turn.completed') {
        turn.usage = codexUsage(event.usage);
        return;
    }
    if (event.type === 'turn.failed') {
        turn.failure = event.error?.message ?? 'codex reported turn.failed';
        return;
    }
    if (event.type !== 'item.completed') {
        return;
    }
    const item = event.item ?? {};
    if (!untracedItems.has(item.type)) {
        turn.trace.push(traceEntry(item.type ?? 'item', codexItemInput(item)));
        return;
    }
    if (item.type === 'agent_message' && !turn.text) {
        turn.text = (item.text ?? '').trim();
    }
}

/**
 * The traced part of an item is the request, never the result: an item's output
 * can quote a file that names `design-system.md` without the model ever having
 * opened it, and that would turn the read check into a lie.
 */
function codexItemInput(item) {
    if (item.type === 'command_execution') {
        return item.command ?? null;
    }
    if (item.type === 'mcp_tool_call') {
        return { arguments: item.arguments, server: item.server, tool: item.tool };
    }
    return item.changes ?? item.path ?? item.query ?? null;
}

function codexUsage(usage) {
    if (!usage) {
        return null;
    }
    const inputTokens = usage.input_tokens ?? 0;
    const outputTokens = usage.output_tokens ?? 0;
    return {
        cacheReadTokens: usage.cached_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_write_input_tokens ?? 0,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
    };
}
