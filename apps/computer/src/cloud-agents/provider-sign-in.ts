import { type CloudAgentCapabilityState, cloudAgentCapabilityStateSchema } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Clock, Deferred, Effect, Fiber } from 'effect';
import { foreign } from './foreign-operation.ts';
import type { CloudAgentProvider } from './provider.ts';
import {
    type CloudAgentProviderAccess,
    cloudAgentCapabilityState,
    readCloudAgentReadiness,
} from './registry.ts';

/** The attachment daemon owns the sign-in wait, including foreign SDK cleanup. */
export class ProviderSignIn {
    private signIn: CloudAgentCapabilityState['signIn'];
    private attempt: {
        started: Deferred.Deferred<void>;
        fiber: Fiber.RuntimeFiber<void, never>;
    } | null = null;

    constructor(
        private readonly runtime: EffectRuntime<never>,
        private readonly provider: CloudAgentProvider,
        private readonly timeoutMs = 300_000
    ) {}

    async get(): Promise<CloudAgentProviderAccess> {
        const state = cloudAgentCapabilityState(
            this.provider,
            await readCloudAgentReadiness(this.provider)
        );
        return this.signIn ? { ...state, signIn: this.signIn } : state;
    }

    async connect(): Promise<CloudAgentProviderAccess> {
        this.attempt ??= this.start();
        await settle(this.runtime, Deferred.await(this.attempt.started));
        return this.get();
    }

    async cancel(): Promise<CloudAgentProviderAccess> {
        await this.close();
        return this.get();
    }

    async close(): Promise<void> {
        const attempt = this.attempt;
        if (attempt) {
            // Interruption joins SDK cleanup before another sign-in can start.
            await settle(this.runtime, Fiber.interrupt(attempt.fiber));
        } else {
            this.signIn = undefined;
        }
    }

    private start() {
        this.signIn = undefined;
        const started = this.runtime.runSync(Deferred.make<void>());
        const expiresAt = new Date(
            this.runtime.runSync(Clock.currentTimeMillis) + this.timeoutMs
        ).toISOString();
        const login = foreign((signal) =>
            this.provider.connect({
                signal,
                onLoginUrl: (url) => {
                    signal.throwIfAborted();
                    const state = cloudAgentCapabilityStateSchema.parse({
                        accountEmail: null,
                        expiresAt: null,
                        provider: this.provider.provider,
                        ready: false,
                        reason: 'not-connected',
                        signIn: { status: 'waiting', url, expiresAt },
                    });
                    this.signIn = state.signIn;
                    this.runtime.runSync(Deferred.succeed(started, undefined));
                },
            })
        );
        const startupDeadline = Deferred.await(started).pipe(
            Effect.timeout(8000),
            Effect.andThen(Effect.never)
        );
        const program = Effect.raceFirst(login, startupDeadline).pipe(
            Effect.timeout(this.timeoutMs),
            Effect.tap((readiness) =>
                Effect.sync(() => {
                    this.signIn = readiness.ready
                        ? undefined
                        : { status: 'failed', message: unfinishedMessage(this.provider) };
                })
            ),
            Effect.catchTag('TimeoutException', () =>
                Effect.sync(() => {
                    this.signIn = {
                        status: 'failed',
                        message: 'This sign-in expired. Try again to get a new link.',
                    };
                })
            ),
            Effect.catchTag('CloudAgentOperationError', () =>
                Effect.sync(() => {
                    this.signIn = {
                        status: 'failed',
                        message: `Could not complete ${providerName(this.provider)} sign-in. Try again.`,
                    };
                })
            ),
            Effect.asVoid,
            Effect.onInterrupt(() =>
                Effect.sync(() => {
                    this.signIn = undefined;
                })
            ),
            Effect.ensuring(
                Effect.sync(() => {
                    this.attempt = null;
                })
            ),
            Effect.ensuring(Deferred.succeed(started, undefined))
        );
        return { started, fiber: this.runtime.runFork(program) };
    }
}

/**
 * Claude's sign-in belongs to Claude Code itself, the same login the Claude
 * Code runtime uses, so connecting only rechecks it.
 */
function unfinishedMessage(provider: CloudAgentProvider): string {
    return provider.provider === 'claude'
        ? 'Sign in to Claude Code on this Computer, then try again.'
        : 'Cursor did not finish connecting. Try again.';
}

function providerName(provider: CloudAgentProvider): string {
    return provider.provider === 'claude' ? 'Claude' : 'Cursor';
}

const signIns = new WeakMap<EffectRuntime<never>, Map<CloudAgentProvider, ProviderSignIn>>();

export function providerSignIn(
    runtime: EffectRuntime<never>,
    provider: CloudAgentProvider
): ProviderSignIn {
    let providers = signIns.get(runtime);
    if (!providers) {
        providers = new Map();
        signIns.set(runtime, providers);
    }
    let signIn = providers.get(provider);
    if (!signIn) {
        signIn = new ProviderSignIn(runtime, provider);
        providers.set(provider, signIn);
    }
    return signIn;
}

export async function closeProviderSignIns(runtime: EffectRuntime<never>): Promise<void> {
    const providers = signIns.get(runtime);
    signIns.delete(runtime);
    await Promise.all([...(providers?.values() ?? [])].map((signIn) => signIn.close()));
}
