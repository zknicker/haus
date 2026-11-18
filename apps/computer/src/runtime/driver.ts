import type { RuntimeResumeState } from './resume-state.ts';
import type { TurnEvent } from './turn-event.ts';

/**
 * One execution runtime (Claude Code, Codex, Grok Build) bound to one Agent turn's launch
 * facts: model, reasoning effort, instructions, isolated HOME, workspace, env, and host tools.
 * The contract is normative in specs/runtime-drivers.md.
 */
export interface RuntimeDriver {
    /**
     * Fingerprints whatever the driver installs before a session runs. A changed fingerprint
     * restarts a resumed session's native process and refreshes the install first; `null`
     * means the driver installs nothing.
     */
    bootstrapFingerprint(signal?: AbortSignal): Promise<string | null>;
    /** Opens a fresh session, or resumes `resumeFrom` (a native resume, never a replay). */
    openSession(options: OpenSessionOptions): Promise<RuntimeSession>;
    /** Re-installs the bootstrap for a parked session before it resumes. */
    refreshBootstrap(options: { sessionId: string; signal: AbortSignal }): Promise<void>;
    readonly runtimeId: string;
}

/** Binds a driver to one turn's launch facts (`Input` is the executor's turn input). */
export type RuntimeDriverFactory<Input> = (
    input: Input,
    options: RuntimeDriverOptions
) => RuntimeDriver;

export interface RuntimeDriverOptions {
    /** The runtime process's launch env; the turn input's own env stays the sandbox's. */
    env: Record<string, string>;
    /** The composed Agent instructions, mounted on the runtime's native instruction layer. */
    instructions: string;
}

export interface OpenSessionOptions {
    resumeFrom: RuntimeResumeState | undefined;
    /** Haus's stable id for the session generation, `<agentId>-<generation>` when cold. */
    sessionId: string;
    signal?: AbortSignal;
}

/**
 * A live native session. One Agent has at most one; turns run on it one at a time, and a
 * running turn takes steering. Parking (`detach`/`stop`) returns the state the next open
 * resumes from.
 */
export interface RuntimeSession {
    /** Tears the session down without producing resume state; used after a failed turn. */
    destroy(): Promise<void>;
    /** Parks the session at an idle boundary, keeping any native process warm when it can. */
    detach(): Promise<RuntimeResumeState>;
    /** Whether `openSession` resumed stored state rather than starting fresh. */
    readonly isResume: boolean;
    /** The runtime's own session id, persisted as the next generation's coordinates. */
    readonly sessionId: string;
    /**
     * Starts a turn. Its events end at the turn's settlement event. A runtime that started a
     * turn on its own to report background work (Claude Code) folds it into this one; when
     * `wake` is set the turn exists for that report, so the adopted turn replaces the prompt.
     */
    startTurn(options: {
        prompt: string;
        signal: AbortSignal;
        wake?: boolean;
    }): Promise<RuntimeTurn>;
    /** Delivers text into the running turn at the runtime's next safe boundary. */
    steer(text: string): Promise<SteerResult>;
    /** Parks the session and ends its native process. */
    stop(): Promise<RuntimeResumeState>;
}

export interface RuntimeTurn {
    readonly events: AsyncIterable<TurnEvent>;
    /**
     * Drains the turn to the runtime's idle boundary. A cancelled turn must reach it before the
     * session parks, or the parked state carries a turn the next prompt cannot start over.
     */
    settle(): Promise<void>;
    /**
     * Steering text the runtime acknowledged (`delivered`) with no evidence the model received
     * it: a Stop cancelled it, or it was still queued when the turn ended. Read once the events
     * end; the executor returns it to the pending-notice path so the next turn gets it.
     */
    unconsumedSteers(): readonly string[];
}

/**
 * `unsupported`: the runtime cannot steer. `idle`: no turn is running to receive it.
 * `failed`: a running turn refused it. Undelivered text stays pending for the next turn.
 */
export type SteerResult =
    | { readonly delivered: true }
    | { readonly delivered: false; readonly reason: 'idle' | 'unsupported' }
    | { readonly delivered: false; readonly error: unknown; readonly reason: 'failed' };
