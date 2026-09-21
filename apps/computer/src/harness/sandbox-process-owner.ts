import type { EffectRuntime } from '@haus/effect';

const owners = new WeakMap<EffectRuntime<never>, SandboxProcessOwner>();

export function sandboxProcessOwner(runtime: EffectRuntime<never>): SandboxProcessOwner {
    let owner = owners.get(runtime);
    if (!owner) {
        owner = new SandboxProcessOwner();
        owners.set(runtime, owner);
    }
    return owner;
}

export function stopSandboxProcesses(runtime: EffectRuntime<never>): Promise<void> {
    return sandboxProcessOwner(runtime).close();
}

class SandboxProcessOwner {
    private readonly registries = new Set<() => Promise<void>>();
    private closing: Promise<void> | null = null;

    assertOpen(): void {
        if (this.closing) {
            throw new Error('Computer sandbox processes are shutting down.');
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
                throw new AggregateError(errors, 'Sandbox processes did not stop.');
            }
        })();
        return this.closing;
    }
}
