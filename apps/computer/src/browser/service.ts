import type { AgentRuntimeBrowserConnection } from '@haus/api';
import { asError, type EffectRuntime, settle } from '@haus/effect';
import { Effect } from 'effect';
import { detectChromeApplications } from './chrome-detection.ts';
import { BrowserCommandQueue } from './command-queue.ts';
import { ExistingBrowserConnection } from './existing-browser.ts';
import type { BrowserTarget } from './types.ts';

export interface BrowserService {
    commandQueue: BrowserCommandQueue;
    connection: AgentRuntimeBrowserConnection;
    contract: BrowserTarget;
    observer: ExistingBrowserConnection;
    root: string;
}

export interface BrowserServiceDesiredState {
    connection: AgentRuntimeBrowserConnection | null;
    enabled: boolean;
}

export class BrowserServiceCoordinator {
    private active: BrowserService | null = null;
    private readonly transitions: Effect.Semaphore;

    constructor(private readonly runtime: EffectRuntime<never>) {
        this.transitions = runtime.runSync(Effect.makeSemaphore(1));
    }

    ownsRuntime(runtime: EffectRuntime<never>): boolean {
        return this.runtime === runtime;
    }

    get(): BrowserService | null {
        return this.active;
    }

    reconcile(
        root: string,
        desired: () => Promise<BrowserServiceDesiredState>
    ): Promise<BrowserService | null> {
        return settle(
            this.runtime,
            this.transitions.withPermits(1)(
                Effect.tryPromise({
                    catch: asError,
                    try: async () => {
                        const state = await desired();
                        if (!(state.enabled && state.connection)) {
                            if (this.active?.root === root) {
                                this.active = null;
                            }
                            return null;
                        }
                        if (
                            this.active?.root === root &&
                            JSON.stringify(this.active.connection) ===
                                JSON.stringify(state.connection)
                        ) {
                            return this.active;
                        }
                        this.active = null;
                        const application = (await detectChromeApplications()).find(
                            (app) => app.path === state.connection?.applicationPath
                        );
                        if (!application) {
                            return null;
                        }
                        const contract = {
                            executablePath: application.executablePath,
                            userDataDir: state.connection.userDataDir,
                        };
                        this.active = {
                            root,
                            connection: state.connection,
                            contract,
                            commandQueue: new BrowserCommandQueue(),
                            observer: new ExistingBrowserConnection(contract, application.version),
                        };
                        return this.active;
                    },
                })
            )
        );
    }

    disconnect(): Promise<void> {
        return settle(
            this.runtime,
            this.transitions.withPermits(1)(
                Effect.sync(() => {
                    this.active = null;
                })
            )
        );
    }
}

let browserServices: BrowserServiceCoordinator | null = null;

export function getBrowserService(): BrowserService | null {
    return browserServices?.get() ?? null;
}

export function reconcileBrowserService(
    root: string,
    desired: () => Promise<BrowserServiceDesiredState>,
    runtime: EffectRuntime<never>
): Promise<BrowserService | null> {
    if (!browserServices?.ownsRuntime(runtime)) {
        if (browserServices?.get()) {
            throw new Error('Browser connection belongs to another Computer daemon runtime.');
        }
        browserServices = new BrowserServiceCoordinator(runtime);
    }
    return browserServices.reconcile(root, desired);
}

export async function disconnectBrowserService(): Promise<void> {
    const coordinator = browserServices;
    if (coordinator) {
        await coordinator.disconnect();
        if (browserServices === coordinator) {
            browserServices = null;
        }
    }
}
