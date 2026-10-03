import type {
    CursorAuth,
    CursorLaunchReading,
    CursorModelListing,
    CursorRunAddress,
    CursorRunEvent,
    CursorRunReading,
    CursorRunStatus,
    CursorSendInput,
    CursorStartInput,
    CursorTransport,
} from './transport.ts';

/**
 * A `CursorTransport` backed by recorded provider responses. Every
 * deterministic Cursor lane runs through this: the adapter exercises the same
 * code path it uses against Cursor, with no network, no SDK install, and no
 * provider account.
 */
export interface RecordedCursorTransport extends CursorTransport {
    /** Pushes the next recorded stream event to the live subscriber. */
    emit(event: CursorRunEvent): Promise<void>;
    /** Every request the adapter made, newest last. */
    readonly requests: string[];
}

export interface RecordedCursorTransportOptions {
    auth?: CursorAuth;
    models?: CursorModelListing[];
    modelsFailure?: Error;
    /** Replayed in order; the last one repeats once the script runs out. */
    reads?: CursorRunReading[];
    sendFailure?: Error;
    sendReading?: CursorLaunchReading;
    startFailure?: Error;
    startReading?: CursorLaunchReading;
}

export function createRecordedCursorTransport(
    options: RecordedCursorTransportOptions = {}
): RecordedCursorTransport {
    const requests: string[] = [];
    const reads = [...(options.reads ?? [])];
    let auth: CursorAuth = options.auth ?? recordedAuth.connected;
    let latest: CursorRunReading = reads.at(-1) ?? recordedRun('RUNNING');
    let subscriber: ((event: CursorRunEvent) => Promise<void>) | null = null;

    return {
        authStatus() {
            requests.push('authStatus');
            return Promise.resolve(auth);
        },
        cancelRun(address: CursorRunAddress) {
            requests.push(`cancelRun ${address.agentId}/${address.runId}`);
            latest = { ...latest, rawStatus: 'CANCELLED' };
            reads.length = 0;
            return Promise.resolve();
        },
        emit(event: CursorRunEvent) {
            return subscriber?.(event) ?? Promise.resolve();
        },
        login() {
            requests.push('login');
            auth = recordedAuth.connected;
            return Promise.resolve(auth);
        },
        listModels() {
            requests.push('listModels');
            if (options.modelsFailure) {
                return Promise.reject(options.modelsFailure);
            }
            return Promise.resolve(options.models ?? recordedModels);
        },
        logout() {
            requests.push('logout');
            auth = { connected: false, reason: 'not-connected' };
            return Promise.resolve();
        },
        readRun(address: CursorRunAddress) {
            requests.push(`readRun ${address.agentId}/${address.runId}`);
            latest = reads.length > 1 ? (reads.shift() ?? latest) : (reads[0] ?? latest);
            return Promise.resolve(latest);
        },
        requests,
        send(input: CursorSendInput) {
            requests.push(
                `send ${input.agentId} ${input.idempotencyKey} model=${modelLabel(input.model)}`
            );
            if (options.sendFailure) {
                return Promise.reject(options.sendFailure);
            }
            return Promise.resolve(
                options.sendReading ?? {
                    agentId: input.agentId,
                    reading: recordedRun('RUNNING', { runId: `run_${input.idempotencyKey}` }),
                }
            );
        },
        start(input: CursorStartInput) {
            requests.push(
                `start ${input.repository}@${input.ref ?? 'default'} ${input.idempotencyKey} model=${modelLabel(input.model)}`
            );
            if (options.startFailure) {
                return Promise.reject(options.startFailure);
            }
            return Promise.resolve(options.startReading ?? recordedLaunch);
        },
        async streamRun(
            address: CursorRunAddress,
            onEvent: (event: CursorRunEvent) => Promise<void>,
            signal: AbortSignal
        ) {
            requests.push(`streamRun ${address.agentId}/${address.runId}`);
            if (signal.aborted) {
                return;
            }
            const done = Promise.withResolvers<void>();
            let pending = Promise.resolve();
            const stop = () => done.resolve();
            signal.addEventListener('abort', stop, { once: true });
            subscriber = (event) => {
                pending = pending.then(async () => {
                    if (signal.aborted) {
                        return;
                    }
                    if (event.kind === 'detached') {
                        stop();
                    } else {
                        await onEvent(event);
                    }
                });
                return pending;
            };
            try {
                await done.promise;
                await pending;
            } finally {
                signal.removeEventListener('abort', stop);
                subscriber = null;
            }
        },
    };
}

