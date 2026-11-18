// The turn runner: the same runtime driver the Computer executor builds.
//
// This is what Haus actually runs, so it is the lab's only lane. Claude Code and
// Codex run the pinned CLI their driver installs, so a lab result is a judgement
// about the product rather than about whichever CLI happens to be installed on
// this Mac; Grok Build runs the operator's installed `grok`, as Haus does.
import path from 'node:path';
import { makeDaemonRuntime } from '../../../apps/computer/src/daemon-runtime.ts';
import { createDriver } from '../../../apps/computer/src/runtime/driver-factory.ts';
import {
    closeRuntimeContext,
    openRuntimeContext,
} from '../../../apps/computer/src/runtime/runtime-context.ts';
import { labInstructions } from './instructions.mjs';

/** Builds the runner one lab run drives: one `runTurn` per battery prompt. */
export const createHarnessRunner = ({
    executable,
    homeDir,
    modelId,
    reasoningEffort,
    runtimeId,
    workspaceDir,
}) => {
    const runtime = makeDaemonRuntime();
    const context = openRuntimeContext(runtime);
    const driver = createDriver(
        {
            agentRoot: path.dirname(workspaceDir),
            homeDir,
            modelId,
            reasoningEffort,
            runtimeId,
            tools: [],
            workspaceDir,
        },
        {
            env: { PATH: [path.dirname(executable.path), executable.searchPath].join(':') },
            instructions: labInstructions,
        },
        context
    );

    return {
        dispose: async () => {
            await closeRuntimeContext(runtime);
            await runtime.dispose();
        },
        runTurn: ({ prompt, timeoutMs }) => runTurn({ driver, prompt, timeoutMs }),
    };
};

async function runTurn({ driver, prompt, timeoutMs }) {
    const signal = AbortSignal.timeout(timeoutMs);
    // A fresh session per prompt, so no battery item sees another's conversation.
    const session = await driver.openSession({
        resumeFrom: undefined,
        sessionId: crypto.randomUUID(),
        signal,
    });
    const trace = [];
    let text = '';
    let usage = null;
    let streamError = null;
    try {
        const turn = await session.startTurn({ prompt, signal });
        for await (const event of turn.events) {
            if (event.type === 'tool-call') {
                trace.push({
                    at: new Date().toISOString(),
                    input: JSON.stringify(event.input ?? null).slice(0, 400),
                    name: event.toolName,
                });
            } else if (event.type === 'text-delta') {
                text += event.text;
            } else if (event.type === 'turn-finish') {
                usage = event.usage;
            } else if (event.type === 'error') {
                streamError ??= event.error;
            } else if (event.type === 'abort') {
                streamError ??= new Error(`turn timed out after ${timeoutMs}ms`);
            }
        }
        if (streamError) {
            throw streamError;
        }
        // The driver surfaces a failure as a stream error, so there is no stderr of
        // its own to keep; the field stays because the trace writer records one.
        return { costUsd: null, stderr: '', text, trace, usage };
    } finally {
        await session.destroy();
    }
}
