// The direct lane: the CLIs installed on this machine, driven as subprocesses.
//
// The harness lane runs each model through the product's own bridge, which
// installs and pins its own copy of the runtime. That is what Haus ships, so
// it is the honest default — but a pinned bridge rejects model ids the
// installed CLI already accepts. This lane exists to measure those models:
// same temp agent root, same seeded skills, same instructions, same prompt,
// only the executable and its flags differ.
//
// This module is only the dispatcher; the mechanics the lanes share live in
// direct-cli.mjs.
import { createClaudeLane } from './direct-claude.mjs';
import { hostHomeDir } from './direct-cli.mjs';
import { createCodexLane } from './direct-codex.mjs';

const lanes = {
    'claude-code': createClaudeLane,
    codex: createCodexLane,
};

/** The runtimes this lane can drive; `--runner direct` is refused for the rest. */
export const directRuntimeIds = Object.keys(lanes);

/**
 * Builds the runner for `--runner direct`. The returned `runTurn` answers the
 * same `{ costUsd, stderr, text, trace, usage }` shape the harness runner does,
 * so the run script never branches on which lane produced a turn.
 */
export const createDirectRunner = async (input) => {
    const lane = lanes[input.runtimeId];
    if (!lane) {
        throw new Error(`--runner direct has no lane for runtime "${input.runtimeId}"`);
    }
    const runTurn = await lane({ ...input, hostHomeDir: hostHomeDir() });
    return { dispose: () => Promise.resolve(), runTurn };
};
