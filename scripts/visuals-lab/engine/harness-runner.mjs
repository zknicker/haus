// The turn runner: the Agent runner's own harnesses, the lane Haus ships.
//
// Claude models run on the Claude Agent SDK and every other model on Pi,
// picked by `harnessFor` exactly as the runner picks them, on a Model
// connection the dev Server holds (lab-connection.mjs). Tools run on the
// Computer's invocation runners in process (lab-tools.mjs). So a lab result is
// a judgement about the product: the same harness options, tool bridge, and
// model login an Agent turn gets, with only the instructions swapped for the
// lab's (instructions.mjs).
import path from 'node:path';
import { createHarnesses } from '../../../apps/runner/src/turn/harnesses.ts';
import { harnessFor } from '../../../apps/runner/src/turn/runtime-driver.ts';
import { openLabConnection } from './lab-connection.mjs';
import { createLabTools } from './lab-tools.mjs';

/** Builds the runner one lab run drives: one `runTurn` per battery prompt. */
export async function createHarnessRunner({
    agentId,
    agentsRoot,
    instructions,
    modelId,
    reasoningEffort,
    repositoryRoot,
    runnerRoot,
    skillListing,
}) {
    const login = await openLabConnection({ modelId, repositoryRoot });
    const harnesses = createHarnesses({
        agentBusy: () => false,
        book: login.book,
        link: login.link,
        log: (line) => process.stderr.write(`${line}\n`),
        maxWarm: 1,
    });
    const runId = crypto.randomUUID();
    const driver = harnesses.factory({
        agentDir: path.join(runnerRoot, agentId),
        agentId,
        connection: login.connection,
        instructions,
        modelId,
        reasoningEffort,
        runId,
        sessionGeneration: 1,
        skillListing,
        tools: createLabTools({ agentId, agentsRoot, runId }),
    });

    return {
        connectionLabel: login.connection.label,
        dispose: async () => {
            await harnesses.close();
            await login.close();
        },
        harness: harnessFor(modelId),
        runTurn: ({ prompt, timeoutMs }) => runTurn({ driver, prompt, timeoutMs }),
    };
}

async function runTurn({ driver, prompt, timeoutMs }) {
    const signal = AbortSignal.timeout(timeoutMs);
    // A fresh session per prompt, so no battery item sees another's conversation.
    const session = await driver.openSession({
        resumeFrom: undefined,
        sessionId: crypto.randomUUID(),
        signal,
    });
    const trace = [];
    const failures = [];
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
            } else if (event.type === 'session-failure') {
                failures.push(`${event.severity} ${event.category}: ${event.title}`);
                if (event.severity === 'error' || event.category === 'access') {
                    streamError ??= new Error(event.title);
                }
            } else if (event.type === 'error') {
                streamError ??= event.error;
            } else if (event.type === 'abort') {
                streamError ??= new Error(`turn timed out after ${timeoutMs}ms`);
            }
        }
        await turn.settle();
        if (streamError) {
            throw streamError;
        }
        // Session failures that did not end the turn, such as a capacity warning,
        // show up nowhere else, so they ride the trace file's stderr record.
        return { costUsd: null, stderr: failures.join('\n'), text, trace, usage };
    } finally {
        await session.destroy();
    }
}