export const recordedAuth = {
    connected: {
        connected: true,
        email: 'delegate@example.com',
        expiresAt: '2026-12-03T21:03:33.000Z',
    },
    expired: { connected: false, reason: 'expired' },
    loggedOut: { connected: false, reason: 'not-connected' },
} satisfies Record<string, CursorAuth>;

/** Trimmed from a real `Cursor.models.list()`; the cheapest tier is gpt-5.4-nano. */
export const recordedModels: CursorModelListing[] = [
    { displayName: 'Auto', id: 'default', variants: [{ isDefault: true, params: [] }] },
    {
        displayName: 'GPT-5.4 Nano',
        id: 'gpt-5.4-nano',
        parameters: [
            {
                displayName: 'Reasoning',
                id: 'reasoning',
                values: [
                    { displayName: 'Low', value: 'low' },
                    { displayName: 'Medium', value: 'medium' },
                ],
            },
        ],
        variants: [{ isDefault: true, params: [{ id: 'reasoning', value: 'medium' }] }],
    },
];

/** A start or send's model as the recorded request log spells it. */
function modelLabel(model: CursorStartInput['model']): string {
    if (!model) {
        return 'auto';
    }
    return [model.id, ...model.params.map((param) => `${param.id}:${param.value}`)].join(',');
}

export const recordedAgentId = 'bc-9f2c1d4e';
export const recordedRunId = 'run-7a6b5c4d';

/** One recorded Run read, in each status the provider reports. */
export function recordedRun(
    rawStatus: CursorRunStatus,
    overrides: Partial<CursorRunReading> = {}
): CursorRunReading {
    const terminal = rawStatus === 'FINISHED';
    return {
        branches: terminal
            ? [
                  {
                      branch: 'cursor/fix-flaky-delivery-test',
                      prUrl: 'https://github.com/haus/haus/pull/412',
                      // Recorded from a live Run: Cursor reports the repository
                      // scheme-less, not as the clone URL it was started from.
                      repoUrl: 'github.com/haus/haus',
                  },
              ]
            : [],
        errorCode: rawStatus === 'ERROR' ? 'agent_run_failed' : null,
        errorMessage:
            rawStatus === 'ERROR'
                ? 'The sandbox could not install dependencies.'
                : rawStatus === 'EXPIRED'
                  ? 'This run expired before it finished.'
                  : null,
        rawStatus,
        result: terminal ? 'Reproduced the flake and opened a pull request.' : null,
        runId: recordedRunId,
        usage: terminal ? { chargedCents: 42.5, inputTokens: 18_402, outputTokens: 3117 } : null,
        ...overrides,
    };
}

export const recordedLaunch: CursorLaunchReading = {
    agentId: recordedAgentId,
    reading: recordedRun('CREATING'),
};

/** Cursor's 409 when a provider Agent already has an active Run. */
export function recordedAgentBusyError(): Error {
    const error = new Error('Agent already has an active run in progress');
    error.name = 'AgentBusyError';
    Object.assign(error, { code: 'agent_busy', status: 409 });
    return error;
}

export function recordedAuthenticationError(): Error {
    const error = new Error('Invalid API key');
    error.name = 'AuthenticationError';
    Object.assign(error, { code: 'unauthorized', status: 401 });
    return error;
}
