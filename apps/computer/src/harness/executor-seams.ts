import type { RuntimeDriverFactory } from '../runtime/driver.ts';
import { createRuntimeDriver } from '../runtime/driver-factory.ts';
import type { HarnessTurnInput } from './executor.ts';

// Tests inject a fake driver at this construction seam.
export type TurnDriverFactory = RuntimeDriverFactory<HarnessTurnInput>;

let runtimeDriverFactory: TurnDriverFactory = createRuntimeDriver;

export function currentRuntimeDriverFactory(): TurnDriverFactory {
    return runtimeDriverFactory;
}

export function setRuntimeDriverFactoryForTesting(factory: TurnDriverFactory) {
    const previous = runtimeDriverFactory;
    runtimeDriverFactory = factory;
    return () => {
        runtimeDriverFactory = previous;
    };
}
