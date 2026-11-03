import type { EffectRuntime } from '@haus/effect';

const owners = new WeakMap<EffectRuntime<never>, RuntimeProcessOwner>();

/** The Computer-wide registry every runtime process joins, one per daemon runtime. */
export function runtimeProcessOwner(runtime: EffectRuntime<never>): RuntimeProcessOwner {
    let owner = owners.get(runtime);
    if (!owner) {
        owner = new RuntimeProcessOwner();
        owners.set(runtime, owner);
    }
    return owner;
}

/** Stops every registered runtime process and fences later spawns (Computer shutdown). */
export function stopRuntimeProcesses(runtime: EffectRuntime<never>): Promise<void> {
    return runtimeProcessOwner(runtime).close();
}

/** Registers a live process's stop with Computer shutdown; what every runtime driver takes. */
export type RuntimeProcessRegistry = Pick<RuntimeProcessOwner, 'add' | 'assertOpen' | 'remove'>;

class RuntimeProcessOwner {
    private readonly registries = new Set<() => Promise<void>>();
    private closing: Promise<void> | null = null;

    assertOpen(): void {
        if (this.closing) {
            throw new Error('Computer runtime processes are shutting down.');
        }
    }

    add(close: () => Promise<void>): void {
        this.assertOpen();
        this.registries.add(close);
    }

    remove(close: () => Promise<void>): void {
        this.registries.delete(close);
    }

    close(): Promise<void> {
        this.closing ??= (async () => {
            const results = await Promise.allSettled([...this.registries].map((close) => close()));
            const errors = results.flatMap((result) =>
                result.status === 'rejected' ? [result.reason] : []
            );
            if (errors.length) {
                throw new AggregateError(errors, 'Runtime processes did not stop.');
            }
        })();
        return this.closing;
    }
}
