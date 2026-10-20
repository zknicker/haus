import type {
    OpenSessionOptions,
    RuntimeDriverFactory,
    RuntimeDriverOptions,
    RuntimeSession,
    RuntimeTurn,
    SteerResult,
} from '../driver.ts';
import type { RuntimeResumeState } from '../resume-state.ts';
import type { RuntimeTokenUsage, TurnEvent } from '../turn-event.ts';

/**
 * An in-memory `RuntimeDriver` for executor and launch tests: no process, no protocol, only the
 * contract. A test scripts what it needs (each turn's `TurnEvent`s, open failures, steer results,
 * parked states) and reads back what the executor asked of the driver.
 */
export interface FakeRuntimeScript<Input> {
    /** The driver's bootstrap fingerprint; `'fake-bootstrap'` unless set. */
    readonly bootstrapFingerprint?: string | null;
    destroy?(): void;
    detach?(count: number): RuntimeResumeState | Promise<RuntimeResumeState>;
    /** Runs on every open, before the session exists; throw to fail the open. */
    open?(
        options: FakeOpen & { readonly signal?: AbortSignal },
        launch: FakeLaunch<Input>
    ): void | Promise<void>;
    refreshBootstrap?(options: { sessionId: string }): Promise<void>;
    /** The runtime's own session id; the requested Haus session id unless set. */
    readonly sessionId?: string;
    steer?(text: string): Promise<SteerResult> | SteerResult;
    stop?(count: number): RuntimeResumeState | Promise<RuntimeResumeState>;
    /** One turn's events; a finished turn with no usage unless set. */
    turn?(context: FakeTurnContext<Input>): AsyncIterable<TurnEvent> | Iterable<TurnEvent>;
    unconsumedSteers?(): readonly string[];
}

export interface FakeLaunch<Input> {
    readonly input: Input;
    readonly options: RuntimeDriverOptions;
}

export interface FakeOpen {
    readonly resumeFrom: RuntimeResumeState | undefined;
    readonly sessionId: string;
}

export interface FakeTurnContext<Input> {
    readonly input: Input;
    readonly isResume: boolean;
    readonly prompt: string;
    readonly signal: AbortSignal;
}

/** Everything the executor asked of the fake, in order. */
export interface FakeRuntimeRecord<Input> {
    readonly counts: { destroy: number; detach: number; refresh: number; stop: number };
    readonly launches: FakeLaunch<Input>[];
    readonly opens: FakeOpen[];
    readonly prompts: string[];
    readonly steers: string[];
}

export const fakeParkedState: RuntimeResumeState = {
    runtime: 'codex',
    threadId: 'native_session_1',
    version: 1,
};

export function fakeRuntimeDriver<Input extends { readonly runtimeId: string }>(
    script: FakeRuntimeScript<Input> = {}
): { factory: RuntimeDriverFactory<Input>; record: FakeRuntimeRecord<Input> } {
    const record: FakeRuntimeRecord<Input> = {
        counts: { destroy: 0, detach: 0, refresh: 0, stop: 0 },
        launches: [],
        opens: [],
        prompts: [],
        steers: [],
    };
    const factory: RuntimeDriverFactory<Input> = (input, options) => {
        const launch = { input, options };
        record.launches.push(launch);
        return {
            bootstrapFingerprint: async () =>
                script.bootstrapFingerprint === undefined
                    ? 'fake-bootstrap'
                    : script.bootstrapFingerprint,
            openSession: async ({ resumeFrom, sessionId, signal }: OpenSessionOptions) => {
                record.opens.push({ resumeFrom, sessionId });
                await script.open?.({ resumeFrom, sessionId, signal }, launch);
                return fakeSession(script, record, {
                    input,
                    isResume: Boolean(resumeFrom),
                    sessionId: script.sessionId ?? sessionId,
                });
            },
            refreshBootstrap: async ({ sessionId }) => {
                record.counts.refresh += 1;
                await script.refreshBootstrap?.({ sessionId });
            },
            runtimeId: input.runtimeId,
        };
    };
    return { factory, record };
}

/** A turn that finished with this usage on its one step. */
export function finishedTurn(
    usage: RuntimeTokenUsage | null = null,
    contextTokens: number | null = usage?.inputTokens ?? null
): TurnEvent[] {
    return [
        { contextTokens, type: 'step-finish', usage },
        { claudePlanUsage: null, type: 'turn-finish', usage },
    ];
}

function fakeSession<Input>(
    script: FakeRuntimeScript<Input>,
    record: FakeRuntimeRecord<Input>,
    session: { input: Input; isResume: boolean; sessionId: string }
): RuntimeSession {
    return {
        destroy: async () => {
            record.counts.destroy += 1;
            script.destroy?.();
        },
        detach: async () => {
            record.counts.detach += 1;
            return (await script.detach?.(record.counts.detach)) ?? fakeParkedState;
        },
        isResume: session.isResume,
        sessionId: session.sessionId,
        startTurn: async ({ prompt, signal }): Promise<RuntimeTurn> => {
            record.prompts.push(prompt);
            const context = { input: session.input, isResume: session.isResume, prompt, signal };
            const events = script.turn?.(context) ?? finishedTurn();
            const drained = Promise.withResolvers<void>();
            let started = false;
            return {
                events: (async function* () {
                    started = true;
                    try {
                        yield* events;
                    } finally {
                        drained.resolve();
                    }
                })(),
                settle: () => (started ? drained.promise : Promise.resolve()),
                unconsumedSteers: () => script.unconsumedSteers?.() ?? [],
            };
        },
        steer: async (text) => {
            record.steers.push(text);
            return (await script.steer?.(text)) ?? { delivered: true };
        },
        stop: async () => {
            record.counts.stop += 1;
            return (await script.stop?.(record.counts.stop)) ?? fakeParkedState;
        },
    };
}
