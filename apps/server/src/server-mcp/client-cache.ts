import type { MCPClient } from '@ai-sdk/mcp';
import { type EffectRuntime, settle } from '@haus/effect';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Scope from 'effect/Scope';
import { classifyMcpClientFailure } from './client-failure.ts';
import { McpClientAcquireError, McpClientRetiredError } from './errors.ts';

export type ClientFactory = (connectionId: string, signal: AbortSignal) => Promise<MCPClient>;

/** `draining`: a session failure unlisted the entry; in-flight calls finish before it closes. */
type ClientEntryState = 'acquiring' | 'ready' | 'draining' | 'retired';

interface ClientEntry {
    acquisition: Promise<MCPClient>;
    readonly acquisitionAbort: AbortController;
    client?: MCPClient;
    closeDone?: Promise<void>;
    readonly connectionId: string;
    factorySettlement: Promise<MCPClient>;
    readonly operations: Set<AbortController>;
    readonly scope: Scope.CloseableScope;
    scopeClose?: Promise<void>;
    state: ClientEntryState;
}

export class McpClientCache {
    private readonly entries = new Map<string, ClientEntry>();
    private readonly draining = new Set<ClientEntry>();
    private readonly concreteCloses = new WeakMap<MCPClient, Promise<void>>();

    constructor(
        private readonly runtime: EffectRuntime<never>,
        private readonly factory: ClientFactory
    ) {}

    async run<A, E>(
        connectionId: string,
        lifecycle: (
            acquisition: Effect.Effect<
                MCPClient,
                McpClientAcquireError | McpClientRetiredError,
                never
            >
        ) => Effect.Effect<A, E, never>,
        signal?: AbortSignal
    ): Promise<A> {
        signal?.throwIfAborted();
        const entry = this.acquire(connectionId);
        const operationAbort = this.beginOperation(entry);
        try {
            const result = await this.runEffect(lifecycle(this.awaitClient(entry)), {
                signal: signal
                    ? AbortSignal.any([operationAbort.signal, signal])
                    : operationAbort.signal,
            });
            if (!this.finishOperation(entry, operationAbort)) {
                throw new McpClientRetiredError();
            }
            return result;
        } catch (cause) {
            if (!signal?.aborted) {
                this.retireAfterFailure(entry, cause);
            }
            throw cause;
        } finally {
            this.finishOperation(entry, operationAbort);
        }
    }

    async closeConnection(connectionId: string, timeoutMs: number): Promise<void> {
        const entries = [...this.entries.values(), ...this.draining].filter(
            (entry) => entry.connectionId === connectionId
        );
        await this.closeEntries(entries, timeoutMs);
    }

    async closeAll(timeoutMs: number): Promise<void> {
        const entries = [...this.entries.values(), ...this.draining];
        this.entries.clear();
        await this.closeEntries(entries, timeoutMs);
    }

    private acquire(connectionId: string): ClientEntry {
        const existing = this.entries.get(connectionId);
        if (existing) {
            return existing;
        }
        const entry: ClientEntry = {
            acquisition: Promise.resolve(undefined as never),
            acquisitionAbort: new AbortController(),
            connectionId,
            factorySettlement: Promise.resolve(undefined as never),
            operations: new Set(),
            scope: this.runtime.runSync(Scope.make()),
            state: 'acquiring',
        };
        this.entries.set(connectionId, entry);
        entry.acquisition = this.startAcquisition(entry);
        void entry.acquisition.catch(() => undefined);
        return entry;
    }

    private awaitClient(
        entry: ClientEntry
    ): Effect.Effect<MCPClient, McpClientAcquireError | McpClientRetiredError, never> {
        return Effect.tryPromise({
            try: () => entry.acquisition,
            catch: asClientAcquisitionError,
        }).pipe(
            Effect.flatMap((client) =>
                this.isCurrentReady(entry, client)
                    ? Effect.succeed(client)
                    : Effect.fail(new McpClientRetiredError())
            )
        );
    }

    private beginOperation(entry: ClientEntry): AbortController {
        const operation = new AbortController();
        if (this.isCurrentEntry(entry)) {
            entry.operations.add(operation);
        } else {
            operation.abort();
        }
        return operation;
    }

    private finishOperation(entry: ClientEntry, operation: AbortController): boolean {
        const usable = this.isCurrentReady(entry) || entry.state === 'draining';
        const current = usable && entry.operations.has(operation);
        entry.operations.delete(operation);
        if (entry.state === 'draining' && entry.operations.size === 0) {
            void this.discard(entry);
        }
        return current;
    }

