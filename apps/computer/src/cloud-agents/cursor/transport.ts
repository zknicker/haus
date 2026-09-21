/**
 * The seam between the Cursor adapter and `@cursor/sdk`. Every SDK type stops
 * here: the adapter above works in these provider-native but Haus-owned
 * shapes, so status mapping, readiness, and observation bounding are testable
 * against recorded provider responses with no network and no SDK install.
 */

/** Cursor's own Run lifecycle vocabulary, preserved verbatim as `rawStatus`. */
export const cursorRunStatuses = [
    'QUEUED',
    'CREATING',
    'RUNNING',
    'FINISHED',
    'ERROR',
    'CANCELLED',
    'EXPIRED',
] as const;

export type CursorRunStatus = (typeof cursorRunStatuses)[number];

export function isCursorRunStatus(value: string): value is CursorRunStatus {
    return (cursorRunStatuses as readonly string[]).includes(value);
}

/** One provider Run, addressed the way Cursor's cloud API addresses it. */
export interface CursorRunAddress {
    agentId: string;
    runId: string;
}

export interface CursorBranchReading {
    branch: string | null;
    prUrl: string | null;
    repoUrl: string;
}

export interface CursorUsageReading {
    /** Charged cents, as Cursor reports them. Absent until billing lands. */
    chargedCents: number | null;
    inputTokens: number;
    outputTokens: number;
}

/**
 * One Run as Cursor reports it. `rawStatus` is Cursor's own string. A Run read
 * through the public SDK collapses `EXPIRED` into the normalized `error`
 * status, so a read reports `expired` only when the terminal error identifies
 * expiry; the per-Run event stream carries the unambiguous raw status.
 */
export interface CursorRunReading {
    branches: CursorBranchReading[];
    errorCode: string | null;
    errorMessage: string | null;
    rawStatus: CursorRunStatus;
    result: string | null;
    runId: string;
    usage: CursorUsageReading | null;
}

export interface CursorLaunchReading {
    agentId: string;
    reading: CursorRunReading;
}

export interface CursorStartInput {
    /** Haus's own Run id, handed to Cursor as its Agent and Send idempotency key. */
    idempotencyKey: string;
    instructions: string;
    ref: string | null;
    /** `owner/name`, as Haus records it. The transport builds the clone URL. */
    repository: string;
    title: string;
}

export interface CursorSendInput {
    agentId: string;
    idempotencyKey: string;
    instructions: string;
}

/** What a Cursor credential resolves to, without ever carrying the key. */
export type CursorAuth =
    | { connected: false; reason: 'expired' | 'not-connected' }
    | { connected: true; email: string | null; expiresAt: string | null };

/**
 * One live event from a Run's stream. A stream reports progress and Cursor's
 * own raw status; it never reports settlement, because the SDK's stream handle
 * can end for client-side reasons — its own wait deadline, an abort — while the
 * hosted Run is still working. `detached` says the live edge is gone, and the
 * adapter reconciles by reading the Run.
 */
export type CursorRunEvent =
    | { kind: 'activity'; summary: string }
    | { kind: 'detached' }
    | { kind: 'status'; rawStatus: CursorRunStatus };

export function isTerminalCursorRunStatus(status: CursorRunStatus): boolean {
    return (
        status === 'FINISHED' ||
        status === 'ERROR' ||
        status === 'CANCELLED' ||
        status === 'EXPIRED'
    );
}

export interface CursorTransport {
    authStatus(): Promise<CursorAuth>;
    cancelRun(address: CursorRunAddress, signal?: AbortSignal): Promise<void>;
    /** Cursor's browser sign-in. Only a human action in settings reaches this. */
    login(options: {
        onLoginUrl?: (url: string) => void;
        signal?: AbortSignal;
    }): Promise<CursorAuth>;
    logout(): Promise<void>;
    readRun(address: CursorRunAddress, signal?: AbortSignal): Promise<CursorRunReading>;
    /** Starts another Run on the existing provider Agent; never creates an Agent. */
    send(input: CursorSendInput): Promise<CursorLaunchReading>;
    /** Creates the provider Agent and performs the first send that hosts the Run. */
    start(input: CursorStartInput): Promise<CursorLaunchReading>;
    streamRun(
        address: CursorRunAddress,
        onEvent: (event: CursorRunEvent) => Promise<void>,
        signal: AbortSignal
    ): Promise<void>;
}

/**
 * Thrown when `@cursor/sdk` itself cannot be loaded or reached on this
 * Computer, which is a different fact from a missing credential.
 */
export class CursorTransportUnavailableError extends Error {
    constructor(cause: unknown) {
        super(
            `The Cursor SDK is unavailable on this Computer: ${
                cause instanceof Error ? cause.message : String(cause)
            }`
        );
        this.name = 'CursorTransportUnavailableError';
    }
}
