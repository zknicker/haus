import type {
    CloudAgentBranch,
    CloudAgentRunModel,
    CloudAgentStatus,
    CloudAgentUnreadyReason,
    CloudAgentUsage,
} from '@haus/api';

export type { CloudAgentUnreadyReason };

export type CloudAgentReadiness =
    | { account: { email: string | null; expiresAt: string | null }; ready: true }
    | { ready: false; reason: CloudAgentUnreadyReason };

/** Everything a provider needs to address one Run it is already hosting. */
export interface CloudAgentRunRef {
    providerAgentId: string | null;
    providerRunId: string | null;
    runId: string;
    workId: string;
}

/** One provider parameter value, under the provider's own parameter id. */
export interface CloudAgentModelParamValue {
    id: string;
    value: string;
}

/** The model a Run sends: a provider model id and the parameters chosen for it. */
export interface CloudAgentModelSelection {
    id: string;
    params: CloudAgentModelParamValue[];
}

/**
 * One raw entry of the provider's model catalog, before Haus maps it. Cursor
 * lists parameters per model and precomputes variants, one marked default.
 */
export interface CloudAgentModelListing {
    description?: string | null;
    displayName: string;
    id: string;
    parameters?: Array<{
        displayName?: string | null;
        id: string;
        values: Array<{ displayName?: string | null; value: string }>;
    }>;
    variants?: Array<{ isDefault?: boolean; params: CloudAgentModelParamValue[] }>;
}

export interface CloudAgentStartInput {
    /** Haus's own Run id, handed to the provider as its idempotency key. */
    idempotencyKey: string;
    /** The work the provider-hosted agent performs. It never reaches Server. */
    instructions: string;
    /** The model Server resolved for this Run (`default` is Auto); `null` sends none. */
    model: CloudAgentModelSelection | null;
    ref: string | null;
    repository: string;
    title: string;
}

export interface CloudAgentLaunch {
    providerAgentId: string;
    providerRunId: string;
    providerUrl: string | null;
    status: CloudAgentStatus;
}

export interface CloudAgentSendInput {
    idempotencyKey: string;
    instructions: string;
    /** The model Server resolved for this Run (`default` is Auto); `null` sends none. */
    model: CloudAgentModelSelection | null;
    providerAgentId: string;
}

/** One bounded provider reading, before Haus's own work and Run identities. */
export interface CloudAgentProviderObservation {
    activity?: { at: string; summary: string };
    branches?: CloudAgentBranch[];
    errorCode?: string;
    observedAt: string;
    providerAgentId?: string;
    providerRunId?: string;
    providerUrl?: string;
    rawStatus?: string;
    status: CloudAgentStatus;
    summary?: string;
    usage?: CloudAgentUsage;
}

/**
 * Computer-local access to one Cloud Agent provider. Everything above this
 * boundary — the Agent CLI, the Server record, the durable events — is
 * provider-neutral; everything below it, including credentials, prompts, and
 * raw provider status mapping, belongs to the adapter.
 *
 * `subscribe` is the live edge and `read` is reconciliation: Haus reads a Run
 * on reconnect, restart, and after a missed event, and never polls a Run it has
 * already settled.
 */
export interface CloudAgentProvider {
    cancel(ref: CloudAgentRunRef, signal?: AbortSignal): Promise<void>;
    /**
     * Runs the provider's own browser sign-in on this Computer and stores the
     * credential where the provider keeps it. Only an explicit human action in
     * Computer settings reaches this; an Agent turn never does.
     */
    connect(options?: {
        onLoginUrl?: (url: string) => void;
        signal?: AbortSignal;
    }): Promise<CloudAgentReadiness>;
    /** Forgets the stored credential. The provider-side key stays revocable. */
    disconnect(): Promise<CloudAgentReadiness>;
    /** The provider's raw model catalog for the connected account. */
    listModels(): Promise<CloudAgentModelListing[]>;
    readonly provider: 'cursor';
    read(ref: CloudAgentRunRef, signal?: AbortSignal): Promise<CloudAgentProviderObservation>;
    readiness(): Promise<CloudAgentReadiness>;
    send(input: CloudAgentSendInput): Promise<CloudAgentLaunch>;
    start(input: CloudAgentStartInput): Promise<CloudAgentLaunch>;
    subscribe(
        ref: CloudAgentRunRef,
        onObservation: (observation: CloudAgentProviderObservation) => void,
        signal: AbortSignal
    ): Promise<void>;
}

/**
 * The provider's definite refusal of a `start` or `send`: resending the same
 * request cannot succeed. The message is the provider's own words. Any other
 * error from `start` or `send` is retryable under the same idempotency key.
 */
export class CloudAgentLaunchRejectedError extends Error {
    override readonly name = 'CloudAgentLaunchRejectedError';
    /** The provider's own error code, when it reported one. */
    readonly providerCode: string | null;

    constructor(message: string, options: { providerCode?: string | null } = {}) {
        super(message);
        this.providerCode = options.providerCode ?? null;
    }
}

export class CloudAgentProviderUnavailableError extends Error {
    readonly reason: CloudAgentUnreadyReason;

    constructor(reason: CloudAgentUnreadyReason) {
        super(cloudAgentUnreadyMessage(reason));
        this.name = 'CloudAgentProviderUnavailableError';
        this.reason = reason;
    }
}

/** The one place an unready reason becomes words a human reads. */
export function cloudAgentUnreadyMessage(reason: CloudAgentUnreadyReason): string {
    switch (reason) {
        case 'not-connected':
            return 'This Computer has no Cloud Agent credential. Connect the provider in Computer settings.';
        case 'expired':
            return "This Computer's Cloud Agent credential expired. Reconnect the provider in Computer settings.";
        case 'provider-unavailable':
            return 'This Computer cannot reach the Cloud Agent provider.';
    }
}

/** The provider selection for a Run's recorded model: Haus names map back to provider ids. */
export function cloudAgentModelSelectionOf(
    model: CloudAgentRunModel | undefined
): CloudAgentModelSelection | null {
    if (!model?.id) {
        return null;
    }
    return {
        id: model.id,
        params: model.params.map((param) => ({ id: param.providerParamId, value: param.value })),
    };
}

/**
 * The provider a Computer reports until a real adapter is installed. It is
 * truthfully not ready, so a launch fails before any Message is created.
 */
export function unavailableCloudAgentProvider(): CloudAgentProvider {
    const unavailable = () => {
        throw new CloudAgentProviderUnavailableError('provider-unavailable');
    };
    return {
        cancel: () => Promise.resolve(),
        connect: () =>
            Promise.reject(new CloudAgentProviderUnavailableError('provider-unavailable')),
        disconnect: () =>
            Promise.resolve({ ready: false, reason: 'provider-unavailable' as const }),
        listModels: () =>
            Promise.reject(new CloudAgentProviderUnavailableError('provider-unavailable')),
        provider: 'cursor',
        read: () => Promise.reject(new CloudAgentProviderUnavailableError('provider-unavailable')),
        readiness: () => Promise.resolve({ ready: false, reason: 'provider-unavailable' as const }),
        send: () => Promise.reject(new CloudAgentProviderUnavailableError('provider-unavailable')),
        start: () => Promise.reject(new CloudAgentProviderUnavailableError('provider-unavailable')),
        subscribe: () => unavailable(),
    };
}
