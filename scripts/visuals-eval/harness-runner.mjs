// The harness lane: the same agent the Computer executor builds.
//
// This is what Haus actually runs, so it stays the eval's default. The bridge
// installs and pins its own copy of each runtime, which is the whole reason the
// direct lane exists beside it — a pinned bridge can reject a model id the
// installed CLI already accepts.
import path from 'node:path';
import { makeDaemonRuntime } from '../../apps/computer/src/daemon-runtime.ts';
import { bridgeStoreDirForHost } from '../../apps/computer/src/harness/bridge-bootstrap.ts';
import { createHarnessAgent } from '../../apps/computer/src/harness/create-agent.ts';
import { createHarnessForRuntime } from '../../apps/computer/src/harness/executor.ts';
import { readTokenUsage } from '../../apps/computer/src/harness/token-usage.ts';
import { evalInstructions } from './instructions.mjs';

/**
 * Builds the runner for `--runner harness`. `runTurn` answers the same shape
 * the direct runner does, so the run script never branches on the lane.
 */
export const createHarnessRunner = ({
    executable,
    homeDir,
    modelId,
    reasoningEffort,
    runtimeId,
    workspaceDir,
}) => {
    const runtime = makeDaemonRuntime();
    const agent = createHarnessAgent(
        {
            agentId: 'agt_visuals_eval',
            env: { PATH: [path.dirname(executable.path), executable.searchPath].join(':') },
            homeDir,
            modelId,
            runtime,
            runtimeId,
            tools: {},
            webAccess: null,
            workspaceDir,
        },
        {
            harness: createHarnessForRuntime(
                runtimeId,
                reasoningEffort,
                false,
                bridgeStoreDirForHost()
            ),
            instructions: evalInstructions,
        }
    );

    return {
        dispose: () => runtime.dispose(),
        runTurn: ({ prompt, timeoutMs }) => runTurn({ agent, prompt, timeoutMs }),
    };
};

async function runTurn({ agent, prompt, timeoutMs }) {
    const session = await agent.createSession({ sessionId: crypto.randomUUID() });
    const trace = [];
    let usage = null;
    let streamError = null;
    try {
        const result = await agent.stream({
            abortSignal: AbortSignal.timeout(timeoutMs),
            prompt,
            session,
        });
        for await (const part of result.fullStream) {
            if (part.type === 'tool-call') {
                trace.push({
                    at: new Date().toISOString(),
                    input: JSON.stringify(part.input ?? null).slice(0, 400),
                    name: part.toolName,
                });
            } else if (part.type === 'finish') {
                usage = readTokenUsage(part.totalUsage);
            } else if (part.type === 'error') {
                streamError ??= part.error;
            }
        }
        if (streamError) {
            throw streamError;
        }
        // The bridge surfaces a failure as a stream error, so there is no
        // stderr of its own to keep; the field stays for the shared shape.
        return { costUsd: null, stderr: '', text: await result.text, trace, usage };
    } finally {
        await session.destroy();
    }
}
