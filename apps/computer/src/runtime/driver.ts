import type { RuntimeResumeState } from './resume-state.ts';
import type { TurnEvent } from './turn-event.ts';

/**
 * One execution runtime (Claude Code, Codex) bound to one Worker turn's launch facts: model,
 * checkout, env, and the machine user's HOME. The contract is normative in
 * specs/runtime-drivers.md.
 */
export interface RuntimeDriver {
    /** Opens a fresh session, or resumes `resumeFrom` (a native resume, never a replay). */
    openSession(options: OpenSessionOptions): Promise<RuntimeSession>;
}

export interface OpenSessionOptions {
    resumeFrom: RuntimeResumeState | undefined;
    /** Haus's id for the session (the Worker id). */
    sessionId: string;
    signal?: AbortSignal;
}

/** A live native session. Turns run on it one at a time, and a running turn takes steering. */
export interface RuntimeSession {
    /** Tears the session down without producing resume state; used after a failed turn. */
    destroy(): Promise<void>;
    /** Whether `openSession` resumed stored state rather than starting fresh. */
    readonly isResume: boolean;
    /** The runtime's own session id, which the next turn resumes. */
    readonly sessionId: string;
    /** Starts a turn. Its events end at the turn's settlement event. */
    startTurn(options: { prompt: string; signal: AbortSignal }): Promise<RuntimeTurn>;
    /** Delivers text into the running turn at the runtime's next safe boundary. */
    steer(text: string): Promise<SteerResult>;
    /** Ends the native process and returns the state the next open resumes from. */
    stop(): Promise<RuntimeResumeState>;
}

export interface RuntimeTurn {
    readonly events: AsyncIterable<TurnEvent>;
    /**
     * Drains the turn to the runtime's idle boundary. A cancelled turn must reach it before the
     * session stops, or the stored state carries a turn the next prompt cannot start over.
     */
    settle(): Promise<void>;
    /**
     * Steering text the runtime acknowledged (`delivered`) with no evidence the model received
     * it: a Stop cancelled it, or it was still queued when the turn ended. Read once the events
     * end.
     */
    unconsumedSteers(): readonly string[];
}

/**
 * `unsupported`: the runtime cannot steer. `idle`: no turn is running to receive it.
 * `failed`: a running turn refused it.
 */
export type SteerResult =
    | { readonly delivered: true }
    | { readonly delivered: false; readonly reason: 'idle' | 'unsupported' }
    | { readonly delivered: false; readonly error: unknown; readonly reason: 'failed' };
