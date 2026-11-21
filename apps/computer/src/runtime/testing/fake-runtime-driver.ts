import type {
    OpenSessionOptions,
    RuntimeDriver,
    RuntimeSession,
    RuntimeTurn,
    SteerResult,
} from '../driver.ts';
import type { RuntimeResumeState } from '../resume-state.ts';
import type { RuntimeTokenUsage, TurnEvent } from '../turn-event.ts';

/**
 * An in-memory `RuntimeDriver` for Worker launch tests: no process, no protocol, only the
 * contract. A test scripts what it needs (each turn's `TurnEvent`s, open failures, steer results,
 * stopped states) and reads back what the Worker asked of the driver.
 */
export interface FakeRuntimeScript<Input> {
    destroy?(): void;
    /** Runs on every open, before the session exists; throw to fail the open. */
    open?(
        options: FakeOpen & { readonly signal?: AbortSignal },
        launch: FakeLaunch<Input>
    ): void | Promise<void>;
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
}

export interface FakeOpen {
    readonly resumeFrom: RuntimeResumeState | undefined;
    readonly sessionId: string;
}

export interface FakeTurnContext<Input> {
    readonly input: Input;
    readonly onQuestion: OpenSessionOptions['onQuestion'];
    readonly isResume: boolean;
    readonly prompt: string;
    readonly signal: AbortSignal;
}

/** Everything the Worker asked of the fake, in order. */
export interface FakeRuntimeRecord<Input> {
    readonly counts: { destroy: number; stop: number };
    readonly launches: FakeLaunch<Input>[];
    readonly opens: FakeOpen[];
    readonly prompts: string[];
    readonly steers: string[];
}

export const fakeStoppedState: RuntimeResumeState = {
    runtime: 'codex',
    threadId: 'native_session_1',
    version: 1,
};

export function fakeRuntimeDriver<Input>(script: FakeRuntimeScript<Input> = {}) {
    const record: FakeRuntimeRecord<Input> = {
        counts: { destroy: 0, stop: 0 },
        launches: [],
        opens: [],
        prompts: [],
        steers: [],
    };
    const factory = (input: Input) => {
        const launch = { input };
        record.launches.push(launch);
        return {
            openSession: async ({
                onQuestion,
                resumeFrom,
                sessionId,
                signal,
            }: OpenSessionOptions) => {
                record.opens.push({ resumeFrom, sessionId });
                await script.open?.({ resumeFrom, sessionId, signal }, launch);
                return fakeSession(script, record, {
                    input,
                    isResume: Boolean(resumeFrom),
                    onQuestion,
                    sessionId: script.sessionId ?? sessionId,
                });
            },
        } satisfies RuntimeDriver;
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
        { type: 'turn-finish', usage },
    ];
}

function fakeSession<Input>(
    script: FakeRuntimeScript<Input>,
    record: FakeRuntimeRecord<Input>,
    session: {
        input: Input;
        isResume: boolean;
        onQuestion: OpenSessionOptions['onQuestion'];
        sessionId: string;
    }
): RuntimeSession {
    return {
        destroy: async () => {
            record.counts.destroy += 1;
            script.destroy?.();
        },
        isResume: session.isResume,
        sessionId: session.sessionId,
        startTurn: async ({ prompt, signal }): Promise<RuntimeTurn> => {
            record.prompts.push(prompt);
            const context = {
                input: session.input,
                isResume: session.isResume,
                onQuestion: session.onQuestion,
                prompt,
                signal,
            };
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
            return (await script.stop?.(record.counts.stop)) ?? fakeStoppedState;
        },
    };
}
