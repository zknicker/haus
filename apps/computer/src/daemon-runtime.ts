import {
    type EffectRuntime,
    makeLifecycleLoggerLayer,
    makeProcessTelemetryLayer,
} from '@haus/effect';
import { Layer, ManagedRuntime } from 'effect';
import { computerSourceRevision, computerVersion } from './build-identity.ts';
import { closeProviderSignIns } from './cloud-agents/provider-sign-in.ts';
import { KeyedSerialWork } from './keyed-serial-work.ts';

export type DaemonRuntime = EffectRuntime<never>;

const serialWorkByRuntime = new WeakMap<DaemonRuntime, KeyedSerialWork<never>>();

export function daemonSerialWork(runtime: DaemonRuntime): KeyedSerialWork<never> {
    const current = serialWorkByRuntime.get(runtime);
    if (current) {
        return current;
    }
    const created = new KeyedSerialWork(runtime);
    serialWorkByRuntime.set(runtime, created);
    return created;
}

export async function closeDaemonCoordination(runtime: DaemonRuntime): Promise<void> {
    const serialWork = serialWorkByRuntime.get(runtime);
    serialWorkByRuntime.delete(runtime);
    await Promise.all([serialWork?.close(), closeProviderSignIns(runtime)]);
}

/** Create the one Effect runtime owned by a Computer attachment daemon. */
export function makeDaemonRuntime(options?: {
    readonly telemetryRelay?: {
        readonly credential: string;
        readonly serverOrigin: string;
    };
}): DaemonRuntime {
    const relay = options?.telemetryRelay
        ? {
              authorization: `Bearer ${options.telemetryRelay.credential}`,
              deploymentEnvironment: 'production' as const,
              endpoint: new URL(
                  '/computer/telemetry',
                  options.telemetryRelay.serverOrigin
              ).toString(),
          }
        : undefined;
    return ManagedRuntime.make(
        Layer.merge(
            makeLifecycleLoggerLayer(),
            makeProcessTelemetryLayer({
                relay,
                serviceName: 'haus-computer',
                serviceRevision: computerSourceRevision,
                serviceVersion: computerVersion,
            })
        )
    );
}

export async function withDaemonRuntime<Value>(
    run: (runtime: DaemonRuntime) => Promise<Value>,
    options?: Parameters<typeof makeDaemonRuntime>[0]
): Promise<Value> {
    const runtime = makeDaemonRuntime(options);
    try {
        return await run(runtime);
    } finally {
        await closeDaemonRuntimeResources(
            () => closeDaemonCoordination(runtime),
            () => runtime.dispose()
        );
    }
}

export async function closeDaemonRuntimeResources(
    closeCoordination: () => Promise<void>,
    disposeRuntime: () => Promise<void>
): Promise<void> {
    const failures: unknown[] = [];
    try {
        await closeCoordination();
    } catch (error) {
        failures.push(error);
    }
    try {
        await disposeRuntime();
    } catch (error) {
        failures.push(error);
    }
    if (failures.length === 1) {
        throw failures[0];
    }
    if (failures.length > 1) {
        throw new AggregateError(failures, 'Computer daemon runtime shutdown failed.');
    }
}
