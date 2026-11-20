import {
    type WorkerLaunch,
    WorkerLaunchRejectedError,
    type CloudAgentProvider,
    type CloudAgentProviderObservation,
    CloudAgentProviderUnavailableError,
    type CloudAgentReadiness,
    type WorkerTurnRef,
    type WorkerSendInput,
    type WorkerStartInput,
} from '../provider.ts';
import { activityOf, workerStatusOf, cursorAgentUrl, observationOf } from './status.ts';
import {
    type CursorRunAddress,
    type CursorTransport,
    CursorTransportUnavailableError,
    cursorSendRejectionOf,
    isTerminalCursorRunStatus,
} from './transport.ts';

/**
 * Computer-local access to Cursor's Cloud Agents, behind `CloudAgentProvider`.
 * Every Cursor request, response, and status string is confined to this
 * adapter and its transport; Haus's durable contracts see only bounded
 * observations. The user API key is never logged, stored by Haus, or copied
 * to Server — it lives only in Cursor's own credential store.
 */
export function createCursorCloudAgentProvider(transport: CursorTransport): CloudAgentProvider {
    return {
        async cancel(ref: WorkerTurnRef, signal?: AbortSignal): Promise<void> {
            await transport.cancelRun(requireAddress(ref), signal);
        },
        async connect(options = {}) {
            return readinessOf(await run(() => transport.login(options)));
        },
        async disconnect() {
            await run(() => transport.logout());
            return { ready: false as const, reason: 'not-connected' as const };
        },
        // Cursor has no cloud environment concept to pin.
        listEnvironments() {
            return Promise.resolve([]);
        },
        listModels() {
            return run(() => transport.listModels());
        },
        provider: 'cursor',
        async read(
            ref: WorkerTurnRef,
            signal?: AbortSignal
        ): Promise<CloudAgentProviderObservation> {
            const address = requireAddress(ref);
            return observationOf(await transport.readRun(address, signal), {
                agentId: address.agentId,
                observedAt: new Date().toISOString(),
            });
        },
        async readiness(): Promise<CloudAgentReadiness> {
            // Readiness answers rather than throws: an inventory report says
            // truthfully that the provider is unreachable, and a launch fails
            // on that reason before any Message exists.
            try {
                return readinessOf(await transport.authStatus());
            } catch (error) {
                if (error instanceof CursorTransportUnavailableError) {
                    return { ready: false, reason: 'provider-unavailable' };
                }
                throw error;
            }
        },
        async send(input: WorkerSendInput): Promise<WorkerLaunch> {
            const launch = await classified(() =>
                transport.send({
                    agentId: input.providerAgentId,
                    idempotencyKey: input.idempotencyKey,
                    instructions: input.instructions,
                    model: input.model,
                })
            );
            if (launch.agentId !== input.providerAgentId) {
                throw new Error('Cursor follow-up returned a different provider Agent');
            }
            return {
                environmentId: null,
                environmentName: null,
                providerAgentId: launch.agentId,
                providerRunId: launch.reading.runId,
                providerUrl: cursorAgentUrl(launch.agentId),
                status: workerStatusOf(launch.reading.rawStatus),
                ...(launch.reading.startedAt ? { startedAt: launch.reading.startedAt } : {}),
            };
        },
        async start(input: WorkerStartInput): Promise<WorkerLaunch> {
            const launch = await classified(() =>
                transport.start({
                    idempotencyKey: input.idempotencyKey,
                    instructions: input.instructions,
                    model: input.model,
                    ref: input.ref,
                    repository: input.repository,
                    title: input.title,
                })
            );
            return {
                environmentId: null,
                environmentName: null,
                providerAgentId: launch.agentId,
                providerRunId: launch.reading.runId,
                providerUrl: cursorAgentUrl(launch.agentId),
                status: workerStatusOf(launch.reading.rawStatus),
                ...(launch.reading.startedAt ? { startedAt: launch.reading.startedAt } : {}),
            };
        },
        subscribe(
            ref: WorkerTurnRef,
            onObservation: (observation: CloudAgentProviderObservation) => void,
            signal: AbortSignal
        ): Promise<void> {
            return watchCursorRun(transport, requireAddress(ref), onObservation, signal);
        },
    };
}

async function watchCursorRun(
    transport: CursorTransport,
    address: CursorRunAddress,
    onObservation: (observation: CloudAgentProviderObservation) => void,
    signal: AbortSignal
): Promise<void> {
    const terminal = new AbortController();
    const lifetime = AbortSignal.any([signal, terminal.signal]);
    await transport.streamRun(
        address,
        async (event) => {
            if (lifetime.aborted || event.kind === 'detached') {
                return;
            }
            const observedAt = new Date().toISOString();
            if (event.kind === 'status') {
                if (isTerminalCursorRunStatus(event.rawStatus)) {
                    // Preserve the stream's EXPIRED alongside the read's terminal evidence.
                    const reading = await transport.readRun(address, lifetime).catch(() => null);
                    if (lifetime.aborted) {
                        return;
                    }
                    onObservation(
                        reading
                            ? observationOf(
                                  { ...reading, rawStatus: event.rawStatus },
                                  {
                                      agentId: address.agentId,
                                      observedAt,
                                  }
                              )
                            : {
                                  observedAt,
                                  providerAgentId: address.agentId,
                                  providerRunId: address.runId,
                                  rawStatus: event.rawStatus,
                                  status: workerStatusOf(event.rawStatus),
                              }
                    );
                    terminal.abort();
                    return;
                }
                onObservation({
                    observedAt,
                    providerAgentId: address.agentId,
                    providerRunId: address.runId,
                    rawStatus: event.rawStatus,
                    status: workerStatusOf(event.rawStatus),
                });
                return;
            }
            const activity = activityOf(event.summary, observedAt);
            if (activity) {
                onObservation({
                    activity,
                    observedAt,
                    providerAgentId: address.agentId,
                    providerRunId: address.runId,
                    status: 'running',
                });
            }
        },
        lifetime
    );
}

/**
 * A Run Haus tracks but Cursor never hosted has no provider address. Failing
 * here keeps a launch that never reached Cursor from reporting a settled Run.
 */
function requireAddress(ref: WorkerTurnRef): CursorRunAddress {
    if (!(ref.providerAgentId && ref.providerRunId)) {
        throw new CloudAgentProviderUnavailableError('not-connected');
    }
    return { agentId: ref.providerAgentId, runId: ref.providerRunId };
}

function readinessOf(
    auth: Awaited<ReturnType<CursorTransport['authStatus']>>
): CloudAgentReadiness {
    return auth.connected
        ? { account: { email: auth.email, expiresAt: auth.expiresAt }, ready: true }
        : { ready: false, reason: auth.reason };
}

/** A definite Cursor refusal becomes the provider-neutral rejection; anything else stays retryable. */
async function classified<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        const rejection = cursorSendRejectionOf(error);
        if (rejection) {
            throw new WorkerLaunchRejectedError(rejection.message, {
                providerCode: rejection.code,
            });
        }
        throw error;
    }
}

/**
 * An SDK that cannot load at all is a different fact from a missing
 * credential, and only that one degrades the whole capability.
 */
async function run<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof CursorTransportUnavailableError) {
            throw new CloudAgentProviderUnavailableError('provider-unavailable');
        }
        throw error;
    }
}
