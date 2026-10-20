import { basename } from 'node:path';
import { HarnessCapabilityUnsupportedError, type HarnessV1 } from '@ai-sdk/harness';
import type {
    HarnessAgent,
    HarnessAgentResumeSessionState,
    HarnessAgentSession,
} from '@ai-sdk/harness/agent';
import type { ToolSet } from '@ai-sdk/provider-utils';
import {
    fingerprintHarnessBootstrap,
    refreshHarnessBootstrap,
} from '../harness/bootstrap-refresh.ts';
import { bridgeStoreDirForHost } from '../harness/bridge-bootstrap.ts';
import { createHarnessAgent, sandboxOptions } from '../harness/create-agent.ts';
import type { HarnessTurnInput } from '../harness/executor.ts';
import { createHarnessForRuntime } from '../harness/runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from '../harness/sandbox.ts';
import { toAiSdkToolSet } from '../host-tools/ai-sdk-tool-set.ts';
import { aiSdkTurnEvents } from './ai-sdk-turn-events.ts';
import type {
    RuntimeDriverFactory as HausRuntimeDriverFactory,
    RuntimeSession,
    RuntimeTurn,
    SteerResult,
} from './driver.ts';
import type { RuntimeResumeState } from './resume-state.ts';
import type { TurnEvent } from './turn-event.ts';

/**
 * TEMPORARY: runs today's AI SDK `HarnessAgent` behind the Haus runtime contract, so the executor
 * and every stream consumer already speak `TurnEvent`. Each runtime moves to a Haus driver in its
 * own phase; this module, `ai-sdk-turn-events.ts`, and the `@ai-sdk/*` dependencies go with the
 * last one (specs/runtime-drivers.md).
 */
export type HarnessAgentFactory = (
    input: HarnessAgentInput,
    options: { harness: HarnessV1<ToolSet>; instructions: string }
) => Pick<HarnessAgent, 'createSession' | 'stream'>;

/** The turn input as the Harness Agent sees it: launch env applied, host tools as AI SDK tools. */
export type HarnessAgentInput = Omit<HarnessTurnInput, 'tools'> & { tools: ToolSet };

type RuntimeDriverFactory = HausRuntimeDriverFactory<HarnessTurnInput>;

/** Wraps a Harness Agent factory; tests inject a fake Agent through this seam. */
export function aiSdkDriverFactory(agentFactory: HarnessAgentFactory): RuntimeDriverFactory {
    return (input, options) => {
        const harness = createHarnessForRuntime(
            input.runtimeId,
            input.reasoningEffort,
            bridgeStoreDirForHost(),
            input.modelId
        );
        const agent = agentFactory(
            { ...input, env: options.env, tools: toAiSdkToolSet(input.tools) },
            { harness, instructions: options.instructions }
        );
        return {
            bootstrapFingerprint: (signal) =>
                fingerprintHarnessBootstrap({ abortSignal: signal, harness }),
            openSession: async ({ resumeFrom, sessionId, signal }) => {
                const live = await agent.createSession({
                    abortSignal: signal,
                    resumeFrom: resumeFrom as HarnessAgentResumeSessionState | undefined,
                    sessionId,
                });
                return wrapHarnessSession(agent, live);
            },
            refreshBootstrap: ({ sessionId, signal }) =>
                harnessBootstrapRefresh({
                    abortSignal: signal,
                    harness,
                    provider: createLocalTrustedSandboxProvider(sandboxOptions(input)),
                    sessionId,
                    workDir: basename(input.workspaceDir),
                }),
            runtimeId: input.runtimeId,
        };
    };
}

/** The production driver factory while the harness path is live. */
export const createAiSdkRuntimeDriver: RuntimeDriverFactory =
    aiSdkDriverFactory(createHarnessAgent);

/** One live Harness Agent session as a `RuntimeSession`. */
export function wrapHarnessSession(
    agent: HarnessTurnStreamer,
    live: HarnessAgentSession
): RuntimeSession {
    return {
        destroy: () => live.destroy(),
        detach: async () => (await live.detach()) as RuntimeResumeState,
        isResume: live.isResume,
        sessionId: live.sessionId,
        steer: (text) => steerHarnessTurn(live, text),
        startTurn: async ({ prompt, signal }): Promise<RuntimeTurn> => {
            const turn = await agent.stream({ abortSignal: signal, prompt, session: live });
            return {
                events: turnEvents(turn.fullStream),
                settle: () => Promise.resolve(turn.consumeStream()),
            };
        },
        stop: async () => (await live.stop()) as RuntimeResumeState,
    };
}

/** Any Harness Agent's `stream`, whatever its builtin tool set. */
interface HarnessTurnStreamer {
    stream(options: {
        abortSignal?: AbortSignal;
        prompt: string;
        session: HarnessAgentSession;
    }): PromiseLike<{ consumeStream(): PromiseLike<void>; fullStream: AsyncIterable<unknown> }>;
}

async function steerHarnessTurn(
    live: Pick<HarnessAgentSession, 'experimental_steerTurn' | 'hasUnfinishedTurn'>,
    text: string
): Promise<SteerResult> {
    try {
        await live.experimental_steerTurn(text);
        return { delivered: true };
    } catch (error) {
        if (HarnessCapabilityUnsupportedError.isInstance(error)) {
            return { delivered: false, reason: 'unsupported' };
        }
        return live.hasUnfinishedTurn()
            ? { delivered: false, error, reason: 'failed' }
            : { delivered: false, reason: 'idle' };
    }
}

async function* turnEvents(parts: AsyncIterable<unknown>): AsyncGenerator<TurnEvent> {
    for await (const part of parts) {
        yield* aiSdkTurnEvents(part);
    }
}

type HarnessBootstrapRefresh = typeof refreshHarnessBootstrap;
let harnessBootstrapRefresh: HarnessBootstrapRefresh = refreshHarnessBootstrap;

export function setHarnessBootstrapRefreshForTesting(refresh: HarnessBootstrapRefresh) {
    const previous = harnessBootstrapRefresh;
    harnessBootstrapRefresh = refresh;
    return () => {
        harnessBootstrapRefresh = previous;
    };
}