    /**
     * A failure while acquiring is an initialize failure: abort and discard. A session failure
     * unlists a ready client so new calls rebuild, without aborting its in-flight calls.
     */
    private retireAfterFailure(entry: ClientEntry, cause: unknown): void {
        if (entry.state === 'acquiring') {
            void this.discard(entry);
            return;
        }
        if (entry.state !== 'ready' || classifyMcpClientFailure(cause) === 'operation') {
            return;
        }
        this.entries.delete(entry.connectionId);
        entry.state = 'draining';
        this.draining.add(entry);
    }

    private discard(entry: ClientEntry, abortOperations = true): Promise<void> {
        if (entry.state === 'retired') {
            return entry.closeDone ?? Promise.resolve();
        }
        if (this.entries.get(entry.connectionId) === entry) {
            this.entries.delete(entry.connectionId);
        }
        this.draining.delete(entry);
        entry.state = 'retired';
        entry.acquisitionAbort.abort();
        if (abortOperations) {
            for (const operation of entry.operations) {
                queueMicrotask(() => operation.abort());
            }
        }

        const scopeClose = this.closeScope(entry);
        const clientClose = entry.client ? this.closeConcrete(entry.client) : Promise.resolve();
        entry.closeDone = Promise.allSettled([
            scopeClose,
            clientClose,
            entry.factorySettlement,
        ]).then(() => undefined);
        return entry.closeDone;
    }

    private startAcquisition(entry: ClientEntry): Promise<MCPClient> {
        entry.factorySettlement = this.startFactory(entry);
        const resource = Scope.extend(
            Effect.acquireReleaseInterruptible(
                Effect.tryPromise({
                    try: () => entry.factorySettlement,
                    catch: asClientAcquisitionError,
                }),
                () =>
                    Effect.promise(() =>
                        entry.client ? this.closeConcrete(entry.client) : Promise.resolve()
                    )
            ),
            entry.scope
        );
        return this.runEffect(resource, { signal: entry.acquisitionAbort.signal }).catch(
            (cause) => {
                void this.discard(entry, false).catch(() => undefined);
                throw cause;
            }
        );
    }

    private startFactory(entry: ClientEntry): Promise<MCPClient> {
        const factoryPromise = Promise.resolve().then(() =>
            this.factory(entry.connectionId, entry.acquisitionAbort.signal)
        );
        const settlement = factoryPromise.then(async (client) => {
            if (this.isCurrentAcquiring(entry)) {
                entry.client = client;
                entry.state = 'ready';
                return client;
            }
            await this.closeConcrete(client);
            throw new McpClientRetiredError();
        });
        void settlement.catch(() => undefined);
        return settlement;
    }

    private isCurrentAcquiring(entry: ClientEntry): boolean {
        return entry.state === 'acquiring' && this.entries.get(entry.connectionId) === entry;
    }

    private isCurrentEntry(entry: ClientEntry): boolean {
        return this.entries.get(entry.connectionId) === entry && entry.state !== 'retired';
    }

    private isCurrentReady(entry: ClientEntry, client?: MCPClient): boolean {
        return (
            entry.state === 'ready' &&
            (client === undefined || entry.client === client) &&
            this.entries.get(entry.connectionId) === entry
        );
    }

    private closeScope(entry: ClientEntry): Promise<void> {
        if (!entry.scopeClose) {
            entry.scopeClose = this.runEffect(
                Scope.close(entry.scope, Exit.succeed(undefined))
            ).catch(() => undefined);
        }
        return entry.scopeClose;
    }

    private closeConcrete(client: MCPClient): Promise<void> {
        const existing = this.concreteCloses.get(client);
        if (existing) {
            return existing;
        }
        const close = Promise.resolve()
            .then(() => client.close())
            .catch(() => undefined);
        this.concreteCloses.set(client, close);
        return close;
    }

    private async closeEntries(entries: ClientEntry[], timeoutMs: number): Promise<void> {
        // Bounded so a hanging upstream close never blocks disconnect or shutdown.
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
            Promise.allSettled(entries.map((entry) => this.discard(entry))),
            new Promise<void>((resolve) => {
                timer = setTimeout(resolve, Math.max(0, timeoutMs));
            }),
        ]);
        clearTimeout(timer);
    }

    private runEffect<A, E>(
        effect: Effect.Effect<A, E, never>,
        options?: { readonly signal?: AbortSignal }
    ): Promise<A> {
        return settle(this.runtime, effect, {
            onInterrupted: () => {
                throw new McpClientRetiredError();
            },
            signal: options?.signal,
        });
    }
}

function asClientAcquisitionError(cause: unknown): McpClientAcquireError | McpClientRetiredError {
    if (cause instanceof McpClientAcquireError || cause instanceof McpClientRetiredError) {
        return cause;
    }
    return new McpClientAcquireError({ cause });
}
