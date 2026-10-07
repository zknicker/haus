// The turn runner: the same harness agent the Computer executor builds.
//
// This is what Haus actually runs, so it is the lab's only lane. The bridge
// installs and pins its own copy of each runtime, which means a lab result is a
// judgement about the product rather than about whichever CLI happens to be
// installed on this Mac.
import path from 'node:path';
import { makeDaemonRuntime } from '../../../apps/computer/src/daemon-runtime.ts';
import { bridgeStoreDirForHost } from '../../../apps/computer/src/harness/bridge-bootstrap.ts';
import { createHarnessAgent } from '../../../apps/computer/src/harness/create-agent.ts';
import { createHarnessForRuntime } from '../../../apps/computer/src/harness/runtime-harness.ts';
import { readTokenUsage } from '../../../apps/computer/src/harness/token-usage.ts';
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
    const agent = createHarnessAgent(
        {
            agentId: 'agt_visuals_lab',
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
                bridgeStoreDirForHost(),
                modelId
            ),
            instructions: labInstructions,
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
        // stderr of its own to keep; the field stays because the trace writer
        // records one when there is one.
        return { costUsd: null, stderr: '', text: await result.text, trace, usage };
    } finally {
        await session.destroy();
    }
}
