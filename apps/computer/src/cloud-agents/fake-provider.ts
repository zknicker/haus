import type { CloudAgentModel, CloudAgentStatus } from '@haus/api';
import type {
    CloudAgentLaunch,
    CloudAgentProvider,
    CloudAgentProviderObservation,
    CloudAgentReadiness,
    CloudAgentRunRef,
    CloudAgentSendInput,
    CloudAgentStartInput,
} from './provider.ts';
import { CloudAgentLaunchRejectedError } from './provider.ts';

export interface FakeCloudAgentProvider extends CloudAgentProvider {
    /** Pushes the next scripted transition to every live subscriber. */
    advance(): CloudAgentProviderObservation | null;
    failNextStart(message: string): void;
    /** Every launch this provider was asked for, newest last. */
    readonly launches: CloudAgentStartInput[];
    readonly sends: CloudAgentSendInput[];
}

export interface FakeCloudAgentProviderOptions {
    models?: CloudAgentModel[];
    readiness?: CloudAgentReadiness;
    /** Scripted transitions, replayed in order by `advance`. */
    transitions?: CloudAgentProviderObservation[];
}

/**
 * An in-memory Cloud Agent provider with scripted transitions. It makes the
 * whole path — launch, live observation, reconciliation read, cancellation —
 * testable without a provider account.
 */
export function createFakeCloudAgentProvider(
    options: FakeCloudAgentProviderOptions = {}
): FakeCloudAgentProvider {
    const launches: CloudAgentStartInput[] = [];
    const sends: CloudAgentSendInput[] = [];
    const subscribers = new Set<(observation: CloudAgentProviderObservation) => void>();
    const transitions = [...(options.transitions ?? [])];
    let startFailure: string | null = null;
    let latest: CloudAgentProviderObservation = {
        observedAt: new Date(0).toISOString(),
        status: 'queued',
    };

    return {
        advance() {
            const next = transitions.shift();
            if (!next) {
                return null;
            }
            latest = next;
            for (const subscriber of subscribers) {
                subscriber(next);
            }
            return next;
        },
        cancel(_ref: CloudAgentRunRef) {
            latest = observe('cancelled', 'CANCELLED');
            return Promise.resolve();
        },
        connect() {
            return Promise.resolve(readiness());
        },
        disconnect() {
            return Promise.resolve({ ready: false as const, reason: 'not-connected' as const });
        },
        failNextStart(message: string) {
            startFailure = message;
        },
        launches,
        listModels() {
            return Promise.resolve(options.models ?? []);
        },
        provider: 'cursor',
        read(_ref: CloudAgentRunRef) {
            return Promise.resolve(latest);
        },
        readiness() {
            return Promise.resolve(readiness());
        },
        sends,
        send(input: CloudAgentSendInput): Promise<CloudAgentLaunch> {
            sends.push(input);
            latest = {
                ...observe('running', 'RUNNING'),
                providerAgentId: input.providerAgentId,
                providerRunId: `run_${input.idempotencyKey}`,
            };
            return Promise.resolve({
                providerAgentId: input.providerAgentId,
                providerRunId: `run_${input.idempotencyKey}`,
                providerUrl: `https://cursor.com/agents/${input.providerAgentId}`,
                status: 'running',
            });
        },
        start(input: CloudAgentStartInput): Promise<CloudAgentLaunch> {
            if (startFailure) {
                const message = startFailure;
                startFailure = null;
                return Promise.reject(new CloudAgentLaunchRejectedError(message));
            }
            launches.push(input);
            latest = {
                ...observe('running', 'RUNNING'),
                providerRunId: `run_${input.idempotencyKey}`,
            };
            return Promise.resolve({
                providerAgentId: `bc_${input.idempotencyKey}`,
                providerRunId: `run_${input.idempotencyKey}`,
                providerUrl: `https://cursor.com/agents/bc_${input.idempotencyKey}`,
                status: 'running',
            });
        },
        subscribe(_ref, onObservation, signal) {
            if (signal.aborted) {
                return Promise.resolve();
            }
            return new Promise<void>((resolve) => {
                subscribers.add(onObservation);
                signal.addEventListener(
                    'abort',
                    () => {
                        subscribers.delete(onObservation);
                        resolve();
                    },
                    { once: true }
                );
            });
        },
    };

    function readiness(): CloudAgentReadiness {
        return options.readiness ?? { account: { email: null, expiresAt: null }, ready: true };
    }
}

function observe(status: CloudAgentStatus, rawStatus: string): CloudAgentProviderObservation {
    return { observedAt: new Date().toISOString(), rawStatus, status };
}
